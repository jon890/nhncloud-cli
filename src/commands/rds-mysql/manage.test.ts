import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlDbInstanceDetail, RdsMysqlParameter, RdsMysqlParameterGroupDetail } from "../../services/rds-mysql/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { configureCommanderExitCodes } from "../commander-errors.js";
import { backupCommand, backupInfoCommand } from "./backup.js";
import { binlogCommand } from "./binlog.js";
import { haCommandGroup } from "./ha.js";
import { resolveRdsMysqlClient } from "./helpers.js";
import { instanceCommand } from "./instance.js";
import { parameterGroupCommand } from "./parameter-group.js";
import { storageCommand } from "./storage.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveRdsMysqlClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const INSTANCE_ID = "11111111-2222-3333-4444-555555555555";
const GROUP_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const OTHER_GROUP_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const JOB_ID = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";

const client = new RdsMysqlClient("appkey", "token", "kr1", "real");
const spies = {
  getDbInstance: vi.spyOn(client, "getDbInstance"),
  listParameterGroups: vi.spyOn(client, "listParameterGroups"),
  getParameterGroup: vi.spyOn(client, "getParameterGroup"),
  copyParameterGroup: vi.spyOn(client, "copyParameterGroup"),
  updateParameters: vi.spyOn(client, "updateParameters"),
  resetParameterGroup: vi.spyOn(client, "resetParameterGroup"),
  setInstanceParameterGroup: vi.spyOn(client, "setInstanceParameterGroup"),
  listBinLogs: vi.spyOn(client, "listBinLogs"),
  purgeBinLogs: vi.spyOn(client, "purgeBinLogs"),
  getStorageInfo: vi.spyOn(client, "getStorageInfo"),
  updateStorageInfo: vi.spyOn(client, "updateStorageInfo"),
  getBackupInfo: vi.spyOn(client, "getBackupInfo"),
  listBackups: vi.spyOn(client, "listBackups"),
  getHaInfo: vi.spyOn(client, "getHaInfo"),
  haAction: vi.spyOn(client, "haAction"),
  rebuildDbInstance: vi.spyOn(client, "rebuildDbInstance"),
  waitForJob: vi.spyOn(client, "waitForJob"),
};

function param(name: string, value: string, extra: Partial<RdsMysqlParameter> = {}): RdsMysqlParameter {
  return { parameterId: `id-${name}`, parameterName: name, value, defaultValue: value, applyType: "BOTH", updateType: "VARIABLE", ...extra };
}

const GROUP: RdsMysqlParameterGroupDetail = {
  parameterGroupId: GROUP_ID,
  parameterGroupName: "pg-a",
  dbVersion: "MYSQL_V8411",
  parameterGroupType: "USER",
  parameterGroupStatus: "STABLE",
  parameters: [
    param("binlog_expire_logs_seconds", "432000"),
    param("innodb_buffer_pool_size", "1073741824", { applyType: "FILE" }),
    param("sql_mode", "STRICT", { updateType: "CONSTANT" }),
  ],
};

const INSTANCE: RdsMysqlDbInstanceDetail = {
  dbInstanceId: INSTANCE_ID,
  dbInstanceName: "db1",
  dbInstanceStatus: "AVAILABLE",
  dbInstanceType: "MASTER",
  dbVersion: "MYSQL_V8411",
  progressStatus: "NONE",
  parameterGroupId: GROUP_ID,
};

function program(): Command {
  const root = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(parameterGroupCommand)
    .addCommand(instanceCommand)
    .addCommand(binlogCommand)
    .addCommand(storageCommand)
    .addCommand(backupInfoCommand)
    .addCommand(backupCommand)
    .addCommand(haCommandGroup);
  configureCommanderExitCodes(root);
  return root;
}

async function run(...args: string[]): Promise<void> {
  await program().parseAsync(["node", "nhncloud", ...args]);
}

describe("rds-mysql 관리 명령", () => {
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
    spies.getDbInstance.mockResolvedValue(INSTANCE);
    spies.getParameterGroup.mockResolvedValue(GROUP);
    spies.listParameterGroups.mockResolvedValue({ items: [GROUP], totalCounts: 1 });
    spies.copyParameterGroup.mockResolvedValue("new-group-id");
    spies.updateParameters.mockResolvedValue(undefined);
    spies.resetParameterGroup.mockResolvedValue(undefined);
    spies.setInstanceParameterGroup.mockResolvedValue(JOB_ID);
    spies.purgeBinLogs.mockResolvedValue(undefined);
    spies.updateStorageInfo.mockResolvedValue(JOB_ID);
    spies.haAction.mockResolvedValue(JOB_ID);
    spies.rebuildDbInstance.mockResolvedValue(JOB_ID);
    spies.waitForJob.mockResolvedValue({ outcome: "completed", job: { jobId: JOB_ID, jobStatus: "COMPLETED" } });
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  describe("parameter-group", () => {
    it("list 는 조회 조건을 넘기고 전체 개수가 더 많으면 안내한다", async () => {
      spies.listParameterGroups.mockResolvedValue({ items: [GROUP], totalCounts: 30 });

      await run("--json", "parameter-group", "list", "--name", "pg", "--size", "1", "--page", "2");

      expect(spies.listParameterGroups).toHaveBeenCalledWith({ parameterGroupName: "pg", dbVersion: undefined, page: 2, size: 1 });
      expect(stderr()).toContain("전체 30개 중 1개");
    });

    it("get 은 --parameter 로 이름을 거르고 --quiet 은 이름만 낸다", async () => {
      await run("--quiet", "parameter-group", "get", GROUP_ID, "--parameter", "BINLOG");

      expect(stdout().trim()).toBe("binlog_expire_logs_seconds");
    });

    it("set-parameters 미리보기는 바뀌는 항목만 전후 값과 적용 유형을 보이고 요청하지 않는다", async () => {
      await run(
        "--json", "parameter-group", "set-parameters", GROUP_ID,
        "--set", "binlog_expire_logs_seconds=86400", "--set", "innodb_buffer_pool_size=1073741824",
      );

      expect(spies.updateParameters).not.toHaveBeenCalled();
      const result = json();
      expect(result).toMatchObject({ action: "update", applied: false, changedCount: 1, restartRequired: false });
      expect(result["changes"]).toMatchObject([
        { parameterName: "binlog_expire_logs_seconds", before: "432000", after: "86400", applyType: "BOTH" },
      ]);
      expect(stderr()).toContain("미리보기입니다");
      expect(stderr()).toContain("NEED_TO_APPLY");
    });

    it("set-parameters --yes 는 parameterId 와 값만 보내고 재시작 필요 항목은 경고한다", async () => {
      await run("--json", "parameter-group", "set-parameters", GROUP_ID, "--set", "innodb_buffer_pool_size=2147483648", "--yes");

      expect(spies.updateParameters).toHaveBeenCalledWith(GROUP_ID, [
        { parameterId: "id-innodb_buffer_pool_size", value: "2147483648" },
      ]);
      expect(json()).toMatchObject({ applied: true, restartRequired: true, jobId: null });
      expect(stderr()).toContain("재시작이 필요한 파라미터");
    });

    it("set-parameters 는 없는 파라미터, CONSTANT, 형식 오류, --set 누락을 요청 전에 종료 코드 3으로 막는다", async () => {
      for (const args of [["--set", "nope=1"], ["--set", "sql_mode=ANSI"], ["--set", "binlog_expire_logs_seconds"], []]) {
        await expect(run("parameter-group", "set-parameters", GROUP_ID, ...args, "--yes")).rejects.toMatchObject({
          exitCode: EXIT_PARAM_ERROR,
        });
      }
      expect(spies.updateParameters).not.toHaveBeenCalled();
    });

    it("set-parameters 는 값이 이미 같으면 요청하지 않는다", async () => {
      await run("--json", "parameter-group", "set-parameters", GROUP_ID, "--set", "binlog_expire_logs_seconds=432000", "--yes");

      expect(spies.updateParameters).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "unchanged", applied: false });
    });

    it("reset 은 기본값과 다른 항목만 되돌리고 --yes 가 있어야 요청한다", async () => {
      spies.getParameterGroup.mockResolvedValue({
        ...GROUP,
        parameters: [param("binlog_expire_logs_seconds", "86400", { defaultValue: "432000" }), param("sql_mode", "STRICT")],
      });

      await run("--json", "parameter-group", "reset", GROUP_ID);
      expect(spies.resetParameterGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "reset", changedCount: 1, applied: false });

      stdoutWrite.mockClear();
      await run("--json", "parameter-group", "reset", GROUP_ID, "--yes");
      expect(spies.resetParameterGroup).toHaveBeenCalledWith(GROUP_ID);
      expect(json()).toMatchObject({ applied: true });
    });

    it("copy 는 같은 이름이 있으면 막고, --yes 로 만들면 새 ID 를 낸다", async () => {
      spies.listParameterGroups.mockResolvedValue({ items: [{ ...GROUP, parameterGroupName: "taken" }], totalCounts: 1 });
      await expect(run("parameter-group", "copy", GROUP_ID, "--name", "taken", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      expect(spies.copyParameterGroup).not.toHaveBeenCalled();

      spies.listParameterGroups.mockResolvedValue({ items: [], totalCounts: 0 });
      await run("--quiet", "parameter-group", "copy", GROUP_ID, "--name", "pg-b", "--description", "d", "--yes");
      expect(spies.copyParameterGroup).toHaveBeenCalledWith(GROUP_ID, { parameterGroupName: "pg-b", description: "d" });
      expect(stdout().trim()).toBe("new-group-id");
    });
  });

  describe("instance set-parameter-group", () => {
    const OTHER: RdsMysqlParameterGroupDetail = {
      ...GROUP,
      parameterGroupId: OTHER_GROUP_ID,
      parameterGroupName: "pg-b",
      parameters: [
        param("binlog_expire_logs_seconds", "86400"),
        param("innodb_buffer_pool_size", "2147483648", { applyType: "FILE" }),
        param("sql_mode", "STRICT", { updateType: "CONSTANT" }),
      ],
    };

    beforeEach(() => {
      spies.getParameterGroup.mockImplementation(async (id: string) => (id === OTHER_GROUP_ID ? OTHER : GROUP));
    });

    it("미리보기는 값이 바뀌는 파라미터와 재시작 여부를 보이고 요청하지 않는다", async () => {
      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", OTHER_GROUP_ID);

      expect(spies.setInstanceParameterGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "update", changedParameterCount: 2, restartRequired: true, applied: false });
      expect(stderr()).toContain("재시작");
    });

    it("--yes --wait 는 파라미터 그룹만 바꾸는 요청을 보내고 작업을 기다린다", async () => {
      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", OTHER_GROUP_ID, "--yes", "--wait");

      expect(spies.setInstanceParameterGroup).toHaveBeenCalledWith(INSTANCE_ID, OTHER_GROUP_ID);
      expect(spies.waitForJob).toHaveBeenCalledWith(JOB_ID, { timeoutMs: 300000 });
      expect(json()).toMatchObject({ applied: true, jobId: JOB_ID, jobStatus: "COMPLETED" });
    });

    it("이미 연결된 그룹이면 요청하지 않고, 엔진 버전이 다르면 종료 코드 3으로 막는다", async () => {
      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", GROUP_ID, "--yes");
      expect(spies.setInstanceParameterGroup).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "unchanged" });

      spies.getParameterGroup.mockResolvedValue({ ...OTHER, dbVersion: "MYSQL_V8033" });
      await expect(
        run("instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", OTHER_GROUP_ID, "--yes"),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });

    it("다른 작업이 진행 중이면 경고한다", async () => {
      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, progressStatus: "BACKING_UP" });

      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", OTHER_GROUP_ID);

      expect(stderr()).toContain("progressStatus=BACKING_UP");
    });
  });

  describe("binlog", () => {
    const LOGS = ["000012", "000010", "000011", "000013"].map((n) => ({
      binLogFileName: `mysql-bin.${n}`,
      binLogFileSize: 1024 * 1024,
    }));

    beforeEach(() => spies.listBinLogs.mockResolvedValue(LOGS));

    it("list 는 번호순으로 정렬하고 --deletable 을 넘긴다", async () => {
      await run("--quiet", "binlog", "list", INSTANCE_ID, "--deletable");

      expect(spies.listBinLogs).toHaveBeenCalledWith(INSTANCE_ID, true);
      expect(stdout().trim().split("\n")).toStrictEqual(["mysql-bin.000010", "mysql-bin.000011", "mysql-bin.000012", "mysql-bin.000013"]);
    });

    it("purge 미리보기는 지울 파일 수와 크기 합, 시점 복원 경고를 보이고 요청하지 않는다", async () => {
      await run("--json", "binlog", "purge", INSTANCE_ID, "--before", "mysql-bin.000012");

      expect(spies.purgeBinLogs).not.toHaveBeenCalled();
      expect(json()).toMatchObject({
        action: "purge",
        deleteFileCount: 2,
        deleteBytes: 2 * 1024 * 1024,
        firstDeleted: "mysql-bin.000010",
        lastDeleted: "mysql-bin.000011",
        keepFileCount: 2,
        applied: false,
      });
      expect(stderr()).toContain("특정 시점 복원");
    });

    it("purge --yes 는 지정한 파일 이름을 보낸다", async () => {
      await run("--json", "binlog", "purge", INSTANCE_ID, "--before", "mysql-bin.000012", "--yes");

      expect(spies.purgeBinLogs).toHaveBeenCalledWith(INSTANCE_ID, "mysql-bin.000012");
      expect(json()).toMatchObject({ applied: true, jobId: null });
    });

    it("purge 는 없는 파일이면 종료 코드 3, 가장 오래된 파일이면 요청하지 않는다", async () => {
      await expect(run("binlog", "purge", INSTANCE_ID, "--before", "mysql-bin.999999", "--yes")).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
      });
      await run("--json", "binlog", "purge", INSTANCE_ID, "--before", "mysql-bin.000010", "--yes");

      expect(spies.purgeBinLogs).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "unchanged", deleteFileCount: 0 });
    });
  });

  describe("storage", () => {
    const INFO = { storageType: "General SSD", storageSize: 200, storageStatus: "ATTACHED", storageAutoscale: { useStorageAutoscale: false } };

    beforeEach(() => spies.getStorageInfo.mockResolvedValue(INFO));

    it("expand 미리보기는 현재와 늘린 뒤 크기를 보이고 요청하지 않는다", async () => {
      await run("--json", "storage", "expand", INSTANCE_ID, "--size", "300");

      expect(spies.updateStorageInfo).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "expand", currentSizeGb: 200, newSizeGb: 300, applied: false });
    });

    it("expand --yes 는 크기만 보내고, 자동 확장을 쓰면 현재 설정을 함께 보낸다", async () => {
      await run("--json", "storage", "expand", INSTANCE_ID, "--size", "300", "--yes");
      expect(spies.updateStorageInfo).toHaveBeenLastCalledWith(INSTANCE_ID, { storageSize: 300 });

      spies.getStorageInfo.mockResolvedValue({
        ...INFO,
        storageAutoscale: { useStorageAutoscale: true, threshold: 80, maxStorageSize: 500, cooldownTime: 60 },
      });
      await run("--json", "storage", "expand", INSTANCE_ID, "--size", "400", "--yes");
      expect(spies.updateStorageInfo).toHaveBeenLastCalledWith(INSTANCE_ID, {
        storageSize: 400,
        storageAutoscale: { useStorageAutoscale: true, threshold: 80, maxStorageSize: 500, cooldownTime: 60 },
      });
    });

    it("줄이기와 상한 초과는 요청 전에 종료 코드 3으로 막고, 같은 크기는 요청하지 않는다", async () => {
      await expect(run("storage", "expand", INSTANCE_ID, "--size", "100", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      await expect(run("storage", "expand", INSTANCE_ID, "--size", "2049", "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      stdoutWrite.mockClear();
      await run("--json", "storage", "expand", INSTANCE_ID, "--size", "200", "--yes");
      expect(spies.updateStorageInfo).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ action: "unchanged" });
    });
  });

  describe("backup-info, backup", () => {
    it("backup-info get 은 응답 필드를 그대로 보인다", async () => {
      spies.getBackupInfo.mockResolvedValue({ backupPeriod: 7, backupSchedules: [{ backupWndBgnTime: "00:00:00" }] });

      await run("--json", "backup-info", "get", INSTANCE_ID);

      expect(json()).toMatchObject({ backupPeriod: 7 });
    });

    it("backup list 는 유형을 대문자로 바꿔 넘기고 잘못된 유형은 막는다", async () => {
      spies.listBackups.mockResolvedValue({ items: [], totalCounts: 0 });

      await run("backup", "list", "--instance", INSTANCE_ID, "--type", "manual", "--size", "5");
      expect(spies.listBackups).toHaveBeenCalledWith({
        backupType: "MANUAL", dbInstanceId: INSTANCE_ID, dbVersion: undefined, page: undefined, size: 5,
      });

      await expect(run("backup", "list", "--type", "weekly")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    });
  });

  describe("ha, instance rebuild", () => {
    beforeEach(() => spies.getHaInfo.mockResolvedValue({ useHighAvailability: true, haStatus: "STABLE" }));

    it("ha get 은 상태를 보인다", async () => {
      await run("--json", "ha", "get", INSTANCE_ID);

      expect(json()).toMatchObject({ useHighAvailability: true, haStatus: "STABLE" });
    });

    it.each(["pause", "resume", "repair", "split"] as const)("ha %s 는 --yes 없이는 요청하지 않고 --yes 로 요청한다", async (action) => {
      await run("--json", "ha", action, INSTANCE_ID);
      expect(spies.haAction).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: `ha-${action}`, applied: false });

      stdoutWrite.mockClear();
      await run("--json", "ha", action, INSTANCE_ID, "--yes");
      expect(spies.haAction).toHaveBeenCalledWith(INSTANCE_ID, action);
      expect(json()).toMatchObject({ applied: true, jobId: JOB_ID });
    });

    it("rebuild 는 정상 Primary 를 종료 코드 3으로 막고, 복구 대상은 --yes --wait 로 요청한다", async () => {
      await expect(run("instance", "rebuild", INSTANCE_ID, "--yes")).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(spies.rebuildDbInstance).not.toHaveBeenCalled();

      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, dbInstanceType: "FAILED_MASTER", dbInstanceStatus: "FAILOVER" });
      await run("--json", "instance", "rebuild", INSTANCE_ID, "--yes", "--wait");

      expect(spies.rebuildDbInstance).toHaveBeenCalledWith(INSTANCE_ID);
      expect(json()).toMatchObject({ applied: true, jobStatus: "COMPLETED" });
      expect(stderr()).toContain("모든 데이터베이스를 지우고");
    });
  });
});
