import { Command } from "commander";
import chalk from "chalk";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNcsClient } from "./helpers.js";
import { confirmDestructive } from "./template.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type {
  NcsWorkloadSummary,
  NcsWorkloadDetail,
  NcsWorkloadLog,
  NcsWorkloadEvent,
  NcsWorkloadHistorySummary,
  NcsWorkloadHistoryDetail,
  NcsWorkloadScheduleHistory,
} from "../../services/ncs/types.js";

/** id 인수 공통 검증 — 빈값/공백 거절(1-3 회피: spinner 시작 전 검증). */
function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) {
    throw new NhnCloudCliError(`${label} 인수가 비어있습니다.`, EXIT_PARAM_ERROR);
  }
}

interface WorkloadListOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  q?: string;
  page?: string;
  size?: string;
}

const listCommand = new Command("list")
  .description("NCS workload(런타임 실행) 목록을 조회한다")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--q <query>", "워크로드 이름·템플릿 ID·템플릿 버전으로 필터링")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadListOpts>();

    // ── 1. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("NCS workload 목록 조회 중...");

    let totalCount: number;
    let workloads: NcsWorkloadSummary[];
    try {
      const result = await client.listWorkloads({
        q: opts.q,
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
      });
      totalCount = result.totalCount;
      workloads = result.workloads;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "name", "type", "status", "desired", "available"],
      rows: workloads.map((w) => [
        w.id,
        w.name,
        w.type ?? "",
        w.status,
        String(w.desired ?? ""),
        String(w.available ?? ""),
      ]),
      raw: { totalCount, workloads },
      ids: workloads.map((w) => w.id),
    });
  });

interface WorkloadGetOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

const getCommand = new Command("get")
  .description("NCS workload 단건을 조회한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 조회 중...`);

    let workload: NcsWorkloadDetail;
    try {
      workload = await client.getWorkload(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "name", "type", "status", "desired", "available", "tasks"],
      rows: [
        [
          workload.id,
          workload.name,
          workload.type ?? "",
          workload.status,
          String(workload.desired ?? ""),
          String(workload.available ?? ""),
          String(workload.tasks?.length ?? 0),
        ],
      ],
      raw: workload,
      ids: [workload.id],
    });
  });

interface WorkloadLogsOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  task?: string;
  container?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
}

const logsCommand = new Command("logs")
  .description("NCS workload task 의 컨테이너 로그를 조회한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--task <taskId>", "task ID (필수)")
  .option("--container <name>", "컨테이너 이름 (필수)")
  .option("--from <time>", "로그 시작 시간 (기본: 현재로부터 5분 전)")
  .option("--to <time>", "로그 종료 시간 (기본: 현재 시간)")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 100)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadLogsOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) — task/container 누락은 EXIT_PARAM_ERROR ──
    requireNonEmpty(id, "id");
    if (!opts.task || !opts.task.trim()) {
      throw new NhnCloudCliError(
        "--task 옵션이 비어있습니다. task ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }
    if (!opts.container || !opts.container.trim()) {
      throw new NhnCloudCliError(
        "--container 옵션이 비어있습니다. 컨테이너 이름을 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" task "${opts.task}" 로그 조회 중...`);

    let logs: NcsWorkloadLog[];
    try {
      const result = await client.getWorkloadLogs(id, opts.task, {
        container: opts.container,
        from: opts.from,
        to: opts.to,
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
      });
      logs = result.logs;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["time", "log"],
      rows: logs.map((l) => [l.time, l.log]),
      raw: { logs },
      ids: [],
    });
  });

interface WorkloadEventsOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  task?: string;
  type?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
}

const eventsCommand = new Command("events")
  .description("NCS workload task 의 이벤트를 조회한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--task <taskId>", "task ID (필수)")
  .option("--type <type>", "이벤트 타입 (Normal | Warning)")
  .option("--q <query>", "이벤트 내용 필터링")
  .option("--from <time>", "이벤트 마지막 발생 시작 시간 (기본: 현재로부터 1시간 전)")
  .option("--to <time>", "이벤트 마지막 발생 종료 시간 (기본: 현재 시간)")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadEventsOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");
    if (!opts.task || !opts.task.trim()) {
      throw new NhnCloudCliError(
        "--task 옵션이 비어있습니다. task ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" task "${opts.task}" 이벤트 조회 중...`);

    let totalCount: number;
    let events: NcsWorkloadEvent[];
    try {
      const result = await client.getWorkloadEvents(id, opts.task, {
        type: opts.type,
        q: opts.q,
        from: opts.from,
        to: opts.to,
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
      });
      totalCount = result.totalCount;
      events = result.events;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["type", "reason", "message", "count", "lastTimestamp"],
      rows: events.map((e) => [e.type, e.reason, e.message, String(e.count), e.lastTimestamp]),
      raw: { totalCount, events },
      ids: [],
    });
  });

interface WorkloadHistoryListOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  page?: string;
  size?: string;
  sort?: string;
}

const historyGetCommand = new Command("get")
  .description("NCS workload 실행 히스토리 단건을 조회한다")
  .argument("<id>", "workload ID")
  .argument("<historyId>", "히스토리 ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, historyId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");
    requireNonEmpty(historyId, "historyId");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 히스토리 "${historyId}" 조회 중...`);

    let detail: NcsWorkloadHistoryDetail;
    try {
      detail = await client.getWorkloadHistory(id, historyId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "status", "templateId", "createdAt", "deletedAt"],
      rows: [
        [
          String(detail.id),
          detail.status,
          detail.templateId ?? "",
          detail.createdAt,
          detail.deletedAt ?? "",
        ],
      ],
      raw: detail,
      ids: [String(detail.id)],
    });
  });

const historyCommand = new Command("history")
  .description("NCS workload 실행 히스토리 목록을 조회한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .option("--sort <sort>", "정렬 기준 필드명 (역순은 필드명 앞에 - 를 붙임, 예: -id)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadHistoryListOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 히스토리 목록 조회 중...`);

    let totalCount: number;
    let history: NcsWorkloadHistorySummary[];
    try {
      const result = await client.listWorkloadHistory(id, {
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
        sort: opts.sort,
      });
      totalCount = result.totalCount;
      history = result.history;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "status", "templateId", "createdAt", "deletedAt"],
      rows: history.map((h) => [
        String(h.id),
        h.status,
        h.templateId ?? "",
        h.createdAt,
        h.deletedAt ?? "",
      ]),
      raw: { totalCount, history },
      ids: history.map((h) => String(h.id)),
    });
  })
  .addCommand(historyGetCommand);

const scheduleHistoryCommand = new Command("schedule-history")
  .description("NCS workload 예약 실행 히스토리를 조회한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 예약 실행 히스토리 조회 중...`);

    let scheduleHistory: NcsWorkloadScheduleHistory[];
    try {
      const result = await client.getWorkloadScheduleHistory(id);
      scheduleHistory = result.scheduleHistory;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "status", "createdAt", "finishedAt"],
      rows: scheduleHistory.map((s) => [s.id, s.status, s.createdAt, s.finishedAt ?? ""]),
      raw: { scheduleHistory },
      ids: scheduleHistory.map((s) => s.id),
    });
  });

interface WorkloadControlOpts {
  region?: string;
  appKey?: string;
  profile?: string;
}

const pauseCommand = new Command("pause")
  .description("NCS workload 를 일시정지한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadControlOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 일시정지 중...`);
    try {
      await client.pauseWorkload(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NCS workload "${id}" 가 일시정지되었습니다.\n`));
  });

const resumeCommand = new Command("resume")
  .description("NCS workload 를 재개한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadControlOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" 재개 중...`);
    try {
      await client.resumeWorkload(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NCS workload "${id}" 가 재개되었습니다.\n`));
  });

interface WorkloadRestartOpts extends WorkloadControlOpts {
  task?: string;
}

const restartCommand = new Command("restart")
  .description("NCS workload task 를 재시작한다")
  .argument("<id>", "workload ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--task <taskId>", "task ID (필수)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadRestartOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) — task 누락은 EXIT_PARAM_ERROR ──
    requireNonEmpty(id, "id");
    if (!opts.task || !opts.task.trim()) {
      throw new NhnCloudCliError(
        "--task 옵션이 비어있습니다. task ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS workload "${id}" task "${opts.task}" 재시작 중...`);
    try {
      await client.restartWorkloadTask(id, opts.task);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(
      chalk.green(`✓ NCS workload "${id}" task "${opts.task}" 가 재시작되었습니다.\n`),
    );
  });

interface WorkloadDeleteOpts extends WorkloadControlOpts {
  yes?: boolean;
}

const deleteCommand = new Command("delete")
  .description("NCS workload 를 삭제한다")
  .argument("<id>", "workload ID")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<WorkloadDeleteOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 확인 (spinner 시작 전) ──
    const ok = await confirmDestructive(`NCS workload "${id}" 를 삭제하시겠습니까?`, opts.yes);
    if (!ok) {
      process.stderr.write(chalk.yellow("삭제가 취소되었습니다.\n"));
      return;
    }

    // ── 3. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 4. 삭제 (spinner 내부) ──
    startSpinner(`NCS workload 삭제 중... (id: ${id})`);
    try {
      await client.deleteWorkload(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NCS workload "${id}" 가 삭제되었습니다.\n`));
  });

export const workloadCommand = new Command("workload")
  .description("NCS workload(런타임 실행) 관리")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(logsCommand)
  .addCommand(eventsCommand)
  .addCommand(historyCommand)
  .addCommand(scheduleHistoryCommand)
  .addCommand(pauseCommand)
  .addCommand(resumeCommand)
  .addCommand(restartCommand)
  .addCommand(deleteCommand);
