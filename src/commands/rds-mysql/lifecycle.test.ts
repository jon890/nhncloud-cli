import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import { RdsMysqlApiError } from "../../services/rds-mysql/errors.js";
import type { RdsMysqlDbInstanceDetail } from "../../services/rds-mysql/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { configureCommanderExitCodes } from "../commander-errors.js";
import { resolveRdsMysqlClient } from "./helpers.js";
import { instanceCommand } from "./instance.js";
import { availabilityZoneCommand, dbVersionCommand, flavorCommand, projectCommand, subnetCommand } from "./lookup.js";
import { storageCommand } from "./storage.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveRdsMysqlClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const ID = "11111111-2222-3333-4444-555555555555";
const FLAVOR = "aaaaaaaa-1111-2222-3333-444444444444";
const SUBNET = "bbbbbbbb-1111-2222-3333-444444444444";
const GROUP = "cccccccc-1111-2222-3333-444444444444";
const SG = "dddddddd-1111-2222-3333-444444444444";
const JOB = "eeeeeeee-bbbb-cccc-dddd-ffffffffffff";

const client = new RdsMysqlClient("appkey", "token", "kr1", "real");
const spies = {
  getDbInstance: vi.spyOn(client, "getDbInstance"),
  getHaInfo: vi.spyOn(client, "getHaInfo"),
  getNetworkInfo: vi.spyOn(client, "getNetworkInfo"),
  getParameterGroup: vi.spyOn(client, "getParameterGroup"),
  listDbFlavors: vi.spyOn(client, "listDbFlavors"),
  listSubnets: vi.spyOn(client, "listSubnets"),
  listDbVersions: vi.spyOn(client, "listDbVersions"),
  listStorageTypes: vi.spyOn(client, "listStorageTypes"),
  listAvailabilityZones: vi.spyOn(client, "listAvailabilityZones"),
  listProjectMembers: vi.spyOn(client, "listProjectMembers"),
  createDbInstance: vi.spyOn(client, "createDbInstance"),
  replicateDbInstance: vi.spyOn(client, "replicateDbInstance"),
  modifyDbInstance: vi.spyOn(client, "modifyDbInstance"),
  deleteDbInstance: vi.spyOn(client, "deleteDbInstance"),
  startDbInstance: vi.spyOn(client, "startDbInstance"),
  stopDbInstance: vi.spyOn(client, "stopDbInstance"),
  restartDbInstance: vi.spyOn(client, "restartDbInstance"),
  forceRestartDbInstance: vi.spyOn(client, "forceRestartDbInstance"),
  promoteDbInstance: vi.spyOn(client, "promoteDbInstance"),
  setDeletionProtection: vi.spyOn(client, "setDeletionProtection"),
  updateNetworkInfo: vi.spyOn(client, "updateNetworkInfo"),
  listMaintenances: vi.spyOn(client, "listMaintenances"),
  waitForJob: vi.spyOn(client, "waitForJob"),
};

const INSTANCE: RdsMysqlDbInstanceDetail = {
  dbInstanceId: ID,
  dbInstanceName: "db1",
  dbInstanceStatus: "AVAILABLE",
  dbInstanceType: "MASTER",
  dbVersion: "MYSQL_V8411",
  progressStatus: "NONE",
  dbPort: 3306,
  description: "old",
  dbSecurityGroupIds: [SG],
  useDeletionProtection: false,
};

async function run(...args: string[]): Promise<void> {
  const root = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(instanceCommand)
    .addCommand(storageCommand)
    .addCommand(flavorCommand)
    .addCommand(dbVersionCommand)
    .addCommand(subnetCommand)
    .addCommand(availabilityZoneCommand)
    .addCommand(projectCommand);
  configureCommanderExitCodes(root);
  await root.parseAsync(["node", "nhncloud", ...args]);
}

describe("rds-mysql DB 인스턴스 수명주기 명령", () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>;
  let stderrWrite: MockInstance<typeof process.stderr.write>;
  const stdout = (): string => stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
  const stderr = (): string => stderrWrite.mock.calls.map((call) => String(call[0])).join("");
  const json = (): Record<string, unknown> => JSON.parse(stdout()) as Record<string, unknown>;
  const paramError = { exitCode: EXIT_PARAM_ERROR };

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(resolveRdsMysqlClient).mockResolvedValue({ client, profileName: "default" });
    spies.getDbInstance.mockResolvedValue(INSTANCE);
    spies.getHaInfo.mockResolvedValue({ useHighAvailability: false });
    spies.getNetworkInfo.mockResolvedValue({ availabilityZone: "kr-pub-a", endPoints: [{ domain: "d" }] });
    spies.getParameterGroup.mockResolvedValue({ parameterGroupId: GROUP, parameterGroupName: "pg", dbVersion: "MYSQL_V8411", parameters: [] });
    spies.listDbFlavors.mockResolvedValue([{ dbFlavorId: FLAVOR, dbFlavorName: "m2.c1m2", vcpus: 1, ram: 2048 }]);
    spies.listSubnets.mockResolvedValue([{ subnetId: SUBNET }]);
    spies.listDbVersions.mockResolvedValue([{ dbVersion: "MYSQL_V8411" }]);
    spies.listStorageTypes.mockResolvedValue(["General SSD"]);
    for (const name of ["createDbInstance", "replicateDbInstance", "modifyDbInstance", "deleteDbInstance", "startDbInstance", "stopDbInstance", "restartDbInstance", "promoteDbInstance", "updateNetworkInfo"] as const) {
      spies[name].mockResolvedValue(JOB);
    }
    spies.forceRestartDbInstance.mockResolvedValue(undefined);
    spies.setDeletionProtection.mockResolvedValue(undefined);
    spies.waitForJob.mockResolvedValue({ outcome: "completed", job: { jobId: JOB, jobStatus: "COMPLETED" } });
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  describe("delete", () => {
    it("삭제 보호가 켜져 있으면 --yes 여도 요청 전에 종료 코드 3 으로 막고 끄는 명령을 안내한다", async () => {
      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, useDeletionProtection: true });

      await expect(run("instance", "delete", ID, "--yes")).rejects.toMatchObject(paramError);

      expect(spies.deleteDbInstance).not.toHaveBeenCalled();
      await expect(run("instance", "delete", ID, "--yes")).rejects.toThrow("disable-deletion-protection");
    });

    it("--yes 가 없으면 미리보기만 하고 요청하지 않는다", async () => {
      await run("--json", "instance", "delete", ID);

      expect(spies.deleteDbInstance).not.toHaveBeenCalled();
      expect(json()).toMatchObject({ operation: "instance-delete", action: "delete", applied: false, deleteAutoBackup: false });
      expect(stderr()).toContain("Standby 와 읽기 복제본도 모두 함께 삭제");
    });

    it("--yes 는 --delete-auto-backup 값을 보내고 --wait 로 작업을 기다린다", async () => {
      await run("--json", "instance", "delete", ID, "--delete-auto-backup", "--yes", "--wait");

      expect(spies.deleteDbInstance).toHaveBeenCalledWith(ID, true);
      expect(json()).toMatchObject({ applied: true, jobId: JOB, jobStatus: "COMPLETED" });
    });
  });

  describe("start, stop", () => {
    it("이미 원하는 상태면 요청하지 않는다", async () => {
      await run("--json", "instance", "start", ID, "--yes");
      expect(json()).toMatchObject({ action: "unchanged" });
      expect(spies.startDbInstance).not.toHaveBeenCalled();

      stdoutWrite.mockClear();
      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, dbInstanceStatus: "SHUTDOWN" });
      await run("--json", "instance", "stop", ID, "--yes");
      expect(json()).toMatchObject({ action: "unchanged" });
      expect(spies.stopDbInstance).not.toHaveBeenCalled();
    });

    it("--yes 는 상태에 맞는 요청을 보낸다", async () => {
      await run("--json", "instance", "stop", ID, "--yes");
      expect(spies.stopDbInstance).toHaveBeenCalledWith(ID);

      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, dbInstanceStatus: "SHUTDOWN" });
      await run("--json", "instance", "start", ID, "--yes");
      expect(spies.startDbInstance).toHaveBeenCalledWith(ID);
    });
  });

  describe("restart", () => {
    it("--yes 는 다섯 옵션을 모두 담아 보낸다", async () => {
      spies.getHaInfo.mockResolvedValue({ useHighAvailability: true });

      await run("--json", "instance", "restart", ID, "--online-failover", "--backup", "--yes");

      expect(spies.restartDbInstance).toHaveBeenCalledWith(ID, {
        useOnlineFailover: true, executeBackup: true, waitReplicationDelay: false, useReadOnly: false, osRestart: false,
      });
    });

    it("--online-failover 는 고가용성이 아니면 요청 전에 막는다", async () => {
      await expect(run("instance", "restart", ID, "--online-failover", "--yes")).rejects.toMatchObject(paramError);
      expect(spies.restartDbInstance).not.toHaveBeenCalled();
    });

    it("--force 는 고가용성이면 막고, 아니면 강제 재시작을 보내며 작업이 없다", async () => {
      spies.getHaInfo.mockResolvedValue({ useHighAvailability: true });
      await expect(run("instance", "restart", ID, "--force", "--yes")).rejects.toMatchObject(paramError);
      expect(spies.forceRestartDbInstance).not.toHaveBeenCalled();

      spies.getHaInfo.mockResolvedValue({ useHighAvailability: false });
      await run("--json", "instance", "restart", ID, "--force", "--yes");
      expect(spies.forceRestartDbInstance).toHaveBeenCalledWith(ID);
      expect(json()).toMatchObject({ operation: "instance-force-restart", applied: true, jobId: null });
      expect(stderr()).toContain("트랜잭션이 유실");
    });

    it("--force 는 다른 재시작 옵션, --wait 와 함께 쓸 수 없다", async () => {
      await expect(run("instance", "restart", ID, "--force", "--backup")).rejects.toMatchObject(paramError);
      await expect(run("instance", "restart", ID, "--force", "--wait")).rejects.toMatchObject(paramError);
    });
  });

  describe("promote", () => {
    it("읽기 복제본이 아니면 막는다", async () => {
      await expect(run("instance", "promote", ID, "--yes")).rejects.toMatchObject(paramError);
      expect(spies.promoteDbInstance).not.toHaveBeenCalled();
    });

    it("읽기 복제본은 되돌릴 수 없다고 경고하고 --yes 에 요청한다", async () => {
      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, dbInstanceType: "READ_ONLY_SLAVE" });

      await run("--json", "instance", "promote", ID, "--yes");

      expect(spies.promoteDbInstance).toHaveBeenCalledWith(ID);
      expect(stderr()).toContain("되돌릴 수 없습니다");
    });
  });

  describe("삭제 보호와 외부 접속", () => {
    it("같은 값이면 요청하지 않고, 다르면 바꾼 뒤 서버 오류여도 다시 읽어 반영을 확인한다", async () => {
      await run("--json", "instance", "disable-deletion-protection", ID, "--yes");
      expect(json()).toMatchObject({ action: "unchanged" });
      expect(spies.setDeletionProtection).not.toHaveBeenCalled();

      stdoutWrite.mockClear();
      spies.getDbInstance.mockResolvedValueOnce(INSTANCE).mockResolvedValueOnce({ ...INSTANCE, useDeletionProtection: true });
      spies.setDeletionProtection.mockRejectedValue(new RdsMysqlApiError(80500, "internal", 500));
      await run("--json", "instance", "enable-deletion-protection", ID, "--yes");
      expect(spies.setDeletionProtection).toHaveBeenCalledWith(ID, true);
      expect(json()).toMatchObject({ applied: true, verifiedAfterError: true });
    });

    it("외부 접속 허용은 경고하고 --yes 에 요청한다", async () => {
      await run("--json", "instance", "enable-public-access", ID, "--yes");

      expect(spies.updateNetworkInfo).toHaveBeenCalledWith(ID, true);
      expect(stderr()).toContain("DB 보안 그룹 규칙");
    });
  });

  describe("modify", () => {
    it("바꿀 항목이 없으면 종료 코드 3 이다", async () => {
      await expect(run("instance", "modify", ID, "--yes")).rejects.toMatchObject(paramError);
    });

    it("이미 같은 값이면 요청하지 않는다", async () => {
      await run("--json", "instance", "modify", ID, "--description", "old", "--port", "3306", "--security-group-id", SG, "--yes");

      expect(json()).toMatchObject({ action: "unchanged" });
      expect(spies.modifyDbInstance).not.toHaveBeenCalled();
    });

    it("달라지는 항목과 제어 옵션만 보내고 재시작 경고를 낸다", async () => {
      await run("--json", "instance", "modify", ID, "--description", "old", "--port", "13306", "--no-slow-query-analysis", "--backup", "--yes");

      expect(spies.modifyDbInstance).toHaveBeenCalledWith(ID, {
        dbPort: 13306, useSlowQueryAnalysis: false,
        executeBackup: true, useOnlineFailover: false, waitReplicationDelay: false, useReadOnly: false,
      });
      expect(stderr()).toContain("재시작될 수 있습니다");
    });

    it("parameterGroupId 는 받지 않는다", async () => {
      await expect(run("instance", "modify", ID, "--parameter-group-id", GROUP)).rejects.toThrow("unknown option");
    });
  });

  describe("create", () => {
    const baseArgs = [
      "instance", "create", "--name", "db-new", "--flavor-id", FLAVOR, "--db-version", "MYSQL_V8411", "--port", "13306",
      "--user-name", "admin1", "--parameter-group-id", GROUP, "--subnet-id", SUBNET, "--availability-zone", "kr-pub-a",
      "--storage-type", "General SSD", "--storage-size", "20", "--backup-period", "7", "--backup-schedule", "02:00@1h",
    ];
    let dir: string;
    let passwordFile: string;

    beforeEach(async () => {
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      dir = mkdtempSync(join(tmpdir(), "rds-create-"));
      passwordFile = join(dir, "pw");
      writeFileSync(passwordFile, "dummy-pass\n");
    });

    afterEach(async () => {
      const { rmSync } = await import("node:fs");
      rmSync(dir, { recursive: true, force: true });
    });

    it("미리보기는 비밀번호를 내지 않고 요청하지 않는다", async () => {
      await run("--json", ...baseArgs, "--password-file", passwordFile);

      expect(spies.createDbInstance).not.toHaveBeenCalled();
      expect(stdout()).not.toContain("dummy-pass");
      expect(stderr()).not.toContain("dummy-pass");
      expect(json()).toMatchObject({ operation: "instance-create", dbFlavorId: FLAVOR, backupScheduleCount: 1, applied: false });
    });

    it("--yes 는 API 본문 구조로 보낸다", async () => {
      await run("--json", ...baseArgs, "--password-file", passwordFile, "--high-availability", "--candidate-name", "db-new-s", "--autoscale",
        "--autoscale-threshold", "80", "--autoscale-max-size", "500", "--autoscale-cooldown", "30", "--tls", "ssl", "--yes");

      expect(spies.createDbInstance).toHaveBeenCalledWith({
        dbInstanceName: "db-new", dbFlavorId: FLAVOR, dbVersion: "MYSQL_V8411", dbPort: 13306, dbUserName: "admin1",
        dbPassword: "dummy-pass", parameterGroupId: GROUP,
        useHighAvailability: true, dbInstanceCandidateName: "db-new-s", tlsOption: "SSL",
        network: { subnetId: SUBNET, availabilityZone: "kr-pub-a" },
        storage: { storageType: "General SSD", storageSize: 20, storageAutoscale: { useStorageAutoscale: true, threshold: 80, maxStorageSize: 500, cooldownTime: 30 } },
        backup: { backupPeriod: 7, backupSchedules: [{ backupWndBgnTime: "02:00:00", backupWndDuration: "ONE_HOUR" }] },
      });
      expect(stdout()).not.toContain("dummy-pass");
    });

    it("목록에 없는 사양과 서브넷, 다른 엔진 버전의 파라미터 그룹은 요청 전에 막는다", async () => {
      spies.listDbFlavors.mockResolvedValue([]);
      await expect(run(...baseArgs, "--password-file", passwordFile, "--yes")).rejects.toThrow("DB 인스턴스 사양");
      spies.listDbFlavors.mockResolvedValue([{ dbFlavorId: FLAVOR, dbFlavorName: "m" }]);
      spies.listSubnets.mockResolvedValue([]);
      await expect(run(...baseArgs, "--password-file", passwordFile, "--yes")).rejects.toThrow("서브넷");
      spies.listSubnets.mockResolvedValue([{ subnetId: SUBNET }]);
      spies.getParameterGroup.mockResolvedValue({ parameterGroupId: GROUP, parameterGroupName: "pg", dbVersion: "MYSQL_V5726", parameters: [] });
      await expect(run(...baseArgs, "--password-file", passwordFile, "--yes")).rejects.toThrow("엔진 버전이 다릅니다");
      expect(spies.createDbInstance).not.toHaveBeenCalled();
    });

    it("스토리지, 백업, 고가용성 입력 오류를 요청 전에 종료 코드 3 으로 막는다", async () => {
      const withoutStorage = baseArgs.filter((_, i) => i < 18 || i > 21);
      await expect(run(...withoutStorage, "--password-file", passwordFile)).rejects.toMatchObject(paramError);
      await expect(run(...baseArgs, "--password-file", passwordFile, "--high-availability")).rejects.toMatchObject(paramError);
      await expect(run(...baseArgs, "--password-file", passwordFile, "--autoscale")).rejects.toMatchObject(paramError);
      await expect(run(...baseArgs.slice(0, -1), "25:00@1h", "--password-file", passwordFile)).rejects.toMatchObject(paramError);
      expect(spies.createDbInstance).not.toHaveBeenCalled();
    });
  });

  describe("replicate", () => {
    it("Primary 가 아닌 DB 인스턴스에서는 막는다", async () => {
      spies.getDbInstance.mockResolvedValue({ ...INSTANCE, dbInstanceType: "READ_ONLY_SLAVE" });

      await expect(run("instance", "replicate", ID, "--name", "rr", "--availability-zone", "kr-pub-a", "--yes")).rejects.toMatchObject(paramError);
      expect(spies.replicateDbInstance).not.toHaveBeenCalled();
    });

    it("--yes 는 지정한 값만 담아 보낸다", async () => {
      await run("--json", "instance", "replicate", ID, "--name", "rr", "--availability-zone", "kr-pub-b", "--storage-size", "50", "--yes");

      expect(spies.replicateDbInstance).toHaveBeenCalledWith(ID, {
        dbInstanceName: "rr", network: { availabilityZone: "kr-pub-b" }, storage: { storageSize: 50 },
      });
    });
  });

  describe("조회", () => {
    it("maintenances 는 조회 조건을 넘긴다", async () => {
      spies.listMaintenances.mockResolvedValue({ items: [{ maintenanceId: "m1", type: "APPLY_CHANGE_PARAMETER", status: "PENDING" }], totalCounts: 1 });

      await run("--json", "instance", "maintenances", ID, "--type", "APPLY_CHANGE_PARAMETER", "--status", "PENDING");

      expect(spies.listMaintenances).toHaveBeenCalledWith(ID, { type: "APPLY_CHANGE_PARAMETER", statuses: "PENDING", category: undefined });
    });

    it("network 는 접속 정보를 낸다", async () => {
      await run("--json", "instance", "network", ID);

      expect(json()).toMatchObject({ availabilityZone: "kr-pub-a" });
    });

    it("사양, 엔진 버전, 스토리지 유형, 서브넷, 가용성 영역, 멤버를 낸다", async () => {
      spies.listAvailabilityZones.mockResolvedValue([{ availabilityZoneName: "kr-pub-a", zoneState: { available: true } }]);
      spies.listProjectMembers.mockResolvedValue([{ memberId: "m", memberName: "홍길동", emailAddress: "user@example.com" }]);

      for (const args of [["flavor", "list"], ["db-version", "list"], ["storage", "types"], ["subnet", "list"], ["availability-zone", "list"], ["project", "members"]]) {
        stdoutWrite.mockClear();
        await run("--quiet", ...args);
        expect(stdout().trim()).not.toBe("");
      }
    });
  });
});
