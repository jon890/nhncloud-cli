# Phase 01. 두 에이전트 경로의 상태 판정과 한 단위 설치

**Execution profile**: deep

## 목표

`src/skill/manager.ts` 가 Claude Code 경로(`~/.claude/skills/nhncloud-cli`)와 Codex 경로(`~/.agents/skills/nhncloud-cli`)를 함께 판정하고, `installSkill` 이 두 경로를 먼저 검사한 뒤 한 단위로 전환하며 실패하면 이미 바꾼 경로를 되돌리게 한다.

**범위 외**: `uninstallSkill` 의 두 경로 제거(phase 02), `skills` 명령의 텍스트 출력과 공개 문서(phase 02), `doctor`(phase 03).
`prepareRepository` 가 `--force` 로 저장소를 교체한 뒤 링크 전환이 실패해도 저장소 교체는 되돌리지 않는다(기존 동작, 백업은 남는다).

## 컨텍스트

- 지금 `src/skill/manager.ts` 는 `destinationPath(context)` 하나(`<homeDir>/.claude/skills/nhncloud-cli`)만 다룬다. `inspectSkill` 이 그 경로의 `SkillStatus` 를, `installSkill` 이 `prepareRepository` 와 `switchActiveLink` 로 그 경로 하나를 전환한다.
- 관리 저장소(`<dataRoot>/skills/{version}-{digestHex}`), 매니페스트, 콘텐츠 해시 계약은 바꾸지 않는다. `prepareRepository` 는 그대로 한 번만 호출한다.
- `SkillManagerOperations` 는 `{ rename }` 하나이고 테스트가 실패를 주입하는 지점이다. 새 전환 코드의 모든 `rename` 은 `operations.rename` 으로 부른다.
- `src/commands/skills.ts`, `src/commands/doctor.ts` 는 `inspectSkill`, `installSkill`, `SkillStatus`, `SkillInstallResult` 를 import 한다. 이 phase 의 타입 변경은 필드 추가라 `skills.ts` 는 고치지 않아도 컴파일되고, `doctor.ts` 는 기본 의존성 한 줄만 고친다(작업 항목 5-1). `src/commands/skills.test.ts` 의 fixture 만 타입에 맞춘다.

**근거 문서**: `docs/adr/043-codex-skill-path-shared-repository.md`, `docs/adr/025-managed-skill-lifecycle.md`, `docs/flow.md` 의 「공개 스킬 수명주기」 절, `docs/data-schema.md` 의 「파일 위치」 와 「공개 스킬 매니페스트」 절

## 의도 메모

- 에이전트 선택 플래그(`--agent`)는 만들지 않는다. Codex 설치 여부를 감지하지 않는다. 두 경로를 항상 다룬다(ADR-043).
- 한 경로라도 보호 상태면 아무것도 바꾸지 않는다. 경로마다 따로 보호하고 가능한 쪽만 바꾸는 방식은 기각했다.
- 기존 `switchActiveLink` 는 경로 하나에서 실패하면 그 경로의 백업만 복원하고 끝난다. 두 경로에서는 앞 경로가 이미 새 링크로 바뀐 상태라 그대로 쓰면 두 경로가 다른 버전으로 갈라진다. 경로 목록 전체를 되돌리는 새 함수로 바꾼다.
- `realpath` 비교는 양쪽 모두 `realpath` 한 값으로 한다. macOS 의 임시 디렉터리는 `/var` 가 `/private/var` 로 풀려 한쪽만 풀면 비교가 늘 어긋난다.
- 링크가 다른 링크를 거쳐 관리 저장소에 닿는 경우(작업 항목 2)만 관리형으로 본다. Codex 링크가 Claude Code 링크를 가리키는데 그 링크가 legacy 나 broken 이면 Codex 경로는 `unmanaged` 가 되어 `--force` 없이는 갱신되지 않는다. 의도한 보수적 동작이다.
- 되돌리기 실패를 삼키지 않는다. 되돌리지 못한 경로와 보존한 백업 경로를 오류 메시지에 넣는다.
- 테스트는 반드시 `mkdtemp` 로 만든 임시 디렉터리를 `context.homeDir` 와 `context.dataRoot` 로 쓴다. `os.homedir()`, `createSkillManagerContext()`, 실제 `HOME` 은 테스트에서 부르지 않는다. 사용자 홈의 `~/.claude/skills` 와 `~/.agents/skills` 를 건드리면 안 된다.
- 테스트 표본 문자열에 사내 도메인처럼 보이는 호스트나 16자 이상 비밀값 리터럴을 쓰지 않는다. `scripts/check-pii.mjs` 가 `src/` 도 검사한다.

## 작업 항목

### 1. `src/skill/manager.ts` 에 에이전트 정의와 경로

```ts
export const SKILL_AGENTS = ["claude", "codex"] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];
export const SKILL_AGENT_NAMES: Record<SkillAgent, string> = { claude: "Claude Code", codex: "Codex" };
```

`destinationPath(context)` 를 `destinationPath(context: SkillManagerContext, agent: SkillAgent): string` 로 바꾼다.
`claude` 는 `path.join(homeDir, ".claude", "skills", SKILL_NAME)`, `codex` 는 `path.join(homeDir, ".agents", "skills", SKILL_NAME)` 이다.
`statusBase(context)` 도 `agent` 를 받아 그 경로를 `destination` 에 넣는다.

### 2. 경로별 판정 `inspectAgentSkill`

지금의 `inspectSkill` 본문을 `export async function inspectAgentSkill(context: SkillManagerContext, agent: SkillAgent): Promise<SkillStatus>` 로 옮긴다. 판정 규칙은 그대로 두고 아래 하나만 더한다.

- 링크 대상이 존재하고(`targetStat` 있음) `isManagedRepositoryLocation` 이 거짓이면, 기존 패키지 판정(`readLegacyPackageMetadata`) 전에 `realpath(linkTarget)` 과 `realpath(repositoryRoot(context))` 를 구한다. 저장소 루트가 없어 `realpath` 가 `ENOENT` 로 실패하면 이 분기를 건너뛴다. `ENOENT` 를 뺀 오류(`EACCES`, `ELOOP` 등)는 기존 `optionalLstat` 처럼 `managerError` 로 던진다.
- `path.dirname(realTarget) === realRoot` 이면 다른 링크를 거쳐 관리 저장소에 닿은 링크다. `parseRepositoryName(realTarget)` 과 `inspectRepository(realTarget, name)` 로 직접 링크와 같은 규칙(`corrupt`, `modified`, `broken`, `current`, `outdated`)을 적용하고 `managed: true` 로 낸다. `current` 판정의 경로 비교는 `realTarget` 과 `realpath(repositoryPath(context, currentDigest))` 로 한다(기대 경로가 없으면 `outdated`).
- `linkTarget` 필드는 지금처럼 한 단계만 푼 값(`resolveLinkTarget`)을 낸다.

### 3. 두 경로를 합친 `inspectSkill`

```ts
export interface SkillsStatus extends SkillStatus {
  agents: Record<SkillAgent, SkillStatus>;
}
export async function inspectSkill(context: SkillManagerContext): Promise<SkillsStatus>
```

- `claude`, `codex` 순서로 `inspectAgentSkill` 을 부른다.
- 최상위 `status` 는 `["corrupt", "modified", "unmanaged", "broken", "outdated", "missing", "current"]` 순서에서 두 경로 가운데 먼저 나오는 값이다. 우선순위 배열은 모듈 상수로 둔다.
- 나머지 최상위 필드는 Claude Code 경로의 `SkillStatus` 를 펼친 값이다: `{ ...claude, status: aggregate, agents: { claude, codex } }`.
- `SkillStatus` 타입과 `schemaVersion: 1` 은 바꾸지 않는다.

### 4. `SkillInstallResult` 와 한 단위 설치

`SkillInstallResult` 의 `previousStatus` 와 `status` 타입을 `SkillsStatus` 로 바꾼다. 다른 필드(`schemaVersion`, `action`, `changed`, `repositoryPath`, `backupPaths: string[]`)는 유지한다. `backupPaths` 는 저장소 백업과 경로별 백업을 모두 담는다.

`installSkillInternal` 의 순서:

1. `previous = await inspectSkill(context)`. 최상위 `status` 가 `current` 면 지금처럼 `unchanged` 를 돌려준다.
2. `force` 가 없으면 `SKILL_AGENTS` 순서로 각 경로를 보고, 상태가 `unmanaged`, `modified`, `corrupt` 인 첫 경로에서 `managerError(\`${SKILL_AGENT_NAMES[agent]} 스킬 상태가 ${status}입니다. --force로 백업 후 교체하세요: ${destination}\`)` 를 던진다. 이 검사는 `prepareRepository` 와 어떤 파일 변경보다 먼저 한다.
3. `prepareRepository(context, force, operations)` 를 한 번 부른다.
4. 새 함수 `switchActiveLinks(context, repository, previous, operations): Promise<{ backupPaths: string[]; status: SkillsStatus }>` 로 전환한다(기존 `switchActiveLink` 를 대체하고 지운다). 보호 검사가 2단계로 옮겨졌으므로 `force` 인자는 받지 않는다. `previous.agents[agent].status === "unmanaged"` 인 경로는 백업한다(2단계가 `force` 없이는 이미 막았다).
5. `inspectSkill` 로 다시 검사해 최상위 `status` 가 `current` 가 아니면 4번이 바꾼 경로를 되돌리고 `managerError(\`스킬 설치 후 상태가 current가 아닙니다: ${status}\`)` 를 던진다. 사후 검사와 그 실패 롤백은 `switchActiveLinks` 안에서 한다(전환 기록을 공유해 같은 되돌리기 코드를 쓴다). 사후 검사에는 `inspectSkill` 을 쓰고, 그 결과를 반환값의 `status` 로 돌려줘 `installSkillInternal` 이 한 번 더 검사하지 않게 한다. 실패하면 두 경로 모두 되돌린다. 사후 검사가 실패한 뒤 되돌리기마저 실패하면 아래 「일부 경로를 되돌리지 못했습니다」 메시지의 `전환 오류` 자리에 `스킬 설치 후 상태가 current가 아닙니다: ${status}` 를 넣는다(메시지 하나만 낸다).
6. `action` 은 지금처럼 `installAction(previous.status)`(합친 상태)다.

`switchActiveLinks` 규칙:

- 전환 대상: `previous.agents[agent].status !== "current"` 인 경로만.
- 전환 기록의 `destination`, 백업, `rename` 은 원래 `destinationPath` 값으로 한다. `resolvedDestination` 은 두 경로가 같은 대상인지 비교할 때만 쓴다(macOS 에서 `/var` 와 `/private/var` 가 달라 테스트의 `newPath === destination("codex")` 주입이 어긋나지 않게 한다).
- 각 대상의 부모 디렉터리를 `mkdir({ recursive: true })` 한 뒤 `resolvedDestination = path.join(await realpath(parent), path.basename(destination))` 를 구한다. 앞 대상과 `resolvedDestination` 이 같으면 새 전환을 만들지 않고 그 전환에 에이전트만 더한다(부모가 같은 실제 디렉터리인 경우 한 번만 전환).
- 전환 기록: `{ agents, destination, previous: SkillStatus, previousRawTarget?: string, temporaryLink, backup?: string, activated: boolean }`. `previous.status` 가 `missing` 이나 `unmanaged` 가 아니면 `readlink(destination)` 값을 `previousRawTarget` 에 남긴다.
- 1단계: 모든 대상에 `symlink(repository, temporaryLink)` 를 만든다. 이름은 지금 규칙(`.${SKILL_NAME}.link-${randomUUID()}`, 같은 부모 디렉터리)을 따른다.
- 2단계: 대상 순서대로, `previous.status === "unmanaged"` 면 `backupPath(destination, operations)` 로 백업하고 `backup` 을 기록한다. 그 뒤 `operations.rename(temporaryLink, destination)` 하고 `activated = true`.
- 실패하면 기록을 역순으로 되돌린다.
  - `activated` 이고 `backup` 있음: `rm(destination, { force: true })` 뒤 `operations.rename(backup, destination)`.
  - `activated` 이고 `backup` 없음, `previousRawTarget` 있음: 새 임시 링크에 `previousRawTarget` 로 `symlink` 한 뒤 `operations.rename(그 링크, destination)`.
  - `activated` 이고 `backup` 없음, `previous.status === "missing"`: `rm(destination, { force: true })`.
  - `activated` 아님, `backup` 있음: `operations.rename(backup, destination)`.
  - 모두 성공하면 `managerError(\`스킬 전환에 실패해 바꾼 경로를 이전 상태로 되돌렸습니다: ${destinations.join(", ")}\`, originalError)`.
  - 하나라도 실패하면 나머지를 계속 되돌린 뒤 `managerError(\`스킬 전환에 실패했고 일부 경로를 되돌리지 못했습니다: ${failed.join(", ")}; 보존한 백업: ${backups.join(", ") || "없음"}; 전환 오류: ${toReason(originalError)}\`, firstRestoreError)`. 백업은 지우지 않는다.
- 성공이든 실패든 `finally` 에서 남은 임시 링크를 `rm({ force: true })` 한다.
- 돌려주는 값은 생성한 백업 경로 목록이다.

### 5. `uninstallSkill` 의 판정 범위 고정

`uninstallSkill` 은 이 phase 에서 Claude Code 경로만 다루는 지금 동작을 유지한다. 다만 지금 `inspectSkill(context)` 를 부르므로, 합친 상태를 받으면 Claude Code 링크가 있는데도 `absent` 를 돌려줄 수 있다. `inspectAgentSkill(context, "claude")` 와 `destinationPath(context, "claude")` 를 쓰게 바꾼다. 두 경로 제거는 phase 02 가 한다.

### 5-1. `src/commands/doctor.ts` 기본 의존성

`doctor.ts:16` 의 import 에 `inspectAgentSkill` 을 더하고(`inspectSkill` 은 더 쓰지 않으면 뺀다), `defaultDependencies.inspectSkill`(94줄 근처)을 `(c) => inspectAgentSkill(c, "claude")` 로 바꾼다. `inspectSkill` 이 합친 `SkillsStatus` 를 내므로 phase 01 과 03 사이 중간 상태에서도 doctor 의 `agents.claude` 출력이 깨지지 않게 하는 한 줄이다. 다른 줄은 고치지 않는다. phase 03 이 이 의존성을 두 에이전트용으로 확장한다.

### 6. `src/skill/manager.test.ts` 기존 테스트를 새 계약에 맞춘다

- 파일 상단 helper `destination()` 을 `destination(agent: "claude" | "codex" = "claude")` 로 바꾸고 `codex` 는 `path.join(context.homeDir, ".agents", "skills", "nhncloud-cli")` 를 돌려준다.
- 「설치 상태 객체에 status 필드와 공통 경로 정보를 제공한다」: 기대 객체에 `agents: { claude: {...}, codex: {... destination: destination("codex") } }` 를 더한다. 두 값 모두 `status: "missing"`, `managed: false`.
- `inspectSkill` 의 단일 경로 판정을 확인하던 테스트(「관리 저장소의 정상·수정·손상 상태를 구분한다」 등)는 `inspectAgentSkill(context, "claude")` 로 바꾸거나 `.agents.claude` 를 단언한다. 판정 기대값은 바꾸지 않는다.
- 「활성 링크 전환 실패 시 사용자 항목 백업을 원래 위치로 복원한다」 의 기대 메시지를 `"이전 상태로 되돌렸습니다"` 로 바꾼다.
- 「사용자 디렉터리는 force 없이 보존하고 force에서는 백업한다」 는 Codex 경로가 없는 상태라 `backupPaths` 길이 1 을 유지한다.

### 7. `src/skill/manager.test.ts` 새 테스트

모두 `beforeEach` 의 `mkdtemp` 임시 디렉터리 아래 `context.homeDir` 로만 실행한다.

1. 빈 홈에서 `installSkill(context)`: 두 경로의 `readlink` 가 같은 `repositoryPath` 이고, `status.agents.claude.status`, `status.agents.codex.status`, 최상위 `status.status` 가 모두 `current`.
2. Claude Code 경로만 최신(먼저 설치한 뒤 Codex 링크를 `rm`): `inspectSkill` 최상위 `status` 가 `missing`, `agents.claude.status` 가 `current`. 다시 `installSkill` 하면 `action: "installed"`, Codex 링크가 생기고 Claude Code 링크의 `readlink` 값은 그대로다.
3. Codex 경로에 사용자 디렉터리(`user.md` 포함), Claude Code 경로 없음: `force` 없이 `NhnCloudCliError` 이고 메시지에 `Codex` 가 있다. Claude Code 경로는 여전히 `lstat` 이 `ENOENT`, `<dataRoot>/skills` 도 만들어지지 않았다(`lstat` 이 `ENOENT`). `force: true` 면 `action: "replaced"`, 백업에 `user.md` 내용이 남고 두 경로 모두 `current`.
4. 두 번째 경로 전환 실패: 먼저 설치한 뒤 소스를 바꿔 두 경로를 `outdated` 로 만든다. `operations.rename` 이 `newPath === destination("codex")` 이고 `path.basename(oldPath)` 가 `.nhncloud-cli.link-` 로 시작할 때만 던지게 한다(기존 `manager.test.ts` 의 패턴). `installSkill` 은 `"이전 상태로 되돌렸습니다"` 로 실패하고, Claude Code 링크와 Codex 링크의 `readlink` 가 모두 이전 저장소 경로를 가리킨다. 두 부모 디렉터리에 `.nhncloud-cli.link-` 로 시작하는 항목이 남지 않는다.
5. 부모가 같은 실제 디렉터리: `<homeDir>/.claude/skills` 를 만들고 `<homeDir>/.agents/skills` 를 그 디렉터리를 가리키는 심볼릭 링크로 만든다(`<homeDir>/.agents` 는 `mkdir`). `operations.rename` 을 감싸 `newPath` 의 basename 이 `nhncloud-cli` 인 호출 수를 센다. `installSkill` 뒤 호출 수가 1 이고 두 경로 모두 `current`.
6. 다른 링크를 거친 관리 링크: 설치 뒤 Codex 링크를 지우고 `symlink(destination("claude"), destination("codex"))` 로 만든다. `inspectAgentSkill(context, "codex")` 가 `status: "current"`, `managed: true`. Codex 링크가 관리 저장소 밖의 사용자 디렉터리(`<root>/user-skill`)를 가리키면 `unmanaged`, `managed: false` 다.

7. 롤백 실패 주입(참고 구현: 형제 저장소 dooray-cli 의 `src/skill/manager.test.ts` 의 「removes the new Claude link…」, 「restores both user entries…」, 「…verification fails」). 모두 임시 `context.homeDir` 에서 한다.
   1. 두 경로가 모두 사용자 디렉터리(각각 `user.md` 포함)이고 `force: true` 인 상태에서 Codex 의 `.nhncloud-cli.link-` 에서 `destination("codex")` 로의 `rename` 이 실패하게 주입한다. `installSkill` 이 실패하고 두 디렉터리의 `user.md` 가 원위치에 있다.
   2. 빈 홈에서 Codex 전환이 실패하면 Claude Code 경로를 `lstat` 했을 때 `ENOENT` 다(새로 만든 링크가 지워진다).
   3. 백업 복원 `rename` 도 실패하게 주입한다(`oldPath` 가 백업 경로일 때 던진다). 오류 메시지에 되돌리지 못한 경로와 백업 경로가 있고, 그 백업이 디스크에 남아 있다.
   4. 사후 검사 실패 롤백: 전환은 성공하지만 `inspectSkill` 의 최상위 상태가 `current` 가 되지 않게(예: 전환 직후 관리 저장소 콘텐츠를 바꾸는 `rename` 래퍼) 만든다. `"스킬 설치 후 상태가 current가 아닙니다"` 로 실패하고 두 경로가 이전 상태로 돌아와 있다.

### 8. `src/commands/skills.test.ts` fixture 타입 맞춤

`updatedResult` 처럼 `SkillInstallResult` 로 선언한 fixture 와, `src/commands/skills.test.ts:149-155` 처럼 `mockResolvedValue({ ...updatedResult, previousStatus: currentStatus, ... })` 로 `previousStatus`/`status` 를 `SkillStatus`(`agents` 없음)로 덮어쓰는 호출의 `previousStatus` 와 `status` 에 `agents: { claude: <같은 상태>, codex: <같은 상태에 destination 만 "/home/tester/.agents/skills/nhncloud-cli"> }` 를 더해 `SkillsStatus` 로 만든다.
테스트의 단언과 명령 코드는 바꾸지 않는다. 이 파일의 출력 단언은 phase 02 가 새 출력에 맞춘다.

## 검증

```bash
pnpm exec vitest run src/skill/manager.test.ts src/commands/skills.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node scripts/check-pii.mjs
git diff --check
```

- 대상 테스트와 전체 테스트가 통과한다. `pnpm install` 이 막힌 worktree 면 `node_modules/.bin/vitest run ...`, `node_modules/.bin/tsc --noEmit`, `node_modules/.bin/tsup` 로 같은 검증을 한다.
- `git grep -n "switchActiveLink(" -- src/skill/manager.ts` 결과가 0 건이다(새 함수 이름은 `switchActiveLinks(`).
- 테스트가 실제 홈을 쓰지 않는다: `git grep -n "homedir()" -- src/skill/manager.test.ts` 결과가 0 건이다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/skill/manager.ts` | 수정 |
| `src/skill/manager.test.ts` | 수정 |
| `src/commands/skills.test.ts` | 수정 |
| `src/commands/doctor.ts` | 수정 (기본 inspect 의존성 한 줄) |
