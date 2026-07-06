# Phase 02 — agent-friendly help와 command catalog

## 목표

CLI 자체의 help 표면을 agent가 더 쉽게 사용할 수 있게 만든다.

사람용 `--help`는 길게 만들지 않는다.
대신 root와 service group help에 짧은 agent hint를 추가하고, 필요하면 machine-readable command catalog를 제공한다.

## 현재 근거

현재 help 출력은 기본 Commander help 중심이다.

확인한 명령:

```bash
node dist/index.js --help
node dist/index.js nks --help
node dist/index.js nks cluster --help
node dist/index.js ncr --help
```

관찰:

- root help는 command 목록만 보여준다.
- service group help는 다음 discovery command를 안내하지 않는다.
- `--json`, `--quiet`, `--profile`, `--region` 사용 기준이 help에서 바로 보이지 않는다.
- `addHelpText`와 `summary`는 아직 사용하지 않는다.

## 설계 결정

### 1. Help text는 짧은 hint만 추가한다

각 help에 긴 매뉴얼을 넣지 않는다.
긴 설명은 Phase 01의 reference 파일과 README에 둔다.

root help에 추가할 hint:

```text
Agent hints:
  - Prefer --json for structured output.
  - Use --quiet only when the command documents an identifier output.
  - Use --profile <name> to avoid relying on default profile.
  - For IaaS/NKS commands, use --region <region> when region matters.
  - Run "nhncloud commands --json" to inspect command paths and options.
```

서비스 group help에는 해당 서비스의 discovery 순서만 둔다.

예:

```text
Agent workflow:
  1. nhncloud nks supports --json
  2. nhncloud nks cluster list --json
  3. nhncloud nks cluster get <cluster> --json
```

### 2. Machine-readable catalog를 추가한다

새 root command를 추가한다.

```bash
nhncloud commands
nhncloud commands --json
```

목적:

- AI 에이전트가 command path, argument, option, description을 구조화해서 읽는다.
- 사람이 볼 때는 간단한 table을 출력한다.
- `--json`에서는 stdout에 JSON만 출력한다.

권장 JSON shape:

```json
{
  "commands": [
    {
      "path": "nks cluster list",
      "description": "NKS 클러스터 목록을 조회한다",
      "arguments": [],
      "options": ["--region <region>", "--profile <name>"],
      "subcommands": []
    }
  ]
}
```

`commands` 자체는 read-only metadata command다.
외부 API를 호출하지 않는다.

### 3. Commander tree에서 생성한다

수동 catalog JSON을 따로 유지하지 않는다.
`program.commands`와 command metadata에서 동적으로 생성한다.

이유:

- 명령 추가 때 catalog drift를 줄인다.
- help description과 catalog description이 같은 source를 쓴다.

## 구현 항목

### 1. catalog helper 추가

권장 파일:

- `src/commands/commands.ts`

역할:

- `createCommandsCommand(program: Command): Command`
- command tree traversal
- JSON 출력
- table 출력

주의:

- root `help` pseudo-command는 catalog에서 제외한다.
- `commands` 자기 자신은 포함해도 되지만, 포함 시 `metadata: true` 같은 field를 둘 수 있다.
- option parser의 내부 field에 과하게 의존하지 않는다.
  Commander public method로 얻을 수 있는 값만 사용한다.

### 2. root command 등록

`src/index.ts`에서 모든 service command 등록 후 `commands` command를 등록한다.

권장 순서:

- `configure`
- service groups
- `commands`

root help에는 `commands`가 보인다.

### 3. help text 추가

`src/index.ts`에서 root와 주요 group command에 `addHelpText("after", ...)`를 추가한다.

대상:

- root `program`
- `logncrashCommand`
- `deployCommand`
- `instanceCommand`
- `networkCommand`
- `volumeCommand`
- `floatingipCommand`
- `ncrCommand`
- `nksCommand`

서비스별 group help text는 5줄 안쪽으로 제한한다.

### 4. 테스트 추가

권장 파일:

- `src/commands/commands.test.ts`

테스트 케이스:

- catalog가 `nks cluster list`, `ncr images`, `instance list` 같은 nested command를 포함한다.
- catalog가 command description과 options를 포함한다.
- `help` pseudo-command는 포함하지 않는다.
- `--json` 출력은 JSON parse 가능하다.
- table 출력은 command path를 포함한다.

필요하면 helper 함수는 command action과 분리해 unit test한다.

## 문서 영향

이 phase는 신규 CLI 명령 추가에 해당한다.
따라서 아래 문서를 Phase 03에서 반드시 동기화한다.

- `AGENTS.md`
- `docs/code-architecture.md`
- `docs/flow.md`
- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `skills/nhncloud-cli/references/common.md`

Phase 02에서는 코드와 테스트만 수정한다.
단, phase 완료를 위해 task status는 갱신하지 않는다.
최종 docs 동기화는 Phase 03에서 완료한다.

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/plan/new-command-docs-required-skip.md`
- `.agents/skills/_shared/pitfalls/plan/success-criterion-no-enforcement.md`
- `.agents/skills/_shared/pitfalls/code-review/quiet-mode-identifier-missing.md`

특히 확인할 점:

- 신규 `commands` 명령이 stdout에 metadata만 출력하고 stderr를 오염하지 않는가?
- `--json` 출력은 JSON만 포함하는가?
- `--quiet`를 지원하지 않는다면 help와 docs에서 지원한다고 쓰지 않는다.
- command catalog 검증 grep은 기존 텍스트로 통과하지 않는 고유 command path를 사용한다.

## 검증

자동 검증:

```bash
pnpm tsc --noEmit
pnpm build
pnpm test
node dist/index.js --help
node dist/index.js nks --help
node dist/index.js ncr --help
node dist/index.js commands
node dist/index.js commands --json
node dist/index.js commands --json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); if (!j.commands.some(c=>c.path==='nks cluster list')) process.exit(1);})"
```

기대값:

- `pnpm tsc --noEmit`, `pnpm build`, `pnpm test` 모두 exit 0.
- root help에 `commands` 명령과 agent hint가 보인다.
- `nks --help`, `ncr --help`에 짧은 agent workflow가 보인다.
- `commands --json`은 parse 가능한 JSON만 stdout에 출력한다.
- JSON catalog에 `nks cluster list`, `ncr images`, `instance list`가 포함된다.

## 변경 파일

- `src/index.ts`
- `src/commands/commands.ts`
- `src/commands/commands.test.ts`

## 커밋

```bash
git commit -m "feat(help): add agent-friendly command catalog"
```
