import ky from "ky";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RdsMysqlClient } from "./client.js";

vi.mock("ky", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ky")>();
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

const ID = "11111111-2222-3333-4444-555555555555";
const RULE_ID = "99999999-2222-3333-4444-555555555555";
const base = "https://kr1-rds-mysql.api.nhncloudservice.com/v4.0";
const header = { resultCode: 0, resultMessage: "SUCCESS", isSuccessful: true };

function body(fields: Record<string, unknown> = {}) {
  const text = JSON.stringify({ header, ...fields });
  return { json: async () => JSON.parse(text), text: async () => text } as never;
}

function emptyBody() {
  return { json: async () => ({}), text: async () => "" } as never;
}

const client = () => new RdsMysqlClient("appkey", "token", "kr1", "real");

describe("RdsMysqlClient v4.0 보안 그룹·사용자 그룹·알림 그룹·모니터링·이벤트 API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("파라미터 그룹 생성은 parameterGroupId 를, 삭제는 빈 본문을 성공으로 받는다", async () => {
    vi.mocked(ky.post).mockReturnValue(body({ parameterGroupId: "pg-1" }));
    vi.mocked(ky.delete).mockReturnValue(emptyBody());

    await expect(client().createParameterGroup({ parameterGroupName: "pg", dbVersion: "MYSQL_V8411" })).resolves.toBe("pg-1");
    await expect(client().deleteParameterGroup(ID)).resolves.toBeUndefined();

    expect(vi.mocked(ky.post).mock.calls[0]?.[0]).toBe(`${base}/parameter-groups`);
    expect(vi.mocked(ky.post).mock.calls[0]?.[1]).toMatchObject({ json: { dbVersion: "MYSQL_V8411" }, retry: 0 });
    expect(vi.mocked(ky.delete).mock.calls[0]?.[0]).toBe(`${base}/parameter-groups/${ID}`);
  });

  it("보안 그룹 목록·상세는 가드를 통과하고 형식이 다르면 형식 오류다", async () => {
    vi.mocked(ky.get).mockReturnValueOnce(
      body({ totalCounts: 1, dbSecurityGroups: [{ dbSecurityGroupId: ID, dbSecurityGroupName: "sg", progressStatus: "NONE" }] }),
    );
    await expect(client().listDbSecurityGroups({ page: 2, size: 10 })).resolves.toMatchObject({ totalCounts: 1 });
    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/db-security-groups`);
    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).toMatchObject({ searchParams: { page: 2, size: 10 } });

    vi.mocked(ky.get).mockReturnValueOnce(
      body({
        dbSecurityGroupId: ID,
        dbSecurityGroupName: "sg",
        rules: [{ ruleId: RULE_ID, direction: "INGRESS", etherType: "IPV4", cidr: "10.0.0.0/24", port: { portType: "PORT", minPort: 3306, maxPort: 3306 } }],
      }),
    );
    const detail = await client().getDbSecurityGroup(ID);
    expect(detail.rules).toHaveLength(1);
    expect(vi.mocked(ky.get).mock.calls[1]?.[0]).toBe(`${base}/db-security-groups/${ID}`);

    vi.mocked(ky.get).mockReturnValueOnce(body({ dbSecurityGroupId: ID, dbSecurityGroupName: "sg", rules: "x" }));
    await expect(client().getDbSecurityGroup(ID)).rejects.toThrow("응답 형식 오류");
  });

  it("보안 그룹 생성·수정·삭제와 규칙 요청은 문서의 경로와 본문을 쓴다", async () => {
    vi.mocked(ky.post).mockReturnValueOnce(body({ dbSecurityGroupId: ID })).mockReturnValueOnce(body({ jobId: "job-1" }));
    vi.mocked(ky.put).mockReturnValueOnce(emptyBody()).mockReturnValueOnce(body({ jobId: "job-2" }));
    vi.mocked(ky.delete).mockReturnValueOnce(emptyBody()).mockReturnValueOnce(body({ jobId: "job-3" }));
    const rule = { direction: "INGRESS", etherType: "IPV4", port: { portType: "DB_PORT" }, cidr: "10.0.0.0/24" };

    await expect(client().createDbSecurityGroup({ dbSecurityGroupName: "sg", rules: [rule] })).resolves.toBe(ID);
    await expect(client().createDbSecurityGroupRule(ID, rule)).resolves.toBe("job-1");
    await expect(client().updateDbSecurityGroup(ID, { description: "d" })).resolves.toBeUndefined();
    await expect(client().updateDbSecurityGroupRule(ID, RULE_ID, rule)).resolves.toBe("job-2");
    await expect(client().deleteDbSecurityGroup(ID)).resolves.toBeUndefined();
    await expect(client().deleteDbSecurityGroupRules(ID, [RULE_ID, ID])).resolves.toBe("job-3");

    expect(vi.mocked(ky.post).mock.calls.map((c) => c[0])).toStrictEqual([`${base}/db-security-groups`, `${base}/db-security-groups/${ID}/rules`]);
    expect(vi.mocked(ky.put).mock.calls.map((c) => c[0])).toStrictEqual([`${base}/db-security-groups/${ID}`, `${base}/db-security-groups/${ID}/rules/${RULE_ID}`]);
    expect(vi.mocked(ky.delete).mock.calls[1]?.[0]).toBe(`${base}/db-security-groups/${ID}/rules`);
    expect(vi.mocked(ky.delete).mock.calls[1]?.[1]).toMatchObject({ searchParams: { ruleIds: `${RULE_ID},${ID}` }, retry: 0 });
  });

  it("사용자 그룹은 목록·상세·생성·수정·삭제를 호출한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(body({ totalCounts: 1, userGroups: [{ userGroupId: ID, userGroupName: "ug" }] }))
      .mockReturnValueOnce(body({ userGroupId: ID, userGroupName: "ug", userGroupTypeCode: "INDIVIDUAL_MEMBER", members: [{ memberId: RULE_ID }] }));
    vi.mocked(ky.post).mockReturnValue(body({ userGroupId: ID }));
    vi.mocked(ky.put).mockReturnValue(emptyBody());
    vi.mocked(ky.delete).mockReturnValue(emptyBody());

    await expect(client().listUserGroups({})).resolves.toMatchObject({ totalCounts: 1 });
    await expect(client().getUserGroup(ID)).resolves.toMatchObject({ members: [{ memberId: RULE_ID }] });
    await expect(client().createUserGroup({ userGroupName: "ug", memberIds: [RULE_ID] })).resolves.toBe(ID);
    await expect(client().updateUserGroup(ID, { userGroupName: "ug", memberIds: [], selectAll: false })).resolves.toBeUndefined();
    await expect(client().deleteUserGroup(ID)).resolves.toBeUndefined();

    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/user-groups/${ID}`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[1]).toMatchObject({ json: { userGroupName: "ug", memberIds: [], selectAll: false } });
  });

  it("알림 그룹 목록은 전체 배열이고 상세는 감시 대상과 사용자 그룹을 가진다", async () => {
    const group = { notificationGroupId: ID, notificationGroupName: "ng", notifyEmail: true, notifySms: false, isEnabled: true };
    vi.mocked(ky.get)
      .mockReturnValueOnce(body({ notificationGroups: [group] }))
      .mockReturnValueOnce(body({ ...group, dbInstances: [{ dbInstanceId: ID, dbInstanceName: "db" }], userGroups: [] }))
      .mockReturnValueOnce(body({ ...group, dbInstances: [{ name: "x" }], userGroups: [] }));
    vi.mocked(ky.post).mockReturnValue(body({ notificationGroupId: ID }));
    vi.mocked(ky.put).mockReturnValue(emptyBody());
    vi.mocked(ky.delete).mockReturnValue(emptyBody());

    await expect(client().listNotificationGroups()).resolves.toHaveLength(1);
    await expect(client().getNotificationGroup(ID)).resolves.toMatchObject({ dbInstances: [{ dbInstanceId: ID }] });
    await expect(client().getNotificationGroup(ID)).rejects.toThrow("응답 형식 오류");
    await expect(client().createNotificationGroup({ notificationGroupName: "ng" })).resolves.toBe(ID);
    await expect(client().updateNotificationGroup(ID, { isEnabled: false })).resolves.toBeUndefined();
    await expect(client().deleteNotificationGroup(ID)).resolves.toBeUndefined();

    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/notification-groups/${ID}`);
  });

  it("지표 통계는 지표를 쉼표로 이어 쿼리로 보내고 값 쌍을 검사한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(body({ metrics: [{ measureName: "CPU_USAGE", unit: "%" }] }))
      .mockReturnValueOnce(body({ metricStatistics: [{ measureName: "CPU_USAGE", unit: "%", values: [[1679298540, "7.5%"]] }] }))
      .mockReturnValueOnce(body({ metricStatistics: [{ measureName: "CPU_USAGE", values: [["x", 1]] }] }));

    await expect(client().listMetrics()).resolves.toStrictEqual([{ measureName: "CPU_USAGE", unit: "%" }]);
    const query = {
      dbInstanceId: ID,
      measureNames: ["CPU_USAGE", "MEMORY_USAGE"],
      from: "2026-01-01T00:00:00+09:00",
      to: "2026-01-01T01:00:00+09:00",
      interval: 5,
    };
    await expect(client().getMetricStatistics(query)).resolves.toHaveLength(1);
    await expect(client().getMetricStatistics(query)).rejects.toThrow("응답 형식 오류");

    expect(vi.mocked(ky.get).mock.calls[1]?.[0]).toBe(`${base}/metric-statistics`);
    expect(vi.mocked(ky.get).mock.calls[1]?.[1]).toMatchObject({
      searchParams: { dbInstanceId: ID, measureNames: "CPU_USAGE,MEMORY_USAGE", from: "2026-01-01T00:00:00+09:00", interval: 5 },
    });
  });

  it("이벤트 코드·이벤트·구독을 조회하고 구독을 만들고 고치고 지운다", async () => {
    const subscription = {
      eventSubscriptionId: ID,
      eventSubscriptionName: "sub",
      eventCategoryType: "INSTANCE",
      enabled: true,
      notifyEmail: true,
      notifySms: false,
      eventCodes: ["INSTC_02_01"],
      sources: [{ sourceId: ID, eventCategoryType: "INSTANCE" }],
      userGroupIds: [ID],
    };
    vi.mocked(ky.get)
      .mockReturnValueOnce(body({ eventCodes: [{ eventCode: "INSTC_02_01", eventCategoryType: "INSTANCE" }] }))
      .mockReturnValueOnce(body({ totalCounts: 1, events: [{ eventCode: "INSTC_02_01", messages: [{ langCode: "KO", message: "m" }] }] }))
      .mockReturnValueOnce(body({ totalCounts: 1, eventSubscriptions: [subscription] }));
    vi.mocked(ky.post).mockReturnValue(body({ eventSubscriptionId: ID }));
    vi.mocked(ky.put).mockReturnValue(emptyBody());
    vi.mocked(ky.delete).mockReturnValue(emptyBody());

    await expect(client().listEventCodes()).resolves.toHaveLength(1);
    await expect(
      client().listEvents({ from: "2026-01-01T00:00:00+09:00", to: "2026-01-02T00:00:00+09:00", eventCategoryType: "ALL", ascendingOrder: "ASC" }),
    ).resolves.toMatchObject({ totalCounts: 1 });
    await expect(client().listEventSubscriptions({ eventSubscriptionId: ID })).resolves.toMatchObject({ items: [{ eventCodes: ["INSTC_02_01"] }] });
    await expect(client().createEventSubscription({ eventSubscriptionName: "sub" })).resolves.toBe(ID);
    await expect(client().updateEventSubscription(ID, { enabled: false })).resolves.toBeUndefined();
    await expect(client().deleteEventSubscription(ID)).resolves.toBeUndefined();

    expect(vi.mocked(ky.get).mock.calls[1]?.[0]).toBe(`${base}/events`);
    expect(vi.mocked(ky.get).mock.calls[1]?.[1]).toMatchObject({ searchParams: { eventCategoryType: "ALL", ascendingOrder: "ASC" } });
    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/event-subscriptions/${ID}`);
  });
});
