import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type {
  RdsMysqlDbSecurityGroupDetail,
  RdsMysqlEventSubscription,
  RdsMysqlNotificationGroupDetail,
  RdsMysqlUserGroupDetail,
} from "../../services/rds-mysql/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { configureCommanderExitCodes } from "../commander-errors.js";
import { eventCommand, eventSubscriptionCommand } from "./event.js";
import { formatKst, mergeList, parseIsoInstant, resolveTimeRange } from "./group-helpers.js";
import { resolveRdsMysqlClient } from "./helpers.js";
import { metricCommand } from "./metric.js";
import { notificationGroupCommand } from "./notification-group.js";
import { parameterGroupCommand } from "./parameter-group.js";
import { dbSecurityGroupCommand, parsePortSpec } from "./security-group.js";
import { userGroupCommand } from "./user-group.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveRdsMysqlClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const SG_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const RULE_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const RULE_ID_2 = "bbbbbbbb-1111-2222-3333-444444444445";
const UG_ID = "cccccccc-1111-2222-3333-444444444444";
const UG_ID_2 = "cccccccc-1111-2222-3333-444444444445";
const NG_ID = "dddddddd-1111-2222-3333-444444444444";
const DB_ID = "eeeeeeee-1111-2222-3333-444444444444";
const DB_ID_2 = "eeeeeeee-1111-2222-3333-444444444445";
const MEMBER_ID = "ffffffff-1111-2222-3333-444444444444";
const MEMBER_ID_2 = "ffffffff-1111-2222-3333-444444444445";
const SUB_ID = "99999999-1111-2222-3333-444444444444";
const PG_ID = "88888888-1111-2222-3333-444444444444";

const client = new RdsMysqlClient("appkey", "token", "kr1", "real");
const spies = {
  listDbSecurityGroups: vi.spyOn(client, "listDbSecurityGroups"),
  getDbSecurityGroup: vi.spyOn(client, "getDbSecurityGroup"),
  createDbSecurityGroup: vi.spyOn(client, "createDbSecurityGroup"),
  updateDbSecurityGroup: vi.spyOn(client, "updateDbSecurityGroup"),
  deleteDbSecurityGroup: vi.spyOn(client, "deleteDbSecurityGroup"),
  createDbSecurityGroupRule: vi.spyOn(client, "createDbSecurityGroupRule"),
  updateDbSecurityGroupRule: vi.spyOn(client, "updateDbSecurityGroupRule"),
  deleteDbSecurityGroupRules: vi.spyOn(client, "deleteDbSecurityGroupRules"),
  listUserGroups: vi.spyOn(client, "listUserGroups"),
  getUserGroup: vi.spyOn(client, "getUserGroup"),
  createUserGroup: vi.spyOn(client, "createUserGroup"),
  updateUserGroup: vi.spyOn(client, "updateUserGroup"),
  deleteUserGroup: vi.spyOn(client, "deleteUserGroup"),
  listProjectMembers: vi.spyOn(client, "listProjectMembers"),
  listNotificationGroups: vi.spyOn(client, "listNotificationGroups"),
  getNotificationGroup: vi.spyOn(client, "getNotificationGroup"),
  createNotificationGroup: vi.spyOn(client, "createNotificationGroup"),
  updateNotificationGroup: vi.spyOn(client, "updateNotificationGroup"),
  deleteNotificationGroup: vi.spyOn(client, "deleteNotificationGroup"),
  listDbInstances: vi.spyOn(client, "listDbInstances"),
  listMetrics: vi.spyOn(client, "listMetrics"),
  getMetricStatistics: vi.spyOn(client, "getMetricStatistics"),
  listEventCodes: vi.spyOn(client, "listEventCodes"),
  listEvents: vi.spyOn(client, "listEvents"),
  listEventSubscriptions: vi.spyOn(client, "listEventSubscriptions"),
  createEventSubscription: vi.spyOn(client, "createEventSubscription"),
  updateEventSubscription: vi.spyOn(client, "updateEventSubscription"),
  deleteEventSubscription: vi.spyOn(client, "deleteEventSubscription"),
  listDbVersions: vi.spyOn(client, "listDbVersions"),
  listParameterGroups: vi.spyOn(client, "listParameterGroups"),
  getParameterGroup: vi.spyOn(client, "getParameterGroup"),
  createParameterGroup: vi.spyOn(client, "createParameterGroup"),
  deleteParameterGroup: vi.spyOn(client, "deleteParameterGroup"),
  waitForJob: vi.spyOn(client, "waitForJob"),
};

const SECURITY_GROUP: RdsMysqlDbSecurityGroupDetail = {
  dbSecurityGroupId: SG_ID,
  dbSecurityGroupName: "sg-a",
  description: "설명",
  progressStatus: "NONE",
  rules: [
    { ruleId: RULE_ID, direction: "INGRESS", etherType: "IPV4", cidr: "10.0.0.0/24", port: { portType: "PORT", minPort: 3306, maxPort: 3306 }, description: "앱" },
    { ruleId: RULE_ID_2, direction: "EGRESS", etherType: "IPV4", cidr: "0.0.0.0/0", port: { portType: "ALL" } },
  ],
};

const USER_GROUP: RdsMysqlUserGroupDetail = {
  userGroupId: UG_ID,
  userGroupName: "ug-a",
  userGroupTypeCode: "INDIVIDUAL_MEMBER",
  members: [{ memberId: MEMBER_ID }],
};

const NOTIFICATION_GROUP: RdsMysqlNotificationGroupDetail = {
  notificationGroupId: NG_ID,
  notificationGroupName: "ng-a",
  notifyEmail: true,
  notifySms: false,
  isEnabled: true,
  dbInstances: [{ dbInstanceId: DB_ID, dbInstanceName: "db1" }],
  userGroups: [{ userGroupId: UG_ID, userGroupName: "ug-a" }],
};

const SUBSCRIPTION: RdsMysqlEventSubscription = {
  eventSubscriptionId: SUB_ID,
  eventSubscriptionName: "sub-a",
  eventCategoryType: "INSTANCE",
  enabled: true,
  notifyEmail: true,
  notifySms: false,
  eventCodes: ["INSTC_02_01"],
  sources: [{ sourceId: DB_ID, eventCategoryType: "INSTANCE" }],
  userGroupIds: [UG_ID],
};

function program(): Command {
  const root = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(dbSecurityGroupCommand)
    .addCommand(userGroupCommand)
    .addCommand(notificationGroupCommand)
    .addCommand(metricCommand)
    .addCommand(eventCommand)
    .addCommand(eventSubscriptionCommand)
    .addCommand(parameterGroupCommand);
  configureCommanderExitCodes(root);
  return root;
}

async function run(...args: string[]): Promise<void> {
  await program().parseAsync(["node", "nhncloud", ...args]);
}

describe("rds-mysql 그룹·모니터링·이벤트 명령", () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>;
  let stderrWrite: MockInstance<typeof process.stderr.write>;
  const stdout = (): string => stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
  const stderr = (): string => stderrWrite.mock.calls.map((call) => String(call[0])).join("");
  const json = (): Record<string, unknown> => JSON.parse(stdout()) as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(resolveRdsMysqlClient).mockResolvedValue({ client, profileName: "default" });
    spies.listDbSecurityGroups.mockResolvedValue({ items: [SECURITY_GROUP], totalCounts: 1 });
    spies.getDbSecurityGroup.mockResolvedValue(SECURITY_GROUP);
    spies.createDbSecurityGroup.mockResolvedValue("new-sg");
    spies.updateDbSecurityGroup.mockResolvedValue(undefined);
    spies.deleteDbSecurityGroup.mockResolvedValue(undefined);
    spies.createDbSecurityGroupRule.mockResolvedValue("job-1");
    spies.updateDbSecurityGroupRule.mockResolvedValue("job-2");
    spies.deleteDbSecurityGroupRules.mockResolvedValue("job-3");
    spies.listUserGroups.mockResolvedValue({ items: [USER_GROUP, { userGroupId: UG_ID_2, userGroupName: "ug-b" }], totalCounts: 2 });
    spies.getUserGroup.mockResolvedValue(USER_GROUP);
    spies.createUserGroup.mockResolvedValue("new-ug");
    spies.updateUserGroup.mockResolvedValue(undefined);
    spies.deleteUserGroup.mockResolvedValue(undefined);
    spies.listProjectMembers.mockResolvedValue([
      { memberId: MEMBER_ID, memberName: "홍길동" },
      { memberId: MEMBER_ID_2, memberName: "김철수" },
    ] as never);
    spies.listNotificationGroups.mockResolvedValue([NOTIFICATION_GROUP]);
    spies.getNotificationGroup.mockResolvedValue(NOTIFICATION_GROUP);
    spies.createNotificationGroup.mockResolvedValue("new-ng");
    spies.updateNotificationGroup.mockResolvedValue(undefined);
    spies.deleteNotificationGroup.mockResolvedValue(undefined);
    spies.listDbInstances.mockResolvedValue([
      { dbInstanceId: DB_ID, dbInstanceName: "db1", dbInstanceStatus: "AVAILABLE" },
      { dbInstanceId: DB_ID_2, dbInstanceName: "db2", dbInstanceStatus: "AVAILABLE" },
    ]);
    spies.listMetrics.mockResolvedValue([{ measureName: "CPU_USAGE", unit: "%" }]);
    spies.getMetricStatistics.mockResolvedValue([{ measureName: "CPU_USAGE", unit: "%", values: [[1679298540, "7.5%"]] }]);
    spies.listEventCodes.mockResolvedValue([
      { eventCode: "INSTC_02_01", eventCategoryType: "INSTANCE" },
      { eventCode: "INSTC_02_02", eventCategoryType: "INSTANCE" },
    ]);
    spies.listEvents.mockResolvedValue({
      items: [{ eventCode: "INSTC_02_01", eventYmdt: "2026-01-01T00:00:00+09:00", sourceName: "db1", messages: [{ langCode: "EN", message: "en" }, { langCode: "KO", message: "한국어" }] }],
      totalCounts: 1,
    });
    spies.listEventSubscriptions.mockResolvedValue({ items: [SUBSCRIPTION], totalCounts: 1 });
    spies.createEventSubscription.mockResolvedValue("new-sub");
    spies.updateEventSubscription.mockResolvedValue(undefined);
    spies.deleteEventSubscription.mockResolvedValue(undefined);
    spies.listDbVersions.mockResolvedValue([{ dbVersion: "MYSQL_V8411", dbVersionName: "8.4.11" }] as never);
    spies.listParameterGroups.mockResolvedValue({ items: [], totalCounts: 0 });
    spies.getParameterGroup.mockResolvedValue({
      parameterGroupId: PG_ID,
      parameterGroupName: "pg-a",
      dbVersion: "MYSQL_V8411",
      parameterGroupType: "USER",
      parameterGroupStatus: "STABLE",
      parameters: [],
    });
    spies.createParameterGroup.mockResolvedValue("new-pg");
    spies.deleteParameterGroup.mockResolvedValue(undefined);
    spies.waitForJob.mockResolvedValue({ outcome: "completed", job: { jobId: "job-1", jobStatus: "COMPLETED" } });
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  describe("입력 해석", () => {
    it("포트 지정은 번호, 범위, db, all 을 본문으로 바꾸고 범위 밖이면 거부한다", () => {
      expect(parsePortSpec("3306")).toStrictEqual({ portType: "PORT", minPort: 3306, maxPort: 3306 });
      expect(parsePortSpec("3306-3310")).toStrictEqual({ portType: "PORT_RANGE", minPort: 3306, maxPort: 3310 });
      expect(parsePortSpec("DB")).toStrictEqual({ portType: "DB_PORT" });
      expect(parsePortSpec("all")).toStrictEqual({ portType: "ALL" });
      expect(() => parsePortSpec("80")).toThrow("3306 이상");
      expect(() => parsePortSpec("3310-3306")).toThrow("시작은 끝보다");
      expect(() => parsePortSpec("abc")).toThrow("숫자");
    });

    it("시각은 +0900 도 받아 +09:00 으로 바꾸고 시간대가 없으면 거부한다", () => {
      const instant = parseIsoInstant("2026-01-31T09:00:00+0900", "--from");
      expect(formatKst(instant)).toBe("2026-01-31T09:00:00+09:00");
      expect(formatKst(Date.parse("2026-01-31T00:00:00Z"))).toBe("2026-01-31T09:00:00+09:00");
      expect(() => parseIsoInstant("2026-01-31T09:00:00", "--from")).toThrow("시간대가 있는 ISO 8601");
    });

    it("범위는 --last 나 --from 으로 정하고 시작이 종료보다 늦으면 거부한다", () => {
      const now = Date.parse("2026-01-31T00:00:00Z");
      expect(resolveTimeRange({ last: "1h" }, now)).toStrictEqual({ from: "2026-01-31T08:00:00+09:00", to: "2026-01-31T09:00:00+09:00" });
      expect(() => resolveTimeRange({}, now)).toThrow("--from");
      expect(() => resolveTimeRange({ last: "1h", from: "2026-01-30T00:00:00Z" }, now)).toThrow("함께 쓸 수 없습니다");
      expect(() => resolveTimeRange({ from: "2026-02-01T00:00:00Z" }, now)).toThrow("앞이어야");
      expect(() => resolveTimeRange({ last: "1w" }, now)).toThrow("m|h|d");
    });

    it("목록 더하기·빼기는 현재 값을 유지하고 중복을 만들지 않는다", () => {
      expect(mergeList(["a", "b"], ["b", "c"], ["a"])).toStrictEqual(["b", "c"]);
    });
  });

  describe("db-security-group", () => {
    it("list 와 get 은 조회 결과를 보인다", async () => {
      await run("--quiet", "db-security-group", "list");
      expect(stdout().trim()).toBe(SG_ID);

      stdoutWrite.mockClear();
      await run("--json", "db-security-group", "get", SG_ID);
      expect((json()["rules"] as unknown[]).length).toBe(2);
    });

    it("create 미리보기는 규칙을 보이고 요청하지 않으며, 모든 주소 허용은 경고한다", async () => {
      await run("--json", "db-security-group", "create", "--name", "sg-new", "--rule", "ingress,0.0.0.0/0,3306", "--rule", "egress,::/0,all");

      expect(spies.createDbSecurityGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "db-security-group-create", applied: false, ruleCount: 2 });
      expect(stderr()).toContain("모든 주소(0.0.0.0/0)");
      expect(stderr()).toContain("미리보기입니다");
    });

    it("create --yes 는 규칙을 본문에 담아 만들고 createdId 를 낸다", async () => {
      await run("--json", "db-security-group", "create", "--name", "sg-new", "--rule", "ingress,10.0.0.0/24,db", "--yes");

      expect(spies.createDbSecurityGroup).toHaveBeenCalledWith({
        dbSecurityGroupName: "sg-new",
        rules: [{ direction: "INGRESS", etherType: "IPV4", port: { portType: "DB_PORT" }, cidr: "10.0.0.0/24" }],
      });
      expect(json()).toMatchObject({ applied: true, createdId: "new-sg" });
    });

    it("create 는 같은 이름이 있거나 규칙 형식이 틀리면 요청 전에 종료 코드 3 이다", async () => {
      await expect(run("db-security-group", "create", "--name", "sg-a", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("db-security-group", "create", "--name", "x", "--rule", "in,10.0.0.0/24,3306", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      await expect(run("db-security-group", "create", "--name", "x", "--rule", "ingress,10.0.0.0/33,3306", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      expect(spies.createDbSecurityGroup).not.toHaveBeenCalled();
    });

    it("update 는 바뀌는 항목만 보내고, 같으면 요청하지 않는다", async () => {
      await run("--json", "db-security-group", "update", SG_ID, "--name", "sg-b", "--description", "설명", "--yes");
      expect(spies.updateDbSecurityGroup).toHaveBeenCalledWith(SG_ID, { dbSecurityGroupName: "sg-b" });

      spies.updateDbSecurityGroup.mockClear();
      await run("--json", "db-security-group", "update", SG_ID, "--name", "sg-a", "--yes");
      expect(spies.updateDbSecurityGroup).not.toHaveBeenCalled();
      expect(stderr()).toContain("이미 같아");
    });

    it("update 는 바꿀 항목이 없으면 종료 코드 3 이다", async () => {
      await expect(run("db-security-group", "update", SG_ID)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("delete 는 --yes 없이 요청하지 않고, --yes 에서 지운다", async () => {
      await run("--json", "db-security-group", "delete", SG_ID);
      expect(spies.deleteDbSecurityGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "db-security-group-delete", ruleCount: 2, applied: false });

      stdoutWrite.mockClear();
      await run("--json", "db-security-group", "delete", SG_ID, "--yes");
      expect(spies.deleteDbSecurityGroup).toHaveBeenCalledWith(SG_ID);
      expect(json()).toMatchObject({ applied: true });
    });

    it("delete 가 오류로 끝나도 목록에서 사라졌으면 반영된 것으로 처리한다", async () => {
      spies.deleteDbSecurityGroup.mockRejectedValue(new Error("network"));
      spies.listDbSecurityGroups.mockResolvedValue({ items: [], totalCounts: 0 });

      await run("--json", "db-security-group", "delete", SG_ID, "--yes");

      expect(json()).toMatchObject({ applied: true, verifiedAfterError: true });
    });

    it("rule create 는 CIDR 로 ether type 을 정하고 모든 주소 허용을 경고한다", async () => {
      await run("--json", "db-security-group", "rule", "create", SG_ID, "--direction", "ingress", "--cidr", "0.0.0.0/0", "--port", "3306-3310", "--description", "공개", "--yes");

      expect(spies.createDbSecurityGroupRule).toHaveBeenCalledWith(SG_ID, {
        direction: "INGRESS",
        etherType: "IPV4",
        port: { portType: "PORT_RANGE", minPort: 3306, maxPort: 3310 },
        cidr: "0.0.0.0/0",
        description: "공개",
      });
      expect(stderr()).toContain("모든 주소");
      expect(json()).toMatchObject({ applied: true, jobId: "job-1" });
    });

    it("rule create 는 ether type 과 CIDR 이 어긋나면 종료 코드 3 이다", async () => {
      await expect(
        run("db-security-group", "rule", "create", SG_ID, "--direction", "ingress", "--cidr", "10.0.0.0/24", "--port", "db", "--ether-type", "ipv6", "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.createDbSecurityGroupRule).not.toHaveBeenCalled();
    });

    it("rule update 는 지정하지 않은 항목을 현재 값으로 채워 보낸다", async () => {
      await run("--json", "db-security-group", "rule", "update", SG_ID, RULE_ID, "--cidr", "10.1.0.0/16", "--yes");

      expect(spies.updateDbSecurityGroupRule).toHaveBeenCalledWith(SG_ID, RULE_ID, {
        direction: "INGRESS",
        etherType: "IPV4",
        port: { portType: "PORT", minPort: 3306, maxPort: 3306 },
        cidr: "10.1.0.0/16",
        description: "앱",
      });
    });

    it("rule update 는 없는 규칙이면 종료 코드 3 이다", async () => {
      await expect(
        run("db-security-group", "rule", "update", SG_ID, SG_ID, "--cidr", "10.1.0.0/16", "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("rule delete 는 규칙을 미리 보이고 --yes 에서 한 번에 지운다", async () => {
      await run("--json", "db-security-group", "rule", "delete", SG_ID, RULE_ID);
      expect(spies.deleteDbSecurityGroupRules).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ ruleCount: 1 });

      await run("db-security-group", "rule", "delete", SG_ID, RULE_ID, RULE_ID_2, "--yes");
      expect(spies.deleteDbSecurityGroupRules).toHaveBeenCalledWith(SG_ID, [RULE_ID, RULE_ID_2]);
      expect(stderr()).toContain("모든 규칙을 지우면");
    });

    it("rule delete 는 그룹에 없는 규칙이면 종료 코드 3 이다", async () => {
      await expect(run("db-security-group", "rule", "delete", SG_ID, SG_ID, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });
  });

  describe("user-group", () => {
    it("get 은 멤버 ID 를 보인다", async () => {
      await run("--quiet", "user-group", "get", UG_ID);
      expect(stdout().trim()).toBe(MEMBER_ID);
    });

    it("create 는 멤버나 --all-members 중 하나가 있어야 하고, 멤버가 프로젝트에 없으면 거부한다", async () => {
      await expect(run("user-group", "create", "--name", "x", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("user-group", "create", "--name", "x", "--member", DB_ID, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.createUserGroup).not.toHaveBeenCalled();
    });

    it("create --yes 는 멤버 목록으로 만들고 미리보기에는 멤버 이름을 보인다", async () => {
      await run("--json", "user-group", "create", "--name", "ug-new", "--member", MEMBER_ID);
      expect(spies.createUserGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ members: ["홍길동"], memberCount: 1 });

      stdoutWrite.mockClear();
      await run("--json", "user-group", "create", "--name", "ug-new", "--member", MEMBER_ID, "--yes");
      expect(spies.createUserGroup).toHaveBeenCalledWith({ userGroupName: "ug-new", memberIds: [MEMBER_ID], selectAll: false });
      expect(json()).toMatchObject({ createdId: "new-ug" });
    });

    it("update 는 현재 멤버에 더하고 빼며 이름과 전체 멤버 목록을 함께 보낸다", async () => {
      await run("--json", "user-group", "update", UG_ID, "--add-member", MEMBER_ID_2, "--yes");

      expect(spies.updateUserGroup).toHaveBeenCalledWith(UG_ID, { userGroupName: "ug-a", memberIds: [MEMBER_ID, MEMBER_ID_2], selectAll: false });
    });

    it("update 는 없는 멤버를 빼려 하거나 더하면서 빼는 값이 겹치면 종료 코드 3 이다", async () => {
      await expect(run("user-group", "update", UG_ID, "--remove-member", MEMBER_ID_2, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(
        run("user-group", "update", UG_ID, "--add-member", MEMBER_ID_2, "--remove-member", MEMBER_ID_2, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.updateUserGroup).not.toHaveBeenCalled();
    });

    it("update 는 전체 멤버 그룹의 개별 멤버 변경에 --no-all-members 를 요구한다", async () => {
      spies.getUserGroup.mockResolvedValue({ ...USER_GROUP, userGroupTypeCode: "ENTIRE" });
      await expect(run("user-group", "update", UG_ID, "--add-member", MEMBER_ID_2, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      await run("user-group", "update", UG_ID, "--add-member", MEMBER_ID_2, "--no-all-members", "--yes");
      expect(spies.updateUserGroup).toHaveBeenCalledWith(UG_ID, expect.objectContaining({ selectAll: false }));
    });

    it("update 는 바뀌는 값이 없으면 요청하지 않는다", async () => {
      await run("user-group", "update", UG_ID, "--name", "ug-a", "--yes");
      expect(spies.updateUserGroup).not.toHaveBeenCalled();
    });

    it("delete 는 이 그룹을 쓰는 알림 그룹과 이벤트 구독을 경고한다", async () => {
      await run("--json", "user-group", "delete", UG_ID);

      expect(spies.deleteUserGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ usedByNotificationGroups: ["ng-a"], usedByEventSubscriptions: ["sub-a"] });
      expect(stderr()).toContain("알림 그룹 1개, 이벤트 구독 1개");

      await run("--json", "user-group", "delete", UG_ID, "--yes");
      expect(spies.deleteUserGroup).toHaveBeenCalledWith(UG_ID);
    });
  });

  describe("notification-group", () => {
    it("list 는 활성 여부와 알림 방식을, get 은 감시 대상을 보인다", async () => {
      await run("--json", "notification-group", "list");
      expect(JSON.parse(stdout())).toHaveLength(1);

      stdoutWrite.mockClear();
      await run("--quiet", "notification-group", "get", NG_ID);
      expect(stdout().trim().split("\n")).toStrictEqual([DB_ID, UG_ID]);
    });

    it("get 은 알림이 나가지 않는 설정을 경고한다", async () => {
      spies.getNotificationGroup.mockResolvedValue({ ...NOTIFICATION_GROUP, dbInstances: [] });

      await run("--json", "notification-group", "get", NG_ID);

      expect(stderr()).toContain("감시 대상 DB 인스턴스가 없습니다");
    });

    it("create 는 기본값(활성, 이메일·SMS 켬)으로 감시 대상과 사용자 그룹을 보낸다", async () => {
      await run("--json", "notification-group", "create", "--name", "ng-new", "--instance", DB_ID, "--instance", DB_ID_2, "--user-group", UG_ID, "--yes");

      expect(spies.createNotificationGroup).toHaveBeenCalledWith({
        notificationGroupName: "ng-new",
        notifyEmail: true,
        notifySms: true,
        isEnabled: true,
        dbInstanceIds: [DB_ID, DB_ID_2],
        userGroupIds: [UG_ID],
      });
      expect(json()).toMatchObject({ createdId: "new-ng" });
    });

    it("create 는 없는 DB 인스턴스나 사용자 그룹이면 요청 전에 종료 코드 3 이다", async () => {
      await expect(
        run("notification-group", "create", "--name", "n", "--instance", MEMBER_ID, "--user-group", UG_ID, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(
        run("notification-group", "create", "--name", "n", "--instance", DB_ID, "--user-group", MEMBER_ID, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.createNotificationGroup).not.toHaveBeenCalled();
    });

    it("create --no-email --no-sms --disable 은 알림이 가지 않는다고 경고한다", async () => {
      await run("--json", "notification-group", "create", "--name", "n", "--no-email", "--no-sms", "--disable");

      expect(stderr()).toContain("비활성 상태입니다");
      expect(stderr()).toContain("모두 꺼져 있습니다");
      expect(json()).toMatchObject({ isEnabled: false, notifyEmail: false, notifySms: false });
    });

    it("create 는 같은 이름이 있으면 종료 코드 3 이다", async () => {
      await expect(run("notification-group", "create", "--name", "ng-a", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("update 는 지정하지 않은 필드를 현재 값으로 채워 전체를 보낸다", async () => {
      await run("--json", "notification-group", "update", NG_ID, "--add-instance", DB_ID_2, "--sms", "--yes");

      expect(spies.updateNotificationGroup).toHaveBeenCalledWith(NG_ID, {
        notificationGroupName: "ng-a",
        notifyEmail: true,
        notifySms: true,
        isEnabled: true,
        dbInstanceIds: [DB_ID, DB_ID_2],
        userGroupIds: [UG_ID],
      });
      expect(json()).toMatchObject({ dbInstanceCount: "1 -> 2", notifySms: "false -> true" });
    });

    it("update --disable 은 요청하되 알림이 멈춘다고 경고하고, 없는 항목을 빼려 하면 거부한다", async () => {
      await run("notification-group", "update", NG_ID, "--disable", "--remove-user-group", UG_ID, "--yes");
      expect(spies.updateNotificationGroup).toHaveBeenCalledWith(
        NG_ID,
        expect.objectContaining({ isEnabled: false, userGroupIds: [] }),
      );
      expect(stderr()).toContain("알림이 가지 않습니다");

      await expect(run("notification-group", "update", NG_ID, "--remove-instance", DB_ID_2, "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
    });

    it("update 는 --enable 과 --disable 을 함께 받지 않고, 바뀌는 값이 없으면 요청하지 않는다", async () => {
      await expect(run("notification-group", "update", NG_ID, "--enable", "--disable")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      spies.updateNotificationGroup.mockClear();

      await run("notification-group", "update", NG_ID, "--enable", "--yes");
      expect(spies.updateNotificationGroup).not.toHaveBeenCalled();
    });

    it("delete 는 감시 대상을 보이고 알림이 멈춘다고 경고하며 --yes 에서 지운다", async () => {
      await run("--json", "notification-group", "delete", NG_ID);
      expect(spies.deleteNotificationGroup).not.toHaveBeenCalled();
      expect(stderr()).toContain("알림이 멈춥니다");

      await run("notification-group", "delete", NG_ID, "--yes");
      expect(spies.deleteNotificationGroup).toHaveBeenCalledWith(NG_ID);
    });
  });

  describe("metric", () => {
    it("list 는 지표 이름과 단위를 보인다", async () => {
      await run("--quiet", "metric", "list");
      expect(stdout().trim()).toBe("CPU_USAGE");
    });

    it("statistics 는 +09:00 시각과 쉼표로 나눈 지표 목록을 보내고 행마다 시각을 보인다", async () => {
      await run(
        "--json", "metric", "statistics", DB_ID, "--metric", "CPU_USAGE,MEMORY_USAGE", "--metric", "CPU_USAGE",
        "--from", "2026-01-31T09:00:00+0900", "--to", "2026-01-31T10:00:00Z", "--interval", "5",
      );

      expect(spies.getMetricStatistics).toHaveBeenCalledWith({
        dbInstanceId: DB_ID,
        measureNames: ["CPU_USAGE", "MEMORY_USAGE"],
        from: "2026-01-31T09:00:00+09:00",
        to: "2026-01-31T19:00:00+09:00",
        interval: 5,
      });
      expect(stderr()).toContain("응답에 없는 지표가 있습니다");
    });

    it("statistics 는 시각이 없거나 형식이 틀리면 요청 전에 종료 코드 3 이다", async () => {
      await expect(run("metric", "statistics", DB_ID, "--metric", "CPU_USAGE")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(
        run("metric", "statistics", DB_ID, "--metric", "CPU_USAGE", "--from", "2026-01-31 09:00", "--to", "2026-01-31T10:00:00Z"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.getMetricStatistics).not.toHaveBeenCalled();
    });

    it("statistics --last 는 지금까지의 기간을 조회한다", async () => {
      await run("--json", "metric", "statistics", DB_ID, "--metric", "CPU_USAGE", "--last", "30m");

      const call = spies.getMetricStatistics.mock.calls[0]?.[0];
      expect(call?.from).toMatch(/\+09:00$/);
      expect(Date.parse(call?.to as string) - Date.parse(call?.from as string)).toBe(30 * 60 * 1000);
    });
  });

  describe("event", () => {
    it("list 는 카테고리를 대문자로 보내고 한국어 메시지를 보인다", async () => {
      await run("--json", "event", "list", "--last", "1d", "--category", "db-security-group", "--asc", "--keyword", "fail");

      expect(spies.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ eventCategoryType: "DB_SECURITY_GROUP", ascendingOrder: "ASC", keyword: "fail" }),
      );
      await run("event", "list", "--last", "1h");
      expect(stdout()).toContain("한국어");
    });

    it("list 는 카테고리가 틀리면 종료 코드 3 이다", async () => {
      await expect(run("event", "list", "--last", "1h", "--category", "x")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("codes 는 구독할 수 있는 코드를 보인다", async () => {
      await run("--quiet", "event", "codes");
      expect(stdout().trim().split("\n")).toStrictEqual(["INSTC_02_01", "INSTC_02_02"]);
    });
  });

  describe("event-subscription", () => {
    it("list 는 구독을 보인다", async () => {
      await run("--quiet", "event-subscription", "list", "--user-group", UG_ID);
      expect(stdout().trim()).toBe(SUB_ID);
      expect(spies.listEventSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ userGroupId: UG_ID }));
    });

    it("create 는 코드와 사용자 그룹을 확인하고 소스에 카테고리를 붙여 보낸다", async () => {
      await run(
        "--json", "event-subscription", "create", "--name", "sub-new", "--category", "instance",
        "--event-code", "INSTC_02_01", "--source", DB_ID, "--user-group", UG_ID, "--no-sms", "--yes",
      );

      expect(spies.createEventSubscription).toHaveBeenCalledWith({
        eventCategoryType: "INSTANCE",
        eventSubscriptionName: "sub-new",
        enabled: true,
        notifyEmail: true,
        notifySms: false,
        eventCodes: ["INSTC_02_01"],
        sources: [{ sourceId: DB_ID, eventCategoryType: "INSTANCE" }],
        userGroupIds: [UG_ID],
      });
    });

    it("create 는 없는 이벤트 코드나 사용자 그룹이면 종료 코드 3 이다", async () => {
      await expect(
        run("event-subscription", "create", "--name", "n", "--category", "instance", "--event-code", "NOPE", "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(
        run("event-subscription", "create", "--name", "n", "--category", "instance", "--user-group", MEMBER_ID, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.createEventSubscription).not.toHaveBeenCalled();
    });

    it("update 는 현재 구독을 읽어 더하고 뺀 전체를 보낸다", async () => {
      await run("--json", "event-subscription", "update", SUB_ID, "--add-event-code", "INSTC_02_02", "--remove-user-group", UG_ID, "--enable", "--yes");

      expect(spies.updateEventSubscription).toHaveBeenCalledWith(SUB_ID, {
        eventCategoryType: "INSTANCE",
        eventSubscriptionName: "sub-a",
        enabled: true,
        notifyEmail: true,
        notifySms: false,
        eventCodes: ["INSTC_02_01", "INSTC_02_02"],
        sources: [{ sourceId: DB_ID, eventCategoryType: "INSTANCE" }],
        userGroupIds: [],
      });
      expect(stderr()).toContain("알림 받을 사용자 그룹이 없습니다");
    });

    it("update 는 없는 구독이거나 없는 항목을 빼면 종료 코드 3 이다", async () => {
      await expect(run("event-subscription", "update", SUB_ID, "--remove-event-code", "INSTC_02_02", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      spies.listEventSubscriptions.mockResolvedValue({ items: [], totalCounts: 0 });
      await expect(run("event-subscription", "update", SUB_ID, "--name", "x", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("delete 는 --yes 없이 요청하지 않고, 지운 뒤 오류가 나도 목록으로 반영을 확인한다", async () => {
      await run("event-subscription", "delete", SUB_ID);
      expect(spies.deleteEventSubscription).not.toHaveBeenCalled();

      stdoutWrite.mockClear();
      spies.deleteEventSubscription.mockRejectedValue(new Error("network"));
      spies.listEventSubscriptions.mockResolvedValueOnce({ items: [SUBSCRIPTION], totalCounts: 1 }).mockResolvedValue({ items: [], totalCounts: 0 });
      await run("--json", "event-subscription", "delete", SUB_ID, "--yes");
      expect(json()).toMatchObject({ applied: true, verifiedAfterError: true });
    });
  });

  describe("parameter-group create·delete", () => {
    it("create 는 엔진 버전과 같은 이름을 확인하고 --yes 에서 만든다", async () => {
      await run("--json", "parameter-group", "create", "--name", "pg-new", "--db-version", "MYSQL_V8411", "--description", "설명");
      expect(spies.createParameterGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "parameter-group-create", applied: false });

      stdoutWrite.mockClear();
      await run("--json", "parameter-group", "create", "--name", "pg-new", "--db-version", "MYSQL_V8411", "--description", "설명", "--yes");
      expect(spies.createParameterGroup).toHaveBeenCalledWith({ parameterGroupName: "pg-new", dbVersion: "MYSQL_V8411", description: "설명" });
      expect(json()).toMatchObject({ createdId: "new-pg" });
    });

    it("create 는 모르는 엔진 버전이면 종료 코드 3 이다", async () => {
      await expect(run("parameter-group", "create", "--name", "n", "--db-version", "NOPE", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      expect(spies.createParameterGroup).not.toHaveBeenCalled();
    });

    it("delete 는 --yes 없이 요청하지 않고, --yes 에서 지우며, 오류 뒤에는 목록으로 확인한다", async () => {
      await run("--json", "parameter-group", "delete", PG_ID);
      expect(spies.deleteParameterGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "parameter-group-delete", target: "pg-a", applied: false });

      spies.deleteParameterGroup.mockRejectedValue(new Error("network"));
      stdoutWrite.mockClear();
      await run("--json", "parameter-group", "delete", PG_ID, "--yes");
      expect(json()).toMatchObject({ applied: true, verifiedAfterError: true });
    });
  });
});
