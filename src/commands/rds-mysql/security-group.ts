import { isIPv4, isIPv6 } from "node:net";
import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type {
  RdsMysqlDbSecurityGroupDetail,
  RdsMysqlSecurityGroupRule,
  RdsMysqlSecurityGroupRuleInput,
} from "../../services/rds-mysql/types.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { collectOption } from "../parse-options.js";
import {
  checkLength,
  checkOptionalLength,
  fail,
  isAbsentFromList,
  noticeTruncated,
  parsePageOptions,
} from "./group-helpers.js";
import {
  applyRdsMysqlWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseUuidArgument,
  parseWaitOptions,
  type RdsMysqlCommandOptions,
  type RdsMysqlDetails,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlConfirmOptions,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";

const HINT = "nhncloud rds-mysql db-security-group";
const GROUP_ID = "<db-security-group-id>";
const GROUP_ID_DESCRIPTION = "DB 보안 그룹 ID (UUID)";

const DIRECTIONS: Readonly<Record<string, string>> = { ingress: "INGRESS", egress: "EGRESS" };
const ETHER_TYPES: Readonly<Record<string, string>> = { ipv4: "IPV4", ipv6: "IPV6" };

// 문서가 정한 포트 범위다(최솟값 3306, 최댓값 65535). DB 인스턴스 포트가 3306~43306 이라서 같은 하한을 쓴다.
const MIN_PORT = 3306;
const MAX_PORT = 65535;

function getGroup(client: RdsMysqlClient, id: string): Promise<RdsMysqlDbSecurityGroupDetail> {
  return withRdsMysqlSpinner(`DB 보안 그룹 조회 중 (${id})...`, () => client.getDbSecurityGroup(id));
}

function parsePortNumber(text: string, spec: string): number {
  if (!/^\d+$/.test(text)) fail(`포트는 숫자여야 합니다 (입력: ${JSON.stringify(spec)}).`);
  const port = Number(text);
  if (port < MIN_PORT || port > MAX_PORT) fail(`포트는 ${MIN_PORT} 이상 ${MAX_PORT} 이하여야 합니다 (입력: ${JSON.stringify(spec)}).`);
  return port;
}

/** 포트 지정은 `3306`(특정 포트), `3306-3310`(범위), `db`(DB 수신 포트), `all`(전체) 중 하나다. */
export function parsePortSpec(spec: string): RdsMysqlSecurityGroupRuleInput["port"] {
  const lower = spec.toLowerCase();
  if (lower === "all") return { portType: "ALL" };
  if (lower === "db") return { portType: "DB_PORT" };
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range !== null) {
    const minPort = parsePortNumber(range[1] as string, spec);
    const maxPort = parsePortNumber(range[2] as string, spec);
    if (minPort >= maxPort) fail(`포트 범위의 시작은 끝보다 작아야 합니다 (입력: ${JSON.stringify(spec)}). 하나만 열려면 포트 번호 하나를 씁니다.`);
    return { portType: "PORT_RANGE", minPort, maxPort };
  }
  const port = parsePortNumber(spec, spec);
  return { portType: "PORT", minPort: port, maxPort: port };
}

function describePort(port: RdsMysqlSecurityGroupRuleInput["port"] | RdsMysqlSecurityGroupRule["port"]): string {
  if (port === null || port === undefined) return "-";
  const { portType, minPort, maxPort } = port;
  if (portType === "ALL") return "전체";
  if (portType === "DB_PORT") return "DB 포트";
  if (portType === "PORT_RANGE") return `${minPort}-${maxPort}`;
  return String(minPort ?? "-");
}

function parseCidr(value: string): { cidr: string; etherType: string } {
  const [address, prefix, ...rest] = value.split("/");
  const v4 = address !== undefined && isIPv4(address);
  const v6 = address !== undefined && isIPv6(address);
  const max = v4 ? 32 : 128;
  if ((!v4 && !v6) || prefix === undefined || rest.length > 0 || !/^\d{1,3}$/.test(prefix) || Number(prefix) > max) {
    fail(`--cidr은 10.0.0.0/24 또는 2001:db8::/32 같은 CIDR 이어야 합니다 (입력: ${JSON.stringify(value)}).`);
  }
  return { cidr: value, etherType: v4 ? "IPV4" : "IPV6" };
}

function parseChoice(value: string, table: Readonly<Record<string, string>>, flag: string): string {
  const key = value.toLowerCase();
  const found = Object.hasOwn(table, key) ? table[key] : undefined;
  if (found === undefined) fail(`${flag}은 ${Object.keys(table).join(", ")} 중 하나여야 합니다 (입력: ${JSON.stringify(value)}).`);
  return found as string;
}

function isOpenToAll(cidr: string): boolean {
  return cidr === "0.0.0.0/0" || cidr === "::/0";
}

function warnOpenRule(rule: Pick<RdsMysqlSecurityGroupRuleInput, "direction" | "cidr" | "port">): void {
  if (rule.direction === "INGRESS" && isOpenToAll(rule.cidr)) {
    const scope = rule.port.portType === "ALL" ? "모든 포트" : `포트 ${describePort(rule.port)}`;
    process.stderr.write(`경고: 모든 주소(${rule.cidr})에서 ${scope}로 들어오는 접속을 허용합니다. 외부에 DB 가 노출될 수 있습니다.\n`);
  }
}

function ruleSummary(rule: RdsMysqlSecurityGroupRuleInput | RdsMysqlSecurityGroupRule): string {
  return `${rule.direction} ${rule.etherType} ${rule.cidr} 포트 ${describePort(rule.port)}`;
}

/** `--rule 방향,CIDR,포트` 를 규칙 본문으로 바꾼다. */
function parseRuleOption(value: string): RdsMysqlSecurityGroupRuleInput {
  const parts = value.split(",");
  if (parts.length !== 3) fail(`--rule은 방향,CIDR,포트 형식이어야 합니다 (예: ingress,10.0.0.0/24,3306, 입력: ${JSON.stringify(value)}).`);
  const [direction, cidrText, portText] = parts as [string, string, string];
  const { cidr, etherType } = parseCidr(cidrText.trim());
  return {
    direction: parseChoice(direction.trim(), DIRECTIONS, "--rule의 방향"),
    etherType,
    port: parsePortSpec(portText.trim()),
    cidr,
  };
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

interface ListOptions extends RdsMysqlCommandOptions {
  page?: string;
  size?: string;
}

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("DB 보안 그룹 목록을 조회한다")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ListOptions>();
  const page = parsePageOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("DB 보안 그룹 목록 조회 중...", () => client.listDbSecurityGroups(page));
  output(opts, {
    headers: ["dbSecurityGroupId", "dbSecurityGroupName", "progressStatus", "description"],
    rows: list.items.map((g) => [
      formatCell(g.dbSecurityGroupId),
      formatCell(g.dbSecurityGroupName),
      formatCell(g.progressStatus),
      formatCell(g.description),
    ]),
    raw: list.items,
    ids: list.items.map((g) => g.dbSecurityGroupId),
  });
  noticeTruncated(list.totalCounts, list.items.length);
});

const getCommand = withRdsMysqlOptions(
  new Command("get").description("DB 보안 그룹과 규칙을 조회한다").argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  output(opts, {
    headers: ["ruleId", "direction", "etherType", "cidr", "port", "description"],
    rows: group.rules.map((r) => [
      formatCell(r.ruleId),
      formatCell(r.direction),
      formatCell(r.etherType),
      formatCell(r.cidr),
      describePort(r.port),
      formatCell(r.description),
    ]),
    raw: group,
    ids: group.rules.map((r) => r.ruleId),
  });
  process.stderr.write(
    `DB 보안 그룹 ${sanitizeForTerminal(group.dbSecurityGroupName)} (진행 상태 ${sanitizeForTerminal(group.progressStatus ?? "알 수 없음")}), 규칙 ${group.rules.length}개\n`,
  );
});

// ---------------------------------------------------------------------------
// 그룹 쓰기
// ---------------------------------------------------------------------------

interface CreateOptions extends RdsMysqlWriteOptions {
  name: string;
  description?: string;
  rule: string[];
}

const createCommand = withRdsMysqlConfirmOptions(
  new Command("create")
    .description("DB 보안 그룹을 만든다. --yes가 없으면 미리보기만 한다")
    .requiredOption("--name <name>", "DB 보안 그룹 이름 (1~100자)")
    .option("--description <text>", "설명 (100자 이하)")
    .option("--rule <direction,cidr,port>", "규칙 (예: ingress,10.0.0.0/24,3306). 포트는 번호, 시작-끝, db, all. 여러 번 지정할 수 있다", collectOption, [] as string[]),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<CreateOptions>();
  checkLength(opts.name, "--name", 100);
  checkOptionalLength(opts.description, "--description", 100);
  const rules = opts.rule.map(parseRuleOption);
  const { client } = await resolveRdsMysqlClient(opts);

  const same = await withRdsMysqlSpinner("같은 이름의 DB 보안 그룹 확인 중...", () => client.listDbSecurityGroups({ size: 100 }));
  if (same.items.some((g) => g.dbSecurityGroupName === opts.name)) {
    fail(`같은 이름의 DB 보안 그룹이 이미 있습니다: ${JSON.stringify(opts.name)}. ${HINT} list로 확인하세요.`);
  }
  if (rules.length === 0) {
    process.stderr.write("경고: 규칙이 없는 DB 보안 그룹입니다. 인스턴스에 적용하면 접속이 모두 막힙니다. --rule을 지정하세요.\n");
  }
  for (const rule of rules) warnOpenRule(rule);

  const details: RdsMysqlDetails = { description: opts.description ?? null, ruleCount: rules.length };
  const result = rdsMysqlOperationResult({ operation: "db-security-group-create", target: opts.name, action: "create", details });
  result["rules"] = rules.map((rule) => ({ ...rule, summary: ruleSummary(rule) }));
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      result["createdId"] = await client.createDbSecurityGroup({
        dbSecurityGroupName: opts.name,
        ...(opts.description === undefined ? {} : { description: opts.description }),
        rules,
      });
      return null;
    },
    `${HINT} list`,
  );
});

interface UpdateOptions extends RdsMysqlWriteOptions {
  name?: string;
  description?: string;
}

const updateCommand = withRdsMysqlConfirmOptions(
  new Command("update")
    .description("DB 보안 그룹의 이름이나 설명을 바꾼다. 규칙은 rule 명령으로 바꾼다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION)
    .option("--name <name>", "새 이름 (1~100자)")
    .option("--description <text>", "새 설명 (100자 이하)"),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<UpdateOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  if (opts.name === undefined && opts.description === undefined) fail("바꿀 항목을 하나 이상 지정해야 합니다 (--name, --description).");
  if (opts.name !== undefined) checkLength(opts.name, "--name", 100);
  checkOptionalLength(opts.description, "--description", 100);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const body: { dbSecurityGroupName?: string; description?: string } = {};
  const details: RdsMysqlDetails = { dbSecurityGroupId: id };
  if (opts.name !== undefined && opts.name !== group.dbSecurityGroupName) {
    body.dbSecurityGroupName = opts.name;
    details["name"] = `${formatCell(group.dbSecurityGroupName)} -> ${formatCell(opts.name)}`;
  }
  if (opts.description !== undefined && opts.description !== (group.description ?? "")) {
    body.description = opts.description;
    details["description"] = `${formatCell(group.description)} -> ${formatCell(opts.description)}`;
  }
  const unchanged = Object.keys(body).length === 0;
  const result = rdsMysqlOperationResult({
    operation: "db-security-group-update",
    target: group.dbSecurityGroupName,
    action: unchanged ? "unchanged" : "update",
    details,
  });
  if (unchanged) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.updateDbSecurityGroup(id, body);
      return null;
    },
    `${HINT} get ${id}`,
    async () => {
      const after = await client.getDbSecurityGroup(id);
      return (
        (body.dbSecurityGroupName === undefined || after.dbSecurityGroupName === body.dbSecurityGroupName) &&
        (body.description === undefined || (after.description ?? "") === body.description)
      );
    },
  );
});

const deleteCommand = withRdsMysqlConfirmOptions(
  new Command("delete")
    .description("DB 보안 그룹을 지운다. DB 인스턴스에 적용된 그룹은 서버가 거절한다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const result = rdsMysqlOperationResult({
    operation: "db-security-group-delete",
    target: group.dbSecurityGroupName,
    action: "delete",
    details: { dbSecurityGroupId: id, ruleCount: group.rules.length },
  });
  process.stderr.write("경고: 지운 DB 보안 그룹은 되돌릴 수 없습니다. 규칙 정보가 함께 사라집니다.\n");
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.deleteDbSecurityGroup(id);
      return null;
    },
    `${HINT} list`,
    () => isAbsentFromList((page) => client.listDbSecurityGroups({ page, size: 100 }), (g) => g.dbSecurityGroupId, id),
  );
});

// ---------------------------------------------------------------------------
// 규칙
// ---------------------------------------------------------------------------

interface RuleOptions extends RdsMysqlWriteOptions {
  direction?: string;
  etherType?: string;
  cidr?: string;
  port?: string;
  description?: string;
}

function withRuleOptions(command: Command, requiredFields: boolean): Command {
  const direction = "통신 방향 (ingress|egress)";
  const cidr = "CIDR (예: 10.0.0.0/24, ::/0)";
  const port = "포트: 번호(3306), 범위(3306-3310), db(DB 수신 포트), all(전체)";
  if (requiredFields) {
    command.requiredOption("--direction <dir>", direction).requiredOption("--cidr <cidr>", cidr).requiredOption("--port <spec>", port);
  } else {
    command.option("--direction <dir>", direction).option("--cidr <cidr>", cidr).option("--port <spec>", port);
  }
  return command
    .option("--ether-type <type>", "ipv4|ipv6. 없으면 CIDR 에서 정한다")
    .option("--description <text>", "규칙 설명 (200자 이하)");
}

function buildRuleBody(opts: RuleOptions, base: RdsMysqlSecurityGroupRule | undefined): RdsMysqlSecurityGroupRuleInput {
  const cidrInfo = opts.cidr === undefined ? undefined : parseCidr(opts.cidr);
  const cidr = cidrInfo?.cidr ?? base?.cidr;
  if (cidr === undefined) return fail("--cidr을 지정해야 합니다.");
  const inferred = cidrInfo?.etherType ?? base?.etherType ?? parseCidr(cidr).etherType;
  const etherType = opts.etherType === undefined ? inferred : parseChoice(opts.etherType, ETHER_TYPES, "--ether-type");
  if (etherType !== parseCidr(cidr).etherType) fail(`--ether-type(${etherType})과 CIDR(${cidr})의 주소 종류가 다릅니다.`);
  const basePort =
    base?.port === null || base?.port === undefined
      ? undefined
      : ({
          portType: base.port.portType ?? "ALL",
          ...(base.port.minPort === null || base.port.minPort === undefined ? {} : { minPort: base.port.minPort }),
          ...(base.port.maxPort === null || base.port.maxPort === undefined ? {} : { maxPort: base.port.maxPort }),
        } satisfies RdsMysqlSecurityGroupRuleInput["port"]);
  const port = opts.port === undefined ? basePort : parsePortSpec(opts.port);
  if (port === undefined) return fail("--port를 지정해야 합니다.");
  const direction = opts.direction === undefined ? base?.direction : parseChoice(opts.direction, DIRECTIONS, "--direction");
  if (direction === undefined) return fail("--direction을 지정해야 합니다.");
  const description = checkOptionalLength(opts.description, "--description", 200) ?? (base?.description ?? undefined);
  return { direction, etherType, port, cidr, ...(description === undefined || description === "" ? {} : { description }) };
}

const ruleCreateCommand = withRuleOptions(
  withRdsMysqlWriteOptions(
    new Command("create")
      .description("DB 보안 그룹에 규칙을 더한다. --yes가 없으면 미리보기만 한다")
      .argument(GROUP_ID, GROUP_ID_DESCRIPTION),
  ),
  true,
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RuleOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const wait = parseWaitOptions(opts);
  const body = buildRuleBody(opts, undefined);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  warnOpenRule(body);
  const result = rdsMysqlOperationResult({
    operation: "db-security-group-rule-create",
    target: group.dbSecurityGroupName,
    action: "create",
    details: {
      dbSecurityGroupId: id,
      direction: body.direction,
      etherType: body.etherType,
      cidr: body.cidr,
      port: describePort(body.port),
      description: body.description ?? null,
    },
  });
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.createDbSecurityGroupRule(id, body), `${HINT} get ${id}`);
});

const ruleUpdateCommand = withRuleOptions(
  withRdsMysqlWriteOptions(
    new Command("update")
      .description("DB 보안 그룹 규칙을 바꾼다. 지정하지 않은 항목은 현재 값을 그대로 보낸다. --yes가 없으면 미리보기만 한다")
      .argument(GROUP_ID, GROUP_ID_DESCRIPTION)
      .argument("<rule-id>", "규칙 ID (UUID)"),
  ),
  false,
).action(async (groupId: string, ruleId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RuleOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const parsedRuleId = parseUuidArgument(ruleId, "<rule-id>");
  const wait = parseWaitOptions(opts);
  if ([opts.direction, opts.etherType, opts.cidr, opts.port, opts.description].every((value) => value === undefined)) {
    fail("바꿀 항목을 하나 이상 지정해야 합니다 (--direction, --cidr, --port 등).");
  }
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const current = group.rules.find((rule) => rule.ruleId === parsedRuleId);
  if (current === undefined) fail(`DB 보안 그룹에 없는 규칙입니다: ${parsedRuleId}. ${HINT} get ${id}로 확인하세요.`);
  const body = buildRuleBody(opts, current);
  warnOpenRule(body);
  const result = rdsMysqlOperationResult({
    operation: "db-security-group-rule-update",
    target: group.dbSecurityGroupName,
    action: "update",
    details: {
      dbSecurityGroupId: id,
      ruleId: parsedRuleId,
      before: ruleSummary(current as RdsMysqlSecurityGroupRule),
      after: ruleSummary(body),
    },
  });
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.updateDbSecurityGroupRule(id, parsedRuleId, body), `${HINT} get ${id}`);
});

const ruleDeleteCommand = withRdsMysqlWriteOptions(
  new Command("delete")
    .description("DB 보안 그룹에서 규칙을 지운다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION)
    .argument("<rule-ids...>", "지울 규칙 ID (UUID). 여러 개를 줄 수 있다"),
).action(async (groupId: string, ruleIds: string[], _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const wait = parseWaitOptions(opts);
  const ids = [...new Set(ruleIds.map((value) => parseUuidArgument(value, "<rule-ids>")))];
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const missing = ids.filter((ruleId) => !group.rules.some((rule) => rule.ruleId === ruleId));
  if (missing.length > 0) fail(`DB 보안 그룹에 없는 규칙입니다: ${missing.join(", ")}. ${HINT} get ${id}로 확인하세요.`);
  const removed = group.rules.filter((rule) => ids.includes(rule.ruleId));
  const result = rdsMysqlOperationResult({
    operation: "db-security-group-rule-delete",
    target: group.dbSecurityGroupName,
    action: "delete",
    details: { dbSecurityGroupId: id, ruleCount: removed.length },
  });
  result["rules"] = removed.map((rule) => ({ ruleId: rule.ruleId, summary: ruleSummary(rule) }));
  if (removed.length === group.rules.length) {
    process.stderr.write("경고: 모든 규칙을 지우면 이 그룹을 쓰는 DB 인스턴스의 접속이 막힙니다.\n");
  }
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.deleteDbSecurityGroupRules(id, ids), `${HINT} get ${id}`);
});

const ruleCommand = new Command("rule")
  .description("DB 보안 그룹 규칙 추가·수정·삭제 명령")
  .addCommand(ruleCreateCommand)
  .addCommand(ruleUpdateCommand)
  .addCommand(ruleDeleteCommand);

export const dbSecurityGroupCommand = new Command("db-security-group")
  .description("DB 보안 그룹 조회, 생성, 수정, 삭제와 규칙 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(updateCommand)
  .addCommand(deleteCommand)
  .addCommand(ruleCommand);
