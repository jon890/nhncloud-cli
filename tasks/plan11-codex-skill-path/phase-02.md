# Phase 02. 두 경로 제거와 skills 명령 출력, 공개 문서

**Execution profile**: standard

## 목표

`uninstallSkill` 이 두 경로를 먼저 검사한 뒤 한 단위로 제거하게 하고, `nhncloud skills status|install|update|uninstall` 의 텍스트, `--json`, `--quiet` 출력이 두 경로를 함께 보고하게 한다.
README 와 공개 스킬 문서의 스킬 설치 안내를 Codex 경로까지 넓힌다.

**범위 외**: `doctor` 의 `skills.agents.codex` 와 「설정 진단」 표(phase 03). 설치 로직(phase 01 에서 끝남).

## 컨텍스트

- phase 01 이 `src/skill/manager.ts` 에 `SKILL_AGENTS`, `SkillAgent`, `SKILL_AGENT_NAMES`, `destinationPath(context, agent)`, `inspectAgentSkill(context, agent)`, `SkillsStatus`(`SkillStatus` 에 `agents: Record<SkillAgent, SkillStatus>` 를 더한 타입), 합친 상태를 내는 `inspectSkill` 을 만들었다. `uninstallSkill` 은 아직 Claude Code 경로만 다룬다.
- 지금 `src/commands/skills.ts` 의 `uninstall` 동작은 `dependencies.inspect` 로 이전 상태를 읽어 `destination` 을 얻고, `dependencies.uninstall` 이 돌려준 `"removed" | "absent"` 로 결과를 만든다.
- 출력 함수는 `src/commands/skills-output.ts` 의 `outputSkillStatus`, `outputSkillInstallResult`, `outputSkillUninstallResult` 이고 공통 `output(opts, { headers, rows, raw, ids })` 를 쓴다. `--json` 은 `raw`, `--quiet` 는 `ids` 를 낸다.
- `skillRecoveryCommand(status)` 는 `doctor` 도 쓰므로 시그니처를 바꾸지 않는다.

**근거 문서**: `docs/adr/043-codex-skill-path-shared-repository.md`, `docs/flow.md` 의 「공개 스킬 수명주기」 절, `docs/data-schema.md` 의 「공개 스킬 매니페스트」 절 끝 문단

## 의도 메모

- `uninstall` 은 한 경로라도 관리하지 않는 항목이면 어느 경로도 지우지 않는다(ADR-043). 지울 수 있는 쪽만 지우는 방식은 기각했다.
- 기존 단일 경로 `uninstallSkill` 은 이동 후 검증(`candidate` 로 `rename` 한 뒤 링크 대상 재확인)과 `restoreUninstallCandidate` 로 동시 변경을 막는다. 이 보호는 경로마다 그대로 유지한다. 바뀌는 것은 두 번째 경로가 실패할 때 첫 경로도 되돌리는 부분이다.
- `skills status --json` 은 `schemaVersion` 1 을 유지하고 필드만 더한다. 최상위 `status` 는 합친 상태, 나머지 최상위 필드는 Claude Code 경로의 상세다. 기존 필드를 지우거나 이름을 바꾸지 않는다.
- 테스트는 반드시 `mkdtemp` 임시 디렉터리를 `context.homeDir` 로 쓴다. `os.homedir()`, `createSkillManagerContext()`, 실제 `HOME` 을 쓰지 않는다. 명령 테스트(`src/commands/skills.test.ts`)는 지금처럼 주입한 의존성으로만 실행한다.
- 테스트 표본 문자열에 사내 도메인처럼 보이는 호스트나 16자 이상 비밀값 리터럴을 쓰지 않는다.
- `docs/pitfalls/plan/decision-surface-sweep-incomplete.md`: 「Claude Code 스킬」 처럼 한 에이전트만 말하던 표현이 명령 설명, README, 공개 스킬 문서에 남지 않게 훑는다.

## 작업 항목

### 1. `src/skill/manager.ts` 의 `uninstallSkill`

```ts
export type SkillUninstallAction = "removed" | "absent";
export interface SkillUninstallResult {
  action: SkillUninstallAction;
  agents: Record<SkillAgent, { action: SkillUninstallAction; destination: string }>;
}
export async function uninstallSkill(context, operations = defaultOperations): Promise<SkillUninstallResult>
```

1. `SKILL_AGENTS` 순서로 `inspectAgentSkill` 을 부른다. `missing` 이 아닌 경로 가운데 `!managed || !linkTarget` 인 것이 있으면 `managerError(\`관리되지 않은 스킬 항목이므로 어느 경로도 제거하지 않았습니다: ${destination}\`)` 를 던진다. 이 검사는 어떤 `rename` 보다 먼저 한다.
2. 부모 디렉터리의 `realpath` 와 basename 으로 같은 실제 경로인 대상을 하나로 합친다(phase 01 의 `switchActiveLinks` 와 같은 규칙). 부모가 없으면 그 경로는 `missing` 이라 대상이 아니다.
3. 대상마다 지금의 이동과 검증(`.${SKILL_NAME}.uninstall-${randomUUID()}` 로 `operations.rename`, `lstat`, `readlink` 로 대상 재확인)을 순서대로 한다. 이 단계가 한 경로에서 실패하면 그 경로는 `restoreUninstallCandidate` 로 복원하고, 앞에서 이동한 경로의 `candidate` 도 원래 `destination` 으로 `operations.rename` 해 되돌린 뒤 실패한다. 이동 중 `ENOENT` 는 그 경로를 `absent` 로 본다.
4. 모든 대상의 이동과 검증이 끝난 뒤에만 `candidate` 들을 `rm` 한다. `rm` 이 실패하면 그 `candidate` 와 아직 지우지 않은 `candidate` 를 원래 위치로 되돌리고, 오류 메시지에 이미 지운 경로를 적는다.
5. 경로별 `action` 은 지운 경로가 `removed`, 처음부터 없거나 이동 시 `ENOENT` 인 경로가 `absent` 다. 합친 대상의 두 에이전트는 같은 `action` 을 받는다. 최상위 `action` 은 하나라도 `removed` 면 `removed`.

### 2. `src/commands/skills.ts`

- `SkillCommandDependencies` 의 `inspect` 반환 타입을 `Promise<SkillsStatus>`, `uninstall` 반환 타입을 `Promise<SkillUninstallResult>` 로 바꾼다.
- `uninstall` 동작은 `dependencies.inspect` 를 부르지 않는다. 결과 객체는 다음과 같다.

```ts
{
  schemaVersion: 1,
  action: result.action,
  changed: result.action === "removed",
  status: "missing",
  destination: result.agents.claude.destination,
  repositoryPreserved: true,
  agents: result.agents,
}
```

- 명령 설명의 「Claude Code 스킬」 을 「Claude Code·Codex 스킬」 로 바꾼다. 대상은 `install`, `update`, `status`, `uninstall`, 부모 `skills` 의 `.description(...)` 다섯 곳이다. `uninstall` 은 「활성 Claude Code·Codex 스킬 링크를 제거한다」.

### 3. `src/commands/skills-output.ts`

- `outputSkillStatus(opts, status: SkillsStatus)`: 행은 `상태`(합친 값), `현재 버전`, 그리고 `SKILL_AGENTS` 순서로 에이전트마다 `${이름} 상태`, `${이름} 설치 버전`, `${이름} 설치 경로`, `${이름} 링크 대상`, 마지막에 `복구 명령`(`skillRecoveryCommand(합친 상태) ?? "조치 없음"`). `raw` 는 `status` 전체, `ids` 는 `[status.status]`.
- `outputSkillInstallResult`: `설치 경로` 행 하나를 에이전트별 `${이름} 설치 경로` 두 행으로 바꾼다. 나머지 행과 `raw`, `ids` 는 유지한다.
- `SkillUninstallOutputResult` 에 `agents: Record<SkillAgent, { action: "removed" | "absent"; destination: string }>` 를 더한다. 행은 `작업`, 에이전트마다 `${이름} 설치 경로` 와 `${이름} 결과`(`removed` 면 「활성 링크 제거」, `absent` 면 「활성 링크 없음」), `관리 저장소`(「보존됨」). `ids` 는 `["missing"]` 유지.
- 경로 값은 지금처럼 `terminalText` 로 감싼다.

### 4. `src/skill/manager.test.ts` 의 `uninstallSkill` 테스트

기존 `uninstallSkill` 테스트는 반환값 단언을 `result.action` 과 `result.agents.claude.action` 으로 바꾼다. 새 테스트(모두 임시 `context.homeDir`):

1. 두 경로 설치 뒤 `uninstallSkill`: 두 경로 모두 `lstat` 이 `ENOENT`, `agents.claude.action` 과 `agents.codex.action` 이 `removed`, 관리 저장소 디렉터리는 남아 있다.
2. Claude Code 는 관리 링크, Codex 는 사용자 디렉터리: `NhnCloudCliError` 이고 Claude Code 링크의 `readlink` 가 그대로이며 Codex 디렉터리의 파일도 그대로다.
3. Claude Code 만 관리 링크, Codex 없음: `action: "removed"`, `agents.codex.action: "absent"`.
4. 두 번째 경로 이동 실패: `operations.rename` 이 `oldPath === destination("codex")` 일 때 던진다. 실패하고 Claude Code 링크가 원래 대상으로 돌아와 있다. 두 부모 디렉터리에 `.nhncloud-cli.uninstall-` 로 시작하는 항목이 남지 않는다.
5. 부모가 같은 실제 디렉터리(`<homeDir>/.agents/skills` 가 `<homeDir>/.claude/skills` 를 가리키는 링크): 제거가 성공하고 두 에이전트 모두 `removed`.
6. 두 경로 모두 없음: `action: "absent"`.

### 5. `src/commands/skills.test.ts`

- 주입하는 `inspect` fixture 를 `SkillsStatus` 로 바꾼다(`agents.codex.destination` 은 `"/home/tester/.agents/skills/nhncloud-cli"`).
- 기본 출력 테스트: `Claude Code 상태`, `Codex 상태`, 두 경로 문자열이 stdout 에 있다.
- `--json`: `agents.claude`, `agents.codex` 를 포함한 객체 전체를 `toEqual` 로 단언한다.
- `--quiet`: 합친 상태 토큰 한 줄. `agents.claude.status` 가 `current`, `agents.codex.status` 가 `missing`, 최상위 `status` 가 `missing` 인 fixture 로 `missing\n` 을 확인한다.
- `uninstall --json`: `dependencies.uninstall` 이 `{ action: "removed", agents: {...} }` 를 돌려줄 때 위 2번의 결과 객체 전체를 `toEqual` 로 단언하고, `dependencies.inspect` 가 불리지 않았음을 확인한다.

### 6. 공개 문서

- `skills/nhncloud-cli/references/common.md` 「Claude Code 공개 스킬 관리」 절: 제목을 「Claude Code·Codex 공개 스킬 관리」 로 바꾼다. 다음을 더한다.
  - 설치 경로는 Claude Code 의 `~/.claude/skills/nhncloud-cli` 와 Codex 의 `~/.agents/skills/nhncloud-cli` 이고 두 경로는 같은 관리 저장소를 가리킨다. Codex 설치 여부와 관계없이 두 경로를 만들고, 필요하면 `~/.agents/skills` 디렉터리도 만든다.
  - 기존에 Claude Code 에만 설치했다면 `nhncloud skills install` 이나 `update` 를 다시 실행해 Codex 경로를 연결한다.
  - `status` 의 상태는 두 경로를 합친 값이며, 상태 표의 순서(`corrupt` 부터 `current` 까지)로 먼저 해당하는 값이다. 두 경로가 모두 `current` 일 때만 `current` 다.
  - 한 경로라도 `unmanaged`, `modified`, `corrupt` 면 `--force` 없이는 어느 경로도 바꾸지 않는다. 한 경로의 전환이 실패하면 이미 바꾼 경로를 되돌린다.
  - `uninstall` 문장을 두 경로로 바꾸고, 한 경로라도 사용자 항목이면 어느 링크도 지우지 않는다고 적는다.
  - `--json` 설명에 `agents.claude`, `agents.codex` 경로별 상세와, 최상위 필드는 합친 `status` 를 빼면 Claude Code 경로 상세라는 점을 적는다.
  - Codex 에서는 `$nhncloud-cli` 로 스킬을 부를 수 있고, 새 스킬이 보이지 않으면 Codex 를 다시 시작한다.
- `skills/nhncloud-cli/SKILL.md` frontmatter `description` 의 「Claude Code 공개 스킬의 상태를 확인하거나」 를 「Claude Code·Codex 공개 스킬의 상태를 확인하거나」 로 바꾼다.
- `README.md` 「5. AI 에이전트에 연결해요 (선택)」 절과 12번째 줄 소개 문장: Claude Code 와 Codex 를 함께 말하고, 두 경로에 함께 연결된다는 한 줄을 더한다. 문체는 README 의 해요체를 따른다.

## 검증

```bash
pnpm exec vitest run src/skill/manager.test.ts src/commands/skills.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.stringify(JSON.parse(s));if(!t.includes("Claude Code·Codex 스킬"))process.exit(1)})'
node scripts/check-pii.mjs
git diff --check
```

- `git grep -n "Claude Code 스킬\|Claude Code 공개 스킬" -- src skills README.md` 결과가 `src/commands/doctor.ts` 의 텍스트 머리 한 줄뿐이다. 그 줄은 phase 03 이 바꾼다.
- `git grep -n "agents/skills/nhncloud-cli" -- skills/nhncloud-cli/references/common.md README.md` 결과가 각각 1 건 이상이다.
- 한국어 점검: korean-check 스킬의 검사기 `python3 <korean-check 스킬 디렉터리>/scripts/korean-style-check.py skills/nhncloud-cli/references/common.md README.md skills/nhncloud-cli/SKILL.md` 종료 코드 0.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/skill/manager.ts` | 수정 |
| `src/skill/manager.test.ts` | 수정 |
| `src/commands/skills.ts` | 수정 |
| `src/commands/skills-output.ts` | 수정 |
| `src/commands/skills.test.ts` | 수정 |
| `skills/nhncloud-cli/references/common.md` | 수정 |
| `skills/nhncloud-cli/SKILL.md` | 수정 |
| `README.md` | 수정 |
