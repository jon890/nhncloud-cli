# Phase 03. doctor 의 skills.agents.codex

**Execution profile**: standard

## 목표

`nhncloud doctor` 보고서의 `skills.agents` 에 `codex` 키를 더하고, 텍스트 출력이 두 에이전트의 스킬 상태를 함께 보여 주게 한다.
경로마다 따로 판정해 한쪽 판정 실패가 다른 쪽 결과를 가리지 않게 한다.

**범위 외**: 스킬 설치·제거 로직과 `skills` 명령 출력(phase 01, 02). `ready` 판정 규칙(스킬 상태를 반영하지 않는 지금 규칙을 유지).

## 컨텍스트

- phase 01 이 `src/skill/manager.ts` 에 `SKILL_AGENTS`(`["claude", "codex"]`), `SkillAgent`, `SKILL_AGENT_NAMES`(`{ claude: "Claude Code", codex: "Codex" }`), `inspectAgentSkill(context, agent): Promise<SkillStatus>` 를 만들었다.
- 지금 `src/commands/doctor.ts` 는 다음과 같다.
  - `DoctorDependencies.inspectSkill: (context: SkillManagerContext) => Promise<SkillStatus>`, 기본값은 `inspectSkill`.
  - `inspectClaudeSkill(dependencies)` 가 `createSkillContext()` 와 `inspectSkill` 을 `try` 로 감싸고, 실패하면 `{ status: "error", reason }` 을 낸다. `reason` 은 고정 문구 `SKILL_ERROR_REASON` 에 문자열 `code` 만 붙인다.
  - `DoctorReport.skills` 타입은 `{ agents: { claude: DoctorSkillAgentStatus } }`.
  - `printSkillSection(skill)` 이 「Claude Code 스킬」 머리 아래 `nhncloud-cli: ...` 한 줄을 낸다.
- `--json` 필드는 `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절이 소유한다. 그 절은 「에이전트가 늘면 `agents`에 키가 추가되며 기존 키의 모양은 바뀌지 않는다」고 약속했다. `agents.claude` 의 모양을 바꾸지 않는다.

**근거 문서**: `docs/adr/043-codex-skill-path-shared-repository.md`, `docs/adr/042-doctor-offline-default-and-exit-code.md`, `docs/flow.md` 의 「설정 진단」 절, `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절

## 의도 메모

- 합친 상태(`inspectSkill`)를 한 번 부르는 방식은 기각했다. 한 경로의 `lstat` 이 `EACCES` 로 실패하면 두 에이전트가 모두 `error` 가 된다.
- `reason` 에 오류 메시지 원문을 넣지 않는 기존 규칙을 Codex 에도 그대로 적용한다. 경로나 파일 내용이 섞일 수 있다.
- 진단 결과로 종료 코드를 바꾸지 않는다(ADR-042). Codex 경로가 `missing` 이어도 `ready` 와 종료 코드는 그대로다.
- 테스트는 주입한 의존성으로만 실행한다. `createSkillManagerContext()`, `os.homedir()`, 실제 `HOME` 을 쓰지 않는다.
- 테스트 표본 문자열에 사내 도메인처럼 보이는 호스트나 16자 이상 비밀값 리터럴을 쓰지 않는다.

## 작업 항목

### 1. `src/commands/doctor.ts`

- `DoctorDependencies.inspectSkill` 의 타입을 `(context: SkillManagerContext, agent: SkillAgent) => Promise<SkillStatus>` 로 바꾸고 기본값을 `inspectAgentSkill` 로 바꾼다.
- `DoctorReport.skills` 타입을 `{ agents: Record<SkillAgent, DoctorSkillAgentStatus> }` 로 바꾼다.
- `inspectClaudeSkill` 을 `inspectAgentSkillForDoctor(dependencies, agent: SkillAgent)` 로 바꾼다. `createSkillContext()` 호출과 `inspectSkill(context, agent)` 호출을 같은 `try` 안에 두는 지금 구조와 오류 변환 규칙을 유지한다.
- `buildDoctorReport` 는 `SKILL_AGENTS` 순서로 위 함수를 순차로 불러 `skills: { agents: { claude, codex } }` 를 만든다.
- `printSkillSection(agents)` 는 머리를 「공개 스킬」 로 바꾸고 `SKILL_AGENTS` 순서로 에이전트마다 한 줄을 낸다. 줄 머리는 지금의 `${SKILL_NAME}:` 대신 `${SKILL_AGENT_NAMES[agent]}:` 이고, 상태별 문구(`✓ current (버전)`, `미설치 — 복구 명령`, `⚠ 상태 — 복구 명령`, `⚠ error — reason`)와 `sanitizeForTerminal` 사용은 지금과 같다.
- `printText` 의 `printSkillSection(report.skills.agents.claude)` 호출을 `printSkillSection(report.skills.agents)` 로 바꾼다.

### 2. `src/commands/doctor.test.ts`

- 의존성 기본 fixture 의 `inspectSkill` 을 `vi.fn(async (_context, agent) => (agent === "claude" ? missingSkill : missingCodexSkill))` 형태로 바꾼다. `missingCodexSkill` 은 `missingSkill` 에 `destination: "/home/tester/.agents/skills/nhncloud-cli"` 를 덮은 값이다.
- 157번째 줄 근처의 보고서 전체 단언에 `codex: { ...missingCodexSkill, recoveryCommand: "nhncloud skills install" }` 를 더한다.
- 새 테스트:
  1. `inspectSkill` 이 `"claude"` 와 `"codex"` 로 한 번씩 불린다(`toHaveBeenCalledWith(context, "claude")`, `toHaveBeenCalledWith(context, "codex")`).
  2. Codex 판정만 `code: "EACCES"` 오류로 실패하면 `agents.codex` 가 `{ status: "error", reason: "공개 스킬 상태를 판정하지 못했습니다: EACCES" }` 이고 `agents.claude` 는 정상 상태 객체다.
  3. 텍스트 출력에 `Claude Code:` 와 `Codex:` 가 모두 있고, Codex 가 `missing` 이면 그 줄에 `nhncloud skills install` 이 있다.
  4. Codex 가 `missing` 이어도 `ready` 는 자격증명과 profile 이 정상이면 `true` 다.
- 기존 「스킬 판정이 실패하면」, 「스킬 컨텍스트 생성이 실패해도」, 「code 만 reason 에 붙이고」 테스트는 `agents.claude` 와 `agents.codex` 를 함께 단언하게 고친다. 컨텍스트 생성 실패는 두 에이전트 모두 `error` 다.

### 3. `skills/nhncloud-cli/references/common.md` 「설정 진단」 절

- 최상위 필드 표의 `skills` 행을 `{ "agents": { "claude": ..., "codex": ... } }`. 에이전트별 공개 스킬 상태 로 바꾼다.
- 표 아래 문단의 `skills.agents.claude` 설명을 `skills.agents.claude` 와 `skills.agents.codex` 로 넓히고, 각각 Claude Code(`~/.claude/skills/nhncloud-cli`)와 Codex(`~/.agents/skills/nhncloud-cli`) 경로 하나의 `SkillStatus` 라고 적는다. 판정 실패는 그 에이전트만 `error` 가 된다는 문장을 더한다.
- 「에이전트가 늘면 `agents`에 키가 추가되며 기존 키의 모양은 바뀌지 않는다」 문장은 유지한다.

## 검증

```bash
pnpm exec vitest run src/commands/doctor.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node scripts/check-pii.mjs
git diff --check
```

- `git grep -n "Claude Code 스킬\|Claude Code 공개 스킬" -- src skills README.md` 결과가 0 건이다.
- `git grep -n "agents.codex" -- skills/nhncloud-cli/references/common.md` 결과가 1 건 이상이다.
- 빈 임시 HOME 에서 실제 실행을 확인한다. 실제 홈을 쓰지 않도록 `HOME` 과 `XDG_DATA_HOME` 을 함께 바꾼다.
  `T=$(mktemp -d) && HOME="$T" XDG_DATA_HOME="$T/data" node dist/index.js doctor --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.skills.agents.codex.status!=="missing"||r.skills.agents.claude.status!=="missing")process.exit(1)})' && rm -rf "$T"`
  종료 코드 0.
- 한국어 점검: korean-check 스킬의 검사기 `python3 <korean-check 스킬 디렉터리>/scripts/korean-style-check.py skills/nhncloud-cli/references/common.md` 종료 코드 0.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/doctor.ts` | 수정 |
| `src/commands/doctor.test.ts` | 수정 |
| `skills/nhncloud-cli/references/common.md` | 수정 |
