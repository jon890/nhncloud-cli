import ky, { HTTPError } from "ky";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RdsMysqlClient } from "./client.js";
import { RdsMysqlApiError } from "./errors.js";

vi.mock("ky", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ky")>();
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

const INSTANCE_ID = "11111111-2222-3333-4444-555555555555";
const GROUP_ID = "99999999-8888-7777-6666-555555555555";
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

const parameter = {
  parameterId: "p1",
  parameterFileGroup: "MYSQLD",
  parameterName: "binlog_expire_logs_seconds",
  fileParameterName: "binlog_expire_logs_seconds",
  value: "432000",
  defaultValue: "432000",
  allowedValue: "0 ~ 4294967295",
  updateType: "VARIABLE",
  applyType: "BOTH",
};

describe("RdsMysqlClient v4.0 관리 API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("파라미터 그룹 목록은 조회 조건을 쿼리로 보내고 totalCounts 를 함께 돌려준다", async () => {
    const group = { parameterGroupId: GROUP_ID, parameterGroupName: "pg", dbVersion: null, dbEngineVersionFamily: "MYSQL_V84" };
    vi.mocked(ky.get).mockReturnValue(body({ totalCounts: 5, parameterGroups: [group] }));

    const list = await client().listParameterGroups({ parameterGroupName: "pg", page: 2, size: 1, dbVersion: undefined });

    expect(list).toStrictEqual({ items: [group], totalCounts: 5 });
    const [url, options] = vi.mocked(ky.get).mock.calls[0] ?? [];
    expect(url).toBe(`${base}/parameter-groups`);
    expect(options).toMatchObject({ searchParams: { parameterGroupName: "pg", page: 2, size: 1 }, retry: 0 });
    expect((options as { searchParams: Record<string, unknown> }).searchParams).not.toHaveProperty("dbVersion");
  });

  it("파라미터 그룹 상세는 parameters 배열을 가드로 검사한다", async () => {
    vi.mocked(ky.get).mockReturnValue(body({ parameterGroupId: GROUP_ID, parameterGroupName: "pg", parameters: [parameter] }));
    await expect(client().getParameterGroup(GROUP_ID)).resolves.toMatchObject({ parameters: [parameter] });

    vi.mocked(ky.get).mockReturnValue(body({ parameterGroupId: GROUP_ID, parameterGroupName: "pg" }));
    await expect(client().getParameterGroup(GROUP_ID)).rejects.toThrow("응답 형식 오류");
  });

  it("복사는 새 parameterGroupId 를 돌려준다", async () => {
    vi.mocked(ky.post).mockReturnValue(body({ parameterGroupId: "new-id" }));

    await expect(client().copyParameterGroup(GROUP_ID, { parameterGroupName: "copy" })).resolves.toBe("new-id");

    const [url, options] = vi.mocked(ky.post).mock.calls[0] ?? [];
    expect(url).toBe(`${base}/parameter-groups/${GROUP_ID}/copy`);
    expect(options).toMatchObject({ json: { parameterGroupName: "copy" } });
  });

  it("파라미터 수정과 초기화는 빈 응답 본문도 성공으로 본다", async () => {
    vi.mocked(ky.put).mockReturnValue(emptyBody());

    await client().updateParameters(GROUP_ID, [{ parameterId: "p1", value: "86400" }]);
    await client().resetParameterGroup(GROUP_ID);

    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/parameter-groups/${GROUP_ID}/parameters`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[1]).toMatchObject({
      json: { modifiedParameters: [{ parameterId: "p1", value: "86400" }] },
    });
    expect(vi.mocked(ky.put).mock.calls[1]?.[0]).toBe(`${base}/parameter-groups/${GROUP_ID}/reset`);
  });

  it("파라미터 수정은 봉투 응답이 실패면 오류로 끝낸다", async () => {
    const text = JSON.stringify({ header: { resultCode: 70001, resultMessage: "FAIL", isSuccessful: false } });
    vi.mocked(ky.put).mockReturnValue({ text: async () => text } as never);

    await expect(client().updateParameters(GROUP_ID, [])).rejects.toBeInstanceOf(RdsMysqlApiError);
  });

  it("인스턴스의 파라미터 그룹 변경은 parameterGroupId 만 보내고 jobId 를 돌려준다", async () => {
    vi.mocked(ky.put).mockReturnValue(body({ jobId: "job-1" }));

    await expect(client().setInstanceParameterGroup(INSTANCE_ID, GROUP_ID)).resolves.toBe("job-1");

    const [url, options] = vi.mocked(ky.put).mock.calls[0] ?? [];
    expect(url).toBe(`${base}/db-instances/${INSTANCE_ID}`);
    expect((options as { json: unknown }).json).toStrictEqual({ parameterGroupId: GROUP_ID });
  });

  it("바이너리 로그 목록은 deletable 쿼리를 보내고 purge 는 lastBinLogFileName 만 보낸다", async () => {
    const log = { binLogFileName: "mysql-bin.000010", binLogFileSize: 1024, createdYmdt: "2023-12-31T15:00:00+09:00" };
    vi.mocked(ky.get).mockReturnValue(body({ binLogs: [log] }));
    vi.mocked(ky.post).mockReturnValue(emptyBody());

    await expect(client().listBinLogs(INSTANCE_ID, true)).resolves.toStrictEqual([log]);
    await client().purgeBinLogs(INSTANCE_ID, "mysql-bin.000010");

    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${INSTANCE_ID}/binlogs`);
    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).toMatchObject({ searchParams: { deletable: true } });
    expect(vi.mocked(ky.post).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${INSTANCE_ID}/binlogs/purge`);
    expect(vi.mocked(ky.post).mock.calls[0]?.[1]).toMatchObject({ json: { lastBinLogFileName: "mysql-bin.000010" } });
  });

  it("스토리지 조회는 header 를 뺀 객체를, 수정은 jobId 를 돌려준다", async () => {
    const info = { storageType: "General SSD", storageSize: 200, storageStatus: "ATTACHED", storageAutoscale: { useStorageAutoscale: false } };
    vi.mocked(ky.get).mockReturnValue(body(info));
    vi.mocked(ky.put).mockReturnValue(body({ jobId: "job-2" }));

    await expect(client().getStorageInfo(INSTANCE_ID)).resolves.toStrictEqual(info);
    await expect(client().updateStorageInfo(INSTANCE_ID, { storageSize: 300 })).resolves.toBe("job-2");

    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${INSTANCE_ID}/storage-info`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[1]).toMatchObject({ json: { storageSize: 300 } });
  });

  it("백업 설정과 백업 목록을 조회한다", async () => {
    const backup = { backupId: "b1", backupName: "n", backupStatus: "COMPLETED", backupType: "AUTO", backupSize: 10 };
    vi.mocked(ky.get).mockReturnValueOnce(body({ backupPeriod: 1, backupSchedules: [] }));
    vi.mocked(ky.get).mockReturnValueOnce(body({ totalCounts: 1, backups: [backup] }));

    await expect(client().getBackupInfo(INSTANCE_ID)).resolves.toMatchObject({ backupPeriod: 1 });
    await expect(client().listBackups({ dbInstanceId: INSTANCE_ID, backupType: "AUTO" })).resolves.toStrictEqual({
      items: [backup],
      totalCounts: 1,
    });

    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${INSTANCE_ID}/backup-info`);
    expect(vi.mocked(ky.get).mock.calls[1]?.[0]).toBe(`${base}/backups`);
    expect(vi.mocked(ky.get).mock.calls[1]?.[1]).toMatchObject({ searchParams: { dbInstanceId: INSTANCE_ID, backupType: "AUTO" } });
  });

  it("고가용성 조회와 동작은 경로로 구분하고 동작은 jobId 를 돌려준다", async () => {
    vi.mocked(ky.get).mockReturnValue(body({ useHighAvailability: true, haStatus: "STABLE", pingInterval: 3, pingType: "INSERT" }));
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-3" }));

    await expect(client().getHaInfo(INSTANCE_ID)).resolves.toMatchObject({ haStatus: "STABLE" });
    for (const action of ["pause", "resume", "repair", "split"] as const) {
      await expect(client().haAction(INSTANCE_ID, action)).resolves.toBe("job-3");
    }
    await expect(client().rebuildDbInstance(INSTANCE_ID)).resolves.toBe("job-3");

    const urls = vi.mocked(ky.post).mock.calls.map((call) => call[0]);
    expect(urls).toStrictEqual([
      ...["pause", "resume", "repair", "split"].map((a) => `${base}/db-instances/${INSTANCE_ID}/high-availability/${a}`),
      `${base}/db-instances/${INSTANCE_ID}/rebuild`,
    ]);
  });

  it("HTTP 오류 본문의 봉투는 RdsMysqlApiError 로 바꾼다", async () => {
    const response = new Response(JSON.stringify({ header: { resultCode: 80403, resultMessage: "Forbidden", isSuccessful: false } }), {
      status: 403,
    });
    const error = new HTTPError(response, new Request(`${base}/backups`), {} as never);
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw error;
      },
    } as never);

    await expect(client().listBackups({})).rejects.toMatchObject({ resultCode: 80403 });
  });
});
