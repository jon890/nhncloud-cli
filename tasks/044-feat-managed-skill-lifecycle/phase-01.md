# Phase 01 — 스킬 매니페스트와 실행 컨텍스트

**Execution profile**: standard
**Status**: completed

---

## 목표

공개 스킬의 현재 패키지 버전과 콘텐츠를 검증할 수 있는 실행 컨텍스트·매니페스트·SHA-256 해시 계약을 구현한다.

**범위 외**: 설치 상태 판정, 파일 복사, 활성 링크 전환과 Commander 명령은 다음 phase에서 구현한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
test "$(git branch --show-current)" = "feat/044-feat-managed-skill-lifecycle"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
test -f docs/adr/025-managed-skill-lifecycle.md
git log origin/main --oneline -20 -- \
  src/utils/skill-install.ts src/commands/skills.ts src/commands/doctor.ts
```

최신 `main`이 선행 관계가 아니면 `PHASE_BLOCKED: team-lead의 최신 main 반영 필요`를 보고한다.

---

## 확정 계약

- 단일 소스는 `docs/data-schema.md`의 공개 스킬 매니페스트와 ADR-025다.
- 새 dependency와 npm `postinstall`을 추가하지 않는다.
- package version은 배포물 루트의 `package.json`에서 읽고 외부 JSON이므로 타입 가드로 검증한다.
- `XDG_DATA_HOME`이 절대 경로면 `<XDG_DATA_HOME>/nhncloud-cli`, 아니면 `~/.local/share/nhncloud-cli`를 쓴다.
- 해시 경계는 `docs/data-schema.md`의 길이 접두 계약을 그대로 구현하며 문자열 구분자 연결을 사용하지 않는다.

---

## 작업 항목 (4)

### 1. 실행 컨텍스트

`src/skill/context.ts`를 만들고 다음 표면을 제공한다.

```ts
interface SkillManagerContext {
  homeDir: string;
  packageRoot: string;
  currentVersion: string;
  dataRoot: string;
}

resolveSkillDataRoot(homeDir: string, xdgDataHome?: string): string
readPackageVersion(packageRoot: string): string
createSkillManagerContext(): SkillManagerContext
```

`createSkillManagerContext`는 bundle의 `__dirname`에서 package root를 해석한다.
`readPackageVersion`은 `package.json`의 `name`과 `version`을 검증해 테스트에서 경로를 주입할 수 있게 한다.

### 2. 매니페스트 타입과 타입 가드

`src/skill/manifest.ts`에 `NhnCloudSkillManifest`, `MANIFEST_FILE_NAME`, 생성·읽기·타입 가드 함수를 구현한다.
`installedAt`은 실제 UTC ISO 8601 왕복 검사를 통과해야 하고 `contentDigest`는 `sha256:` 뒤 64자리 소문자 hex만 허용한다.

### 3. 콘텐츠 해시

`SKILL.md`와 `references/` 아래 파일을 재귀 수집한다.
상대 경로를 코드 포인트 순으로 정렬하고 각 경로·콘텐츠의 UTF-8 바이트 길이를 unsigned 64-bit big-endian으로 기록해 SHA-256을 계산한다.
`references/` 루트와 내부 항목이 심볼릭 링크이거나 정규 파일이 아니면 `NhnCloudCliError(EXIT_PARAM_ERROR)`로 거부한다.

### 4. 단위 테스트와 상태 갱신

`src/skill/context.test.ts`와 `src/skill/manifest.test.ts`를 만든다.

- XDG 절대 경로와 기본 경로를 검증한다.
- package metadata의 누락·잘못된 타입을 검증한다.
- 파일 순서와 플랫폼 구분자에 독립적인 해시를 검증한다.
- 한글 파일명·내용의 UTF-8 바이트 길이, 내용 변경, 심볼릭 링크 거부를 검증한다.

Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/skill/context.ts` | package·XDG·설치 경로 컨텍스트 |
| `src/skill/context.test.ts` | 경로·package metadata 테스트 |
| `src/skill/manifest.ts` | 매니페스트 타입 가드와 콘텐츠 해시 |
| `src/skill/manifest.test.ts` | 해시 경계·파일 가드 테스트 |
| `tasks/044-feat-managed-skill-lifecycle/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
pnpm tsc --noEmit
pnpm test -- src/skill/context.test.ts src/skill/manifest.test.ts
test "$(rg -n 'JSON\.parse.*\) as ' src/skill || true)" = ""
git diff --check
```

## Blocked 조건

- package root를 bundle과 테스트에서 같은 계약으로 해석할 수 없으면 경로를 추측하지 않고 차단한다.
- 해시 입력이 `docs/data-schema.md`와 다르면 구현보다 문서 정합성을 먼저 복구한다.
