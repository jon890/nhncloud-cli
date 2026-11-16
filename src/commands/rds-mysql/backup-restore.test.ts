import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlDbInstanceDetail } from "../../services/rds-mysql/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { configureCommanderExitCodes } from "../commander-errors.js";
import { backupCommand, backupInfoCommand } from "./backup.js";
import { certificateCommand } from "./certificate.js";
import { resolveRdsMysqlClient } from "./helpers.js";
import { logFileCommand } from "./log-file.js";
import { restoreCommand } from "./restore.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveRdsMysqlClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const INSTANCE_ID = "11111111-2222-3333-4444-555555555555";
const BACKUP_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const GROUP_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const SUBNET_ID = "cccccccc-1111-2222-3333-444444444444";
const JOB_ID = "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee";
const TENANT = "0123456789abcdef0123456789abcdef";
const SECRET = "obs-secret-value";

const client = new RdsMysqlClient("appkey", "token", "kr1", "real");
const spies = {
  getDbInstance: vi.spyOn(client, "getDbInstance"),
  getBackup: vi.spyOn(client, "getBackup"),
  createBackup: vi.spyOn(client, "createBackup"),
  deleteBackup: vi.spyOn(client, "deleteBackup"),
  exportBackup: vi.spyOn(client, "exportBackup"),
  restoreBackup: vi.spyOn(client, "restoreBackup"),
  getBackupInfo: vi.spyOn(client, "getBackupInfo"),
  updateBackupInfo: vi.spyOn(client, "updateBackupInfo"),
  getRestorationInfo: vi.spyOn(client, "getRestorationInfo"),
  restoreDbInstance: vi.spyOn(client, "restoreDbInstance"),
  restoreFromObjectStorage: vi.spyOn(client, "restoreFromObjectStorage"),
  listCertificates: vi.spyOn(client, "listCertificates"),
  exportCertificates: vi.spyOn(client, "exportCertificates"),
  listLogFiles: vi.spyOn(client, "listLogFiles"),
  getLogFileContent: vi.spyOn(client, "getLogFileContent"),
  exportLogFiles: vi.spyOn(client, "exportLogFiles"),
  waitForJob: vi.spyOn(client, "waitForJob"),
};

const INSTANCE: RdsMysqlDbInstanceDetail = {
  dbInstanceId: INSTANCE_ID,
  dbInstanceName: "db1",
  dbInstanceStatus: "AVAILABLE",
  dbInstanceType: "MASTER",
  dbVersion: "MYSQL_V8411",
  progressStatus: "NONE",
};

function program(): Command {
  const root = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(backupCommand)
    .addCommand(backupInfoCommand)
    .addCommand(restoreCommand)
    .addCommand(certificateCommand)
    .addCommand(logFileCommand);
  configureCommanderExitCodes(root);
  return root;
}

async function run(...args: string[]): Promise<void> {
  await program().parseAsync(["node", "nhncloud", ...args]);
}

const OBS_ARGS = ["--tenant-id", TENANT, "--username", "user", "--container", "bk", "--object-path", "dir/"];

describe("rds-mysql 백업·복원·인증서·로그 파일 명령", () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>;
  let stderrWrite: MockInstance<typeof process.stderr.write>;
  let dir: string;
  let passwordFile: string;
  const stdout = (): string => stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
  const stderr = (): string => stderrWrite.mock.calls.map((call) => String(call[0])).join("");
  const json = (): Record<string, unknown> => JSON.parse(stdout()) as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    dir = mkdtempSync(join(tmpdir(), "rds-backup-"));
    passwordFile = join(dir, "pw.txt");
    // 테스트용 더미 값이다.
    writeFileSync(passwordFile, `${SECRET}\n`);
    vi.mocked(resolveRdsMysqlClient).mockResolvedValue({ client, profileName: "default" });
    spies.getDbInstance.mockResolvedValue(INSTANCE);
    spies.getBackup.mockResolvedValue({ backupId: BACKUP_ID, backupName: "bk1", backupStatus: "COMPLETED", backupType: "MANUAL" });
    for (const name of ["createBackup", "deleteBackup", "exportBackup", "restoreBackup", "updateBackupInfo", "restoreDbInstance", "restoreFromObjectStorage", "exportCertificates", "exportLogFiles"] as const) {
      spies[name].mockResolvedValue(JOB_ID);
    }
    spies.waitForJob.mockResolvedValue({ outcome: "completed", job: { jobId: JOB_ID, jobStatus: "COMPLETED" } });
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("backup", () => {
    it("create 는 --yes 가 없으면 미리보기만 한다", async () => {
      await run("--json", "backup", "create", "--name", "b1", "--method", "full", "--instance", INSTANCE_ID);

      expect(spies.createBackup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "backup-create", applied: false, backupMethodType: "FULL" });
      expect(stderr()).toContain("미리보기");
    });

    it("create --yes 는 방식에 맞는 본문을 보낸다", async () => {
      await run("--json", "backup", "create", "--name", "b1", "--method", "snapshot", "--instance", INSTANCE_ID, "--yes");
      expect(spies.createBackup).toHaveBeenCalledWith({ backupName: "b1", backupMethodType: "SNAPSHOT", dbInstanceId: INSTANCE_ID });

      stdoutWrite.mockClear();
      await run("--json", "backup", "create", "--name", "b2", "--method", "incremental", "--base-backup", BACKUP_ID, "--yes");
      expect(spies.createBackup).toHaveBeenLastCalledWith({ backupName: "b2", backupMethodType: "INCREMENTAL", baseBackupId: BACKUP_ID });
    });

    it("create 는 방식과 맞지 않는 인수를 요청 전에 종료 코드 3으로 막는다", async () => {
      await expect(run("backup", "create", "--name", "b", "--method", "incremental", "--instance", INSTANCE_ID)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("backup", "create", "--name", "b", "--method", "full")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("backup", "create", "--name", "b", "--method", "weird", "--instance", INSTANCE_ID)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.getDbInstance).not.toHaveBeenCalled();
    });

    it("delete 는 미리보기 뒤 --yes 로 요청하고 --wait 로 작업을 기다린다", async () => {
      await run("--json", "backup", "delete", BACKUP_ID);
      expect(spies.deleteBackup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "backup-delete", backupName: "bk1" });

      stdoutWrite.mockClear();
      await run("--json", "backup", "delete", BACKUP_ID, "--yes", "--wait");
      expect(spies.deleteBackup).toHaveBeenCalledWith(BACKUP_ID);
      expect(spies.waitForJob).toHaveBeenCalled();
    });

    it("export 는 비밀번호를 본문에만 싣고 출력에는 싣지 않는다", async () => {
      await run("--json", "backup", "export", BACKUP_ID, ...OBS_ARGS, "--password-file", passwordFile, "--yes");

      expect(spies.exportBackup).toHaveBeenCalledWith(BACKUP_ID, {
        tenantId: TENANT,
        username: "user",
        targetContainer: "bk",
        objectPath: "dir/",
        password: SECRET,
      });
      expect(stdout()).not.toContain(SECRET);
      expect(stderr()).not.toContain(SECRET);
    });

    it("export 는 테넌트 ID 형식이 틀리면 요청 전에 막는다", async () => {
      await expect(
        run("backup", "export", BACKUP_ID, "--tenant-id", "short", "--username", "u", "--container", "c", "--object-path", "p", "--password-file", passwordFile, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.exportBackup).not.toHaveBeenCalled();
    });

    it("restore 는 지정한 항목만 본문에 싣고 미리보기에서는 요청하지 않는다", async () => {
      await run("--json", "backup", "restore", BACKUP_ID, "--name", "restored");
      expect(spies.restoreBackup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "backup-restore", action: "create", dbFlavorId: "원본과 같음" });

      await run("--json", "backup", "restore", BACKUP_ID, "--name", "restored", "--port", "3307", "--subnet-id", SUBNET_ID, "--storage-size", "50", "--yes");
      expect(spies.restoreBackup).toHaveBeenCalledWith(BACKUP_ID, {
        dbInstanceName: "restored",
        dbPort: 3307,
        network: { subnetId: SUBNET_ID },
        storage: { storageSize: 50 },
      });
    });

    it("restore 는 고가용성에 Standby 이름이 없으면 막는다", async () => {
      await expect(run("backup", "restore", BACKUP_ID, "--name", "r", "--high-availability")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.getBackup).not.toHaveBeenCalled();
    });

    it("get 은 백업 상세를 낸다", async () => {
      await run("--json", "backup", "get", BACKUP_ID);

      expect(json()).toMatchObject({ backupId: BACKUP_ID });
    });
  });

  describe("backup-info update", () => {
    beforeEach(() => {
      spies.getBackupInfo.mockResolvedValue({ backupPeriod: 7, useBackupLock: true });
    });

    it("현재 값과 다른 항목만 보낸다", async () => {
      await run("--json", "backup-info", "update", INSTANCE_ID, "--backup-period", "7", "--backup-retry-count", "3", "--yes");

      expect(spies.updateBackupInfo).toHaveBeenCalledWith(INSTANCE_ID, { backupRetryCount: 3 });
    });

    it("모두 같으면 요청하지 않는다", async () => {
      await run("--json", "backup-info", "update", INSTANCE_ID, "--backup-period", "7", "--yes");

      expect(spies.updateBackupInfo).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "unchanged" });
    });

    it("바꿀 항목이 없으면 종료 코드 3 이고 --no-backup-lock 은 false 로 보낸다", async () => {
      await expect(run("backup-info", "update", INSTANCE_ID)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      await run("--json", "backup-info", "update", INSTANCE_ID, "--no-backup-lock", "--yes");
      expect(spies.updateBackupInfo).toHaveBeenCalledWith(INSTANCE_ID, { useBackupLock: false });
    });

    it("기간을 줄이면 경고한다", async () => {
      await run("--json", "backup-info", "update", INSTANCE_ID, "--backup-period", "3");

      expect(stderr()).toContain("보관 기간을 줄이면");
    });
  });

  describe("restore", () => {
    const RANGE = { oldestRestorableYmdt: "2026-01-01T00:00:00+09:00", latestRestorableYmdt: "2026-01-10T00:00:00+09:00", restorableBackups: [] };

    beforeEach(() => {
      spies.getRestorationInfo.mockResolvedValue(RANGE);
    });

    it("info 는 범위와 복원 가능한 백업을 낸다", async () => {
      spies.getRestorationInfo.mockResolvedValue({ ...RANGE, restorableBackups: [{ backup: { backupId: BACKUP_ID, backupName: "bk1" } }] });

      await run("--quiet", "restore", "info", INSTANCE_ID);

      expect(stdout().trim()).toBe(BACKUP_ID);
    });

    it("point-in-time 은 시각을 범위와 대조하고 --yes 로 TIMESTAMP 복원을 요청한다", async () => {
      await run("--json", "restore", "point-in-time", INSTANCE_ID, "--name", "pitr", "--time", "2026-01-05T09:00:00+09:00");
      expect(spies.restoreDbInstance).not.toHaveBeenCalled();

      await run("--json", "restore", "point-in-time", INSTANCE_ID, "--name", "pitr", "--time", "2026-01-05T09:00:00+09:00", "--yes");
      expect(spies.restoreDbInstance).toHaveBeenCalledWith(INSTANCE_ID, {
        dbInstanceName: "pitr",
        restore: { restoreType: "TIMESTAMP", restoreYmdt: "2026-01-05T09:00:00+09:00" },
      });
    });

    it("point-in-time 은 시각을 안 주면 가장 최근 시점으로 요청하고 범위 밖 시각은 막는다", async () => {
      await run("--json", "restore", "point-in-time", INSTANCE_ID, "--name", "pitr", "--yes");
      expect(spies.restoreDbInstance).toHaveBeenCalledWith(INSTANCE_ID, { dbInstanceName: "pitr", restore: { restoreType: "TIMESTAMP" } });

      spies.restoreDbInstance.mockClear();
      await expect(
        run("restore", "point-in-time", INSTANCE_ID, "--name", "p", "--time", "2026-02-01T00:00:00+09:00", "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("restore", "point-in-time", INSTANCE_ID, "--name", "p", "--time", "2026-01-05 09:00", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.restoreDbInstance).not.toHaveBeenCalled();
    });

    it("point-in-time 바이너리 로그 복원은 세 값이 모두 있어야 한다", async () => {
      await expect(run("restore", "point-in-time", INSTANCE_ID, "--name", "p", "--backup-id", BACKUP_ID)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      await run("--json", "restore", "point-in-time", INSTANCE_ID, "--name", "p", "--backup-id", BACKUP_ID, "--binlog-file", "mysql-bin.000001", "--binlog-position", "154", "--yes");
      expect(spies.restoreDbInstance).toHaveBeenCalledWith(INSTANCE_ID, {
        dbInstanceName: "p",
        restore: { restoreType: "BINLOG", backupId: BACKUP_ID, binLog: { binLogFileName: "mysql-bin.000001", binLogPosition: 154 } },
      });
    });

    it("from-object-storage 는 필수 항목이 빠지면 막고, 갖추면 비밀번호를 본문에만 싣는다", async () => {
      const common = [
        "restore", "from-object-storage", "--name", "n", "--db-version", "MYSQL_V8411", "--flavor-id", INSTANCE_ID, "--port", "3306",
        "--parameter-group-id", GROUP_ID, "--subnet-id", SUBNET_ID, "--availability-zone", "kr-pub-a", ...OBS_ARGS, "--password-file", passwordFile,
      ];
      await expect(run(...common, "--storage-type", "General SSD", "--storage-size", "20")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      await run("--json", ...common, "--storage-type", "General SSD", "--storage-size", "20", "--backup-period", "7", "--backup-schedule", "02:00@1h", "--yes");

      expect(spies.restoreFromObjectStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          dbInstanceName: "n",
          dbVersion: "MYSQL_V8411",
          restore: { tenantId: TENANT, username: "user", targetContainer: "bk", objectPath: "dir/", password: SECRET },
          network: { subnetId: SUBNET_ID, availabilityZone: "kr-pub-a" },
          backup: { backupPeriod: 7, backupSchedules: [{ backupWndBgnTime: "02:00:00", backupWndDuration: "ONE_HOUR" }] },
        }),
      );
      expect(stdout()).not.toContain(SECRET);
    });
  });

  describe("certificate", () => {
    it("list 는 파일 목록을 낸다", async () => {
      spies.listCertificates.mockResolvedValue([{ fileName: "ca.pem", certificateType: "CA_FILE", fileSize: 1200 }]);

      await run("--quiet", "certificate", "list", INSTANCE_ID);

      expect(stdout().trim()).toBe("ca.pem");
    });

    it("export 는 유형을 API 값으로 바꾸고 key 는 경고한다", async () => {
      await run("--json", "certificate", "export", INSTANCE_ID, "--type", "ca", "--type", "key", ...OBS_ARGS, "--password-file", passwordFile, "--yes");

      expect(spies.exportCertificates).toHaveBeenCalledWith(INSTANCE_ID, expect.objectContaining({ certificateTypes: ["CA_FILE", "KEY_FILE"], password: SECRET }));
      expect(stderr()).toContain("개인키");
      await expect(run("certificate", "export", INSTANCE_ID, "--type", "pem", ...OBS_ARGS, "--password-file", passwordFile, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });
  });

  describe("log-file", () => {
    it("list 는 유형을 API 값으로 바꿔 조회한다", async () => {
      spies.listLogFiles.mockResolvedValue([{ logFileName: "slow.log", logFileType: "SLOW_QUERY", logFileSize: 10 }]);

      await run("--quiet", "log-file", "list", INSTANCE_ID, "--type", "slow-query");

      expect(spies.listLogFiles).toHaveBeenCalledWith(INSTANCE_ID, ["SLOW_QUERY"]);
      expect(stdout().trim()).toBe("slow.log");
      await expect(run("log-file", "list", INSTANCE_ID, "--type", "nope")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("get 은 내용을 표준 출력에 내고 제어 문자는 치환한다", async () => {
      spies.getLogFileContent.mockResolvedValue("line1\n\u001b[31mred\n");

      await run("log-file", "get", INSTANCE_ID, "error.log", "--type", "error");

      expect(spies.getLogFileContent).toHaveBeenCalledWith(INSTANCE_ID, "error.log", "ERROR");
      expect(stdout()).toBe("line1\n?[31mred\n");
    });

    it("get --output-file 은 새 파일에 0600 으로 쓰고 이미 있으면 막는다", async () => {
      spies.getLogFileContent.mockResolvedValue("body");
      const target = join(dir, "out.log");

      await run("log-file", "get", INSTANCE_ID, "error.log", "--type", "error", "--output-file", target);

      expect(readFileSync(target, "utf8")).toBe("body");
      expect(statSync(target).mode & 0o777).toBe(0o600);
      await expect(run("log-file", "get", INSTANCE_ID, "error.log", "--type", "error", "--output-file", target)).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("get 은 한도에 닿으면 잘렸을 수 있다고 안내한다", async () => {
      spies.getLogFileContent.mockResolvedValue("a".repeat(65533));

      await run("--json", "log-file", "get", INSTANCE_ID, "error.log", "--type", "error");

      expect(json()).toMatchObject({ truncated: true });
      expect(stderr()).toContain("잘렸을 수 있습니다");
    });

    it("export 는 파일 이름 목록과 비밀번호를 본문에 싣는다", async () => {
      await run("--json", "log-file", "export", INSTANCE_ID, "--file", "a.log", "--file", "b.log", ...OBS_ARGS, "--password-file", passwordFile, "--yes");

      expect(spies.exportLogFiles).toHaveBeenCalledWith(INSTANCE_ID, expect.objectContaining({ logFileNames: ["a.log", "b.log"], password: SECRET }));
      expect(stdout()).not.toContain(SECRET);
    });
  });
});
