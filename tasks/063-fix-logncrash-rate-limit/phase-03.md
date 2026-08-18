# Phase 03 — 사용자 가이드 갱신과 완료 마킹

**Execution profile**: fast

---

## 목표

phase-01·02 가 바꾼 동작을 공개 문서에 반영한다.

이 저장소는 공개 npm 패키지라 `README.md` 와 `skills/nhncloud-cli/` 가 사용자가 읽는 유일한 안내다.
코드에만 반영하고 여기를 빠뜨리면 사용자는 여전히 "범위를 좁히라" 는 낡은 지시를 따르게 된다.

**범위 외**: `docs/` 아래 문서는 planning 이 이미 갱신하고 커밋했다. 다시 손대지 않는다.
`docs/adr/032-logncrash-rate-limit.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/adr/INDEX.md`, `docs/adr/030-*.md` 이 그 대상이다.
이 파일들을 phase 안에서 고치면 이중 편집이 된다.

---

## 작업 항목 (3)

### 1. `skills/nhncloud-cli/references/logncrash.md` — 낡은 안내를 고치고 rate limit 을 설명한다

이 파일의 절은 `검색` / `검색 출력` / `대량 export` / `로그 전송` / `에러 코드` 다.
착수 전에 `grep -n "^## "` 로 실제 절 구성을 확인한다.

고쳐야 할 낡은 안내는 **`대량 export` 절 바로 앞의 이 문장**이다.

```
반복 검색이나 넓은 wildcard 검색은 시간 범위를 좁혀 확인한다.
```

범위를 좁히는 것이 해법이 아니므로 이 문장을 바꾼다.

`에러 코드` 절에 rate limit 행이 필요한지도 함께 판단한다.
그 절의 기존 형식을 보고 결정하며, 형식이 맞지 않으면 넣지 않고 그 사유를 phase 보고에 적는다.

담을 내용이다.

- rate limit 은 500 과 별개이며 HTTP 200 에 봉투 오류로 온다.
- 기간을 좁혀도 풀리지 않는다. 호출 한 번의 비용이 조회 기간에 거의 비례하지 않기 때문이다.
- 시간을 두고 다시 실행해야 한다.
- `export` 가 실패하면 받은 만큼이 `<output>.partial` 에 남고, `--output` 은 만들어지지 않는다.
- 이어받는 방법은 안내에 나온 `--from` 값과 원래 `--to` 를 함께 쓰는 것이며, 경계 구간의 로그가 중복될 수 있다.
  이 문구는 phase-02 작업 항목 3 의 안내와 표현을 맞춘다.
  파일의 마지막 로그 시각을 `--to` 로 주라고 적으면 안 된다. 그 방법은 미조회 구간을 빠뜨린다.
- `--format json` 이면 부분 파일도 그대로 파싱된다.

회복 속도와 소모량을 숫자로 적지 않는다. 측정값이지 서버 계약이 아니다([[adr-032]]).

`대량 export` 절의 "더 나눌 수 없는 기간에서도 500 응답이 계속되거나 다른 오류가 발생하면 CLI가 원본 오류를 보존한다" 뒤에 부분 파일 동작을 잇는다.

### 2. `README.md` — logncrash 안내가 있으면 대조한다

`README.md` 에 rate limit 이나 export 실패를 설명하는 문장이 있는지 확인하고, 있으면 위 내용과 어긋나지 않게 맞춘다.

```bash
# cwd: <repo root>
grep -n "rate limit\|범위를 좁혀\|기간을 좁혀\|partial" README.md || true
```

없으면 손대지 않는다. 없다는 사실을 phase 보고에 적는다.
`README.md` 는 사용 예 중심이고 오류 처리 상세는 `skills/nhncloud-cli/references/` 가 소유한다.

### 3. `tasks/063-fix-logncrash-rate-limit/index.json` 완료 마킹

- `status` 를 `completed` 로 바꾼다.
- `current_phase` 를 `3` 으로 바꾼다.
- `phases` 배열의 세 항목 `status` 를 모두 `completed` 로 바꾼다.
- `updated_at` 을 실행 시점 ISO 8601 값으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/logncrash.md` | 수정 |
| `README.md` | 대조 후 필요 시 수정 |
| `tasks/063-fix-logncrash-rate-limit/index.json` | 수정 — 완료 마킹 |

## 검증

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js commands --json | jq '.commands | length'
```

pnpm 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패하면 `./node_modules/.bin/tsup` 을 직접 실행한다.

명령 카탈로그는 **170** 이어야 한다. 이번 변경은 명령이나 옵션을 추가하지 않는다.
달라지면 의도치 않은 표면 변경이므로 멈추고 원인을 보고한다.

```bash
# cwd: <repo root>
# 낡은 안내가 사라졌는지 — 출력이 없어야 한다 (변경 전에는 1건 나온다)
grep -n "시간 범위를 좁혀 확인한다" skills/nhncloud-cli/references/logncrash.md || true

# 부분 파일 동작이 문서에 있는지 — 1 이상이어야 한다 (변경 전 baseline 은 0)
grep -c "partial" skills/nhncloud-cli/references/logncrash.md || true

# rate limit 설명이 들어갔는지 — 1 이상이어야 한다
grep -c "rate limit" skills/nhncloud-cli/references/logncrash.md || true
```

공개 저장소 정보 노출 검사도 통과해야 한다. 두 명령 모두 출력이 0줄이어야 한다.

```bash
# cwd: <repo root>
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"

grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
```

마크다운 가독성 검사도 통과해야 한다. 출력이 없으면 통과다.

```bash
# cwd: <repo root>
python3 ~/.claude/scripts/check-readability.py skills/nhncloud-cli/references/logncrash.md
```

## 의도 메모 (왜)

- 사용자 가이드를 별도 phase 로 둔 이유는 코드 두 phase 의 결과가 모두 확정된 뒤에 써야 문구가 실제 동작과 맞기 때문이다.
- 카탈로그 수를 검증에 넣은 이유는 이번 변경이 명령 표면을 건드리지 않는다는 것이 성공 조건의 일부이기 때문이다.
