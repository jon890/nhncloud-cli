# Log & Crash Reference

`logncrash` 명령군은 Log & Crash Search v3 커서 검색, scroll export, collector 전송을 다룬다.

검색과 export에는 profile의 logncrash appkey와 공통 UAK가 필요하다.
CLI가 UAK를 OAuth 토큰으로 교환해 Bearer 인증을 적용한다.
`send`는 별도 collector 계약이므로 Search v3 전환의 영향을 받지 않는다.

## 검색

Discovery:

```bash
nhncloud commands --json | jq '.commands[] | select(.path|startswith("logncrash"))'
```

```bash
nhncloud logncrash search \
  --query 'logType:"ERROR"' \
  --from 1h \
  --to now \
  --json
```

옵션:

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열. API에 그대로 전달 |
| `--from <time>` | 예 | 검색 시작. ISO8601 또는 상대시간 |
| `--to <time>` | 예 | 검색 끝. ISO8601, 상대시간, `now` |
| `--page <n>` | 아니오 | 전환 호환용 pageNumber. 기본 0이며 0만 허용 |
| `--size <n>` | 아니오 | pageSize. 기본 10, 범위 1~100 |
| `--cursor <value>` | 아니오 | 직전 JSON 응답의 불투명한 `nextCursor` |
| `--profile <name>` | 아니오 | 사용할 profile |

CLI는 REAL API 실측 계약에 따라 모든 커서 요청을 `logTime DESC`로 고정 정렬한다.
사용자 정렬 옵션은 제공하지 않는다.

Lucene 예시:

| 의도 | 쿼리 |
|------|------|
| 전체 검색 | `*` |
| body 단어 검색 | `body:request_received` |
| body 부분 문자열 검색 | `body:*request_received*` |
| logType 검색 | `logType:"ERROR"` |

시간 입력:

- `1h`, `30m`, `2d`, `now`
- `2024-01-01T00:00:00+09:00` 같은 ISO8601 직접 입력

API 제약:

- 검색 시작은 최근 90일 이내여야 한다.
- 검색 범위는 31일 이하여야 한다.
- 문서상 제약보다 짧은 기간에서도 서버가 500 응답을 낼 수 있다. 처리 가능한 기간의
  경계는 프로젝트의 로그 양에 따라 달라진다.

`search`는 기간을 자동으로 나누지 않는다. 서버가 500 응답을 반환하면 기간을 줄여
다시 시도하라는 안내와 서버 응답의 `requestId`를 보여 준다. 넓은 기간을 훑어야 하면
자동으로 기간을 나누는 `logncrash export`를 사용한다.

## 검색 출력

`--json` 출력은 `{ totalItems, pageNumber, pageSize, data, nextCursor? }` 객체다.
마지막 페이지에는 `nextCursor`가 없을 수 있다.

```bash
nhncloud logncrash search \
  --query '*' \
  --from 1h --to now \
  --json | jq '.totalItems'

# 다음 cursor가 있을 때만 순차 조회
next_cursor="$(nhncloud logncrash search \
  --query '*' --from 1h --to now --json | jq -r '.nextCursor // empty')"
if [ -n "$next_cursor" ]; then
  nhncloud logncrash search \
    --query '*' --from 1h --to now \
    --cursor "$next_cursor" --json
fi
```

cursor는 파싱하거나 인코딩을 바꾸지 않고 받은 문자열 그대로 전달한다.
임의 페이지 이동은 지원하지 않으므로 `--page 1` 이상은 입력 오류다.

전송 직후에는 인덱싱 지연으로 잠시 0건이 나올 수 있다.
반복 검색이나 넓은 wildcard 검색은 시간 범위를 좁혀 확인한다.

## 대량 export

`logncrash export`는 검색 결과 전체를 scroll로 순회해 파일로 저장한다.
데이터는 stdout이 아니라 파일에 쓰고, 진행 상황은 stderr에 출력한다.

```bash
nhncloud logncrash export \
  --query '<lucene>' \
  --from 1h \
  --to now \
  --output logs.jsonl
```

옵션:

| 옵션 | 설명 |
|------|------|
| `--output <file>` | 필수. 출력 파일 |
| `--format json` | JSON 배열로 저장. 기본은 JSON Lines |
| `--force` | 기존 파일 덮어쓰기 |
| `--size <n>` | 폐기 예정 호환 옵션. 10~100 검증 후 경고하고 v3 요청에는 미전달 |

scroll 시작이나 계속 요청에서 서버가 500 응답을 반환하면 CLI가 해당 기간을 절반으로
줄여 자동으로 다시 시도한다. 성공한 기간 크기는 남은 구간에도 재사용하므로 사용자가
직접 기간을 나눠 호출할 필요가 없다.

더 나눌 수 없는 기간에서도 500 응답이 계속되거나 다른 오류가 발생하면 CLI가 원본
오류를 보존한다.
`--size`는 v3 scroll의 페이지 크기를 제어하지 않는다.

## 로그 전송

`logncrash send`는 collector host로 로그 한 건을 전송한다.
검색의 UAK OAuth Bearer 인증을 재사용하지 않는다.
인증 헤더 없이 body의 `projectName`에 appkey를 넣는다.

```bash
nhncloud logncrash send --body "batch finished" --level INFO
echo "batch finished" | nhncloud logncrash send --level INFO
nhncloud logncrash send --file ./error.log --level ERROR
```

입력 우선순위는 `--body` > `--file` > stdin이다.
본문이 없거나 비어 있으면 입력 오류다.
단일 로그 본문은 8MB 한도이며 초과 시 전송 전 차단된다.

옵션:

| 옵션 | 설명 |
|------|------|
| `--body <text>` | 로그 본문 |
| `--file <path>` | 본문 파일 |
| `--level <level>` | DEBUG, INFO, WARN, ERROR, FATAL |
| `--app-version <ver>` | projectVersion |
| `--source <s>` / `--type <t>` / `--host <h>` | 부가 필드 |
| `--profile <name>` | 사용할 profile |

`--json`이면 `{ ok: true, bytes }`를 stdout에 출력한다.

## 에러 코드

| 상황 | exit code |
|------|-----------|
| 검색 appkey 또는 공통 UAK 누락 | 4 |
| 인증 실패 | 2 |
| 시간 범위 초과, 본문 없음, 8MB 초과 | 3 |
| API 오류 또는 봉투 실패 | 1 |
