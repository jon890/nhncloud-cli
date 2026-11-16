import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import { RdsMysqlApiError } from "../../services/rds-mysql/errors.js";
import type { RdsMysqlParameter, RdsMysqlParameterGroupDetail } from "../../services/rds-mysql/types.js";
import { configureCommanderExitCodes } from "../commander-errors.js";
import { resolveRdsMysqlClient } from "./helpers.js";
import { instanceCommand } from "./instance.js";
import { parameterGroupCommand } from "./parameter-group.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveRdsMysqlClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({ startSpinner: vi.fn(), stopSpinner: vi.fn() }));

const INSTANCE_ID = "11111111-2222-3333-4444-555555555555";
const GROUP_A = "aaaaaaaa-1111-2222-3333-444444444444";
const GROUP_B = "bbbbbbbb-1111-2222-3333-444444444444";
const JOB_ID = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";

const client = new RdsMysqlClient("appkey", "token", "kr1", "real");
const spies = {
  getDbInstance: vi.spyOn(client, "getDbInstance"),
  getParameterGroup: vi.spyOn(client, "getParameterGroup"),
  updateParameters: vi.spyOn(client, "updateParameters"),
  setInstanceParameterGroup: vi.spyOn(client, "setInstanceParameterGroup"),
};

/** 이름이 빈 파일 전용 파라미터다. fileParameterName 만 있다. */
function fileOnly(id: string, fileName: string, value: string): RdsMysqlParameter {
  return { parameterId: id, parameterName: "", fileParameterName: fileName, parameterFileGroup: "MYSQLD", value, defaultValue: value, applyType: "FILE", updateType: "VARIABLE" };
}

function named(id: string, name: string, value: string, applyType = "BOTH"): RdsMysqlParameter {
  return { parameterId: id, parameterName: name, value, defaultValue: value, applyType, updateType: "VARIABLE" };
}

function group(id: string, parameters: RdsMysqlParameter[]): RdsMysqlParameterGroupDetail {
  return { parameterGroupId: id, parameterGroupName: `pg-${id.slice(0, 1)}`, dbVersion: "MYSQL_V8411", parameterGroupType: "USER", parameterGroupStatus: "STABLE", parameters };
}

async function run(...args: string[]): Promise<void> {
  const root = new Command("nhncloud").exitOverride().option("--json").option("--quiet").addCommand(parameterGroupCommand).addCommand(instanceCommand);
  configureCommanderExitCodes(root);
  await root.parseAsync(["node", "nhncloud", ...args]);
}

describe("파라미터 회귀", () => {
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
    spies.getDbInstance.mockResolvedValue({
      dbInstanceId: INSTANCE_ID, dbInstanceName: "db1", dbInstanceStatus: "AVAILABLE", dbInstanceType: "MASTER",
      dbVersion: "MYSQL_V8411", progressStatus: "NONE", parameterGroupId: GROUP_A,
    });
    spies.setInstanceParameterGroup.mockResolvedValue(JOB_ID);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  describe("instance set-parameter-group 비교", () => {
    const fileOnlySame = [
      fileOnly("f1", "user", "tcrds"),
      fileOnly("f2", "replicate-ignore-db", "mysql"),
      fileOnly("f3", "replicate-ignore-table", "a.b"),
      fileOnly("f4", "replica_skip_errors", "1062"),
      fileOnly("f5", "sysdate-is-now", "1"),
    ];

    it("이름이 빈 파일 전용 파라미터의 값이 같으면 차이도 재시작도 없다", async () => {
      spies.getParameterGroup.mockImplementation(async (id) =>
        group(id, [...fileOnlySame, named("n1", "max_connections", "100")]),
      );

      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", GROUP_B);

      const result = json();
      expect(result["changedParameterCount"]).toBe(0);
      expect(result["restartRequired"]).toBe(false);
      expect(result["changedParameters"]).toStrictEqual([]);
    });

    it("이름이 빈 파라미터 중 값이 다른 것만 fileParameterName 으로 알아볼 수 있게 보인다", async () => {
      spies.getParameterGroup.mockImplementation(async (id) =>
        id === GROUP_A
          ? group(id, fileOnlySame)
          : group(id, fileOnlySame.map((p) => (p.parameterId === "f4" ? { ...p, value: "1062,1032" } : p))),
      );

      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", GROUP_B);

      const result = json();
      expect(result["changedParameterCount"]).toBe(1);
      expect(result["restartRequired"]).toBe(true);
      expect(result["changedParameters"]).toStrictEqual([{ summary: "replica_skip_errors: 1062 -> 1062,1032 [재시작 필요(추정)]" }]);
    });

    it("두 그룹이 parameterId 를 하나도 공유하지 않으면 파일 그룹과 파일 이름으로 비교한다", async () => {
      spies.getParameterGroup.mockImplementation(async (id) =>
        id === GROUP_A
          ? group(id, [fileOnly("a1", "user", "tcrds"), fileOnly("a2", "sysdate-is-now", "1")])
          : group(id, [fileOnly("b1", "user", "tcrds"), fileOnly("b2", "sysdate-is-now", "0")]),
      );

      await run("--json", "instance", "set-parameter-group", INSTANCE_ID, "--parameter-group-id", GROUP_B);

      expect(json()["changedParameters"]).toStrictEqual([{ summary: "sysdate-is-now: 1 -> 0 [재시작 필요(추정)]" }]);
    });
  });

  describe("parameter-group set-parameters 5xx 뒤 반영 확인", () => {
    const before = group(GROUP_A, [named("n1", "max_connections", "100")]);
    const after = group(GROUP_A, [named("n1", "max_connections", "200")]);
    const args = ["--json", "parameter-group", "set-parameters", GROUP_A, "--set", "max_connections=200", "--yes"];

    it("서버 오류로 끝났어도 다시 읽어 값이 반영돼 있으면 반영된 것으로 알린다", async () => {
      spies.getParameterGroup.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      spies.updateParameters.mockRejectedValue(new RdsMysqlApiError(80500, "internal error", 500));

      await run(...args);

      expect(spies.getParameterGroup).toHaveBeenCalledTimes(2);
      const result = json();
      expect(result["applied"]).toBe(true);
      expect(result["verifiedAfterError"]).toBe(true);
      expect(stderr()).toContain("다시 읽어 보니 요청한 값이 모두 반영돼 있습니다");
    });

    it("다시 읽어도 값이 그대로면 오류를 그대로 던지고 반영되지 않았다고 알린다", async () => {
      spies.getParameterGroup.mockResolvedValue(before);
      spies.updateParameters.mockRejectedValue(new RdsMysqlApiError(80500, "internal error", 500));

      await expect(run(...args)).rejects.toMatchObject({ name: "RdsMysqlApiError" });

      expect(stderr()).toContain("반영되지 않았습니다");
    });

    it("다시 읽기도 실패하면 접수 여부를 알 수 없다고 안내하고 오류를 던진다", async () => {
      spies.getParameterGroup.mockResolvedValueOnce(before).mockRejectedValueOnce(new Error("network"));
      spies.updateParameters.mockRejectedValue(new RdsMysqlApiError(80500, "internal error", 502));

      await expect(run(...args)).rejects.toMatchObject({ name: "RdsMysqlApiError" });

      expect(stderr()).toContain("접수됐는지 알 수 없습니다");
    });

    it("봉투로 알린 4xx 같은 알려진 실패는 다시 읽지 않는다", async () => {
      spies.getParameterGroup.mockResolvedValue(before);
      spies.updateParameters.mockRejectedValue(new RdsMysqlApiError(80400, "bad", 400));

      await expect(run(...args)).rejects.toMatchObject({ name: "RdsMysqlApiError" });

      expect(spies.getParameterGroup).toHaveBeenCalledTimes(1);
    });
  });
});
