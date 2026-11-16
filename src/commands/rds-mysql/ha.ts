import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { RdsMysqlApiError } from "../../services/rds-mysql/errors.js";
import type { RdsMysqlDbInstanceDetail, RdsMysqlHaInfo } from "../../services/rds-mysql/types.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
  formatCell,
  parseUuidArgument,
  parseWaitOptions,
  type RdsMysqlCommandOptions,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";

const getCommand = withRdsMysqlOptions(
  new Command("get")
    .description("고가용성 사용 여부와 상태를 조회한다")
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const info = await withRdsMysqlSpinner(`고가용성 정보 조회 중 (${id})...`, () => client.getHaInfo(id));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(info).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: info,
    ids: info.haStatus === null || info.haStatus === undefined ? [] : [info.haStatus],
  });
});

type HaAction = "pause" | "resume" | "repair" | "split";

interface HaActionSpec {
  action: HaAction;
  description: string;
  warning: string;
}

const HA_ACTIONS: readonly HaActionSpec[] = [
  {
    action: "pause",
    description: "고가용성을 일시 중지한다",
    warning: "경고: 일시 중지하는 동안 Primary 에 장애가 나도 자동 장애 조치가 일어나지 않습니다. 작업이 끝나면 ha resume 으로 다시 시작합니다.",
  },
  {
    action: "resume",
    description: "일시 중지한 고가용성을 다시 시작한다",
    warning: "안내: 다시 시작한 뒤에는 자동 장애 조치가 다시 동작합니다.",
  },
  {
    action: "repair",
    description: "장애 조치된 Primary(Failed Over Primary)를 새 Primary 와 다시 고가용성 구성으로 복구한다",
    warning:
      "경고: 데이터 정합성이 깨졌거나 복구에 필요한 바이너리 로그가 없으면 복구가 실패합니다. 실패하면 rebuild 로 재구축합니다.",
  },
  {
    action: "split",
    description: "고가용성 구성에서 DB 인스턴스를 분리한다",
    warning:
      "경고: 분리하면 Primary 와 Standby 가 별개 인스턴스가 되어 자동 장애 조치가 사라집니다. 되돌리려면 고가용성을 다시 구성해야 합니다.",
  },
];

function haCommand(spec: HaActionSpec): Command {
  return withRdsMysqlWriteOptions(
    new Command(spec.action)
      .description(`${spec.description}. --yes가 없으면 미리보기만 한다`)
      .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)"),
  ).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
    const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
    const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
    const wait = parseWaitOptions(opts);
    const { client } = await resolveRdsMysqlClient(opts);

    const instance = await checkInstanceForWrite(client, id, false);
    let ha: RdsMysqlHaInfo | null = null;
    try {
      ha = await withRdsMysqlSpinner(`고가용성 정보 조회 중 (${id})...`, () => client.getHaInfo(id));
    } catch (err) {
      // 장애 조치된 Primary 는 고가용성 정보가 조회되지 않을 수 있다. 복구와 분리는 그래도 진행한다.
      if (!(err instanceof RdsMysqlApiError) || (spec.action !== "repair" && spec.action !== "split")) throw err;
      process.stderr.write(`경고: 고가용성 정보를 조회하지 못했습니다 (${err.summary}).\n`);
    }
    warnHaState(spec.action, instance, ha);
    process.stderr.write(`${spec.warning}\n`);

    await applyRdsMysqlWrite(
      opts,
      wait,
      client,
      rdsMysqlOperationResult({
        operation: `ha-${spec.action}`,
        dbInstanceId: id,
        target: id,
        action: spec.action,
        details: {
          dbInstanceType: instance.dbInstanceType ?? null,
          dbInstanceStatus: instance.dbInstanceStatus,
          useHighAvailability: ha?.useHighAvailability ?? null,
          haStatus: ha?.haStatus ?? null,
        },
      }),
      () => client.haAction(id, spec.action),
      `nhncloud rds-mysql ha get ${id}`,
    );
  });
}

/** 상태가 이 동작과 맞지 않아 보이면 알린다. 서버가 판정하므로 막지는 않는다. */
function warnHaState(action: HaAction, instance: RdsMysqlDbInstanceDetail, ha: RdsMysqlHaInfo | null): void {
  const status = sanitizeForTerminal(ha?.haStatus ?? "알 수 없음");
  if (ha !== null && !ha.useHighAvailability && action !== "repair" && action !== "split") {
    process.stderr.write(`경고: 이 DB 인스턴스는 고가용성을 쓰지 않는 것으로 조회됩니다 (haStatus=${status}).\n`);
  }
  if (action === "pause" && typeof ha?.haStatus === "string" && ha.haStatus.startsWith("PAUSED")) {
    process.stderr.write(`경고: 이미 일시 중지 상태입니다 (haStatus=${status}).\n`);
  }
  if (action === "resume" && ha?.haStatus === "STABLE") {
    process.stderr.write(`경고: 고가용성이 이미 정상입니다 (haStatus=${status}).\n`);
  }
  if ((action === "repair" || action === "split") && instance.dbInstanceType !== "FAILED_MASTER") {
    process.stderr.write(
      `경고: 이 동작은 보통 장애 조치된 Primary(FAILED_MASTER)에 씁니다. 현재 dbInstanceType=${sanitizeForTerminal(String(instance.dbInstanceType ?? "알 수 없음"))}입니다.\n`,
    );
  }
}

export const haCommandGroup = new Command("ha").description("고가용성 조회, 일시 중지, 다시 시작, 복구, 분리 명령").addCommand(getCommand);
for (const spec of HA_ACTIONS) haCommandGroup.addCommand(haCommand(spec));
