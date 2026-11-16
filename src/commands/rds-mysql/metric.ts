import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { collectOption, parseIntegerOption } from "../parse-options.js";
import { fail, formatKst, resolveTimeRange } from "./group-helpers.js";
import {
  formatCell,
  parseUuidArgument,
  type RdsMysqlCommandOptions,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

const metricListCommand = withRdsMysqlOptions(
  new Command("list").description("조회할 수 있는 성능 지표(measureName)와 단위 목록을 조회한다"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);

  const metrics = await withRdsMysqlSpinner("지표 목록 조회 중...", () => client.listMetrics());
  output(opts, {
    headers: ["measureName", "unit"],
    rows: metrics.map((m) => [formatCell(m.measureName), formatCell(m.unit)]),
    raw: metrics,
    ids: metrics.map((m) => m.measureName),
  });
});

interface StatisticsOptions extends RdsMysqlCommandOptions {
  metric: string[];
  from?: string;
  to?: string;
  last?: string;
  interval?: string;
}

const statisticsCommand = withRdsMysqlOptions(
  new Command("statistics")
    .description("DB 인스턴스의 성능 지표 통계를 시간 순으로 조회한다")
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
    .requiredOption("--metric <measure-name>", "조회할 지표 (metric list 의 measureName). 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--from <iso>", "시작 시각 (시간대가 있는 ISO 8601, 예: 2026-01-31T09:00:00+09:00)")
    .option("--to <iso>", "종료 시각 (시간대가 있는 ISO 8601). 없으면 지금")
    .option("--last <duration>", "종료 시각에서 거슬러 올라갈 기간 (예: 30m, 6h, 1d). --from 대신 쓴다")
    .option("--interval <minutes>", "조회 간격 (분). 없으면 서버가 범위에 맞게 고른다"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<StatisticsOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const measureNames = [...new Set(opts.metric.flatMap((value) => value.split(",").map((name) => name.trim())))];
  if (measureNames.some((name) => name === "")) fail("--metric에 빈 지표 이름이 있습니다.");
  const range = resolveTimeRange(opts);
  const interval = opts.interval === undefined ? undefined : parseIntegerOption(opts.interval, "--interval", { min: 1 });
  const { client } = await resolveRdsMysqlClient(opts);

  const statistics = await withRdsMysqlSpinner(`지표 통계 조회 중 (${id})...`, () =>
    client.getMetricStatistics({ dbInstanceId: id, measureNames, ...range, interval }),
  );
  const rows = statistics.flatMap((stat) =>
    stat.values.map(([timestamp, value]) => [formatCell(stat.measureName), formatKst(timestamp * 1000), formatCell(value), formatCell(stat.unit)]),
  );
  output(opts, {
    headers: ["measureName", "time", "value", "unit"],
    rows,
    raw: statistics,
    ids: statistics.map((s) => s.measureName),
  });
  const returned = new Set(statistics.map((s) => s.measureName));
  const absent = measureNames.filter((name) => !returned.has(name));
  if (absent.length > 0) {
    process.stderr.write(`안내: 응답에 없는 지표가 있습니다: ${absent.map((n) => JSON.stringify(n)).join(", ")}. nhncloud rds-mysql metric list로 이름을 확인하세요.\n`);
  } else if (rows.length === 0) {
    process.stderr.write("안내: 이 범위에 측정값이 없습니다. 시간 범위를 넓혀 보세요.\n");
  }
});

export const metricCommand = new Command("metric")
  .description("성능 지표 목록과 통계 조회 명령")
  .addCommand(metricListCommand)
  .addCommand(statisticsCommand);
