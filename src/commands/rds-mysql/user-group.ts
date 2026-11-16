import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlProjectMember, RdsMysqlUserGroupDetail } from "../../services/rds-mysql/types.js";
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
  sameSet,
} from "./group-helpers.js";
import {
  applyRdsMysqlWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseUuidArgument,
  type RdsMysqlCommandOptions,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlConfirmOptions,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

const HINT = "nhncloud rds-mysql user-group";
const GROUP_ID = "<user-group-id>";
const GROUP_ID_DESCRIPTION = "사용자 그룹 ID (UUID)";

function getGroup(client: RdsMysqlClient, id: string): Promise<RdsMysqlUserGroupDetail> {
  return withRdsMysqlSpinner(`사용자 그룹 조회 중 (${id})...`, () => client.getUserGroup(id));
}

/** 멤버 ID 가 이 프로젝트의 멤버인지 확인한다. 아니면 요청 전에 종료 코드 3 이다. */
async function checkMembers(client: RdsMysqlClient, memberIds: readonly string[]): Promise<Map<string, RdsMysqlProjectMember>> {
  const members = await withRdsMysqlSpinner("프로젝트 멤버 조회 중...", () => client.listProjectMembers());
  const byId = new Map(members.map((m) => [m.memberId, m]));
  const unknown = memberIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    fail(`프로젝트 멤버가 아닌 ID 입니다: ${unknown.join(", ")}. nhncloud rds-mysql project members로 확인하세요.`);
  }
  return byId;
}

interface ListOptions extends RdsMysqlCommandOptions {
  page?: string;
  size?: string;
}

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("사용자 그룹 목록을 조회한다")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ListOptions>();
  const page = parsePageOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("사용자 그룹 목록 조회 중...", () => client.listUserGroups(page));
  output(opts, {
    headers: ["userGroupId", "userGroupName", "createdYmdt"],
    rows: list.items.map((g) => [formatCell(g.userGroupId), formatCell(g.userGroupName), formatCell(g.createdYmdt)]),
    raw: list.items,
    ids: list.items.map((g) => g.userGroupId),
  });
  noticeTruncated(list.totalCounts, list.items.length);
});

const getCommand = withRdsMysqlOptions(
  new Command("get").description("사용자 그룹과 멤버 ID 를 조회한다").argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  output(opts, {
    headers: ["memberId"],
    rows: group.members.map((m) => [formatCell(m.memberId)]),
    raw: group,
    ids: group.members.map((m) => m.memberId),
  });
  process.stderr.write(
    `사용자 그룹 ${sanitizeForTerminal(group.userGroupName)} (유형 ${sanitizeForTerminal(group.userGroupTypeCode ?? "알 수 없음")}), 멤버 ${group.members.length}명\n`,
  );
});

interface CreateOptions extends RdsMysqlWriteOptions {
  name: string;
  member: string[];
  allMembers?: boolean;
}

const createCommand = withRdsMysqlConfirmOptions(
  new Command("create")
    .description("사용자 그룹을 만든다. 알림 그룹이 이 그룹의 멤버에게 알림을 보낸다. --yes가 없으면 미리보기만 한다")
    .requiredOption("--name <name>", "사용자 그룹 이름")
    .option("--member <member-id>", "멤버 ID (project members 의 memberId). 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--all-members", "프로젝트 멤버 전체를 포함한다"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<CreateOptions>();
  checkLength(opts.name, "--name", 100);
  const memberIds = parseUuidList(opts.member, "--member");
  const selectAll = opts.allMembers === true;
  if (selectAll && memberIds.length > 0) fail("--all-members와 --member는 함께 쓸 수 없습니다.");
  if (!selectAll && memberIds.length === 0) fail("--member를 하나 이상 지정하거나 --all-members를 써야 합니다.");
  const { client } = await resolveRdsMysqlClient(opts);

  const members = await checkMembers(client, memberIds);
  const same = await withRdsMysqlSpinner("같은 이름의 사용자 그룹 확인 중...", () =>
    fetchAllPages((page) => client.listUserGroups({ page, size: 100 })),
  );
  if (same.some((g) => g.userGroupName === opts.name)) {
    fail(`같은 이름의 사용자 그룹이 이미 있습니다: ${JSON.stringify(opts.name)}. ${HINT} list로 확인하세요.`);
  }
  const result = rdsMysqlOperationResult({
    operation: "user-group-create",
    target: opts.name,
    action: "create",
    details: {
      memberScope: selectAll ? "프로젝트 멤버 전체" : "지정한 멤버",
      memberCount: selectAll ? null : memberIds.length,
      members: memberIds.map((id) => members.get(id)?.memberName ?? id),
    },
  });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      result["createdId"] = await client.createUserGroup({ userGroupName: opts.name, memberIds, selectAll });
      return null;
    },
    `${HINT} list`,
  );
});

interface UpdateOptions extends RdsMysqlWriteOptions {
  name?: string;
  addMember: string[];
  removeMember: string[];
  allMembers?: boolean;
}

const updateCommand = withRdsMysqlConfirmOptions(
  new Command("update")
    .description("사용자 그룹의 이름과 멤버를 바꾼다. 멤버는 현재 목록에 더하고 뺀다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION)
    .option("--name <name>", "새 이름")
    .option("--add-member <member-id>", "더할 멤버 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--remove-member <member-id>", "뺄 멤버 ID. 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--all-members", "프로젝트 멤버 전체를 포함하는 그룹으로 바꾼다")
    .option("--no-all-members", "전체 포함을 끄고 현재 멤버 목록을 개별 멤버로 유지한다"),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<UpdateOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const add = parseUuidList(opts.addMember, "--add-member");
  const remove = parseUuidList(opts.removeMember, "--remove-member");
  assertNoOverlap(add, remove, "--add-member", "--remove-member");
  if (opts.name !== undefined) checkLength(opts.name, "--name", 100);
  const changesMembers = add.length > 0 || remove.length > 0;
  if (opts.name === undefined && !changesMembers && opts.allMembers === undefined) {
    fail("바꿀 항목을 하나 이상 지정해야 합니다 (--name, --add-member, --remove-member, --all-members).");
  }
  if (opts.allMembers === true && changesMembers) fail("--all-members와 --add-member, --remove-member는 함께 쓸 수 없습니다.");
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const wasAll = group.userGroupTypeCode === "ENTIRE";
  const selectAll = opts.allMembers ?? wasAll;
  if (wasAll && selectAll && changesMembers) {
    fail("이 사용자 그룹은 프로젝트 멤버 전체를 포함합니다. 멤버를 더하거나 빼려면 --no-all-members를 함께 지정하세요.");
  }
  const currentIds = group.members.map((m) => m.memberId);
  const memberIds = mergeList(currentIds, add, remove);
  // 이미 속한 멤버가 프로젝트를 떠났어도 수정은 막지 않는다. 새로 더하는 멤버만 확인한다.
  const members = await checkMembers(client, add);
  const missingRemoved = remove.filter((value) => !currentIds.includes(value));
  if (missingRemoved.length > 0 && !(wasAll && opts.allMembers === false)) {
    fail(`이 사용자 그룹에 없는 멤버입니다: ${missingRemoved.join(", ")}. ${HINT} get ${id}로 확인하세요.`);
  }

  const nameChanged = opts.name !== undefined && opts.name !== group.userGroupName;
  const membersChanged = selectAll !== wasAll || (!selectAll && !sameSet(memberIds, currentIds));
  const details: Record<string, string | number | boolean | string[] | null> = { userGroupId: id };
  if (nameChanged) details["name"] = `${formatCell(group.userGroupName)} -> ${formatCell(opts.name)}`;
  if (membersChanged) {
    details["memberScope"] = selectAll ? "프로젝트 멤버 전체" : "지정한 멤버";
    details["memberCount"] = `${currentIds.length} -> ${selectAll ? "전체" : memberIds.length}`;
    details["addedMembers"] = add.map((value) => members.get(value)?.memberName ?? value);
    details["removedMembers"] = remove;
  }
  const unchanged = !nameChanged && !membersChanged;
  const result = rdsMysqlOperationResult({
    operation: "user-group-update",
    target: group.userGroupName,
    action: unchanged ? "unchanged" : "update",
    details,
  });
  if (unchanged) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  if (!selectAll && memberIds.length === 0) {
    process.stderr.write("경고: 멤버가 없는 사용자 그룹은 알림을 받을 사람이 없습니다.\n");
  }
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      // 생략한 필드는 서버가 비우거나 기본값으로 바꿀 수 있어 현재 값을 포함한 전체를 보낸다.
      await client.updateUserGroup(id, { userGroupName: opts.name ?? group.userGroupName, memberIds, selectAll });
      return null;
    },
    `${HINT} get ${id}`,
    async () => {
      const after = await client.getUserGroup(id);
      return (
        after.userGroupName === (opts.name ?? group.userGroupName) &&
        (selectAll ? after.userGroupTypeCode === "ENTIRE" : sameSet(after.members.map((m) => m.memberId), memberIds))
      );
    },
  );
});

/** 사용자 그룹을 쓰는 알림 그룹과 이벤트 구독을 찾는다. 삭제하면 이 알림을 받는 사람이 사라진다. */
async function findGroupUsers(client: RdsMysqlClient, id: string): Promise<{ notificationGroups: string[]; subscriptions: string[] }> {
  const notificationGroups = await withRdsMysqlSpinner("사용자 그룹을 쓰는 알림 그룹 확인 중...", async () => {
    const all = await client.listNotificationGroups();
    const details = await Promise.all(all.map((g) => client.getNotificationGroup(g.notificationGroupId)));
    return details.filter((g) => g.userGroups.some((u) => u.userGroupId === id)).map((g) => g.notificationGroupName);
  });
  const subscriptions = await withRdsMysqlSpinner("사용자 그룹을 쓰는 이벤트 구독 확인 중...", async () => {
    const all = await fetchAllPages((page) => client.listEventSubscriptions({ userGroupId: id, page, size: 100 }));
    return all.map((s) => s.eventSubscriptionName);
  });
  return { notificationGroups, subscriptions };
}

const deleteCommand = withRdsMysqlConfirmOptions(
  new Command("delete")
    .description("사용자 그룹을 지운다. 이 그룹을 쓰는 알림 그룹과 이벤트 구독이 있으면 목록을 경고로 보인다. --yes가 없으면 미리보기만 한다")
    .argument(GROUP_ID, GROUP_ID_DESCRIPTION),
).action(async (groupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(groupId, GROUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const users = await findGroupUsers(client, id);
  const result = rdsMysqlOperationResult({
    operation: "user-group-delete",
    target: group.userGroupName,
    action: "delete",
    details: {
      userGroupId: id,
      memberCount: group.members.length,
      usedByNotificationGroups: users.notificationGroups,
      usedByEventSubscriptions: users.subscriptions,
    },
  });
  if (users.notificationGroups.length > 0 || users.subscriptions.length > 0) {
    process.stderr.write(
      `경고: 이 사용자 그룹을 쓰는 알림 그룹 ${users.notificationGroups.length}개, 이벤트 구독 ${users.subscriptions.length}개가 있습니다. 지우면 그 알림을 받는 사람이 사라집니다. 서버가 삭제를 거절할 수도 있습니다.\n`,
    );
  }
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.deleteUserGroup(id);
      return null;
    },
    `${HINT} list`,
    () => isAbsentFromList((page) => client.listUserGroups({ page, size: 100 }), (g) => g.userGroupId, id),
  );
});

export const userGroupCommand = new Command("user-group")
  .description("알림을 받을 사용자 그룹 조회, 생성, 수정, 삭제 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(updateCommand)
  .addCommand(deleteCommand);
