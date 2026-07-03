---
name: nhncloud-cli
description: NHN Cloud 서비스 CLI. 자격증명 설정(configure), Log & Crash 로그 검색·전송(logncrash search/send/export), Deploy 배포 실행·바이너리 그룹·바이너리 목록 조회·업로드·다운로드(deploy upload/download), Compute 인스턴스 관리(instance), VPC·서브넷 조회(network), Block Storage(volume), Floating IP(floatingip), NHN Container Registry(ncr), NHN Kubernetes Service(nks supports/cluster/nodegroup/addon/kubeconfig) 등 NHN Cloud API 를 터미널·AI 에이전트에서 호출한다.
---

# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 TypeScript CLI.
`configure`, `logncrash search/send/export`, `deploy`, `instance`, `network`, `volume`, `floatingip`, `ncr`, `nks` 명령을 지원한다.

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
| `--ncr-appkey <key>` | NCR(Container Registry) appkey |
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
단, `--json`은 CLI 출력 계약이며 API 원본 래퍼를 그대로 보존하지 않을 수 있다.

| 명령 | `--json` 출력 shape |
|------|---------------------|
| `logncrash search` | `{ totalItems, pageNumber, pageSize, data }` 객체 |
| `deploy binary-groups` | `binaryGroups` 래퍼를 언랩한 배열 |
| `deploy binaries` | `{ totalCount, binaries }` 객체 |
| `instance list` | `servers` 래퍼를 언랩한 server 배열 |
| `instance get` | `server` 래퍼를 언랩한 단일 server 객체 |
| `instance flavors` | `flavors` 래퍼를 언랩한 flavor 배열 |
| `instance images` | `images` 래퍼를 언랩한 image 배열 |
| `instance availability-zones` | `availabilityZoneInfo` 래퍼를 언랩한 배열 |
| `instance keypairs` | `keypairs[].keypair`를 flatten한 keypair 배열 |
| `network list` | VPC 배열 |
| `network subnet list` | subnet 배열 |
| `volume list` | volume 배열 |
| `volume get` | 단일 volume 객체 |
| `floatingip list` | floating IP 배열 |
| `ncr list` | `registries` 래퍼를 언랩한 registry 배열 |
| `ncr get` | `registry` 래퍼를 언랩한 단일 registry 객체 |
| `ncr images` | repository 배열 |
| `ncr tags` | tag 배열 |
| `nks supports` | 지원 Kubernetes version / event type 객체 |
| `nks cluster list` | cluster 배열 |
| `nks nodegroup list` | nodegroup 배열 |
| `nks addon-type list` | addon type 배열 |
| `nks addon list` | addon 배열 |
| `nks cluster addon list` | cluster addon 배열 |

예: `nhncloud instance get <instance-id> --json`은 `.server.status`가 아니라 `.status`를 읽는다.

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
| 로그 대량 추출 (파일로) | `nhncloud logncrash export --query '<lucene>' --from 1h --to now --output logs.jsonl` |
| Log & Crash 로그 전송 | `nhncloud logncrash send --body "<메시지>" --level INFO` |
| NCR 레지스트리 목록 조회 | `nhncloud ncr list --app-key <appkey>` |
| NCR 레지스트리 목록 (JSON 파싱용) | `nhncloud ncr list --app-key <appkey> --json` |
| NCR 단일 레지스트리 조회 | `nhncloud ncr get <registry-name> --app-key <appkey>` |
| NCR 이미지(repository) 목록 조회 | `nhncloud ncr images <registry>` |
| NCR 이미지 목록 (JSON) | `nhncloud ncr images <registry> --json` |
| NCR 태그 목록 조회 | `nhncloud ncr tags <registry> <repository>` |
| NCR 태그 목록 (JSON) | `nhncloud ncr tags <registry> <repository> --json` |
| NKS 지원 버전 조회 | `nhncloud nks supports --json` |
| NKS 클러스터 목록 조회 | `nhncloud nks cluster list --json` |
| NKS kubeconfig 저장 | `nhncloud nks cluster kubeconfig <cluster> --output ./kubeconfig` |
| NKS 노드 그룹 목록 조회 | `nhncloud nks nodegroup list <cluster> --json` |
| NKS 애드온 목록 조회 | `nhncloud nks addon list --k8s-version v1.30.1 --json` |
| NKS 클러스터 애드온 설치 | `nhncloud nks cluster addon install <cluster> --name coredns --version 1.0.0 --resolve-conflicts overwrite` |

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

`--query` 는 Log & Crash Search API 의 Lucene 쿼리 원문이다.
콘솔의 body 키워드 검색처럼 쓰고 싶으면 필드를 명시한다.

| 의도 | 쿼리 |
|------|------|
| body 단어 검색 | `body:request_received` |
| body 부분 문자열 검색 | `body:*request_received*` |
| logType 검색 | `logType:"ERROR"` |

전송 직후에는 인덱싱 지연으로 잠시 0건이 나올 수 있다.
반복 검색이나 넓은 wildcard 검색은 API rate limit 에 걸릴 수 있으므로 시간 범위를 좁혀 확인한다.

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

### logncrash export (대량 추출)

- `nhncloud logncrash export` — 검색 결과 전체를 파일로 내보낸다.
  단발 검색(search)이 한 페이지만 보여주는 것과 달리, scroll 로 전체(최대 10만 건)를 순회한다.
- `--output <file>` 필수. 기본은 JSON Lines(한 줄당 한 로그), `--format json` 이면 JSON 배열. 기존 파일은 기본 거부 — 덮어쓰려면 `--force`.
- 진행 상황은 stderr, 데이터는 파일에만 쓴다(stdout 비움).
- scrollKey 는 1분 만료 — 데이터가 많아 1분을 넘기면 만료 에러가 난다.
  이때는 검색 범위를 좁히거나 `--size`(범위 10~100, 기본 100)를 키워 페이지 수를 줄인 뒤 다시 시도한다.
- 시간 범위 제한은 search 와 동일(90일 이내·31일 이하).

### logncrash send 전송

- `nhncloud logncrash send --body "<메시지>"` — 로그 한 건을 Log & Crash 로 전송한다.
  본문은 `--body`, 또는 `--file <path>`, 또는 stdin(파이프) 으로 전달한다.
- `--level` 로 DEBUG/INFO/WARN/ERROR/FATAL 을 지정한다.
  `--app-version`(projectVersion)·`--source`/`--type`/`--host` 로 부가 필드를 설정한다.
- 검색과 달리 collector 로 전송하며 **appkey 만 사용**한다 (secret 불요·ADR-014).
  단일 로그 본문은 8MB 한도이며 초과 시 입력 오류로 차단된다.

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
| 바이너리 그룹 목록 | `nhncloud deploy binary-groups <target>` |
| 바이너리 목록 | `nhncloud deploy binaries <target> --binary-group <key>` (전체 필드는 `--json`) |
| 바이너리 업로드 | `nhncloud deploy upload <target> --file <path> --binary-group <key>` |
| 바이너리 다운로드 | `nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o <file>` |
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

### deploy 바이너리 조회

- `nhncloud deploy binary-groups <target>` — 아티팩트의 바이너리 그룹 목록을 조회한다.
  출력의 key 를 binaries 입력으로 쓴다.
- `nhncloud deploy binaries <target> --binary-group <key>` — 해당 그룹의 바이너리 목록을 조회한다.
  컬럼: version·binaryName·size(bytes)·uploadDate·uploader.
  `--binary-group` 은 필수다.
- 정렬은 `--sort-key UPLOAD_DATE --sort-direction DESC`, 페이지는 `--page-num` / `--page-size`.
- size 는 bytes 정수이며 KB/MB 변환 없이 원시값으로 출력한다.
  정밀값은 `--json` 으로 확인한다.

### deploy 바이너리 전송

- `nhncloud deploy upload <target> --file <path> --binary-group <key>` — 로컬 파일을 바이너리 그룹에 업로드 (multipart). `--application-type`(기본 server) · `--description` 선택. 출력의 binaryKey 를 download 입력으로 쓴다. `--quiet` 면 binaryKey 만.
- `nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o <file>` — 바이너리를 파일로 저장. 대상이 이미 있으면 기본 거부, `--force` 로 덮어쓴다.
- 그룹 key 와 바이너리 key 는 `deploy binary-groups` / `deploy binaries` 로 확인한다.

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
| 이미지 목록 조회 | `nhncloud instance images` (create --image 소스, 전체 필드는 `--json`) |
| 특정 노출 범위 이미지 | `nhncloud instance images --visibility public` |
| 인스턴스 타입(flavor) 목록 | `nhncloud instance flavors` |
| 가용성 영역 목록 | `nhncloud instance availability-zones` |
| 인스턴스 타입 상세 (스펙 포함) | `nhncloud instance flavors --detail` (전체 필드는 `--json`) |
| 키페어 목록 | `nhncloud instance keypairs` |
| 키페어 생성 (키 저장) | `nhncloud instance keypair create <keypair-name> -o ./key.pem` |
| 키페어 삭제 | `nhncloud instance keypair delete <keypair-name>` |
| 특정 인스턴스 상태 조회 | `nhncloud instance get <id>` |
| 인스턴스 생성 (즉시 반환) | `nhncloud instance create --name <name> --flavor <id> --image <id> --network <uuid>` |
| 인스턴스 생성 + ACTIVE 대기 | `nhncloud instance create ... --wait` |
| GPU 인스턴스 생성 | `nhncloud instance create --flavor <gpu-flavor-id> --boot-volume-size <gb> ...` (GPU 는 boot-from-volume 필수) |
| 인스턴스 삭제 (confirm 없이) | `nhncloud instance delete <id> --yes` |
| 인스턴스 시작 | `nhncloud instance start <id>` |
| 인스턴스 정지 | `nhncloud instance stop <id>` |
| 인스턴스 재부팅 | `nhncloud instance reboot <id>` (`--hard` 로 HARD) |
| 인스턴스 타입 변경 | `nhncloud instance resize <id> --flavor <flavor-id>` |
| resize 확정 | `nhncloud instance resize-confirm <id>` |
| resize 롤백 | `nhncloud instance resize-revert <id>` |
| 다른 region 사용 | `nhncloud instance list --region kr2` |
| 다른 profile 사용 | `nhncloud instance list --profile staging` |

### instance 전원 제어 (start / stop / reboot)

- `nhncloud instance start <id>` — 정지된(SHUTOFF) 인스턴스를 켠다 (→ ACTIVE).
- `nhncloud instance stop <id>` — 동작 중인(ACTIVE) 인스턴스를 끈다 (→ SHUTOFF).
- `nhncloud instance reboot <id>` — 재부팅한다. 기본은 SOFT(OS graceful), `--hard` 는 강제 전원 cycle.
- 세 명령 모두 요청만 보내고(202 무본문) 상태 전이는 비동기다. 전이 확인은 `nhncloud instance get <id>` 로 한다.

### instance 타입 변경 (resize)

- `nhncloud instance resize <id> --flavor <flavor-id>` — 인스턴스 타입(flavor)을 바꾼다. 사전 상태는 ACTIVE 또는 SHUTOFF.
- 변경할 `<flavor-id>` 는 `nhncloud instance flavors --detail` 로 후보를 조회해 고른다 (vcpus·ram·disk 비교).
- resize 후 인스턴스는 VERIFY_RESIZE 에서 멈춘다. `resize-confirm <id>` 로 새 flavor 를 고정하거나 `resize-revert <id>` 로 롤백한다.
- 상태 전이는 비동기다 — `nhncloud instance get <id>` 로 status 를 확인한다.

### instance keypair 관리

- `nhncloud instance keypairs` — 키페어 name·fingerprint 목록.
  create 의 `--key-name` 에 넣을 키를 고를 때 사용한다.
- `nhncloud instance keypair create <keypair-name> -o <keyfile>` — NHN 이 키쌍을 생성하고 private_key 를 `<keyfile>` 에 mode 0600 으로 저장한다.
  **private_key 는 생성 시 한 번만 받을 수 있으므로** 자동화에서는 항상 `-o` 로 저장한다.
- `--public-key <path|key>` 로 기존 공개키를 등록하면 private_key 는 반환되지 않는다.
- `nhncloud instance keypair delete <keypair-name>` — 삭제.

### instance flavors 조회

- `nhncloud instance flavors` — 인스턴스 타입 id·name 목록.
  create 의 `--flavor` 에 넣을 id 를 고를 때 사용한다.
- `--detail` 로 vcpus·ram(MB)·disk(GB) 스펙을 확인한다.
  테이블은 핵심 5컬럼이며, is_public·extra_specs 등 나머지 필드는 `--json` 으로 확인한다.
- `--min-disk <gb>` / `--min-ram <mb>` 로 조건에 맞는 타입만 필터한다.

### instance availability-zones 조회

- `nhncloud instance availability-zones` — 가용성 영역 목록(zoneName·available). 인스턴스 발급 가능한 영역을 확인할 때. (현재 `instance create` 에는 `--availability-zone` 옵션이 없다 — 영역 정보 참고용.)
- `available` 이 false 인 영역은 신규 발급이 막혀 있으니 true 인 영역을 참고한다.
- 전체 응답(zoneState 등)은 `--json` 으로 확인한다.

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

---

## network — VPC·서브넷 조회

`network` 명령군은 NHN VPC API 를 호출한다.
`instance` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유하므로 별도 설정이 필요 없다.

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| VPC 목록 조회 | `nhncloud network list` (전체 필드는 `--json`) |
| 서브넷 목록 조회 | `nhncloud network subnet list` |
| 다른 region VPC | `nhncloud network list --region kr2` |
| VPC id 를 instance create 에 사용 | `nhncloud instance create ... --network <network-uuid>` |

> **`--network` 가 받는 uuid**: `network list` 의 **VPC id** 를 그대로 사용한다 (subnet id 아님, 실측 확정).
> VPC id 를 `--quiet` 로 추출해 create 로 파이프하는 흐름을 지원한다.

### 체이닝 예시

```bash
# VPC id 한 줄씩 (--quiet)
nhncloud network list --quiet

# 서브넷 id·CIDR 확인
nhncloud network subnet list --json | jq '.[] | {id, cidr, vpc_id}'

# VPC 선택 후 인스턴스 생성
nhncloud instance create \
  --name web \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --wait --quiet
```

### network 에러 코드

| 상황 | exit code |
|------|-----------|
| iaas 자격증명 누락·불완전 | 4 (CONFIG_ERROR) |
| Keystone 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| 미등록 region | 3 (PARAM_ERROR) |
| VPC API 오류 | 1 (API_ERROR) |

---

## volume — Block Storage 볼륨 관리

`volume` 명령군은 NHN Block Storage (Cinder volumev2) API 를 호출한다.
`instance`·`network` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유하므로 별도 설정이 필요 없다.

> **쓰기 작업 주의**: `volume create`, `instance volume attach`, `instance volume detach` 는 쓰기 작업이다.
> 실행 전 환경을 확인한다(수동 QA 필수).

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 볼륨 목록 조회 | `nhncloud volume list` |
| 정렬·페이지네이션 | `nhncloud volume list --sort created_at:desc --limit 20` |
| 단일 볼륨 상세 조회 | `nhncloud volume get <volume-id>` |
| 볼륨 생성 (⚠️ 쓰기) | `nhncloud volume create --size <gb>` |
| 이름·타입 지정 생성 (⚠️ 쓰기) | `nhncloud volume create --size 50 --name my-volume --volume-type "General SSD"` |
| 인스턴스 연결 볼륨 목록 | `nhncloud instance volumes <instance-id>` |
| 볼륨 연결 (⚠️ 쓰기) | `nhncloud instance volume attach <instance-id> --volume <volume-id>` |
| 볼륨 연결 해제 (⚠️ 쓰기) | `nhncloud instance volume detach <instance-id> <volume-id>` |
| 다른 region | `nhncloud volume list --region kr2` |

> **UX 비대칭**: `attach` 는 `--volume <id>` 플래그로 볼륨을 지정하고,
> `detach` 는 `<instanceId> <volumeId>` 위치 인수 두 개로 지정한다.

### volume list 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--sort <field:dir>` | 아니오 | 정렬 (예: `created_at:desc`) |
| `--limit <n>` | 아니오 | 최대 반환 건수 |
| `--offset <n>` | 아니오 | 오프셋 |
| `--marker <id>` | 아니오 | 페이지네이션 marker |
| `--region <region>` | 아니오 | region override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

### volume create 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--size <gb>` | 예 | 볼륨 크기(GB) |
| `--name <name>` | 아니오 | 볼륨 이름 |
| `--description <text>` | 아니오 | 볼륨 설명 |
| `--volume-type <type>` | 아니오 | 볼륨 타입 (예: `General SSD`) |
| `--snapshot-id <id>` | 아니오 | 스냅샷 ID (스냅샷으로부터 생성) |
| `--region <region>` | 아니오 | region override |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

### volume 에러 코드

| 상황 | exit code |
|------|-----------|
| iaas 자격증명 누락·불완전 | 4 (CONFIG_ERROR) |
| Keystone 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| 미등록 region / 필수 옵션 누락 | 3 (PARAM_ERROR) |
| Block Storage API 오류 | 1 (API_ERROR) |

---

## floatingip — 공인 IP(Floating IP) 관리

인스턴스에 공인 IP 를 부여하거나 회수한다.
`floatingip` 명령군은 `network` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유한다.

> **쓰기 작업 주의**: `floatingip create`(공인 IP 발급·비용)·`floatingip delete`(IP 회수)는 쓰기 작업이다.
> 실행 전 환경을 확인한다(수동 QA 필수).

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| Floating IP 목록 조회 | `nhncloud floatingip list` |
| Floating IP 발급 (외부 VPC 자동) | `nhncloud floatingip create` |
| 특정 외부 VPC 로 발급 | `nhncloud floatingip create --network <network-uuid>` |
| Floating IP 삭제 (⚠️ 쓰기) | `nhncloud floatingip delete <floatingip-id> --yes` |

> **associate 보류**: `floatingip associate` (인스턴스 연결) 는 instance→port_id 매핑 경로 미확정으로 보류 중.
> 후속 task 에서 실측 확정 후 추가한다.

### 체이닝 예시

```bash
# Floating IP 목록 (id·공인 IP·상태·연결 port 확인)
nhncloud floatingip list

# 발급 후 id 추출
nhncloud floatingip create --quiet

# JSON 으로 발급 정보 확인
nhncloud floatingip create --json | jq '{id, floating_ip_address, status}'

# 삭제 (비대화형 환경)
nhncloud floatingip delete <floatingip-id> --yes
```

### floatingip 에러 코드

| 상황 | exit code |
|------|-----------|
| iaas 자격증명 누락·불완전 | 4 (CONFIG_ERROR) |
| Keystone 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| 외부 네트워크 미발견 (create --network 미지정) | 3 (PARAM_ERROR) |
| 비대화형 delete --yes 누락 | 3 (PARAM_ERROR) |
| Floating IP API 오류 | 1 (API_ERROR) |

## ncr — NHN Container Registry 레지스트리·이미지·태그 조회

NCR Management API 로 레지스트리(Harbor 프로젝트)를 조회한다.
이미지(repository)·태그는 레지스트리 데이터플레인 Harbor REST API 를 직접 호출한다.
두 경로 모두 공통 UAK 를 사용하므로 추가 설정은 없다.
appKey 는 `--app-key` 옵션 또는 `nhncloud configure --ncr-appkey <appkey>` 로 profile 에 저장한 값을 자동 사용한다.

### 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 레지스트리 목록 조회 | `nhncloud ncr list --app-key <appkey>` |
| 레지스트리 목록 (JSON) | `nhncloud ncr list --app-key <appkey> --json` |
| 다른 region 조회 (기본 kr1) | `nhncloud ncr list --region kr2 --app-key <appkey>` |
| 단일 레지스트리 조회 | `nhncloud ncr get <registry> --app-key <appkey>` |
| appkey 저장 후 생략 | `nhncloud configure --ncr-appkey <appkey>` → `nhncloud ncr list` |
| 이미지(repository) 목록 조회 | `nhncloud ncr images <registry>` |
| 이미지 목록 (JSON) | `nhncloud ncr images <registry> --json` |
| 특정 이미지의 태그 목록 조회 | `nhncloud ncr tags <registry> <repository>` |
| 태그 목록 (JSON) | `nhncloud ncr tags <registry> <repository> --json` |

### ncr list / get 옵션

| 옵션 | 설명 |
|------|------|
| `--region <region>` | NCR region (기본: `kr1`). 지원: `kr1`, `kr2`, `kr3` |
| `--app-key <key>` | NCR appKey (profile 의 `ncr.appkey` 보다 우선) |
| `--profile <name>` | 사용할 profile 이름 |

### ncr images / ncr tags 옵션

| 옵션 | 설명 |
|------|------|
| `--region <region>` | NCR region (기본: `kr1`) |
| `--app-key <key>` | NCR appKey (profile 의 `ncr.appkey` 보다 우선) |
| `--profile <name>` | 사용할 profile 이름 |

### 체이닝 예시

```bash
# 레지스트리 목록 (이름만 추출)
nhncloud ncr list --app-key <appkey> --json | jq -r '.[].name'

# 레지스트리 수 확인
nhncloud ncr list --app-key <appkey> --json | jq length

# 단일 레지스트리 상세 조회
nhncloud ncr get <registry> --app-key <appkey> --json

# 이미지 목록 (이름만 추출)
nhncloud ncr images <registry> --json | jq -r '.[].repository'

# 이미지별 artifact 수 확인
nhncloud ncr images <registry> --json | jq '.[] | {repository, artifact_count}'

# 특정 이미지의 태그 목록
nhncloud ncr tags <registry> <repository> --json | jq -r '.[].tag'

# 가장 최근 push 태그 확인
nhncloud ncr tags <registry> <repository> --json | jq 'sort_by(.push_time) | last | .tag'
```

### ncr 에러 코드

| 상황 | exit code |
|------|-----------|
| UAK 누락·불완전 | 4 (CONFIG_ERROR) |
| NCR appkey 미설정 (`--app-key` 미지정 + configure 미설정) | 4 (CONFIG_ERROR) |
| 지원하지 않는 region | 3 (PARAM_ERROR) |
| registry / repository 인수 공백·빈값 | 3 (PARAM_ERROR) |
| UAK 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| NCR API 오류 | 1 (API_ERROR) |

## nks — NHN Kubernetes Service 관리

NKS는 `iaas` 자격증명으로 Keystone 토큰을 발급하고 `container-infra` API를 호출한다.
AI 에이전트는 조회 작업에 `--json`을 우선 사용한다.
지원 region은 `kr1`, `kr2`, `kr3` 이다.

### 조회 시나리오

| 의도 | 커맨드 |
|------|--------|
| 지원 Kubernetes version / event type 확인 | `nhncloud nks supports --json` |
| 클러스터 목록 조회 | `nhncloud nks cluster list --json` |
| 클러스터 상세 조회 | `nhncloud nks cluster get <cluster> --json` |
| 작업 이력 조회 | `nhncloud nks cluster events <cluster> --json` |
| kubeconfig stdout 출력 | `nhncloud nks cluster kubeconfig <cluster>` |
| kubeconfig 파일 저장 | `nhncloud nks cluster kubeconfig <cluster> --output ./kubeconfig` |
| 노드 그룹 목록 조회 | `nhncloud nks nodegroup list <cluster> --json` |
| 노드 그룹 autoscale 조회 | `nhncloud nks nodegroup autoscale <cluster> <nodegroup> --json` |
| 애드온 타입 조회 | `nhncloud nks addon-type list --json` |
| 설치 가능 애드온 조회 | `nhncloud nks addon list --k8s-version v1.30.1 --json` |
| 클러스터 설치 애드온 조회 | `nhncloud nks cluster addon list <cluster> --json` |

### 쓰기 시나리오

복잡한 생성·변경 작업은 공식 API payload를 JSON 파일로 전달한다.
삭제·제거 명령은 비대화형 환경에서 `--yes` 가 필요하다.
payload 원문에는 appkey 같은 민감값이 들어갈 수 있으므로 로그에 출력하지 않는다.

```bash
# 생성
nhncloud nks cluster create --file ./cluster-create.json
nhncloud nks nodegroup create <cluster> --file ./nodegroup-create.json

# 클러스터 변경
nhncloud nks cluster resize <cluster> --nodegroup worker --node-count 3
nhncloud nks cluster set-ipacl <cluster> --file ./ipacl.json
nhncloud nks cluster renew-certificate <cluster> --term-of-validity 3
nhncloud nks cluster update-sgw <cluster> --ncr-sgw <uuid> --obs-sgw <uuid>
nhncloud nks cluster set-control-plane-log <cluster> --file ./control-plane-log.json

# 노드 그룹 변경
nhncloud nks nodegroup stop-node <cluster> worker --nodes node-1,node-2
nhncloud nks nodegroup start-node <cluster> worker --nodes node-1,node-2
nhncloud nks nodegroup set-autoscale <cluster> worker --file ./autoscale.json
nhncloud nks nodegroup set-metric-autoscale <cluster> worker --file ./metric-autoscale.json
nhncloud nks nodegroup upgrade <cluster> worker --version v1.30.1
nhncloud nks nodegroup set-userscript <cluster> worker --file ./userscript.sh
nhncloud nks nodegroup update-flavor <cluster> worker --flavor <flavor-uuid>
nhncloud nks nodegroup set-fip-auto-bind <cluster> worker --file ./fip-auto-bind.json
nhncloud nks nodegroup set-labels <cluster> worker --file ./labels.json

# 애드온 변경
nhncloud nks cluster addon install <cluster> \
  --name coredns \
  --version 1.0.0 \
  --resolve-conflicts overwrite

nhncloud nks cluster addon update <cluster> coredns \
  --version 1.0.1 \
  --resolve-conflicts preserve

nhncloud nks cluster addon remove <cluster> coredns --yes
```

### nks 에러 코드

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락·불완전 | 4 (CONFIG_ERROR) |
| Keystone 또는 NKS 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| 지원하지 않는 NKS region | 3 (PARAM_ERROR) |
| payload JSON 파일 파싱 실패 | 3 (PARAM_ERROR) |
| 위험 명령에서 비대화형 `--yes` 누락 | 3 (PARAM_ERROR) |
| NKS API 오류 / 응답 형식 불일치 | 1 (API_ERROR) |
