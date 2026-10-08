import type { OutputOptions } from "../formatters/table.js";
import { output } from "../formatters/table.js";
import {
  SKILL_AGENTS,
  SKILL_AGENT_NAMES,
  type SkillAgent,
  type SkillInstallAction,
  type SkillInstallResult,
  type SkillsStatus,
  type SkillStatusToken,
  type SkillUninstallAction,
} from "../skill/manager.js";

function terminalText(value: string | undefined): string {
  return value === undefined ? "-" : value.replace(/[\x00-\x1F\x7F]/g, "?");
}

function installActionText(action: SkillInstallAction): string {
  switch (action) {
    case "unchanged":
      return "이미 최신 상태";
    case "installed":
      return "설치 완료";
    case "updated":
      return "갱신 완료";
    case "recovered":
      return "복구 완료";
    case "replaced":
      return "백업 후 교체 완료";
  }
}

export function skillRecoveryCommand(status: SkillStatusToken): string | undefined {
  switch (status) {
    case "current":
      return undefined;
    case "missing":
      return "nhncloud skills install";
    case "outdated":
    case "broken":
      return "nhncloud skills update";
    case "unmanaged":
    case "modified":
    case "corrupt":
      return "nhncloud skills update --force";
  }
}

export function outputSkillStatus(opts: OutputOptions, status: SkillsStatus): void {
  output(opts, {
    headers: ["항목", "값"],
    rows: [
      ["상태", status.status],
      ["현재 버전", status.currentVersion],
      ...SKILL_AGENTS.flatMap((agent) => {
        const name = SKILL_AGENT_NAMES[agent];
        const agentStatus = status.agents[agent];
        return [
          [`${name} 상태`, agentStatus.status],
          [`${name} 설치 버전`, terminalText(agentStatus.installedVersion)],
          [`${name} 설치 경로`, terminalText(agentStatus.destination)],
          [`${name} 링크 대상`, terminalText(agentStatus.linkTarget)],
        ];
      }),
      ["복구 명령", skillRecoveryCommand(status.status) ?? "조치 없음"],
    ],
    raw: status,
    ids: [status.status],
  });
}

export function outputSkillInstallResult(
  opts: OutputOptions,
  result: SkillInstallResult,
): void {
  output(opts, {
    headers: ["항목", "값"],
    rows: [
      ["작업", installActionText(result.action)],
      ["변경 여부", result.changed ? "변경됨" : "변경 없음"],
      ["이전 상태", result.previousStatus.status],
      ["현재 상태", result.status.status],
      ...SKILL_AGENTS.map((agent) => [
        `${SKILL_AGENT_NAMES[agent]} 설치 경로`,
        terminalText(result.status.agents[agent].destination),
      ]),
      ["관리 저장소", terminalText(result.repositoryPath)],
      [
        "백업 경로",
        result.backupPaths.length > 0
          ? result.backupPaths.map(terminalText).join("\n")
          : "없음",
      ],
    ],
    raw: result,
    ids: [result.status.status],
  });
}

export interface SkillUninstallOutputResult {
  schemaVersion: 1;
  action: SkillUninstallAction;
  changed: boolean;
  status: "missing";
  destination: string;
  repositoryPreserved: true;
  agents: Record<SkillAgent, { action: SkillUninstallAction; destination: string }>;
}

export function outputSkillUninstallResult(
  opts: OutputOptions,
  result: SkillUninstallOutputResult,
): void {
  output(opts, {
    headers: ["항목", "값"],
    rows: [
      ["작업", result.action === "removed" ? "활성 링크 제거 완료" : "활성 링크 없음"],
      ...SKILL_AGENTS.flatMap((agent) => {
        const name = SKILL_AGENT_NAMES[agent];
        const agentResult = result.agents[agent];
        return [
          [`${name} 설치 경로`, terminalText(agentResult.destination)],
          [`${name} 결과`, agentResult.action === "removed" ? "활성 링크 제거" : "활성 링크 없음"],
        ];
      }),
      ["관리 저장소", "보존됨"],
    ],
    raw: result,
    ids: [result.status],
  });
}
