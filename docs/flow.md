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
