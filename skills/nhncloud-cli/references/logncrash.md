# Log & Crash Reference

`logncrash` 명령군은 Log & Crash Search 검색, scroll export, collector 전송을 다룬다.

## 검색

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
| `--page <n>` | 아니오 | pageNumber. 기본 0 |
| `--size <n>` | 아니오 | pageSize. 기본 10, 최대 100 |
| `--profile <name>` | 아니오 | 사용할 profile |

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

## 검색 출력

`--json` 출력은 `{ totalItems, pageNumber, pageSize, data }` 객체다.

```bash
nhncloud logncrash search \
  --query '*' \
  --from 1h --to now \
  --json | jq '.totalItems'
```

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
| `--size <n>` | scroll pageSize. 10~100 |

scrollKey는 1분 만료다.
데이터가 많아 다음 호출까지 1분을 넘기면 만료될 수 있다.
이 경우 검색 범위를 좁히거나 `--size`를 키워 페이지 수를 줄인다.

## 로그 전송

`logncrash send`는 collector host로 로그 한 건을 전송한다.
검색과 달리 secret 헤더를 쓰지 않고, body의 `projectName`에 appkey를 넣는다.

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
| appkey 또는 secret 누락 | 4 |
| 인증 실패 | 2 |
| 시간 범위 초과, 본문 없음, 8MB 초과 | 3 |
| API 오류 또는 봉투 실패 | 1 |
