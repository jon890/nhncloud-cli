# User Flow — nhncloud-cli

## 최초 설정 — `nhncloud configure`

대화형 마법사로 자격증명을 설정한다 ([[adr-009]]).

```bash
nhncloud configure                    # 기본 profile 대화형
nhncloud configure --profile playground
```

### 대화형 흐름

1. profile 이름 (기본 `default`)
2. 개인 UAK — id, secret (password 입력)
3. 서비스별 자격증명 — logncrash appkey, secret (건너뛰기 가능)
4. 연결 테스트 (UAK → OAuth 발급, logncrash → 최소 검색)
5. 기존 값과 머지 저장 (`credentials.json` 0600, all-or-nothing)

### 비대화형 (flag — CI·자동화)

flag 가 하나라도 있으면 비대화형으로 동작한다.

```bash
nhncloud configure --profile playground \
  --uak-id <id> --uak-secret <secret> \
  --logncrash-appkey <k> --logncrash-secret <s> \
  [--no-verify]
```

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 대상 profile (기본 default) |
| `--uak-id` / `--uak-secret` | 개인 UAK |
| `--logncrash-appkey` / `--logncrash-secret` | logncrash 자격증명 |
| `--no-verify` | 연결 테스트 생략 |

### 연결 테스트

- UAK — OAuth `token/create` 호출 성공 여부로 검증
- logncrash — 짧은 범위(예: 1분) 검색 호출로 인증(401/403) 검증
- 실패 시 저장 여부를 다시 확인 (또는 비대화형은 비-0 종료)

## logncrash search 흐름

```bash
nhncloud logncrash search \
  --query 'logType:"NORMAL"' \
  --from '1h' \
  --to now
```

### 명령 시그니처

```
nhncloud logncrash search [options]
```

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열. API 에 그대로 전달 |
| `--from <time>` | 예 | 검색 시작. ISO8601 또는 상대시간 (`1h`/`30m`/`2d`/`now`) |
| `--to <time>` | 예 | 검색 끝. 형식 동일 |
| `--page <n>` | 아니오 | pageNumber (기본 0) |
| `--size <n>` | 아니오 | pageSize (기본 10, 최대 100) |
| `--profile <name>` | 아니오 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 시간 입력 해석

- 상대시간 (`1h`/`30m`/`2d`) 과 `now` 는 호출 시점 기준으로 ISO8601 로 변환해 API 전달.
- ISO8601 직접 입력은 그대로 통과.
- API 제약: 최근 90일 이내, 범위 31일 이하 (초과 시 사전 에러).

### 출력

- 기본(테이블): 고정 컬럼 `logTime` / `logType` / 본문 요약.
- `--json`: API `body` 의 `data` 배열 raw + 페이지 메타.
- `--quiet`: 자동화용 최소 출력 (행별 핵심 식별 정보).

### 에러 경로

| 상황 | exit code |
|------|-----------|
| 자격증명 누락 | `EXIT_CONFIG_ERROR` |
| `X-LNCS-SECRET` 인증 실패 (401/403) | `EXIT_AUTH_ERROR` |
| 봉투 `isSuccessful: false` / 기타 4xx·5xx | `EXIT_API_ERROR` |
| 시간 범위 초과 등 입력 오류 | `EXIT_PARAM_ERROR` |

## deploy 흐름

배포 좌표는 `config.json` 의 named target 으로 참조하고, OAuth 토큰은 캐시한다 ([[adr-007]], [[adr-008]]).

### 인증 흐름

1. profile 공통 `userAccessKey` 블록에서 UAK(id+secret) 로드 ([[adr-004]])
2. 캐시된 access_token 이 만료 전이면 재사용, 아니면 OAuth 교환 후 캐시
3. `X-NHN-AUTHORIZATION: Bearer <token>` 로 Deploy API 호출

### 명령 시그니처

```
nhncloud deploy run <target> [options]      # 배포 실행
nhncloud deploy artifacts [options]          # 아티팩트 목록
nhncloud deploy server-groups <target> [options]   # 서버그룹 목록
nhncloud deploy histories <target> [options]       # 배포 이력
```

`<target>` 은 config.json 의 deploy target 이름. target 이 좌표(appKey·artifactId·serverGroupId·scenarioIds)를 공급하며, 아래 flag 로 개별 override.

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--app-key <k>` | 전체 | target 의 appKey override |
| `--artifact-id <id>` | 전체 | target 의 artifactId override |
| `--server-group-id <id>` | run, server-groups | target override |
| `--scenario-ids <csv>` | run | target override |
| `--target-hosts <csv>` | run | 대상 호스트. 생략 시 서버그룹 전체 |
| `--concurrent <n>` | run | 병렬 배포 수 (기본 1) |
| `--next-when-fail` | run | 시나리오 실패 시에도 진행 |
| `--note <s>` | run | 배포 메모 (기본 timestamp) |
| `--async` | run | 즉시 반환 (기본은 완료 대기) |
| `--profile <name>` | 전체 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### run 동기/비동기

- 기본 `async=false` — 서버가 배포 완료까지 응답 보류 (CLI 자체 폴링 없음).
- `--async` — `async=true` 로 즉시 반환 (status `deploying`).
- 동기 모드는 배포가 길면 ky timeout 을 늘려야 한다 (구현 시 고려).

### deploy 에러 경로

| 상황 | exit code |
|------|-----------|
| UAK 누락 / OAuth 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| target 미존재 (config 에 없음) | `EXIT_PARAM_ERROR` |
| Deploy API 4xx·5xx / 봉투 실패 | `EXIT_API_ERROR` |
