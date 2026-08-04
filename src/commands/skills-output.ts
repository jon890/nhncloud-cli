import type { OutputOptions } from "../formatters/table.js";
import { output } from "../formatters/table.js";
import type {
  SkillInstallAction,
  SkillInstallResult,
  SkillStatus,
  SkillStatusToken,
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

export function outputSkillStatus(opts: OutputOptions, status: SkillStatus): void {
  output(opts, {
    headers: ["항목", "값"],
    rows: [
      ["상태", status.status],
      ["현재 버전", status.currentVersion],
      ["설치 버전", terminalText(status.installedVersion)],
      ["설치 경로", terminalText(status.destination)],
      ["링크 대상", terminalText(status.linkTarget)],
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
      ["설치 경로", terminalText(result.status.destination)],
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
  action: "removed" | "absent";
  changed: boolean;
  status: "missing";
  destination: string;
  repositoryPreserved: true;
}

export function outputSkillUninstallResult(
  opts: OutputOptions,
  result: SkillUninstallOutputResult,
): void {
  output(opts, {
    headers: ["항목", "값"],
    rows: [
      ["작업", result.action === "removed" ? "활성 링크 제거 완료" : "활성 링크 없음"],
      ["설치 경로", terminalText(result.destination)],
      ["관리 저장소", "보존됨"],
    ],
    raw: result,
    ids: [result.status],
  });
}
