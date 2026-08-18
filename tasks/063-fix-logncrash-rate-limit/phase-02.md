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

**범위 외**: `resultCode` 보존과 `isRateLimitError`·`withRateLimitHint` 는 phase-01 이 이미 만들었다. 다시 만들지 않고 import 한다.
사용자 가이드 갱신은 phase-03 이 맡는다.
[[adr-030]] 의 적응형 분할 자체는 바꾸지 않는다. 500 대응으로 유효하다.
자동 재시도와 백오프는 넣지 않는다. [[adr-032]] 가 기각했다.

이 phase 는 phase-01 이 만드는 `isRateLimitError` 와 `withRateLimitHint` 를 전제한다. 없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (4)

### 1. 실패 시 부분 결과를 `<output>.partial` 에 남긴다

`export.ts` 의 바깥 catch (현재 `stopSpinner(false)` 로 시작하는 블록) 를 바꾼다.

- 받은 건수가 **0 이면** 지금처럼 temp 를 지운다. 빈 파일을 남길 이유가 없다.
- 받은 건수가 **1 이상이면** temp 를 `` `${opts.output}.partial` `` 로 옮긴다.
- `--output` 경로는 어떤 경우에도 만들지 않는다. 잘린 파일과 완전한 파일이 구분되어야 한다.

**`--format json` 의 배열 닫기는 순서를 지켜야 한다.**
현재 바깥 catch 는 `stream.destroy()` 로 pending write 를 버린다.
그 상태에서 `write("]")` 를 부르면 반영되지 않고, 이미 destroy 된 stream 에 `end()` 를 부르면 매달릴 수 있다.
게다가 이 catch 는 정상 경로가 `write("]\n")` 를 **성공한 뒤** `endAndClose` 에서 실패한 경우에도 진입한다.
그때 다시 닫으면 `]]` 가 되어 `JSON.parse` 가 깨진다.

그래서 이 순서로 한다.

1. 기존 close 대기 로직으로 stream 을 먼저 닫는다.
2. 배열이 아직 닫히지 않았을 때만 `appendFile(tmp, "]\n")` 로 붙인다. stream 을 재사용하지 않는다.
3. 닫힘 여부는 별도 플래그로 추적한다. 정상 경로에서 `write("]\n")` 를 부른 시점에 세운다.

`createWriteStream` 은 파일을 지연 open 하므로 close 를 기다리지 않고 파일을 다루면 경합이 난다.
현재 파일에 그 이유가 주석으로 남아 있다. 지우지 않는다.

`.partial` 이 이미 있으면 덮어쓴다. 실패 산출물이라 이전 잔여를 보존할 이유가 없다.
`--force` 검사 대상이 아니다. 그 정책은 `--output` 에만 적용한다.

**보존에 실패해도 원본 오류를 가리지 않는다.**
`.partial` 자리에 디렉터리가 있거나 권한이 없으면 `rename` 이 던진다.
그 오류가 rate limit 오류를 덮으면 사용자는 진짜 원인을 볼 수 없다.
`rename` 과 `appendFile` 의 실패는 삼키고, 그 사실만 stderr 한 줄로 알린 뒤 원본 `err` 를 던진다.

### 2. 이어받을 지점을 창 경계로 기록한다

**로그의 `logTime` 을 쓰면 안 된다.** 데이터를 잃는다.

`splitTimeRange` 는 창을 **오래된 쪽부터 오름차순**으로 만들고, 루프는 그 순서로 `shift` 해 처리한다.
`logTime DESC` 정렬은 **창 안에서만** 적용된다.
그래서 창 W1..Wk 를 처리하고 실패하면 파일에 마지막으로 쓰인 `logTime` 은 전체의 가장 오래된 시각이 아니라 **Wk 의 시작 경계**다.
그 값을 `--to` 로 주면 이미 받은 W1..W(k-1) 을 다시 받으면서 제한을 또 쓰고,
아직 받지 않은 **더 새로운** 구간 Wk+1..Wn 은 영영 빠진다.
이슈 #91 의 28창 시나리오가 정확히 이 경우다.

대신 **실패한 창의 `from`** 을 기록한다.

- 스코프에 `let resumeFrom = ""` 를 두고, 각 창을 `shift` 한 직후 그 창의 `from` 으로 갱신한다.
- 실패 시 이 값과 원래 `--to` 를 짝지어 안내한다. 미조회 구간을 모두 덮고 중복만 생긴다.
- 이 값은 `splitTimeRange` 나 `resolveTime` 이 만든 문자열이라 서버 응답이 아니다.
- 로그의 `logTime` 을 추적할 필요가 없어진다. `getString` 을 옮기거나 새로 만들지 않는다.

### 3. 부분 결과 안내를 낸다

부분 파일을 남겼을 때만 stderr 로 알린다. 데이터가 아니므로 stdout 을 쓰지 않는다.

```
안내: 여기까지 받은 {count}건을 {output}.partial 에 남겼습니다.
안내: 이어받으려면 --from "{resumeFrom}" --to "{원래 --to}" 로 다시 실행하세요. 경계 구간의 로그가 중복될 수 있습니다.
```

- `resumeFrom` 이 비어 있으면 둘째 줄을 내지 않는다. 값을 지어내지 않는다.
- **서버 응답 문자열을 stderr 로 내지 않는다.** 안내에 담기는 두 시각은 모두 CLI 가 만든 값이다.
  서버 문자열을 내야 한다면 `sanitizeForTerminal` 로 감싼다 — 같은 파일의 `LogncrashServerError` 가 `requestId` 에 그렇게 한다.
  `src/index.ts` 출력 관문은 `err.message` 만 정제하므로 직접 `stderr.write` 하는 값은 관문을 지나지 않는다.
- 출력 경로는 기존 완료 메시지와 같은 방식으로 다룬다. 이 파일은 이미 `--output` 을 정제 없이 출력한다.

### 4. `scrollNextWithHint` 의 rate limit 안내를 고친다

phase-01 의 `isRateLimitError` 와 `withRateLimitHint` 를 import 한다.

- rate limit 이면 `withRateLimitHint` 로 감싸 던진다. 기간을 좁히라는 문구가 붙으면 안 된다.
  **원본을 그대로 던지면 안 된다.** phase-01 의 안내는 `search.ts` 안에만 있어 export 경로에 닿지 않는다.
  그러면 사용자는 서버 원문만 보고 무엇을 해야 할지 알 수 없다.
- `scrollStart` 가 던지는 rate limit 도 같은 안내를 받아야 한다.
  그 오류는 적응형 분할 catch 를 통과해 위로 올라가므로, 바깥에서 한 번 더 판별해 감싼다.
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
# phase-01 산출물을 실제로 쓰는지 — 각각 1 이상이어야 한다
grep -c 'isRateLimitError' src/commands/logncrash/export.ts || true
grep -c 'withRateLimitHint' src/commands/logncrash/export.ts || true

# 부분 파일 경로가 --output 과 분리돼 있는지 — 출력이 있어야 한다
grep -n '\.partial' src/commands/logncrash/export.ts || true

# 로그의 logTime 을 이어받기 지점으로 쓰지 않는지 — 출력이 없어야 한다
grep -n 'lastLogTime' src/commands/logncrash/export.ts || true
```

테스트는 아래를 각각 덮는다.

- 페이지를 일부 받은 뒤 실패하면 `<output>.partial` 이 생기고 `--output` 은 생기지 않는다.
- `--format json` 으로 실패한 부분 파일이 `JSON.parse` 로 파싱되고 받은 건수만큼 배열 항목을 갖는다.
- **분할이 일어난 뒤 실패하면 안내의 `--from` 이 실패한 창의 시작이다.**
  이미 받은 구간의 시작이 아니고, 파일 마지막 로그의 `logTime` 도 아니다.
  창 두 개 이상을 처리하다 실패하는 상황을 만들어 확인한다.
- 한 건도 받지 못하고 실패하면 `.partial` 도 temp 도 남지 않는다.
- rate limit 오류에 "범위를 좁혀" 문구가 붙지 않고 "시간을 두고" 안내가 붙는다.
- `scrollStart` 단계의 rate limit 도 같은 안내를 받는다.
- rate limit 이 적응형 분할을 유발하지 않는다. `scrollStart` 호출 횟수로 확인한다.
- `resumeFrom` 이 비어 있으면 이어받기 안내 줄이 나오지 않는다.
  이것은 방어 분기이고 정상 경로에서는 도달하지 않는다.
  첫 창을 `shift` 한 직후 값이 세워지고, 그 전에 실패하면 받은 건수가 0 이라 부분 파일 자체가 없다.
  억지 mock 을 만들지 말고 분기 존재만 확인한다.

## 의도 메모 (왜)

- 부분 파일을 `--output` 이 아니라 별도 경로에 두는 이유는 자동화가 잘린 데이터를 전체로 오인하지 않게 하기 위해서다.
  경로가 다르면 성공 여부를 파일 존재로 판정하던 스크립트가 그대로 동작한다.
- JSON 배열을 닫는 이유는 닫지 않은 부분 파일이 파싱되지 않아 보존의 의미가 사라지기 때문이다.
- 이어받기 지점을 창 경계로 잡는 이유는 로그 시각이 처리 순서를 반영하지 않기 때문이다.
  창은 오래된 쪽부터 처리되고 정렬은 창 안에서만 내림차순이라, 두 방향이 어긋난다.
  창 경계는 그 어긋남이 없고 미조회 구간을 빠짐없이 덮는다.
- 중복을 허용하고 누락을 막는 쪽을 택했다. 중복은 사용자가 걸러낼 수 있지만 누락은 알아차릴 수 없다.

## 범위 밖으로 남기는 것

모든 창을 받은 뒤 `rename(tmp, opts.output)` 이 실패하는 경로는 여전히 temp 를 지운다.
이 phase 가 고치는 catch 와 다른 블록이라 위 변경으로 덮이지 않는다.

여기서 다루지 않는 이유는 그 시점의 데이터가 **완전하기** 때문이다.
`.partial` 로 남기면 이름이 사실과 어긋나고, 완전한 결과를 부분 결과로 오인하게 만든다.
별도 결함으로 phase 보고에 남긴다.

## Blocked 조건

- `src/services/logncrash/errors.ts` 에 `isRateLimitError` 또는 `withRateLimitHint` 가 없으면
  `PHASE_BLOCKED: phase-01 산출물 부재` 를 출력하고 종료한다.
