# Phase 02 — export 부분 결과 보존과 안내 문구 교체

**Execution profile**: standard

---

## 목표

`logncrash export` 가 중간에 실패해도 이미 받은 로그를 버리지 않게 만들고, rate limit 에 맞지 않는 안내를 고친다.

지금은 두 가지가 잘못돼 있다.

- 실패하면 `src/commands/logncrash/export.ts` 의 catch 가 temp 파일을 무조건 지운다.
  7,880건 중 3,000건을 받고 끊겨도 남는 것이 없어, 재실행이 처음부터 다시 받으며 제한을 더 소모한다.
- `scrollNextWithHint` 가 500 이 아닌 모든 API 오류를 "검색 범위를 좁혀 다시 실행하세요" 로 감싼다.
  rate limit 이 여기 걸리는데, 호출 비용이 기간에 거의 비례하지 않아 범위를 좁히면 오히려 손해다([[adr-032]]).

**범위 외**: `resultCode` 보존과 `isRateLimitError` 는 phase-01 이 이미 만들었다. 다시 만들지 않고 import 한다.
사용자 가이드 갱신은 phase-03 이 맡는다.
[[adr-030]] 의 적응형 분할 자체는 바꾸지 않는다. 500 대응으로 유효하다.
자동 재시도와 백오프는 넣지 않는다. [[adr-032]] 가 기각했다.

이 phase 는 phase-01 이 만드는 `isRateLimitError` 를 전제한다. 없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (4)

### 1. 실패 시 부분 결과를 `<output>.partial` 에 남긴다

`export.ts` 의 바깥 catch (현재 `stopSpinner(false)` 로 시작하는 블록) 를 바꾼다.

- 받은 건수가 **0 이면** 지금처럼 temp 를 지운다. 빈 파일을 남길 이유가 없다.
- 받은 건수가 **1 이상이면** temp 를 `` `${opts.output}.partial` `` 로 옮긴다.
- `--format json` 이면 옮기기 **전에** 배열을 닫는다. 닫지 않으면 파싱되지 않아 쓸모가 없다.
- `--output` 경로는 어떤 경우에도 만들지 않는다. 잘린 파일과 완전한 파일이 구분되어야 한다.

기존 코드의 stream 종료 처리를 유지한다.
`createWriteStream` 은 파일을 지연 open 하므로 close 를 기다리지 않고 파일을 다루면 경합이 난다.
현재 파일에 그 이유가 주석으로 남아 있다. 지우지 않는다.

`.partial` 이 이미 있으면 덮어쓴다. 실패 산출물이라 이전 잔여를 보존할 이유가 없다.
`--force` 검사 대상이 아니다. 그 정책은 `--output` 에만 적용한다.

### 2. 이어받을 지점을 추적한다

`writePage` 가 마지막으로 쓴 로그의 `logTime` 을 기록한다.

- 스코프에 `let lastLogTime = ""` 를 두고, 각 로그를 쓸 때 `log["logTime"]` 이 문자열이면 갱신한다.
- 검색 정렬이 `logTime DESC` 로 고정돼 있으므로([[adr-024]]) 마지막 값이 가장 오래된 시각이다.
  그래서 이 값을 `--to` 로 주면 그 앞 구간을 이어받게 된다.
- `search.ts` 의 `getString` 은 그 파일 안의 private 함수다. 옮기지 말고 `export.ts` 안에서 타입 검사로 처리한다.

### 3. 부분 결과 안내를 낸다

부분 파일을 남겼을 때만 stderr 로 알린다. 데이터가 아니므로 stdout 을 쓰지 않는다.

```
안내: 여기까지 받은 {count}건을 {output}.partial 에 남겼습니다.
안내: 이어받으려면 --to "{lastLogTime}" 로 다시 실행하세요. 경계 시각의 로그가 중복될 수 있습니다.
```

- `lastLogTime` 이 빈 문자열이면 둘째 줄을 내지 않는다. 줄 값을 지어내지 않는다.
- 경로와 시각은 `sanitizeForTerminal` 로 감싸지 않는다.
  제어 문자 정제는 `src/index.ts` 출력 관문이 담당한다 — 저장소 전체가 그 규칙으로 통일돼 있다.

### 4. `scrollNextWithHint` 의 rate limit 안내를 고친다

phase-01 의 `isRateLimitError` 를 import 한다.

- rate limit 이면 **감싸지 않고 원본 오류를 그대로 던진다.**
  기간을 좁히라는 문구가 붙으면 안 된다.
- 그 밖의 `EXIT_API_ERROR` 는 기존 문구를 유지한다. 원인을 구분할 수 없어 범위를 좁히는 안내가 여전히 최선이다.
- `LogncrashServerError`(500) 를 그대로 던지는 기존 분기는 건드리지 않는다. 적응형 분할이 그것을 잡는다.

rate limit 은 `LogncrashServerError` 가 아니므로 분할 catch 에 걸리지 않고 위로 올라간다.
현재 구조가 이미 그렇게 동작한다. 분할이 rate limit 을 증폭시키지 않는지 테스트로 고정한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/logncrash/export.ts` | 수정 — 부분 파일 보존, 안내, rate limit 분기 |
| `src/commands/logncrash/export.test.ts` | 수정 — 아래 검증 항목 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
```

pnpm 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패하면 `./node_modules/.bin/tsc`,
`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsup` 을 직접 실행한다.

추가 기준이다.

```bash
# cwd: <repo root>
# phase-01 의 판별 함수를 실제로 쓰는지 — 1 이상이어야 한다
grep -c 'isRateLimitError' src/commands/logncrash/export.ts || true

# 부분 파일 경로가 --output 과 분리돼 있는지 — 출력이 있어야 한다
grep -n '\.partial' src/commands/logncrash/export.ts || true
```

테스트는 아래를 각각 덮는다.

- 페이지를 일부 받은 뒤 실패하면 `<output>.partial` 이 생기고 `--output` 은 생기지 않는다.
- `--format json` 으로 실패한 부분 파일이 `JSON.parse` 로 파싱되고 받은 건수만큼 배열 항목을 갖는다.
- 한 건도 받지 못하고 실패하면 `.partial` 도 temp 도 남지 않는다.
- rate limit 오류에 "범위를 좁혀" 문구가 붙지 않는다.
- rate limit 이 적응형 분할을 유발하지 않는다. `scrollStart` 호출 횟수로 확인한다.
- `lastLogTime` 을 못 얻으면 이어받기 안내 줄이 나오지 않는다.

## 의도 메모 (왜)

- 부분 파일을 `--output` 이 아니라 별도 경로에 두는 이유는 자동화가 잘린 데이터를 전체로 오인하지 않게 하기 위해서다.
  경로가 다르면 성공 여부를 파일 존재로 판정하던 스크립트가 그대로 동작한다.
- JSON 배열을 닫는 이유는 닫지 않은 부분 파일이 파싱되지 않아 보존의 의미가 사라지기 때문이다.
- rate limit 에서 원본 오류를 그대로 올리는 이유는 phase-01 이 붙인 안내가 이미 정확하기 때문이다.
  여기서 다시 감싸면 문구가 두 겹이 된다.

## Blocked 조건

- `src/services/logncrash/errors.ts` 에 `isRateLimitError` 가 없으면
  `PHASE_BLOCKED: phase-01 산출물 부재` 를 출력하고 종료한다.
