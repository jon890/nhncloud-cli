# Phase 02. 릴리스 스킬이 스크립트로 판정하고 게시 안내를 실제 인증 흐름에 맞춘다

**Execution profile**: standard

## 목표

`.agents/skills/release/SKILL.md` 의 통과 조건을 phase 01 스크립트의 종료 코드로 바꾸고, npm 게시 안내를 `references/publish.md` 로 옮겨 실제 흐름에 맞춘다.

**범위 외**: 스크립트 구현(phase 01), 태그 push 워크플로 파일(phase 03). 이 phase 는 문서만 바꾼다.

## 컨텍스트

`.agents/skills/release/SKILL.md` 는 여덟 단계다. 절 제목은 `## 1. 사전 검증` 부터 `## 8. 남은 이슈 처리` 까지이고, 「워크플로우 개요」 표가 단계별 통과 조건을 소유한다.

바꿀 곳은 일곱이다.

| 절 | 지금 | 바꾼 뒤 |
|---|---|---|
| 1. 사전 검증 | `AGENTS.md` 검증 명령을 사람이 차례로 실행 | main 가드와 `git status` 확인 뒤 `node .agents/skills/release/scripts/preflight.mjs` 가 종료 코드 0 |
| 3. 문서 동기화 | `KEYWORD` 를 사람이 정해 grep | `node .agents/skills/release/scripts/doc-sync-check.mjs` 가 종료 코드 0. 1 이면 출력된 대상의 보완 커밋을 만든 뒤 다시 돌린다 |
| 4. 공개 정보 검사 | grep 실행 | 1단계 `preflight.mjs` 가 포함하므로 절을 1단계에 합치고 번호를 당긴다 |
| 7. npm 배포 | `npm publish --access public --otp=OTP코드` 를 안내 | `references/publish.md` 를 읽고 수행. 통과 조건은 `verify-release.mjs $VERSION` 종료 코드 0. 이 단계에 있던 「1분 간격으로 다시 조회하고 10분…」 줄(다른 브랜치가 넣는다)은 `verify-release.mjs` 가 대기를 맡으므로 지운다 |
| `SKILL.md` 목표 문장 | 「사용자가 OTP 로 npm 배포를 마칠 수 있게」 | OTP 를 말하지 않고 「사용자가 npm 게시를 마칠 수 있게」 로 고친다 |
| 7단계 첫 문장 | 「npm 배포에는 2FA OTP 가 필요하다」 | 계정의 2단계 인증 때문에 사용자가 직접 게시해야 한다는 문장으로 고치고 OTP 를 말하지 않는다 |
| 6. 태그와 GitHub Release | Release 본문 점검 grep | 태그 push 뒤 태그 워크플로를 기다리는 항목을 더한다(아래 「태그 워크플로 확인」). 본문 점검은 7단계의 `verify-release.mjs` 가 맡으므로 grep 블록을 지운다 |

**태그 워크플로 확인**: 태그를 push 한 뒤 아래 순서로 막는 조건을 건다.

1. run id 를 얻는다: `gh run list --workflow release.yml --branch "$TAG" --limit 1 --json databaseId -q '.[0].databaseId'`. 목록에 아직 없으면 몇 초 간격으로 다시 조회한다.
2. `gh run watch <id> --exit-status` 로 끝날 때까지 기다린다.
3. 실패하면 npm 게시 단계로 가지 않고 사용자에게 보고한다.

통과 조건은 「태그 run 이 success」 다. 「워크플로우 개요」 표의 6단계 통과 조건에도 같은 문구를 쓴다.

**단계 번호 재배치**: 4단계를 1단계에 합치므로 번호가 당겨진다.

| 옛 | 새 |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 1에 합침 |
| 5 | 4 |
| 6 | 5 |
| 7 | 6 |
| 8 | 7 |

옛 4단계의 「걸리면 placeholder 보완 커밋, 사용자 동의 없으면 릴리스 중단」 규칙은 새 1단계로 옮긴다. 본문 안의 단계 번호 참조는 이 표대로 모두 고친다(「3·4단계의 보완 커밋」 은 「1·3단계의 보완 커밋」, 7단계의 `verify-release.mjs` 는 새 번호 6단계).

`references/publish.md` 에 담을 사실이다. 모두 형제 프로젝트 dooray-cli 의 같은 문서(<https://github.com/jon890/dooray-cli/blob/main/.claude/skills/release/references/publish.md>)에서 확인한 것이다.

- 게시 전에 에이전트가 `npm publish --access public --dry-run` 을 실행해 파일 목록, 버전, 크기를 보인다. 의도하지 않은 파일이 섞였으면 멈춘다.
- 사용자에게는 `cd <저장소 루트> && npm publish --access public` 을 넘긴다. OTP 인자 없이 실행한다. 이 문서에는 OTP 옵션 문자열을 쓰지 않는다. 계정의 2단계 인증이 쓰기에도 걸려 있으면 npm 이 브라우저 인증 URL 을 띄우고 ENTER 를 기다린다.
- 접수되면 npm 이 `Your package is being processed and may take a few minutes to become available.` 를 낸다. 반영까지 몇 분 걸린다(v0.18.0 에서 4분). `verify-release.mjs` 가 기다린다.
- 사용자가 게시했다는데 이전 버전만 보이면 `~/.npm/_logs/` 의 가장 최근 publish 로그에서 `PUT 202` 를 찾는다. 있으면 접수된 것이다.
- CI 게시는 기본으로 꺼져 있다(`docs/adr/041-release-publish-local-ci-verify.md`).

**근거 문서**: `docs/adr/041-release-publish-local-ci-verify.md`.

## Blocked 조건

- `.agents/skills/release/scripts/preflight.mjs`, `doc-sync-check.mjs`, `verify-release.mjs` 중 하나라도 없으면 `PHASE_BLOCKED: phase 01 스크립트가 없다` 를 출력하고 끝낸다.

## 의도 메모

- 스킬 문서는 스크립트의 사용법과 종료 코드를 다시 적지 않는다. 그것은 각 스크립트의 머리 주석이 소유한다. 스킬에는 언제 부르는지와 통과 조건만 둔다.
- 옛 8단계(새 7단계, 남은 이슈 처리) 본문은 번호만 바꾼다. 2단계(변경 분석)는 바꾸지 않는다.
- 스킬의 다른 단계 번호 참조는 위 재배치 표를 따른다.

## 작업 항목

### 1. `.agents/skills/release/SKILL.md`

컨텍스트 표대로 고치고 「워크플로우 개요」 표의 통과 조건과 단계 번호를 맞춘다. 단계 번호가 바뀌면 본문 안의 단계 번호 참조(「8단계」, 「3·4단계의 보완 커밋」 등)를 재배치 표대로 모두 고친다.

### 2. `.agents/skills/release/references/publish.md` 신규

컨텍스트의 사실을 「로컬 게시」, 「반영 확인」, 「CI 게시」 절로 담는다. OTP 옵션 문자열은 쓰지 않는다.

### 3. 동작 확인 테스트

이 phase 는 문서만 바꾸지만, 문서가 가리키는 스크립트가 실제로 도는지 phase 01 테스트로 확인한다.

## 검증

```bash
node_modules/.bin/vitest run .agents/skills/release/scripts/release-scripts.test.mjs
grep -rniE -- "--otp|OTP|KEYWORD=" .agents/skills/release/
grep -oE "\.agents/skills/release/scripts/[a-z-]*\.mjs" .agents/skills/release/SKILL.md | sort -u | while read -r f; do test -f "$f" || echo "missing $f"; done
for f in .agents/skills/release/SKILL.md .agents/skills/release/references/publish.md; do grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//;s/\)$//' | grep -vE '^(https?:|#)' | while read -r l; do test -f "$(dirname "$f")/${l%%#*}" || echo "missing link $l in $f"; done; done
node scripts/check-pii.mjs
```

- 두 번째 줄은 미추적 파일을 포함하고 대소문자를 구분하지 않으며 0건이어야 한다.
- 세 번째 줄과 네 번째 줄은 아무것도 출력하지 않아야 한다. 네 번째 줄은 두 문서의 상대 링크(http 로 시작하는 것과 `#` 앵커 제외)를 각 파일 기준 경로로 `test -f` 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/release/SKILL.md` | 수정 |
| `.agents/skills/release/references/publish.md` | 신규 |
