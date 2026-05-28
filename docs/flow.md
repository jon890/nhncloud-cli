# User Flow — nhncloud-cli

## 최초 설정

v1 은 설정 마법사 없이 자격증명 파일을 직접 작성한다 (후속 `nhncloud configure` 도입 검토).

```jsonc
// ~/.nhncloud/credentials.json (mode 0600)
{
  "version": 1,
  "profiles": {
    "default": {
      "logncrash": { "appkey": "<appkey>", "secret": "<secretkey>" }
    }
  }
}
```

appkey·secret 은 Log & Crash 콘솔의 프로젝트 설정에서 확인.

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

1. profile 의 deploy 블록에서 UAK(id+secret) 로드
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
