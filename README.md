# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 통합 CLI.
현재 `logncrash search` (Log & Crash 로그 검색) 를 지원한다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정

`~/.nhncloud/credentials.json` 을 직접 작성한다 (권한 0600 권장).

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "logncrash": { "appkey": "<appkey>", "secret": "<secretkey>" }
    }
  }
}
```

appkey 와 secret 은 NHN Cloud 콘솔의 Log & Crash Search 프로젝트 설정에서 확인한다.
기본 profile 은 선택적으로 `~/.nhncloud/config.json` 의 `defaultProfile` 로 지정할 수 있다.

profile 해석 우선순위: `--profile` 옵션 > `NHNCLOUD_PROFILE` 환경변수 > `config.defaultProfile` > `"default"`.

## 사용 예

### 배포 (Deploy)

`~/.nhncloud/credentials.json` 에 deploy UAK 블록을 추가한다.

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "deploy": {
        "uakId": "<user-access-key-id>",
        "uakSecret": "<user-access-key-secret>"
      }
    }
  }
}
```

`~/.nhncloud/config.json` 에 deploy target (배포 좌표)을 추가한다.

```json
{
  "version": 1,
  "deploy": {
    "targets": {
      "my-service": {
        "appKey": "<appKey>",
        "artifactId": "<artifactId>",
        "serverGroupId": "<serverGroupId>",
        "scenarioIds": "<id1,id2>"
      }
    }
  }
}
```

```bash
# 배포 실행 (동기 완료 대기)
nhncloud deploy run my-service

# 즉시 반환 (비동기)
nhncloud deploy run my-service --async

# 특정 호스트만 배포
nhncloud deploy run my-service --target-hosts host1,host2

# 아티팩트 목록 조회
nhncloud deploy artifacts my-service

# 서버그룹 목록 조회
nhncloud deploy server-groups my-service

# 배포 이력 조회
nhncloud deploy histories my-service
```

### 로그 검색

```bash
# 최근 1시간 NORMAL 로그
nhncloud logncrash search \
  --query 'logType:"NORMAL"' \
  --from 1h \
  --to now
```

시간은 상대시간 (`1h` / `30m` / `2d` / `now`) 또는 ISO8601 (`2026-05-01T00:00:00+09:00`) 로 입력한다.
API 제약상 검색 시작은 최근 90일 이내, 검색 범위는 31일 이하여야 한다 (초과 시 입력 오류로 거절).

### 출력 모드

| 모드 | 옵션 | 용도 |
|------|------|------|
| 테이블 | (기본) | 사람이 읽는 고정 컬럼 출력 |
| JSON | `--json` | 자동화·AI 에이전트용 raw 데이터 + 페이지 메타 |
| quiet | `--quiet` | 행별 최소 출력 |

### 체이닝 예시

```bash
# 검색 결과에서 logBody 만 추출
nhncloud logncrash search --query '*' --from 1h --to now --json | jq -r '.data[].logBody'

# 전체 건수 확인
nhncloud logncrash search --query '*' --from 1d --to now --json | jq '.totalItems'
```

## 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열 |
| `--from <time>` | 예 | 검색 시작 (ISO8601 또는 상대시간) |
| `--to <time>` | 예 | 검색 끝 |
| `--page <n>` | 아니오 | pageNumber (기본 0) |
| `--size <n>` | 아니오 | pageSize (기본 10, 최대 100) |
| `--profile <name>` | 아니오 | 사용할 profile |

전역 옵션: `--json` / `--quiet` / `--no-color`.

## 종료 코드

| 코드 | 의미 |
|:---:|------|
| 0 | 성공 |
| 1 | API 오류 |
| 2 | 인증 실패 (401/403) |
| 3 | 입력 오류 (파라미터·시간 범위) |
| 4 | 설정 오류 (자격증명 누락) |

## 개발

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크
node dist/index.js logncrash search --help
```
