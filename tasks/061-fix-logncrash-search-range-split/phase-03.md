# Phase 03 — 사용자 가이드 갱신과 완료 마킹

**Execution profile**: standard

---

## 목표

바뀐 `export` 동작과 `search` 의 500 안내를 공개 가이드에 반영하고 task 를 완료로 마킹한다.

**범위 외**: `docs/adr/`·`docs/flow.md`·`docs/code-architecture.md` 는 planning 이 이미 갱신하고
커밋했다(ADR-030 포함). 이 phase 에서 다시 고치지 않는다.

`AGENTS.md` 도 대상이 아니다. 이 plan 은 명령과 옵션을 추가하지 않아 카탈로그 수가 그대로다.

**이 phase 도 실제 Log & Crash API 를 호출하지 않는다.**

---

## 작업 항목 (3)

### 1. `skills/nhncloud-cli/references/logncrash.md` — 기간 제약과 분할 서술

파일이 없으면 이 명령군을 다루는 references 파일을 찾아 그곳에 넣는다.

- `--from`/`--to` 설명에 문서상 제약(최근 90일, 범위 31일)과 함께,
  **그보다 짧은 기간에서도 서버가 500 을 낼 수 있고 그 경계는 프로젝트 로그 양에 따라 다르다**는 점을 적는다
- `export` 가 500 을 만나면 기간을 절반으로 줄여 자동으로 다시 시도한다는 것을 적는다.
  사용자가 직접 나눠 호출할 필요가 없다는 것이 이 변경의 요점이다
- `search` 는 분할하지 않으며 500 시 안내와 `requestId` 를 보여 준다는 것을 적는다.
  넓은 기간을 훑어야 하면 `export` 를 쓰라고 안내한다
- 실제 appkey·프로젝트 이름·사내 도메인을 쓰지 않는다. `<appkey>` 같은 placeholder 만 쓴다

### 2. `README.md` — 해당 서술이 있으면 맞춘다

`logncrash` 사용 예나 제약 서술이 있으면 위 내용과 어긋나지 않게 고친다.
없으면 추가하지 않는다 — 이 plan 은 명령을 늘리지 않는다.

### 3. `skills/nhncloud-cli/SKILL.md` — 라우터 표 확인

`logncrash` 행이 검색·추출 범위를 서술한다면 그대로 둔다.
"기간 제한" 처럼 이번 변경과 어긋나는 문구가 있을 때만 고친다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/logncrash.md` | 수정 |
| `README.md` | 확인 후 필요 시 수정 |
| `skills/nhncloud-cli/SKILL.md` | 확인 후 필요 시 수정 |
| `tasks/061-fix-logncrash-search-range-split/index.json` | 수정 |

## 검증

```bash
# cwd: <repo root>
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup

# 가이드가 자동 분할을 설명한다 (이 토큰은 이 plan 이전에 references 에 없다)
grep -rq '절반' skills/nhncloud-cli/references/logncrash.md
grep -rq 'requestId' skills/nhncloud-cli/references/logncrash.md

# 카탈로그 수는 그대로다 — 이 plan 은 명령을 추가하지 않는다
# 환경변수는 명령 앞에 둔다. 뒤에 붙이면 argv 로 들어가 process.env 가 undefined 다
BEFORE="$(git show origin/main:AGENTS.md | grep -oE '카탈로그는 [0-9]+개' | grep -oE '[0-9]+')"
node dist/index.js commands --json \
  | BEFORE="$BEFORE" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const n=JSON.parse(s).commands.length;if(String(n)!==process.env.BEFORE){console.error('카탈로그 수 변경: '+n+' (기대 '+process.env.BEFORE+')');process.exit(1)}})"

# AGENTS.md 를 손대지 않았다
test "$(git diff origin/main --name-only -- AGENTS.md | grep -c .)" = "0"

# 공개 저장소 정보 보호 2건이 0 건이다
test "$(grep -rnoE '(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)' README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -vE 'nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com' | grep -c .)" = "0"
test "$(grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -c .)" = "0"

git diff --check
```

마지막으로 `tasks/061-fix-logncrash-search-range-split/index.json` 의 `status` 를 `completed` 로,
`current_phase` 를 `3` 으로, 모든 phase 의 `status` 를 `completed` 로 바꾸고 `updated_at` 을 갱신한다.

마킹이 실제로 됐는지 확인한다. task 레벨 1개와 phase 3개를 합쳐 4개여야 한다.

```bash
# cwd: <repo root>
IDX=tasks/061-fix-logncrash-search-range-split/index.json
test "$(grep -c '"status": "completed"' "$IDX")" = "4"
grep -q '"current_phase": 3' "$IDX"
test "$(grep -c '"status": "pending"' "$IDX")" = "0"
```

---

## 수동 QA (사용자 실행 — executor 는 호출하지 않는다)

실제 검색 API 를 부르므로 자동 실행 대상이 아니다. 읽기 전용이지만 검색 토큰을 소모한다.

1. 짧은 기간이 그대로 동작하는지 확인한다 (회귀 확인)

    ```bash
    # cwd: <repo root>
    node dist/index.js logncrash search --profile <프로파일> --query '*' --from 1h --to now --size 1
    ```

2. 500 이 나던 기간으로 `export` 를 실행해 분할이 동작하는지 본다.
   spinner 에 창 진행이 보이고 파일이 만들어지면 성공이다

    ```bash
    node dist/index.js logncrash export --profile <프로파일> --query '*' --from 30d --to now --output /tmp/lnc.jsonl
    ```

3. 같은 기간으로 `search` 를 실행해 안내가 나오는지 본다.
   원인을 단정하지 않는 문구와 `requestId` 가 함께 나와야 한다

### QA 결과가 설계와 어긋날 때

계획을 고치지 않고 PR 위에서 정정한다.
`review-fix` 로 문구·분할 동작·`docs/adr/030-logncrash-search-range-adaptive-split.md` 를 함께 고치고,
어긋난 지점을 ADR 의 맥락 절에 실측 근거로 남긴다.

특히 아래 둘은 실행 시점에 따라 달라질 수 있다.

- 최소 창 10분이 실제로 충분한지. 로그가 아주 많은 프로젝트에서는 더 작아야 할 수 있다
- 성공 창 크기 재사용이 뒤쪽 구간에서도 통하는지. 로그 양이 시간대별로 크게 다르면 다시 실패할 수 있다

## 의도 메모 (왜)

- 가이드에 "경계가 프로젝트마다 다르다" 를 적는 이유는 고정 숫자를 적으면 그 값이 곧 틀리기 때문이다.
  실측에서 두 프로젝트가 40배 넘게 차이 났다.
- 카탈로그 수를 검증에 넣는 이유는 이 plan 이 명령·옵션을 늘리지 않는다는 것을 강제하기 위해서다.
  적응형 분할은 기본 동작이라 새 옵션이 없어야 한다.
