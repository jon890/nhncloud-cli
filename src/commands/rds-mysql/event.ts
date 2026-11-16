import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlEvent, RdsMysqlEventSource, RdsMysqlEventSubscription } from "../../services/rds-mysql/types.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { collectOption } from "../parse-options.js";
import {
  assertNoOverlap,
  checkLength,
  fail,
  fetchAllPages,
  isAbsentFromList,
  mergeList,
  noticeTruncated,
  parsePageOptions,
  parseUuidList,
  resolveSwitch,
  resolveTimeRange,
  sameSet,
} from "./group-helpers.js";
import {
  applyRdsMysqlWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseUuidArgument,
  type RdsMysqlCommandOptions,
  type RdsMysqlDetails,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlConfirmOptions,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

const EVENT_CATEGORIES: ReadonlySet<string> = new Set([
  "ALL",
  "INSTANCE",
  "DB_SECURITY_GROUP",
  "MONITORING",
  "JOB",
  "BACKUP",
  "TENANT",
]);

function parseCategory(value: string, flag: string): string {
  const category = value.toUpperCase().replaceAll("-", "_");
  if (!EVENT_CATEGORIES.has(category)) {
    fail(`${flag}은 ${[...EVENT_CATEGORIES].join(", ")} 중 하나여야 합니다 (입력: ${JSON.stringify(value)}).`);
  }
  return category;
}

/** 메시지는 한국어(KO)를 먼저, 없으면 첫 메시지를 보인다. */
function pickMessage(event: RdsMysqlEvent): string {
  const messages = (event.messages ?? []).filter((m) => typeof m.message === "string");
  const picked = messages.find((m) => m.langCode === "KO") ?? messages[0];
  return picked?.message ?? "";
}

// ---------------------------------------------------------------------------
// 이벤트 조회
// ---------------------------------------------------------------------------

interface EventListOptions extends RdsMysqlCommandOptions {
  from?: string;
  to?: string;
  last?: string;
  category: string;
  source?: string;
  keyword?: string;
  asc?: boolean;
  page?: string;
  size?: string;
}

const eventListCommand = withRdsMysqlOptions(
  new Command("list")
    .description("DB 인스턴스·백업·모니터링 등에서 발생한 이벤트를 조회한다")
    .option("--from <iso>", "시작 시각 (시간대가 있는 ISO 8601, 예: 2026-01-31T09:00:00+09:00)")
    .option("--to <iso>", "종료 시각 (시간대가 있는 ISO 8601). 없으면 지금")
    .option("--last <duration>", "종료 시각에서 거슬러 올라갈 기간 (예: 30m, 6h, 1d). --from 대신 쓴다")
    .option("--category <type>", "이벤트 카테고리 (ALL|INSTANCE|DB_SECURITY_GROUP|MONITORING|JOB|BACKUP|TENANT)", "ALL")
    .option("--source <id>", "이벤트가 발생한 대상 리소스 ID (UUID)")
    .option("--keyword <text>", "이벤트 메시지에 포함된 글자")
    .option("--asc", "오래된 이벤트부터 보인다 (기본은 최신부터)")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<EventListOptions>();
  const range = resolveTimeRange(opts);
  const eventCategoryType = parseCategory(opts.category, "--category");
  const sourceId = opts.source === undefined ? undefined : parseUuidArgument(opts.source, "--source");
  const page = parsePageOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("이벤트 조회 중...", () =>
    client.listEvents({
      ...range,
      eventCategoryType,
      sourceId,
      keyword: opts.keyword,
      ascendingOrder: opts.asc === true ? "ASC" : undefined,
      ...page,
    }),
  );
  output(opts, {
    headers: ["eventYmdt", "eventCategoryType", "eventCode", "sourceName", "message"],
    rows: list.items.map((e) => [
      formatCell(e.eventYmdt),
      formatCell(e.eventCategoryType),
      formatCell(e.eventCode),
      formatCell(e.sourceName),
      formatCell(pickMessage(e)),
    ]),
    raw: list.items,
    ids: list.items.map((e) => e.eventCode),
  });
  noticeTruncated(list.totalCounts, list.items.length);
});

const eventCodesCommand = withRdsMysqlOptions(
  new Command("codes").description("이벤트 구독에 쓸 수 있는 이벤트 코드 목록을 조회한다"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);

  const codes = await withRdsMysqlSpinner("이벤트 코드 조회 중...", () => client.listEventCodes());
  output(opts, {
    headers: ["eventCode", "eventCategoryType"],
    rows: codes.map((c) => [formatCell(c.eventCode), formatCell(c.eventCategoryType)]),
    raw: codes,
    ids: codes.map((c) => c.eventCode),
  });
});

export const eventCommand = new Command("event")
  .description("이벤트 조회 명령")
  .addCommand(eventListCommand)
  .addCommand(eventCodesCommand);

// ---------------------------------------------------------------------------
// 이벤트 구독
// ---------------------------------------------------------------------------

const HINT = "nhncloud rds-mysql event-subscription";
const SUBSCRIPTION_ID = "<event-subscription-id>";
const SUBSCRIPTION_ID_DESCRIPTION = "이벤트 구독 ID (UUID)";

async function getSubscription(client: RdsMysqlClient, id: string): Promise<RdsMysqlEventSubscription> {
  const found = await withRdsMysqlSpinner(`이벤트 구독 조회 중 (${id})...`, () =>
    client.listEventSubscriptions({ eventSubscriptionId: id, size: 100 }),
  );
  const subscription = found.items.find((s) => s.eventSubscriptionId === id);
  if (subscription === undefined) fail(`없는 이벤트 구독입니다: ${id}. ${HINT} list로 확인하세요.`);
  return subscription as RdsMysqlEventSubscription;
}

async function checkEventCodes(client: RdsMysqlClient, codes: readonly string[]): Promise<void> {
  if (codes.length === 0) return;
  const known = new Set((await withRdsMysqlSpinner("이벤트 코드 확인 중...", () => client.listEventCodes())).map((c) => c.eventCode));
  const unknown = codes.filter((code) => !known.has(code));
  if (unknown.length > 0) fail(`없는 이벤트 코드입니다: ${unknown.join(", ")}. nhncloud rds-mysql event codes로 확인하세요.`);
}

async function checkUserGroups(client: RdsMysqlClient, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const groups = await withRdsMysqlSpinner("사용자 그룹 확인 중...", () =>
    fetchAllPages((page) => client.listUserGroups({ page, size: 100 })),
  );
  const known = new Set(groups.map((g) => g.userGroupId));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) fail(`없는 사용자 그룹입니다: ${unknown.join(", ")}. nhncloud rds-mysql user-group list로 확인하세요.`);
}

function warnSilentSubscription(state: { enabled: boolean; notifyEmail: boolean; notifySms: boolean; userGroupCount: number; eventCodeCount: number }): void {
  const reasons: string[] = [];
  if (!state.enabled) reasons.push("비활성 상태입니다");
  if (!state.notifyEmail && !state.notifySms) reasons.push("이메일과 SMS 알림이 모두 꺼져 있습니다");
  if (state.userGroupCount === 0) reasons.push("알림 받을 사용자 그룹이 없습니다");
  if (state.eventCodeCount === 0) reasons.push("구독한 이벤트 코드가 없습니다");
  if (reasons.length > 0) process.stderr.write(`경고: 이 이벤트 구독으로는 알림이 가지 않습니다. ${reasons.join(", ")}.\n`);
}

function addSubscriptionChannelOptions(command: Command): Command {
  return command
    .option("--email", "이메일 알림을 켠다")
    .option("--no-email", "이메일 알림을 끈다")
    .option("--sms", "SMS 알림을 켠다")
    .option("--no-sms", "SMS 알림을 끈다")
    .option("--enable", "구독을 활성화한다")
    .option("--disable", "구독을 비활성화한다");
}

interface ChannelOptions {
  email?: boolean;
  sms?: boolean;
  enable?: boolean;
  disable?: boolean;
}

interface SubscriptionListOptions extends RdsMysqlCommandOptions {
  name?: string;
  userGroup?: string;
  page?: string;
  size?: string;
}

const subscriptionListCommand = withRdsMysqlOptions(
  new Command("list")
    .description("이벤트 구독 목록을 조회한다")
    .option("--name <text>", "이벤트 구독 이름")
    .option("--user-group <id>", "사용자 그룹 ID (UUID)")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<SubscriptionListOptions>();
  const userGroupId = opts.userGroup === undefined ? undefined : parseUuidArgument(opts.userGroup, "--user-group");
  const page = parsePageOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("이벤트 구독 목록 조회 중...", () =>
    client.listEventSubscriptions({ eventSubscriptionName: opts.name, userGroupId, ...page }),
  );
  output(opts, {
    headers: ["eventSubscriptionId", "eventSubscriptionName", "eventCategoryType", "enabled", "notifyEmail", "notifySms", "eventCodes", "sources", "userGroupIds"],
    rows: list.items.map((s) => [
      formatCell(s.eventSubscriptionId),
      formatCell(s.eventSubscriptionName),
      formatCell(s.eventCategoryType),
      formatCell(s.enabled),
      formatCell(s.notifyEmail),
      formatCell(s.notifySms),
      formatCell(s.eventCodes),
      formatCell(s.sources.map((source) => source.sourceId)),
      formatCell(s.userGroupIds),
    ]),
    raw: list.items,
    ids: list.items.map((s) => s.eventSubscriptionId),
  });
  noticeTruncated(list.totalCounts, list.items.length);
});

interface SubscriptionCreateOptions extends RdsMysqlWriteOptions, ChannelOptions {
  name: string;
  category: string;
  eventCode: string[];
  source: string[];
  userGroup: string[];
}

const subscriptionCreateCommand = addSubscriptionChannelOptions(
  withRdsMysqlConfirmOptions(
    new Command("create")
      .description("이벤트 구독을 만든다. 기본은 활성, 이메일과 SMS 알림 켬이다. --yes가 없으면 미리보기만 한다")
      .requiredOption("--name <name>", "이벤트 구독 이름")
      .requiredOption("--category <type>", "이벤트 카테고리 (ALL|INSTANCE|DB_SECURITY_GROUP|MONITORING|JOB|BACKUP|TENANT)")
      .option("--event-code <code>", "구독할 이벤트 코드 (event codes 의 eventCode). 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--source <id>", "구독할 이벤트 소스 ID (DB 인스턴스 ID 등). 카테고리는 --category 를 쓴다. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--user-group <user-group-id>", "알림 받을 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<SubscriptionCreateOptions>();
  checkLength(opts.name, "--name", 100);
  const eventCategoryType = parseCategory(opts.category, "--category");
  const eventCodes = [...new Set(opts.eventCode)];
  const sourceIds = parseUuidList(opts.source, "--source");
  const userGroupIds = parseUuidList(opts.userGroup, "--user-group");
  const enabled = resolveSwitch(opts.enable, opts.disable, "--enable", "--disable") ?? true;
  const notifyEmail = opts.email ?? true;
  const notifySms = opts.sms ?? true;
  const { client } = await resolveRdsMysqlClient(opts);

  await checkEventCodes(client, eventCodes);
  await checkUserGroups(client, userGroupIds);
  const sources: RdsMysqlEventSource[] = sourceIds.map((sourceId) => ({ sourceId, eventCategoryType }));
  warnSilentSubscription({ enabled, notifyEmail, notifySms, userGroupCount: userGroupIds.length, eventCodeCount: eventCodes.length });
  const result = rdsMysqlOperationResult({
    operation: "event-subscription-create",
    target: opts.name,
    action: "create",
    details: { eventCategoryType, enabled, notifyEmail, notifySms, eventCodes, sources: sourceIds, userGroupIds },
  });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      result["createdId"] = await client.createEventSubscription({
        eventCategoryType,
        eventSubscriptionName: opts.name,
        enabled,
        notifyEmail,
        notifySms,
        eventCodes,
        sources,
        userGroupIds,
      });
      return null;
    },
    `${HINT} list`,
  );
});

interface SubscriptionUpdateOptions extends RdsMysqlWriteOptions, ChannelOptions {
  name?: string;
  category?: string;
  addEventCode: string[];
  removeEventCode: string[];
  addSource: string[];
  removeSource: string[];
  addUserGroup: string[];
  removeUserGroup: string[];
}

const subscriptionUpdateCommand = addSubscriptionChannelOptions(
  withRdsMysqlConfirmOptions(
    new Command("update")
      .description("이벤트 구독의 이름, 알림 방식, 활성 여부, 이벤트 코드, 소스, 사용자 그룹을 바꾼다. 목록은 현재 값에 더하고 뺀다. --yes가 없으면 미리보기만 한다")
      .argument(SUBSCRIPTION_ID, SUBSCRIPTION_ID_DESCRIPTION)
      .option("--name <name>", "새 이름")
      .option("--category <type>", "새 이벤트 카테고리")
      .option("--add-event-code <code>", "더할 이벤트 코드. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--remove-event-code <code>", "뺄 이벤트 코드. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--add-source <id>", "더할 이벤트 소스 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--remove-source <id>", "뺄 이벤트 소스 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--add-user-group <user-group-id>", "더할 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--remove-user-group <user-group-id>", "뺄 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (subscriptionId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<SubscriptionUpdateOptions>();
  const id = parseUuidArgument(subscriptionId, SUBSCRIPTION_ID);
  if (opts.name !== undefined) checkLength(opts.name, "--name", 100);
  const addCodes = [...new Set(opts.addEventCode)];
  const removeCodes = [...new Set(opts.removeEventCode)];
  const addSources = parseUuidList(opts.addSource, "--add-source");
  const removeSources = parseUuidList(opts.removeSource, "--remove-source");
  const addUserGroups = parseUuidList(opts.addUserGroup, "--add-user-group");
  const removeUserGroups = parseUuidList(opts.removeUserGroup, "--remove-user-group");
  assertNoOverlap(addCodes, removeCodes, "--add-event-code", "--remove-event-code");
  assertNoOverlap(addSources, removeSources, "--add-source", "--remove-source");
  assertNoOverlap(addUserGroups, removeUserGroups, "--add-user-group", "--remove-user-group");
  const category = opts.category === undefined ? undefined : parseCategory(opts.category, "--category");
  const enabledChange = resolveSwitch(opts.enable, opts.disable, "--enable", "--disable");
  const nothing =
    opts.name === undefined &&
    category === undefined &&
    opts.email === undefined &&
    opts.sms === undefined &&
    enabledChange === undefined &&
    [addCodes, removeCodes, addSources, removeSources, addUserGroups, removeUserGroups].every((list) => list.length === 0);
  if (nothing) fail("바꿀 항목을 하나 이상 지정해야 합니다 (--name, --email, --sms, --enable, --add-event-code 등).");
  const { client } = await resolveRdsMysqlClient(opts);

  const current = await getSubscription(client, id);
  const missing = [
    ...removeCodes.filter((value) => !current.eventCodes.includes(value)),
    ...removeSources.filter((value) => !current.sources.some((s) => s.sourceId === value)),
    ...removeUserGroups.filter((value) => !current.userGroupIds.includes(value)),
  ];
  if (missing.length > 0) fail(`이 이벤트 구독에 없는 항목을 뺄 수 없습니다: ${missing.join(", ")}. ${HINT} list로 확인하세요.`);
  await checkEventCodes(client, addCodes);
  await checkUserGroups(client, addUserGroups);

  const eventCategoryType = category ?? current.eventCategoryType;
  const eventCodes = mergeList(current.eventCodes, addCodes, removeCodes);
  const currentSourceIds = current.sources.map((s) => s.sourceId);
  const sourceIds = mergeList(currentSourceIds, addSources, removeSources);
  const sources: RdsMysqlEventSource[] = sourceIds.map(
    (sourceId) => current.sources.find((s) => s.sourceId === sourceId) ?? { sourceId, eventCategoryType },
  );
  const userGroupIds = mergeList(current.userGroupIds, addUserGroups, removeUserGroups);
  const next = {
    eventCategoryType,
    eventSubscriptionName: opts.name ?? current.eventSubscriptionName,
    enabled: enabledChange ?? current.enabled,
    notifyEmail: opts.email ?? current.notifyEmail,
    notifySms: opts.sms ?? current.notifySms,
  };

  const details: RdsMysqlDetails = { eventSubscriptionId: id };
  if (next.eventSubscriptionName !== current.eventSubscriptionName) {
    details["name"] = `${formatCell(current.eventSubscriptionName)} -> ${formatCell(next.eventSubscriptionName)}`;
  }
  if (next.eventCategoryType !== current.eventCategoryType) details["eventCategoryType"] = `${current.eventCategoryType} -> ${next.eventCategoryType}`;
  if (next.enabled !== current.enabled) details["enabled"] = `${current.enabled} -> ${next.enabled}`;
  if (next.notifyEmail !== current.notifyEmail) details["notifyEmail"] = `${current.notifyEmail} -> ${next.notifyEmail}`;
  if (next.notifySms !== current.notifySms) details["notifySms"] = `${current.notifySms} -> ${next.notifySms}`;
  const codesChanged = !sameSet(eventCodes, current.eventCodes);
  const sourcesChanged = !sameSet(sourceIds, currentSourceIds);
  const userGroupsChanged = !sameSet(userGroupIds, current.userGroupIds);
  if (codesChanged) details["eventCodes"] = `${current.eventCodes.length}개 -> ${eventCodes.length}개 (+${addCodes.join(",") || "-"} / -${removeCodes.join(",") || "-"})`;
  if (sourcesChanged) details["sources"] = `${currentSourceIds.length}개 -> ${sourceIds.length}개 (+${addSources.join(",") || "-"} / -${removeSources.join(",") || "-"})`;
  if (userGroupsChanged) details["userGroupIds"] = `${current.userGroupIds.length}개 -> ${userGroupIds.length}개 (+${addUserGroups.join(",") || "-"} / -${removeUserGroups.join(",") || "-"})`;
  const unchanged = Object.keys(details).length === 1 && !codesChanged && !sourcesChanged && !userGroupsChanged;
  const result = rdsMysqlOperationResult({
    operation: "event-subscription-update",
    target: current.eventSubscriptionName,
    action: unchanged ? "unchanged" : "update",
    details,
  });
  if (unchanged) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  warnSilentSubscription({ ...next, userGroupCount: userGroupIds.length, eventCodeCount: eventCodes.length });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      // 생략한 필드의 처리가 문서에 없어 현재 값을 포함한 전체를 보낸다.
      await client.updateEventSubscription(id, { ...next, eventCodes, sources, userGroupIds });
      return null;
    },
    `${HINT} list`,
    async () => {
      const after = await getSubscription(client, id);
      return (
        after.eventSubscriptionName === next.eventSubscriptionName &&
        after.eventCategoryType === next.eventCategoryType &&
        after.enabled === next.enabled &&
        after.notifyEmail === next.notifyEmail &&
        after.notifySms === next.notifySms &&
        sameSet(after.eventCodes, eventCodes) &&
        sameSet(after.sources.map((s) => s.sourceId), sourceIds) &&
        sameSet(after.userGroupIds, userGroupIds)
      );
    },
  );
});

const subscriptionDeleteCommand = withRdsMysqlConfirmOptions(
  new Command("delete")
    .description("이벤트 구독을 지운다. 지우면 그 알림이 멈춘다. --yes가 없으면 미리보기만 한다")
    .argument(SUBSCRIPTION_ID, SUBSCRIPTION_ID_DESCRIPTION),
).action(async (subscriptionId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(subscriptionId, SUBSCRIPTION_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const subscription = await getSubscription(client, id);
  const result = rdsMysqlOperationResult({
    operation: "event-subscription-delete",
    target: subscription.eventSubscriptionName,
    action: "delete",
    details: {
      eventSubscriptionId: id,
      eventCategoryType: subscription.eventCategoryType,
      eventCodes: subscription.eventCodes,
      userGroupIds: subscription.userGroupIds,
    },
  });
  process.stderr.write(`경고: 지우면 이 구독(${sanitizeForTerminal(subscription.eventSubscriptionName)})의 알림이 멈춥니다.\n`);
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.deleteEventSubscription(id);
      return null;
    },
    `${HINT} list`,
    () => isAbsentFromList((page) => client.listEventSubscriptions({ page, size: 100 }), (s) => s.eventSubscriptionId, id),
  );
});

export const eventSubscriptionCommand = new Command("event-subscription")
  .description("이벤트 구독 조회, 생성, 수정, 삭제 명령")
  .addCommand(subscriptionListCommand)
  .addCommand(subscriptionCreateCommand)
  .addCommand(subscriptionUpdateCommand)
  .addCommand(subscriptionDeleteCommand);
