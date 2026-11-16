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

describe("RdsMysqlClient v4.0 DB 인스턴스 수명주기 API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("생성, 복제, 수정은 본문을 그대로 보내고 jobId 를 돌려준다", async () => {
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-1" }));
    vi.mocked(ky.put).mockReturnValue(body({ jobId: "job-2" }));

    await expect(client().createDbInstance({ dbInstanceName: "a" })).resolves.toBe("job-1");
    await expect(client().replicateDbInstance(ID, { dbInstanceName: "r" })).resolves.toBe("job-1");
    await expect(client().modifyDbInstance(ID, { description: "d" })).resolves.toBe("job-2");

    expect(vi.mocked(ky.post).mock.calls.map((c) => c[0])).toStrictEqual([`${base}/db-instances`, `${base}/db-instances/${ID}/replicate`]);
    expect(vi.mocked(ky.post).mock.calls[0]?.[1]).toMatchObject({ json: { dbInstanceName: "a" }, retry: 0 });
    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}`);
  });

  it("삭제는 deleteAutoBackup 을 DELETE 본문에 싣는다", async () => {
    vi.mocked(ky.delete).mockReturnValue(body({ jobId: "job-3" }));

    await expect(client().deleteDbInstance(ID, true)).resolves.toBe("job-3");

    expect(vi.mocked(ky.delete).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}`);
    expect(vi.mocked(ky.delete).mock.calls[0]?.[1]).toMatchObject({ json: { deleteAutoBackup: true } });
  });

  it("시작, 정지, 재시작, 승격은 경로로 구분하고 jobId 를 돌려준다", async () => {
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-4" }));

    await client().startDbInstance(ID);
    await client().stopDbInstance(ID);
    await client().restartDbInstance(ID, { useOnlineFailover: true });
    await client().promoteDbInstance(ID);

    expect(vi.mocked(ky.post).mock.calls.map((c) => c[0])).toStrictEqual(
      ["start", "stop", "restart", "promote"].map((a) => `${base}/db-instances/${ID}/${a}`),
    );
    expect(vi.mocked(ky.post).mock.calls[2]?.[1]).toMatchObject({ json: { useOnlineFailover: true } });
  });

  it("강제 재시작과 삭제 보호 변경은 빈 응답 본문도 성공으로 본다", async () => {
    vi.mocked(ky.post).mockReturnValue(emptyBody());
    vi.mocked(ky.put).mockReturnValue(emptyBody());

    await client().forceRestartDbInstance(ID);
    await client().setDeletionProtection(ID, true);

    expect(vi.mocked(ky.post).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/force-restart`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/deletion-protection`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[1]).toMatchObject({ json: { useDeletionProtection: true } });
  });

  it("네트워크 정보는 header 를 뺀 객체로, 수정은 jobId 로 받는다", async () => {
    const info = { availabilityZone: "kr-pub-a", subnet: { subnetId: "s" }, endPoints: [{ domain: "d", ipAddress: "192.0.2.1", endPointType: "EXTERNAL" }] };
    vi.mocked(ky.get).mockReturnValue(body(info));
    vi.mocked(ky.put).mockReturnValue(body({ jobId: "job-5" }));

    await expect(client().getNetworkInfo(ID)).resolves.toStrictEqual(info);
    await expect(client().updateNetworkInfo(ID, false)).resolves.toBe("job-5");

    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/network-info`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[1]).toMatchObject({ json: { usePublicAccess: false } });
  });

  it("유지 관리 목록은 조회 조건을 쿼리로 보낸다", async () => {
    const maintenance = { maintenanceId: "m1", type: "APPLY_CHANGE_PARAMETER", status: "PENDING", category: "USER", required: false };
    vi.mocked(ky.get).mockReturnValue(body({ totalCounts: 1, maintenances: [maintenance] }));

    await expect(client().listMaintenances(ID, { type: "APPLY_CHANGE_PARAMETER", statuses: "PENDING" })).resolves.toStrictEqual({
      items: [maintenance],
      totalCounts: 1,
    });

    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/maintenances`);
    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).toMatchObject({ searchParams: { type: "APPLY_CHANGE_PARAMETER", statuses: "PENDING" } });
  });

  it("조회 목록은 이름 있는 필드를 가드로 검사한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(body({ dbFlavors: [{ dbFlavorId: "f", dbFlavorName: "m2.c1m2", ram: 2048, vcpus: 1 }] }))
      .mockReturnValueOnce(body({ dbVersions: [{ dbVersion: "MYSQL_V8411", dbVersionName: "MySQL 8.4.11", restorableFromObs: true }] }))
      .mockReturnValueOnce(body({ storageTypes: ["General SSD"] }))
      .mockReturnValueOnce(body({ subnets: [{ subnetId: "s", subnetName: "n", subnetCidr: "192.0.2.0/24", usingGateway: false, availableIpCount: 10 }] }))
      .mockReturnValueOnce(body({ availabilityZones: [{ availabilityZoneName: "kr-pub-a", zoneState: { available: true } }] }))
      .mockReturnValueOnce(body({ regions: [{ regionCode: "KR1", isEnabled: true }] }))
      .mockReturnValueOnce(body({ members: [{ memberId: "m", memberName: "홍길동", emailAddress: "user@example.com" }] }));

    await expect(client().listDbFlavors()).resolves.toHaveLength(1);
    await expect(client().listDbVersions()).resolves.toHaveLength(1);
    await expect(client().listStorageTypes()).resolves.toStrictEqual(["General SSD"]);
    await expect(client().listSubnets()).resolves.toHaveLength(1);
    await expect(client().listAvailabilityZones()).resolves.toHaveLength(1);
    await expect(client().listRegions()).resolves.toHaveLength(1);
    await expect(client().listProjectMembers()).resolves.toHaveLength(1);

    expect(vi.mocked(ky.get).mock.calls.map((c) => c[0])).toStrictEqual(
      ["/db-flavors", "/db-versions", "/storage-types", "/network/subnets", "/availability-zones", "/project/regions", "/project/members"].map((p) => `${base}${p}`),
    );

    vi.mocked(ky.get).mockReturnValue(body({ dbFlavors: [{ dbFlavorId: 1 }] }));
    await expect(client().listDbFlavors()).rejects.toThrow("응답 형식 오류: dbFlavors");
  });
});
