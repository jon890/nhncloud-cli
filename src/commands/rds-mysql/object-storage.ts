import type { Command } from "commander";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { decodeUtf8Input, readInputSource, type StdinSource } from "../input-source.js";

/**
 * 오브젝트 스토리지로 내보내거나 오브젝트 스토리지에서 복원하는 명령이 같이 쓰는 접속 정보다.
 * API 비밀번호는 --password-file 이나 표준 입력으로만 받고 어떤 출력에도 싣지 않는다 (ADR-053).
 */

export interface ObjectStorageOptions {
  tenantId?: string;
  username?: string;
  passwordFile?: string;
  container?: string;
  objectPath?: string;
}

export interface ObjectStorageTarget {
  tenantId: string;
  username: string;
  targetContainer: string;
  objectPath: string;
}

const LABEL = "Object Storage API 비밀번호";
const TENANT_ID_PATTERN = /^[0-9a-fA-F]{32}$/;

function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

export function addObjectStorageOptions(command: Command): Command {
  return command
    .requiredOption("--tenant-id <id>", "Object Storage 테넌트 ID (32자)")
    .requiredOption("--username <name>", "NHN Cloud 계정 또는 IAM 계정 ID")
    .option("--password-file <path>", "Object Storage API 비밀번호를 읽을 파일. 없으면 표준 입력에서 읽는다")
    .requiredOption("--container <name>", "대상 컨테이너 이름")
    .requiredOption("--object-path <path>", "컨테이너 안의 경로");
}

/** 접속 정보를 검사한다. 비밀번호는 따로 읽는다. */
export function parseObjectStorageTarget(opts: ObjectStorageOptions): ObjectStorageTarget {
  const tenantId = opts.tenantId ?? "";
  if (!TENANT_ID_PATTERN.test(tenantId)) fail("--tenant-id 는 32자리 16진수여야 합니다.");
  for (const [flag, value] of [
    ["--username", opts.username],
    ["--container", opts.container],
    ["--object-path", opts.objectPath],
  ] as const) {
    if (value === undefined || value.trim() === "") fail(`${flag} 가 비어 있습니다.`);
  }
  return {
    tenantId,
    username: opts.username as string,
    targetContainer: opts.container as string,
    objectPath: opts.objectPath as string,
  };
}

/** 끝 줄바꿈 하나만 지운다. 오류 문구에 값을 넣지 않는다. */
export function readObjectStoragePassword(file: string | undefined, stdin?: StdinSource): string {
  const input = readInputSource({ file }, { fileFlag: "--password-file", label: LABEL, maxBytes: 1024 }, stdin);
  const password = decodeUtf8Input(input, LABEL, "파일 인코딩을 확인하세요.").replace(/\r?\n$/, "");
  if (password === "") fail(`${LABEL}가 비어 있습니다.`);
  return password;
}

/** 요청 본문 조각이다. 비밀번호를 포함하므로 출력에 쓰지 않는다. */
export function objectStorageBody(target: ObjectStorageTarget, password: string): Record<string, string> {
  return { ...target, password };
}

/** 미리보기에 보일 값이다. 비밀번호는 없다. */
export function objectStorageDetails(target: ObjectStorageTarget): Record<string, string> {
  return {
    tenantId: target.tenantId,
    username: target.username,
    targetContainer: target.targetContainer,
    objectPath: target.objectPath,
  };
}
