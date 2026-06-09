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

---

## instance — Compute 인스턴스 발급·조회·삭제

`instance` 명령군은 OpenStack Nova v2 호환 Compute API 를 호출한다.
Keystone v2 토큰 인증을 사용하며 토큰은 만료 전까지 region 별로 캐시한다.

### instance 설정

`nhncloud configure` 대화형 마법사에서 "iaas 자격증명도 설정하시겠습니까?" 에 응답하거나,
flag 로 직접 입력한다.

```bash
# 대화형 (권장)
nhncloud configure

# 비대화형 — API 비밀번호는 env 로 전달 (cmdline 노출 방지)
NHNCLOUD_IAAS_PASSWORD=<api-password> nhncloud configure \
  --iaas-tenant-id <tenant-id> \
  --iaas-username <iam-username> \
  --iaas-region kr1 \
  --no-verify
```

> **주의 (password)**: `--iaas-password` 에 입력하는 값은 NHN Cloud 콘솔 IAM 의 **API 비밀번호**입니다.
> NHN Cloud 로그인 비밀번호와 다릅니다.
> IAM 사용자 상세 페이지 → "API 비밀번호 설정"에서 별도로 발급합니다.
>
> **주의 (username)**: `--iaas-username` 은 NHN Cloud 계정 이메일 **또는 IAM 계정 ID(사번)** 입니다.
> tenantId 와 비슷한 32자리 hex "API 사용자 ID"(UUID)가 아닙니다 — 잘못 넣으면 `Could not find user` 인증 실패가 납니다.

저장 위치: `~/.nhncloud/credentials.json` 의 `profiles.<profile>.iaas` 블록.

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "iaas": {
        "tenantId": "<tenant-id>",
        "username": "<iam-username>",
        "password": "<api-password>",
        "region": "kr1"
      }
    }
  }
}
```

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 인스턴스 목록 조회 | `nhncloud instance list` |
| 인스턴스 타입(flavor) 목록 | `nhncloud instance flavors` |
| 인스턴스 타입 상세 (스펙 포함) | `nhncloud instance flavors --detail` (전체 필드는 `--json`) |
| 특정 인스턴스 상태 조회 | `nhncloud instance get <id>` |
| 인스턴스 생성 (즉시 반환) | `nhncloud instance create --name <name> --flavor <id> --image <id> --network <uuid>` |
| 인스턴스 생성 + ACTIVE 대기 | `nhncloud instance create ... --wait` |
| GPU 인스턴스 생성 | `nhncloud instance create --flavor <gpu-flavor-id> --boot-volume-size <gb> ...` (GPU 는 boot-from-volume 필수) |
| 인스턴스 삭제 (confirm 없이) | `nhncloud instance delete <id> --yes` |
| 다른 region 사용 | `nhncloud instance list --region kr2` |
| 다른 profile 사용 | `nhncloud instance list --profile staging` |

### instance flavors 조회

- `nhncloud instance flavors` — 인스턴스 타입 id·name 목록.
  create 의 `--flavor` 에 넣을 id 를 고를 때 사용한다.
- `--detail` 로 vcpus·ram(MB)·disk(GB) 스펙을 확인한다.
  테이블은 핵심 5컬럼이며, is_public·extra_specs 등 나머지 필드는 `--json` 으로 확인한다.
- `--min-disk <gb>` / `--min-ram <mb>` 로 조건에 맞는 타입만 필터한다.

### instance create 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--name <name>` | 예 | 인스턴스 이름 |
| `--flavor <id>` | 예 | flavor ID (CPU/메모리 사양. GPU 발급 시 GPU flavor ID 지정) |
| `--image <id>` | 예 | 이미지 ID |
| `--network <uuid>` | 예 | 네트워크 UUID (반복 지정으로 여러 개 가능) |
| `--boot-volume-size <gb>` | 조건부 | boot-from-volume root 볼륨 크기(GB). **GPU(g2) 등 일부 flavor 는 필수** (없으면 `Missing Block Device Mapping` 발급 실패). 미지정 시 로컬 디스크 부팅 |
| `--key-name <name>` | 아니오 | 키페어 이름 |
| `--security-group <name>` | 아니오 | 보안 그룹 이름 (반복 지정) |
| `--ephemeral-disk-size <gb>` | 아니오 | 임시 디스크 크기(GB, NHN 확장) |
| `--protect` | 아니오 | 삭제 방지 설정 (NHN 확장) |
| `--user-data <path>` | 아니오 | cloud-init user-data 파일 경로. base64 인코딩해 `user_data` 주입 (인코딩 후 65535 바이트 한도, 초과 시 입력 오류). 부팅 시 드라이버·패키지 자동 셋업에 사용 |
| `--wait` | 아니오 | ACTIVE 상태 + IP 할당까지 대기 |
| `--timeout <sec>` | 아니오 | wait 타임아웃 (초, 기본 300) |
| `--region <region>` | 아니오 | region override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

### 체이닝 예시

```bash
# 1. 인스턴스 생성 후 ACTIVE + IP 대기 → IP 추출 → SSH 접속
IP=$(nhncloud instance create \
  --name ci-runner \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --wait --quiet)
ssh ubuntu@"$IP" "echo ready"

# 2. --wait --json 으로 전체 필드 취득 후 jq 로 IP 파싱
nhncloud instance create \
  --name ci-runner \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --wait --json | jq -r '.addresses | to_entries[0].value[0].addr'

# 3. 사용 후 삭제 (ephemeral CI 패턴)
nhncloud instance delete "$INSTANCE_ID" --yes

# 4. 목록에서 id 만 추출
nhncloud instance list --quiet

# 5. cloud-init 으로 부팅 시 셋업 자동화 (일회성 GPU CI 러너)
nhncloud instance create \
  --name gpu-ci \
  --flavor <gpu-flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --boot-volume-size 30 \
  --user-data ./setup-nvidia-docker.yaml \
  --wait --quiet
```

### instance 에러 코드

| 상황 | exit code |
|------|-----------|
| iaas 자격증명 누락·불완전 | 4 (CONFIG_ERROR) |
| Keystone 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| 미등록 region / 필수 옵션 누락 | 3 (PARAM_ERROR) |
| API 오류 / waitForActive 타임아웃 | 1 (API_ERROR) |
| 비대화형 delete 에서 --yes 미지정 | 3 (PARAM_ERROR) |
