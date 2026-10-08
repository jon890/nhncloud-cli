import chalk from "chalk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileInspection, CredentialsFileInspection } from "../config/credentials.js";
import type { IaasCredential, ServiceCredential, UserAccessKey } from "../config/types.js";
import type { SkillManagerContext } from "../skill/context.js";
import type { SkillStatus } from "../skill/manager.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import {
  createDoctorCommand,
  type DoctorConnectionDependencies,
  type DoctorDependencies,
  type DoctorReport,
} from "./doctor.js";

const CREDENTIALS_FILE = "/home/tester/.nhncloud/credentials.json";
const CONFIG_FILE = "/home/tester/.nhncloud/config.json";

const context: SkillManagerContext = {
  homeDir: "/home/tester",
  packageRoot: "/package",
  currentVersion: "1.2.3",
  dataRoot: "/home/tester/.local/share/nhncloud-cli",
};

const missingSkill: SkillStatus = {
  schemaVersion: 1,
  status: "missing",
  destination: "/home/tester/.claude/skills/nhncloud-cli",
  source: "/package/skills/nhncloud-cli",
  currentVersion: "1.2.3",
  managed: false,
};

const currentSkill: SkillStatus = {
  ...missingSkill,
  status: "current",
  installedVersion: "1.2.3",
  linkTarget: "/home/tester/.local/share/nhncloud-cli/skills/1.2.3-digest",
  managed: true,
};

const missingCredentials: CredentialsFileInspection = {
  path: CREDENTIALS_FILE,
  state: "missing",
  profiles: [],
};

const okCredentials: CredentialsFileInspection = {
  path: CREDENTIALS_FILE,
  state: "ok",
  permissions: "ok",
  profiles: [{ name: "default", environment: "real", blocks: ["iaas", "userAccessKey"] }],
};

const missingConfig: ConfigFileInspection = {
  path: CONFIG_FILE,
  state: "missing",
  defaultProfile: null,
};

const uak: UserAccessKey = { id: "test-uak-id", secret: "fake-secret" };
const iaasCredential: IaasCredential = {
  tenantId: "test-tenant",
  username: "test-user",
  password: "fake-password",
  region: "KR1",
};
const LOGNCRASH_APPKEY = "test-appkey";
const NCR_APPKEY = "test-ncr-appkey";
const NCS_APPKEY = "test-ncs-appkey";

let dependencies: DoctorDependencies;
/** 연결 의존성 호출 순서. verify 순서와 "아무것도 부르지 않음"을 단언한다. */
let connectionCalls: string[];
let exitCodeBefore: typeof process.exitCode;
let chalkLevel: typeof chalk.level;

function program(): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(createDoctorCommand(dependencies));
}

async function run(...args: string[]): Promise<string> {
  vi.mocked(process.stdout.write).mockClear();
  await program().parseAsync(["node", "nhncloud", ...args]);
  return vi.mocked(process.stdout.write).mock.calls.map(([value]) => String(value)).join("");
}

async function runJson(...args: string[]): Promise<DoctorReport> {
  return JSON.parse(await run(...args)) as DoctorReport;
}

/** 실제 네트워크 대신 쓰는 연결 의존성. 기본값은 UAK, iaas, logncrash 만 설정된 일반망 profile 이다. */
function fakeConnection(
  services: Record<string, ServiceCredential | undefined> = { logncrash: { appkey: LOGNCRASH_APPKEY } },
): DoctorConnectionDependencies {
  const record =
    <A extends unknown[], R>(name: string, impl: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      connectionCalls.push(name);
      return impl(...args);
    };
  return {
    getUserAccessKey: record("getUserAccessKey", async () => uak),
    getIaasCredential: record("getIaasCredential", async () => iaasCredential),
    getOptionalServiceCredential: record(
      "getOptionalServiceCredential",
      async (service: string) => services[service],
    ),
    verifyUserAccessKey: record("verifyUserAccessKey", async () => true),
    verifyIaas: record("verifyIaas", async () => true),
    verifyLogncrash: record("verifyLogncrash", async () => true),
    verifyNcr: record("verifyNcr", async () => true),
    verifyNcs: record("verifyNcs", async () => true),
  };
}

beforeEach(() => {
  connectionCalls = [];
  dependencies = {
    inspectCredentials: vi.fn(async () => missingCredentials),
    inspectConfig: vi.fn(async () => missingConfig),
    resolveProfile: vi.fn(async (cliProfile?: string) => cliProfile ?? "default"),
    createSkillContext: vi.fn(() => context),
    inspectSkill: vi.fn(async () => missingSkill),
    connection: fakeConnection(),
  };
  exitCodeBefore = process.exitCode;
  chalkLevel = chalk.level;
  chalk.level = 0;
  vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
});

afterEach(() => {
  chalk.level = chalkLevel;
  vi.restoreAllMocks();
  expect(process.exitCode).toBe(exitCodeBefore);
});

describe("doctor --json", () => {
  it("빈 HOME 에서 고정 필드로 준비되지 않음을 보고한다", async () => {
    const report = await runJson("doctor", "--json");

    expect(report).toEqual({
      schemaVersion: 1,
      ready: false,
      credentials: missingCredentials,
      config: missingConfig,
      profile: { name: "default", exists: false },
      connection: { checked: false },
      skills: {
        agents: { claude: { ...missingSkill, recoveryCommand: "nhncloud skills install" } },
      },
    });
  });

  it("전역 옵션을 명령 앞에 두어도 같은 JSON 을 낸다", async () => {
    const after = await run("doctor", "--json");
    const before = await run("--json", "doctor");

    expect(before).toBe(after);
  });

  it("자격증명과 profile 과 스킬이 정상이면 ready 다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => okCredentials);
    dependencies.inspectSkill = vi.fn(async () => currentSkill);

    const report = await runJson("doctor", "--json");

    expect(report.ready).toBe(true);
    expect(report.profile).toEqual({ name: "default", exists: true });
    expect(report.skills.agents.claude).toEqual({ ...currentSkill, recoveryCommand: null });
  });

  it("profile 해석이 NhnCloudCliError 로 실패하면 name 이 null 이고 정상 종료한다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => okCredentials);
    dependencies.resolveProfile = vi.fn(async () => {
      throw new NhnCloudCliError("config.json 파싱 실패", EXIT_CONFIG_ERROR);
    });

    const report = await runJson("doctor", "--json");

    expect(report.profile).toEqual({ name: null, exists: false });
    expect(report.ready).toBe(false);
  });

  it("--profile 값을 profile 해석에 넘긴다", async () => {
    const report = await runJson("doctor", "--profile", "staging", "--json");

    expect(dependencies.resolveProfile).toHaveBeenCalledWith("staging");
    expect(report.profile.name).toBe("staging");
  });

  it("스킬 판정이 실패하면 error 상태로 바꾸고 나머지 필드는 그대로 낸다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => okCredentials);
    dependencies.inspectSkill = vi.fn(async () => {
      throw new NhnCloudCliError("패키지 메타데이터를 읽을 수 없습니다", EXIT_CONFIG_ERROR);
    });

    const report = await runJson("doctor", "--json");

    expect(report.skills.agents.claude).toEqual({
      status: "error",
      reason: "공개 스킬 상태를 판정하지 못했습니다",
    });
    expect(report.credentials).toEqual(okCredentials);
    expect(report.profile).toEqual({ name: "default", exists: true });
    expect(report.ready).toBe(true);
  });

  it("스킬 컨텍스트 생성이 실패해도 error 상태로 바꾼다", async () => {
    dependencies.createSkillContext = vi.fn(() => {
      throw new Error("context failure");
    });

    const report = await runJson("doctor", "--json");

    expect(report.skills.agents.claude.status).toBe("error");
  });

  it("스킬 오류의 code 만 reason 에 붙이고 메시지는 넣지 않는다", async () => {
    dependencies.inspectSkill = vi.fn(async () => {
      throw Object.assign(new Error("open failed: fake-secret"), { code: "EACCES" });
    });

    const report = await runJson("doctor", "--json");
    const claude = report.skills.agents.claude;

    expect(claude).toEqual({ status: "error", reason: "공개 스킬 상태를 판정하지 못했습니다: EACCES" });
    expect(JSON.stringify(report)).not.toContain("fake-secret");
    expect(JSON.stringify(report)).not.toContain("open failed");
  });

  it("profile 의 environment 가 invalid 면 ready 가 아니다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({
      ...okCredentials,
      profiles: [{ name: "default", environment: "invalid" as const, blocks: ["userAccessKey"] }],
    }));

    const report = await runJson("doctor", "--json");

    expect(report.profile.exists).toBe(true);
    expect(report.ready).toBe(false);
  });

  it("대상 profile 에 자격증명 블록이 없으면 ready 가 아니다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({
      ...okCredentials,
      profiles: [{ name: "default", environment: "real" as const, blocks: [] }],
    }));

    const report = await runJson("doctor", "--json");

    expect(report.profile.exists).toBe(true);
    expect(report.ready).toBe(false);
  });
});

describe("doctor --quiet", () => {
  it("준비되었으면 ready 한 줄만 낸다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => okCredentials);

    expect(await run("doctor", "--quiet")).toBe("ready\n");
  });

  it("준비되지 않았으면 not-ready 한 줄만 낸다", async () => {
    expect(await run("--quiet", "doctor")).toBe("not-ready\n");
  });
});

describe("doctor 텍스트 출력", () => {
  it("credentials 가 invalid 면 경로와 reason 을 보인다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({
      path: CREDENTIALS_FILE,
      state: "invalid" as const,
      reason: "JSON 형식이 아닙니다",
      permissions: "ok" as const,
      profiles: [],
    }));

    const text = await run("doctor");

    expect(text).toContain(CREDENTIALS_FILE);
    expect(text).toContain("JSON 형식이 아닙니다");
    expect(text).toContain("설정이 필요합니다");
  });

  it("profile 이름의 제어 문자를 터미널에 그대로 내지 않는다", async () => {
    const hostile = "evil\u001b[31mred";
    dependencies.inspectCredentials = vi.fn(async () => ({
      ...okCredentials,
      profiles: [{ name: hostile, environment: "gov" as const, blocks: ["userAccessKey"] }],
    }));
    dependencies.resolveProfile = vi.fn(async () => hostile);

    const text = await run("doctor");

    expect(text).toContain("evil?[31mred");
    expect(text).not.toContain(hostile);
    expect(text).not.toContain("\u001b");
  });

  it("credentials 가 ok 이고 profile 이 없으면 profile 없음 안내를 유지한다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({ ...okCredentials, profiles: [] }));

    const text = await run("doctor");

    expect(text).toContain("profile 없음");
  });

  it("파일 권한이 넓으면 chmod 안내를 낸다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({
      ...okCredentials,
      permissions: "too-open" as const,
    }));

    expect(await run("doctor")).toContain(`chmod 600 ${CREDENTIALS_FILE}`);
  });

  it("profile 해석에 실패하면 config.json 을 먼저 고치라고 안내한다", async () => {
    dependencies.resolveProfile = vi.fn(async () => {
      throw new NhnCloudCliError("config.json 파싱 실패", EXIT_CONFIG_ERROR);
    });

    expect(await run("doctor")).toContain("config.json 을 먼저 고치세요");
  });
});

const realCredentials: CredentialsFileInspection = {
  ...okCredentials,
  profiles: [{ name: "default", environment: "real", blocks: ["iaas", "logncrash", "userAccessKey"] }],
};

function verifyCalls(): string[] {
  return connectionCalls.filter((name) => name.startsWith("verify"));
}

describe("doctor --check-connection", () => {
  beforeEach(() => {
    dependencies.inspectCredentials = vi.fn(async () => realCredentials);
  });

  it("플래그가 없으면 연결 의존성을 하나도 부르지 않는다", async () => {
    const report = await runJson("doctor", "--json");

    expect(report.connection).toEqual({ checked: false });
    expect(connectionCalls).toEqual([]);
  });

  it("설정된 대상은 ok, 블록이 없는 대상은 not-configured 로 보고한다", async () => {
    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection).toEqual({
      checked: true,
      profile: "default",
      targets: {
        userAccessKey: { status: "ok" },
        iaas: { status: "ok" },
        logncrash: { status: "ok" },
        ncr: { status: "skipped", reason: "not-configured" },
        ncs: { status: "skipped", reason: "not-configured" },
      },
    });
    expect(report.ready).toBe(true);
    expect(verifyCalls()).toEqual(["verifyUserAccessKey", "verifyIaas", "verifyLogncrash"]);
  });

  it("UAK 인증이 실패하면 failed/auth 이고 ready 가 아니다", async () => {
    dependencies.connection.verifyUserAccessKey = vi.fn(async () => false);

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.userAccessKey).toEqual({
      status: "failed",
      reason: "auth",
    });
    expect(report.ready).toBe(false);
  });

  it("verify 가 NhnCloudCliError 를 던지면 그 종료 코드로 보고하고 다음 대상을 계속 확인한다", async () => {
    dependencies.connection.verifyIaas = async () => {
      connectionCalls.push("verifyIaas");
      throw new NhnCloudCliError("x", EXIT_API_ERROR);
    };

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.iaas).toEqual({
      status: "failed",
      reason: "error",
      exitCode: 1,
    });
    expect(report.connection.checked && report.connection.targets.logncrash).toEqual({ status: "ok" });
    expect(verifyCalls()).toEqual(["verifyUserAccessKey", "verifyIaas", "verifyLogncrash"]);
    expect(JSON.stringify(report)).not.toContain('"x"');
    expect(report.ready).toBe(false);
  });

  it("verify 가 일반 Error 를 던지면 EXIT_API_ERROR 로 보고한다", async () => {
    dependencies.connection.verifyIaas = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.iaas).toEqual({
      status: "failed",
      reason: "error",
      exitCode: EXIT_API_ERROR,
    });
    expect(JSON.stringify(report)).not.toContain("ECONNREFUSED");
  });

  it("verify 가 EXIT_CONFIG_ERROR 를 던지면 그 코드를 그대로 보고한다", async () => {
    dependencies.connection.verifyIaas = vi.fn(async () => {
      throw new NhnCloudCliError("x", EXIT_CONFIG_ERROR);
    });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.iaas).toEqual({
      status: "failed",
      reason: "error",
      exitCode: EXIT_CONFIG_ERROR,
    });
  });

  it("UAK 가 없고 ncr appkey 가 있으면 ncr 은 uak-missing 이고 verifyNcr 를 부르지 않는다", async () => {
    dependencies.connection = fakeConnection({ ncr: { appkey: NCR_APPKEY } });
    dependencies.connection.getUserAccessKey = vi.fn(async () => {
      throw new NhnCloudCliError("userAccessKey 없음", EXIT_CONFIG_ERROR);
    });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.userAccessKey).toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(report.connection.checked && report.connection.targets.ncr).toEqual({
      status: "skipped",
      reason: "uak-missing",
    });
    expect(verifyCalls()).not.toContain("verifyNcr");
  });

  it("UAK 확인이 실패하면 OAuth 대상은 uak-failed 로 건너뛰고 ncr 은 확인한다", async () => {
    dependencies.connection = fakeConnection({
      logncrash: { appkey: LOGNCRASH_APPKEY },
      ncr: { appkey: NCR_APPKEY },
      ncs: { appkey: NCS_APPKEY },
    });
    dependencies.connection.verifyUserAccessKey = async () => {
      connectionCalls.push("verifyUserAccessKey");
      return false;
    };

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets).toMatchObject({
      logncrash: { status: "skipped", reason: "uak-failed" },
      ncr: { status: "ok" },
      ncs: { status: "skipped", reason: "uak-failed" },
    });
    expect(verifyCalls()).toEqual(["verifyUserAccessKey", "verifyIaas", "verifyNcr"]);
  });

  it("공공망 profile 은 모든 대상을 gov-unsupported 로 두고 어떤 의존성도 부르지 않는다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => ({
      ...realCredentials,
      profiles: [{ name: "default", environment: "gov" as const, blocks: ["userAccessKey"] }],
    }));

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && Object.values(report.connection.targets)).toEqual(
      Array(5).fill({ status: "skipped", reason: "gov-unsupported" }),
    );
    expect(connectionCalls).toEqual([]);
  });

  it("자격증명 파일이 없으면 모든 대상을 profile-unavailable 로 둔다", async () => {
    dependencies.inspectCredentials = vi.fn(async () => missingCredentials);

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection).toEqual({
      checked: true,
      profile: "default",
      targets: {
        userAccessKey: { status: "skipped", reason: "profile-unavailable" },
        iaas: { status: "skipped", reason: "profile-unavailable" },
        logncrash: { status: "skipped", reason: "profile-unavailable" },
        ncr: { status: "skipped", reason: "profile-unavailable" },
        ncs: { status: "skipped", reason: "profile-unavailable" },
      },
    });
    expect(connectionCalls).toEqual([]);
  });

  it("getter 가 NhnCloudCliError 가 아닌 예외를 던지면 그 대상만 profile-unavailable 로 두고 계속한다", async () => {
    dependencies.connection.getIaasCredential = vi.fn(async () => {
      throw new Error("x");
    });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.iaas).toEqual({
      status: "skipped",
      reason: "profile-unavailable",
    });
    expect(report.connection.checked && report.connection.targets.logncrash).toEqual({ status: "ok" });
  });

  it("서비스 블록 getter 가 NhnCloudCliError 를 던져도 profile-unavailable 이다", async () => {
    dependencies.connection.getOptionalServiceCredential = vi.fn(async () => {
      throw new NhnCloudCliError("profile 없음", EXIT_CONFIG_ERROR);
    });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.logncrash).toEqual({
      status: "skipped",
      reason: "profile-unavailable",
    });
  });

  it("appkey 가 빈 문자열이면 not-configured 다", async () => {
    dependencies.connection = fakeConnection({ logncrash: { appkey: "" } });

    const report = await runJson("doctor", "--check-connection", "--json");

    expect(report.connection.checked && report.connection.targets.logncrash).toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(verifyCalls()).not.toContain("verifyLogncrash");
  });

  it("텍스트 모드는 연결 확인 절을 내고 비밀값을 어디에도 쓰지 않는다", async () => {
    dependencies.connection = fakeConnection({
      logncrash: { appkey: LOGNCRASH_APPKEY },
      ncr: { appkey: NCR_APPKEY },
      ncs: { appkey: NCS_APPKEY },
    });
    dependencies.connection.verifyUserAccessKey = vi.fn(async () => false);
    dependencies.connection.verifyIaas = vi.fn(async () => {
      throw new Error(`request failed: ${iaasCredential.password}`);
    });
    dependencies.connection.verifyNcr = vi.fn(async () => {
      throw new Error(`GET /appkeys/${NCR_APPKEY} ${uak.secret}`);
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

    const text = await run("doctor", "--check-connection");
    const errText = stderr.mock.calls.map(([value]) => String(value)).join("");

    expect(text).toContain("연결 확인");
    expect(text).toContain("userAccessKey: ❌ 인증 실패");
    expect(text).toContain(`iaas: ❌ 오류 (종료 코드 ${EXIT_API_ERROR})`);
    expect(text).toContain("logncrash: 건너뜀");
    for (const secret of [uak.secret, iaasCredential.password, LOGNCRASH_APPKEY, NCR_APPKEY, NCS_APPKEY]) {
      expect(text, `stdout 에 ${secret} 이 있다`).not.toContain(secret);
      expect(errText, `stderr 에 ${secret} 이 있다`).not.toContain(secret);
    }
  });

  it("텍스트 모드에서 플래그가 없으면 연결 확인 절을 내지 않는다", async () => {
    expect(await run("doctor")).not.toContain("연결 확인");
  });

  it("ncr 과 ncs 성공 줄에 kr1 을 붙인다", async () => {
    dependencies.connection = fakeConnection({ ncr: { appkey: NCR_APPKEY }, ncs: { appkey: NCS_APPKEY } });

    const text = await run("doctor", "--check-connection");

    expect(text).toContain("ncr: ✓ 성공 (kr1)");
    expect(text).toContain("ncs: ✓ 성공 (kr1)");
    expect(text).toContain("userAccessKey: ✓ 성공\n");
  });
});
