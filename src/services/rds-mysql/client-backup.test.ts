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

const client = () => new RdsMysqlClient("appkey", "token", "kr1", "real");

describe("RdsMysqlClient v4.0 백업·복원·인증서·로그 파일 API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("백업 생성·삭제·내보내기·복원은 jobId 를 돌려준다", async () => {
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-1" }));
    vi.mocked(ky.delete).mockReturnValue(body({ jobId: "job-2" }));

    await expect(client().createBackup({ backupName: "b", backupMethodType: "FULL", dbInstanceId: ID })).resolves.toBe("job-1");
    await expect(client().exportBackup(ID, { tenantId: "t" })).resolves.toBe("job-1");
    await expect(client().restoreBackup(ID, { dbInstanceName: "n" })).resolves.toBe("job-1");
    await expect(client().deleteBackup(ID)).resolves.toBe("job-2");

    expect(vi.mocked(ky.post).mock.calls.map((c) => c[0])).toStrictEqual([
      `${base}/backups`,
      `${base}/backups/${ID}/export`,
      `${base}/backups/${ID}/restore`,
    ]);
    expect(vi.mocked(ky.post).mock.calls[0]?.[1]).toMatchObject({ json: { backupMethodType: "FULL" }, retry: 0 });
    expect(vi.mocked(ky.delete).mock.calls[0]?.[0]).toBe(`${base}/backups/${ID}`);
  });

  it("백업 단건은 backup 객체를 돌려주고 백업 설정 변경은 PUT 으로 jobId 를 받는다", async () => {
    vi.mocked(ky.get).mockReturnValue(body({ backup: { backupId: ID, backupStatus: "COMPLETED" } }));
    vi.mocked(ky.put).mockReturnValue(body({ jobId: "job-3" }));

    await expect(client().getBackup(ID)).resolves.toStrictEqual({ backupId: ID, backupStatus: "COMPLETED" });
    await expect(client().updateBackupInfo(ID, { backupPeriod: 7 })).resolves.toBe("job-3");

    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/backups/${ID}`);
    expect(vi.mocked(ky.put).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/backup-info`);
  });

  it("복원 정보는 header 를 뺀 객체이고 시점 복원과 오브젝트 스토리지 복원은 경로로 구분한다", async () => {
    const info = { oldestRestorableYmdt: "2026-01-01T00:00:00+09:00", latestRestorableYmdt: "2026-01-02T00:00:00+09:00", restorableBackups: [] };
    vi.mocked(ky.get).mockReturnValue(body(info));
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-4" }));

    await expect(client().getRestorationInfo(ID)).resolves.toStrictEqual(info);
    await client().restoreDbInstance(ID, { restore: { restoreType: "TIMESTAMP" } });
    await client().restoreFromObjectStorage({ dbInstanceName: "n" });

    expect(vi.mocked(ky.get).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/restoration-info`);
    expect(vi.mocked(ky.post).mock.calls.map((c) => c[0])).toStrictEqual([
      `${base}/db-instances/${ID}/restore`,
      `${base}/db-instances/restore-from-obs`,
    ]);
  });

  it("인증서 목록과 내보내기(upload 경로)", async () => {
    const cert = { fileName: "ca.pem", certificateType: "CA_FILE", fileSize: 10 };
    vi.mocked(ky.get).mockReturnValue(body({ certificates: [cert] }));
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-5" }));

    await expect(client().listCertificates(ID)).resolves.toStrictEqual([cert]);
    await expect(client().exportCertificates(ID, { certificateTypes: ["CA_FILE"] })).resolves.toBe("job-5");

    expect(vi.mocked(ky.post).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/certificates/upload`);
  });

  it("로그 파일 목록은 유형을 쉼표로 이은 쿼리로, 내용은 logFileType 쿼리로 조회한다", async () => {
    const file = { logFileName: "error.log", logFileType: "ERROR", logFileSize: 5 };
    vi.mocked(ky.get).mockReturnValueOnce(body({ logFiles: [file] })).mockReturnValueOnce(body({ content: "line" }));
    vi.mocked(ky.post).mockReturnValue(body({ jobId: "job-6" }));

    await expect(client().listLogFiles(ID, ["ERROR", "SLOW_QUERY"])).resolves.toStrictEqual([file]);
    await expect(client().getLogFileContent(ID, "a b.log", "ERROR")).resolves.toBe("line");
    await expect(client().exportLogFiles(ID, { logFileNames: ["error.log"] })).resolves.toBe("job-6");

    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).toMatchObject({ searchParams: { logFileTypes: "ERROR,SLOW_QUERY" } });
    expect(vi.mocked(ky.get).mock.calls[1]?.[0]).toBe(`${base}/db-instances/${ID}/log-files/a%20b.log`);
    expect(vi.mocked(ky.get).mock.calls[1]?.[1]).toMatchObject({ searchParams: { logFileType: "ERROR" } });
    expect(vi.mocked(ky.post).mock.calls[0]?.[0]).toBe(`${base}/db-instances/${ID}/log-files/export`);
  });

  it("형식이 맞지 않는 목록은 형식 오류로 끝난다", async () => {
    vi.mocked(ky.get).mockReturnValue(body({ certificates: [{ fileName: 1 }] }));

    await expect(client().listCertificates(ID)).rejects.toThrow("응답 형식 오류: certificates");
  });
});
