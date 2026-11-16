import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlNotificationGroupDetail } from "../../services/rds-mysql/types.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { collectOption } from "../parse-options.js";
import {
  assertNoOverlap,
  checkLength,
  fail,
  fetchAllPages,
  mergeList,
  parseUuidList,
  resolveSwitch,
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

const HINT = "nhncloud rds-mysql notification-group";
const GROUP_ID = "<notification-group-id>";
const GROUP_ID_DESCRIPTION = "알림 그룹 ID (UUID)";

function getGroup(client: RdsMysqlClient, id: string): Promise<RdsMysqlNotificationGroupDetail> {
  return withRdsMysqlSpinner(`알림 그룹 조회 중 (${id})...`, () => client.getNotificationGroup(id));
}

/** 감시할 DB 인스턴스와 알림 받을 사용자 그룹이 실제로 있는지 확인하고 이름을 돌려준다. */
async function resolveTargets(
  client: RdsMysqlClient,
  instanceIds: readonly string[],
  userGroupIds: readonly string[],
): Promise<{ instanceNames: Map<string, string>; userGroupNames: Map<string, string> }> {
  const instanceNames = new Map<string, string>();
  const userGroupNames = new Map<string, string>();
  if (instanceIds.length > 0) {
    const instances = await withRdsMysqlSpinner("DB 인스턴스 확인 중...", () => client.listDbInstances());
    for (const i of instances) instanceNames.set(i.dbInstanceId, i.dbInstanceName);
    const unknown = instanceIds.filter((id) => !instanceNames.has(id));
    if (unknown.length > 0) fail(`없는 DB 인스턴스입니다: ${unknown.join(", ")}. nhncloud rds-mysql instance list로 확인하세요.`);
  }
  if (userGroupIds.length > 0) {
    const groups = await withRdsMysqlSpinner("사용자 그룹 확인 중...", () =>
      fetchAllPages((page) => client.listUserGroups({ page, size: 100 })),
    );
    for (const g of groups) userGroupNames.set(g.userGroupId, g.userGroupName);
    const unknown = userGroupIds.filter((id) => !userGroupNames.has(id));
    if (unknown.length > 0) fail(`없는 사용자 그룹입니다: ${unknown.join(", ")}. nhncloud rds-mysql user-group list로 확인하세요.`);
  }
  return { instanceNames, userGroupNames };
}

/** 알림이 실제로 나가지 않을 설정이면 이유를 경고한다. 알림 그룹이 있어도 감시 대상이나 수신자가 비면 알림은 가지 않는다. */
function warnSilentGroup(state: {
  isEnabled: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  instanceCount: number;
  userGroupCount: number;
}): void {
  const reasons: string[] = [];
  if (!state.isEnabled) reasons.push("비활성 상태입니다");
  if (!state.notifyEmail && !state.notifySms) reasons.push("이메일과 SMS 알림이 모두 꺼져 있습니다");
  if (state.instanceCount === 0) reasons.push("감시 대상 DB 인스턴스가 없습니다");
  if (state.userGroupCount === 0) reasons.push("알림 받을 사용자 그룹이 없습니다");
  if (reasons.length > 0) process.stderr.write(`경고: 이 알림 그룹으로는 알림이 가지 않습니다. ${reasons.join(", ")}.\n`);
}

const listCommand = withRdsMysqlOptions(
  new Command("list").description("알림 그룹 목록을 조회한다. 감시 대상 DB 인스턴스는 get 으로 본다"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);

  const groups = await withRdsMysqlSpinner("알림 그룹 목록 조회 중...", () => client.listNotificationGroups());
  output(opts, {
    headers: ["notificationGroupId", "notificationGroupName", "isEnabled", "notifyEmail", "notifySms"],
    rows: groups.map((g) => [
      formatCell(g.notificationGroupId),
      formatCell(g.notificationGroupName),
      formatCell(g.isEnabled),
      formatCell(g.notifyEmail),
      formatCell(g.notifySms),
    ]),
    raw: groups,
    ids: groups.map((g) => g.notificationGroupId),
  });
});

const getCommand = withRdsMysqlOptions(
  new Command("get").description("알림 그룹의 감시 대상 DB 인스턴스와 사용자 그룹을 조회한다").argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const rows = [
    ...group.dbInstances.map((i) => ["dbInstance", formatCell(i.dbInstanceId), formatCell(i.dbInstanceName)]),
    ...group.userGroups.map((u) => ["userGroup", formatCell(u.userGroupId), formatCell(u.userGroupName)]),
  ];
  output(opts, {
    headers: ["kind", "id", "name"],
    rows,
    raw: group,
    ids: [...group.dbInstances.map((i) => i.dbInstanceId), ...group.userGroups.map((u) => u.userGroupId)],
  });
  process.stderr.write(
    `알림 그룹 ${sanitizeForTerminal(group.notificationGroupName)} (${group.isEnabled ? "활성" : "비활성"}, 이메일 ${group.notifyEmail ? "켬" : "끔"}, SMS ${group.notifySms ? "켬" : "끔"})\n`,
  );
  warnSilentGroup({
    isEnabled: group.isEnabled,
    notifyEmail: group.notifyEmail,
    notifySms: group.notifySms,
    instanceCount: group.dbInstances.length,
    userGroupCount: group.userGroups.length,
  });
});

function addChannelOptions(command: Command): Command {
  return command
    .option("--email", "이메일 알림을 켠다")
    .option("--no-email", "이메일 알림을 끈다")
    .option("--sms", "SMS 알림을 켠다")
    .option("--no-sms", "SMS 알림을 끈다")
    .option("--enable", "알림 그룹을 활성화한다")
    .option("--disable", "알림 그룹을 비활성화한다");
}

interface ChannelOptions {
  email?: boolean;
  sms?: boolean;
  enable?: boolean;
  disable?: boolean;
}

interface CreateOptions extends RdsMysqlWriteOptions, ChannelOptions {
  name: string;
  instance: string[];
  userGroup: string[];
}

const createCommand = addChannelOptions(
  withRdsMysqlConfirmOptions(
    new Command("create")
      .description("알림 그룹을 만든다. 기본은 활성, 이메일과 SMS 알림 켬이다. --yes가 없으면 미리보기만 한다")
      .requiredOption("--name <name>", "알림 그룹 이름 (1~100자)")
      .option("--instance <db-instance-id>", "감시할 DB 인스턴스 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--user-group <user-group-id>", "알림 받을 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<CreateOptions>();
  checkLength(opts.name, "--name", 100);
  const instanceIds = parseUuidList(opts.instance, "--instance");
  const userGroupIds = parseUuidList(opts.userGroup, "--user-group");
  const isEnabled = resolveSwitch(opts.enable, opts.disable, "--enable", "--disable") ?? true;
  const notifyEmail = opts.email ?? true;
  const notifySms = opts.sms ?? true;
  const { client } = await resolveRdsMysqlClient(opts);

  const { instanceNames, userGroupNames } = await resolveTargets(client, instanceIds, userGroupIds);
  const groups = await withRdsMysqlSpinner("같은 이름의 알림 그룹 확인 중...", () => client.listNotificationGroups());
  if (groups.some((g) => g.notificationGroupName === opts.name)) {
    fail(`같은 이름의 알림 그룹이 이미 있습니다: ${JSON.stringify(opts.name)}. ${HINT} list로 확인하세요.`);
  }
  warnSilentGroup({ isEnabled, notifyEmail, notifySms, instanceCount: instanceIds.length, userGroupCount: userGroupIds.length });
  const result = rdsMysqlOperationResult({
    operation: "notification-group-create",
    target: opts.name,
    action: "create",
    details: {
      isEnabled,
      notifyEmail,
      notifySms,
      dbInstances: instanceIds.map((id) => `${instanceNames.get(id)} (${id})`),
      userGroups: userGroupIds.map((id) => `${userGroupNames.get(id)} (${id})`),
    },
  });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      result["createdId"] = await client.createNotificationGroup({
        notificationGroupName: opts.name,
        notifyEmail,
        notifySms,
        isEnabled,
        dbInstanceIds: instanceIds,
        userGroupIds,
      });
      return null;
    },
    `${HINT} list`,
  );
});

interface UpdateOptions extends RdsMysqlWriteOptions, ChannelOptions {
  name?: string;
  addInstance: string[];
  removeInstance: string[];
  addUserGroup: string[];
  removeUserGroup: string[];
}

const updateCommand = addChannelOptions(
  withRdsMysqlConfirmOptions(
    new Command("update")
      .description(
        "알림 그룹의 이름, 알림 방식, 활성 여부, 감시 대상 DB 인스턴스, 사용자 그룹을 바꾼다. 목록은 현재 값에 더하고 뺀다. --yes가 없으면 미리보기만 한다",
      )
      .argument(GROUP_ID, GROUP_ID_DESCRIPTION)
      .option("--name <name>", "새 이름 (1~100자)")
      .option("--add-instance <db-instance-id>", "감시 대상에 더할 DB 인스턴스 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--remove-instance <db-instance-id>", "감시 대상에서 뺄 DB 인스턴스 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--add-user-group <user-group-id>", "더할 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--remove-user-group <user-group-id>", "뺄 사용자 그룹 ID. 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<UpdateOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  if (opts.name !== undefined) checkLength(opts.name, "--name", 100);
  const addInstance = parseUuidList(opts.addInstance, "--add-instance");
  const removeInstance = parseUuidList(opts.removeInstance, "--remove-instance");
  const addUserGroup = parseUuidList(opts.addUserGroup, "--add-user-group");
  const removeUserGroup = parseUuidList(opts.removeUserGroup, "--remove-user-group");
  assertNoOverlap(addInstance, removeInstance, "--add-instance", "--remove-instance");
  assertNoOverlap(addUserGroup, removeUserGroup, "--add-user-group", "--remove-user-group");
  const enabledChange = resolveSwitch(opts.enable, opts.disable, "--enable", "--disable");
  const nothing =
    opts.name === undefined &&
    opts.email === undefined &&
    opts.sms === undefined &&
    enabledChange === undefined &&
    [addInstance, removeInstance, addUserGroup, removeUserGroup].every((list) => list.length === 0);
  if (nothing) fail("바꿀 항목을 하나 이상 지정해야 합니다 (--name, --email, --sms, --enable, --add-instance 등).");
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const currentInstances = group.dbInstances.map((i) => i.dbInstanceId);
  const currentUserGroups = group.userGroups.map((u) => u.userGroupId);
  const missing = [
    ...removeInstance.filter((value) => !currentInstances.includes(value)),
    ...removeUserGroup.filter((value) => !currentUserGroups.includes(value)),
  ];
  if (missing.length > 0) fail(`이 알림 그룹에 없는 항목을 뺄 수 없습니다: ${missing.join(", ")}. ${HINT} get ${id}로 확인하세요.`);
  const instanceIds = mergeList(currentInstances, addInstance, removeInstance);
  const userGroupIds = mergeList(currentUserGroups, addUserGroup, removeUserGroup);
  const { instanceNames, userGroupNames } = await resolveTargets(client, addInstance, addUserGroup);

  const next = {
    notificationGroupName: opts.name ?? group.notificationGroupName,
    notifyEmail: opts.email ?? group.notifyEmail,
    notifySms: opts.sms ?? group.notifySms,
    isEnabled: enabledChange ?? group.isEnabled,
  };
  const details: RdsMysqlDetails = { notificationGroupId: id };
  if (next.notificationGroupName !== group.notificationGroupName) {
    details["name"] = `${formatCell(group.notificationGroupName)} -> ${formatCell(next.notificationGroupName)}`;
  }
  if (next.notifyEmail !== group.notifyEmail) details["notifyEmail"] = `${group.notifyEmail} -> ${next.notifyEmail}`;
  if (next.notifySms !== group.notifySms) details["notifySms"] = `${group.notifySms} -> ${next.notifySms}`;
  if (next.isEnabled !== group.isEnabled) details["isEnabled"] = `${group.isEnabled} -> ${next.isEnabled}`;
  const instancesChanged = !sameSet(instanceIds, currentInstances);
  const userGroupsChanged = !sameSet(userGroupIds, currentUserGroups);
  if (instancesChanged) {
    details["dbInstanceCount"] = `${currentInstances.length} -> ${instanceIds.length}`;
    details["addedDbInstances"] = addInstance.map((value) => `${instanceNames.get(value)} (${value})`);
    details["removedDbInstances"] = removeInstance.map(
      (value) => `${group.dbInstances.find((i) => i.dbInstanceId === value)?.dbInstanceName ?? "-"} (${value})`,
    );
  }
  if (userGroupsChanged) {
    details["userGroupCount"] = `${currentUserGroups.length} -> ${userGroupIds.length}`;
    details["addedUserGroups"] = addUserGroup.map((value) => `${userGroupNames.get(value)} (${value})`);
    details["removedUserGroups"] = removeUserGroup.map(
      (value) => `${group.userGroups.find((u) => u.userGroupId === value)?.userGroupName ?? "-"} (${value})`,
    );
  }
  const unchanged = Object.keys(details).length === 1 && !instancesChanged && !userGroupsChanged;
  const result = rdsMysqlOperationResult({
    operation: "notification-group-update",
    target: group.notificationGroupName,
    action: unchanged ? "unchanged" : "update",
    details,
  });
  if (unchanged) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  warnSilentGroup({ ...next, instanceCount: instanceIds.length, userGroupCount: userGroupIds.length });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      // 생략한 필드는 서버가 기본값(false, 빈 목록)으로 바꿀 수 있어 현재 값을 포함한 전체를 보낸다.
      await client.updateNotificationGroup(id, {
        ...next,
        dbInstanceIds: instanceIds,
        userGroupIds,
      });
      return null;
    },
    `${HINT} get ${id}`,
    async () => {
      const after = await client.getNotificationGroup(id);
      return (
        after.notificationGroupName === next.notificationGroupName &&
        after.notifyEmail === next.notifyEmail &&
        after.notifySms === next.notifySms &&
        after.isEnabled === next.isEnabled &&
        sameSet(after.dbInstances.map((i) => i.dbInstanceId), instanceIds) &&
        sameSet(after.userGroups.map((u) => u.userGroupId), userGroupIds)
      );
    },
  );
});

const deleteCommand = withRdsMysqlConfirmOptions(
  new Command("delete")
    .description("알림 그룹을 지운다. 지우면 이 그룹이 감시하던 DB 인스턴스의 알림이 멈춘다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const result = rdsMysqlOperationResult({
    operation: "notification-group-delete",
    target: group.notificationGroupName,
    action: "delete",
    details: {
      notificationGroupId: id,
      dbInstances: group.dbInstances.map((i) => `${i.dbInstanceName ?? "-"} (${i.dbInstanceId})`),
      userGroups: group.userGroups.map((u) => `${u.userGroupName ?? "-"} (${u.userGroupId})`),
    },
  });
  if (group.dbInstances.length > 0) {
    process.stderr.write(`경고: 지우면 이 알림 그룹이 감시하던 DB 인스턴스 ${group.dbInstances.length}개의 알림이 멈춥니다.\n`);
  }
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.deleteNotificationGroup(id);
      return null;
    },
    `${HINT} list`,
    async () => (await client.listNotificationGroups()).every((g) => g.notificationGroupId !== id),
  );
});

export const notificationGroupCommand = new Command("notification-group")
  .description("모니터링 알림 그룹 조회, 생성, 수정, 삭제 명령. 알림 그룹이 감시 대상 DB 인스턴스와 알림 받을 사용자 그룹을 묶는다")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(updateCommand)
  .addCommand(deleteCommand);
