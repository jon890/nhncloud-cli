---
name: nhncloud-cli
description: NHN Cloud 서비스 CLI. 자격증명 설정(configure), Log & Crash 로그 검색(logncrash search), Deploy 배포 실행 등 NHN Cloud PaaS API 를 터미널·AI 에이전트에서 호출한다.
---

# nhncloud-cli

NHN Cloud PaaS 서비스를 AWS CLI 방식으로 호출하는 TypeScript CLI.
`configure`, `logncrash search`, `deploy` 명령을 지원한다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정 — `nhncloud configure`

**첫 설정은 `nhncloud configure` 로 한다.**
대화형 마법사가 profile → UAK → logncrash 순으로 안내하고 저장 전 연결을 테스트한다.

```bash
# 기본 profile 대화형 설정
nhncloud configure

# 특정 profile 대화형 설정
nhncloud configure --profile staging

# CI/자동화 — flag 로 비대화형 설정
nhncloud configure \
  --uak-id <id> --uak-secret <secret> \
  --logncrash-appkey <key> --logncrash-secret <secret> \
  [--no-verify]
```

### configure 옵션

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 대상 profile (기본 `default`) |
| `--uak-id <id>` | 개인 UAK ID |
| `--uak-secret <secret>` | 개인 UAK Secret |
| `--logncrash-appkey <key>` | logncrash appkey |
| `--logncrash-secret <secret>` | logncrash secret |
| `--no-verify` | 연결 테스트 생략 |

저장 파일 구조 (`~/.nhncloud/credentials.json`, mode 0600):

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "userAccessKey": {
        "id": "<uak-id>",
        "secret": "<uak-secret>"
      },
      "logncrash": {
        "appkey": "<appkey>",
        "secret": "<secretkey>"
      }
    }
  }
}
```

UAK 는 NHN Cloud 콘솔 → 계정 → User Access Key 에서 발급한다.
logncrash appkey 와 secret 은 콘솔 → Log & Crash Search → 프로젝트 설정에서 확인한다.

선택적으로 `~/.nhncloud/config.json` 으로 기본 profile 을 지정할 수 있다.

```json
{
  "version": 1,
  "defaultProfile": "default"
}
```

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 사람이 읽기 좋은 테이블 | 기본 |
| `--json` | JSON 출력 (stdout) | 파싱, 체이닝 |
| `--quiet` | 핵심 식별자만 출력 | 스크립팅 |

**AI 에이전트는 `--json` 을 사용하여 구조화된 데이터를 파싱하라.**

---

## 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 최초 자격증명 설정 | `nhncloud configure` |
| CI/자동화 자격증명 설정 | `nhncloud configure --uak-id <id> --uak-secret <secret> --no-verify` |
| 최근 1시간 로그 검색 | `nhncloud logncrash search --query '*' --from 1h --to now` |
| 특정 logType 필터 검색 | `nhncloud logncrash search --query 'logType:"ERROR"' --from 1h --to now` |
| 시간 범위 지정 검색 | `nhncloud logncrash search --query '*' --from 2024-01-01T00:00:00+09:00 --to 2024-01-01T12:00:00+09:00` |
| 페이지네이션 | `nhncloud logncrash search --query '*' --from 1h --to now --page 1 --size 50` |
| 다른 profile 사용 | `nhncloud logncrash search --query '*' --from 1h --to now --profile staging` |

## logncrash search 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열. API 에 그대로 전달 |
| `--from <time>` | 예 | 검색 시작. ISO8601 또는 상대시간 |
| `--to <time>` | 예 | 검색 끝. 형식 동일 |
| `--page <n>` | 아니오 | pageNumber (기본 0) |
| `--size <n>` | 아니오 | pageSize (기본 10, 최대 100) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

전역 옵션: `--json` / `--quiet` / `--no-color`

## 시간 입력 형식

- 상대시간: `1h` (1시간 전), `30m` (30분 전), `2d` (2일 전), `now` (현재)
- ISO8601 직접 입력: `2024-01-01T00:00:00+09:00`

API 제약:

- 검색 시작(`--from`)은 최근 90일 이내여야 한다.
- 검색 범위(`--to` - `--from`)는 31일 이하여야 한다.

## 체이닝 예시

```bash
# 오류 로그 추출 후 jq 로 본문만 보기
nhncloud logncrash search \
  --query 'logType:"ERROR"' \
  --from 1h --to now \
  --json | jq '.data[].logBody'

# 전체 건수만 확인
nhncloud logncrash search \
  --query '*' \
  --from 1h --to now \
  --json | jq '.totalItems'
```

## 에러 코드

| 상황 | exit code |
|------|-----------|
| 자격증명 파일 없음·형식 오류 | 4 (CONFIG_ERROR) |
| 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| API 오류 / 봉투 isSuccessful:false | 1 (API_ERROR) |
| 시간 범위 초과·필수 옵션 누락 | 3 (PARAM_ERROR) |

---

## deploy — NHN Cloud Deploy 배포 실행

`deploy` 명령군은 NHN Cloud Deploy v2.1 API 를 호출한다.
UAK(User Access Key) 를 OAuth `client_credentials` 로 교환한 Bearer 토큰으로 인증하며, 토큰은 만료 전까지 캐시한다.

### deploy 설정

**`~/.nhncloud/credentials.json`** 에 profile 공통 `userAccessKey` 블록을 추가한다.
`nhncloud configure` 로 설정하는 것을 권장한다.

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "userAccessKey": {
        "id": "<user-access-key-id>",
        "secret": "<user-access-key-secret>"
      }
    }
  }
}
```

**`~/.nhncloud/config.json`** 에 deploy target 추가 (배포 좌표 — 비밀 아님):

```json
{
  "version": 1,
  "defaultProfile": "default",
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

UAK 는 NHN Cloud 콘솔 → 계정 → User Access Key 에서 발급한다.
배포 좌표(appKey·artifactId·serverGroupId·scenarioIds)는 Deploy 콘솔에서 확인한다.

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 배포 실행 (동기 완료 대기) | `nhncloud deploy run my-service` |
| 배포 실행 (즉시 반환) | `nhncloud deploy run my-service --async` |
| 특정 호스트만 배포 | `nhncloud deploy run my-service --target-hosts <host1,host2>` |
| 아티팩트 목록 조회 | `nhncloud deploy artifacts my-service` |
| 서버그룹 목록 조회 | `nhncloud deploy server-groups my-service` |
| 배포 이력 조회 | `nhncloud deploy histories my-service` |
| 다른 profile 사용 | `nhncloud deploy run my-service --profile staging` |

### deploy run 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `<target>` | 예 | config.json 의 deploy target 이름 |
| `--app-key <k>` | 아니오 | target 의 appKey override |
| `--artifact-id <id>` | 아니오 | target 의 artifactId override |
| `--server-group-id <id>` | 아니오 | target 의 serverGroupId override |
| `--scenario-ids <csv>` | 아니오 | target 의 scenarioIds override |
| `--target-hosts <csv>` | 아니오 | 대상 호스트 (생략 시 서버그룹 전체) |
| `--concurrent <n>` | 아니오 | 병렬 배포 수 (기본 1) |
| `--next-when-fail` | 아니오 | 시나리오 실패 시에도 진행 |
| `--note <s>` | 아니오 | 배포 메모 |
| `--async` | 아니오 | 즉시 반환 (기본은 완료 대기) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

**동기 모드 (`--async` 미지정, 기본값)**: 서버가 배포 완료까지 응답을 보류한다.
긴 배포는 수 분이 걸릴 수 있으나 CLI 자체 폴링 없이 응답을 기다린다.

**비동기 모드 (`--async`)**: 즉시 `deploying` 상태를 반환한다.
완료 확인은 `deploy histories` 로 한다.

### 체이닝 예시

```bash
# artifactId 확인 후 배포 실행
nhncloud deploy artifacts my-service --json | jq -r '.[0].artifactId'

# 특정 아티팩트로 override 하여 배포
nhncloud deploy run my-service --artifact-id <artifactId>

# 배포 이력에서 최근 상태만 확인
nhncloud deploy histories my-service --json | jq '.[0] | {deployKey, deployStatus}'
```

### deploy 에러 코드

| 상황 | exit code |
|------|-----------|
| UAK 누락 / config target 없음 | 4 (CONFIG_ERROR) 또는 3 (PARAM_ERROR) |
| OAuth 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| Deploy API 오류 / 봉투 실패 | 1 (API_ERROR) |
