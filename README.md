# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 통합 CLI.
현재 98개 command catalog 항목을 지원한다.
`configure`, `commands`, `logncrash search/send/export`, `deploy`, `instance`, `network`, `volume`, `floatingip`, `ncr`, `nks` 명령으로 NHN Cloud 서비스를 조회·운영할 수 있다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정

`nhncloud configure` 를 실행하면 대화형 마법사가 자격증명을 안내한다.

```bash
nhncloud configure
```

- profile → UAK(id/secret) → logncrash appkey/secret → iaas 자격증명 → ncr appkey 순으로 입력한다.
- 저장 전 연결 테스트를 자동으로 수행한다 (`--no-verify` 로 생략 가능).
- CI/자동화는 flag 로 비대화형 설정이 가능하다.

```bash
# UAK + logncrash 비대화형 설정
nhncloud configure \
  --uak-id <id> --uak-secret <secret> \
  --logncrash-appkey <key> --logncrash-secret <secret> \
  --no-verify

# iaas (Compute) 비대화형 설정 — API 비밀번호는 env 권장
NHNCLOUD_IAAS_PASSWORD=<api-password> nhncloud configure \
  --iaas-tenant-id <tenant-id> \
  --iaas-username <iam-username> \
  --iaas-region kr1 \
  --no-verify
```

> **iaas password 안내**: `--iaas-password` 에 입력하는 값은 NHN Cloud 콘솔 IAM 의 **API 비밀번호**입니다.
> 로그인 비밀번호와 다릅니다.
> IAM 사용자 상세 페이지 → "API 비밀번호 설정"에서 별도로 발급하세요.
>
> **iaas username 안내**: `--iaas-username` 은 NHN Cloud 계정 이메일 또는 IAM 계정 ID(사번)입니다.
> tenantId 와 비슷한 "API 사용자 ID"(UUID)가 아닙니다.

저장 경로: `~/.nhncloud/credentials.json` (mode 0600), `~/.nhncloud/config.json`.

profile 해석 우선순위: `--profile` 옵션 > `NHNCLOUD_PROFILE` 환경변수 > `config.defaultProfile` > `"default"`.

## 사용 예

### 배포 (Deploy)

`nhncloud configure --uak-id <id> --uak-secret <secret>` 으로 UAK 를 설정한 뒤,
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

# 바이너리 그룹 목록 — 그룹 key 확인
nhncloud deploy binary-groups my-service

# 위에서 확인한 key 로 바이너리 목록 조회
nhncloud deploy binaries my-service --binary-group <key>

# 업로드 최신순 정렬 + 전체 필드는 --json
nhncloud deploy binaries my-service --binary-group <key> --sort-key UPLOAD_DATE --sort-direction DESC --json

# 바이너리 업로드 — binary-groups 로 확인한 그룹 key 에 파일 올리기
nhncloud deploy upload <target> --file ./build/app.jar --binary-group <key> --description "release build"

# 업로드 응답의 binaryKey 만 필요하면 --quiet
nhncloud deploy upload <target> --file ./build/app.jar --binary-group <key> --quiet

# 바이너리 다운로드 — 파일로 저장 (기본 덮어쓰기 거부, --force 로 강제)
nhncloud deploy download <target> --binary-group <key> --binary-key <binary-key> -o ./app.jar
```

### 로그 검색

```bash
# 최근 1시간 NORMAL 로그
nhncloud logncrash search \
  --query 'logType:"NORMAL"' \
  --from 1h \
  --to now

# body 필드 키워드 검색
nhncloud logncrash search \
  --query 'body:request_received' \
  --from 1h \
  --to now

# body 부분 문자열 검색
nhncloud logncrash search \
  --query 'body:*request_received*' \
  --from 1h \
  --to now
```

`--query` 는 콘솔의 간편 검색어가 아니라 Log & Crash Search API 의 Lucene 쿼리다.
body 검색 의도가 명확하면 `body:<keyword>` 또는 `body:*<keyword>*` 처럼 필드를 지정한다.

시간은 상대시간 (`1h` / `30m` / `2d` / `now`) 또는 ISO8601 (`2026-05-01T00:00:00+09:00`) 로 입력한다.
API 제약상 검색 시작은 최근 90일 이내, 검색 범위는 31일 이하여야 한다 (초과 시 입력 오류로 거절).
전송 직후에는 인덱싱 지연으로 잠시 0건이 나올 수 있다.
반복 검색이나 넓은 wildcard 검색은 API rate limit 에 걸릴 수 있으므로 시간 범위를 좁혀 확인한다.

### 로그 대량 추출 (export)

```bash
# 검색 결과 전체를 파일로 추출 (JSON Lines, scroll 순회)
nhncloud logncrash export \
  --query 'logType:"ERROR"' \
  --from 1h --to now \
  --output errors.jsonl

# JSON 배열 형식으로 추출
nhncloud logncrash export --query 'logType:"ERROR"' --from 1h --to now \
  --output errors.json --format json
```

단발 검색(`search`)과 달리 scroll API 로 전체 결과(최대 10만 건)를 순회해 파일로 저장한다.
진행 상황은 stderr, 데이터는 파일에만 기록된다(stdout 비움).
scrollKey 유효기간은 1분이므로 데이터가 많을 때는 `--size` 를 키워 페이지 수를 줄이는 것을 권장한다.
시간 범위 제한은 search 와 동일(90일 이내·31일 이하).

#### export 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열 |
| `--from <time>` | 예 | 검색 시작 (ISO8601 또는 상대시간 `1h`/`30m`/`2d`/`now`) |
| `--to <time>` | 예 | 검색 끝 |
| `--output <file>` | 예 | 출력 파일 경로 |
| `--format <fmt>` | 아니오 | `jsonl`(기본, 한 줄당 한 로그) 또는 `json`(배열) |
| `--size <n>` | 아니오 | scroll pageSize — 범위 10~100, 기본 100 |
| `--force` | 아니오 | 출력 파일이 있으면 덮어쓴다 (기본 거부) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

### 로그 전송

```bash
# 로그 한 건 전송 — 본문 직접
nhncloud logncrash send --body "결제 완료" --level INFO

# 파일에서 본문 읽어 전송
nhncloud logncrash send --file ./error.log --level ERROR

# 파이프(stdin)로 전송
echo "배치 작업 종료" | nhncloud logncrash send --level INFO

# 프로젝트 버전·소스 지정
nhncloud logncrash send --body "deploy 시작" --app-version 2.3.0 --source batch
```

> logncrash send 는 검색과 다른 collector 로 전송하며 appkey 만 사용한다 (secret 불요). 단일 로그 본문은 8MB 까지.

### 출력 모드

| 모드 | 옵션 | 용도 |
|------|------|------|
| 테이블 | (기본) | 사람이 읽는 고정 컬럼 출력 |
| JSON | `--json` | 자동화·AI 에이전트용 raw 데이터 + 페이지 메타 |
| quiet | `--quiet` | 행별 최소 출력 |

`--json`은 CLI가 가공한 출력 계약이다.
NHN Cloud 또는 OpenStack 원본 응답의 최상위 래퍼를 그대로 보존하지 않을 수 있다.

### 자동화와 AI 에이전트

명령 경로, 인수, 옵션은 `nhncloud commands --json`으로 확인한다.
이 명령은 외부 API를 호출하지 않고 Commander tree metadata만 stdout에 출력한다.

```bash
nhncloud commands --json | jq '.commands[] | select(.path=="nks cluster list")'
```

root와 주요 service group의 `--help`에는 짧은 agent hint가 포함된다.
긴 사용법은 README와 공개 skill reference를 기준으로 확인한다.

| 명령 | `--json` 출력 shape |
|------|---------------------|
| `commands` | `{ commands: [{ path, description, arguments, options, subcommands }] }` |
| `logncrash search` | `{ totalItems, pageNumber, pageSize, data }` 객체 |
| `logncrash export` | 파일 출력 전용. stdout JSON 없음 |
| `deploy artifacts` | Deploy API `body` 객체 |
| `deploy server-groups` | Deploy API `body` 객체 |
| `deploy histories` | Deploy API `body` 객체 |
| `deploy binary-groups` | `binaryGroups` 래퍼를 언랩한 배열 |
| `deploy binaries` | `{ totalCount, binaries }` 객체 |
| `deploy upload` | `{ downloadUrl, binaryKey }` 객체 |
| `instance list` | `servers` 래퍼를 언랩한 server 배열 |
| `instance get` | `server` 래퍼를 언랩한 단일 server 객체 |
| `instance create --wait` | `server` 래퍼를 언랩한 단일 server 객체 |
| `instance flavors` | `flavors` 래퍼를 언랩한 flavor 배열 |
| `instance images` | `images` 래퍼를 언랩한 image 배열 |
| `instance availability-zones` | `availabilityZoneInfo` 래퍼를 언랩한 배열 |
| `instance keypairs` | `keypairs[].keypair`를 flatten한 keypair 배열 |
| `instance volumes` | `volumeAttachments` 래퍼를 언랩한 attachment 배열 |
| `network list` | VPC 배열 |
| `network subnet list` | subnet 배열 |
| `volume list` | volume 배열 |
| `volume get` | 단일 volume 객체 |
| `volume create` | 단일 volume 객체 |
| `floatingip list` | floating IP 배열 |
| `floatingip create` | 단일 floating IP 객체 |
| `ncr list` | `registries` 래퍼를 언랩한 registry 배열 |
| `ncr get` | `registry` 래퍼를 언랩한 단일 registry 객체 |
| `ncr images` | repository 배열 |
| `ncr tags` | tag 배열 |
| `nks supports` | 지원 Kubernetes version / event type 객체 |
| `nks cluster list` | cluster 배열 |
| `nks cluster events` | event 배열 |
| `nks nodegroup list` | nodegroup 배열 |
| `nks addon-type list` | addon type 배열 |
| `nks addon list` | addon 배열 |
| `nks cluster addon list` | cluster addon 배열 |

NKS의 단건 조회는 API 객체를 그대로 반환한다.
예를 들어 `nks cluster get`, `nks cluster event`, `nks nodegroup get`, `nks addon-type get`, `nks addon get`, `nks cluster addon get`, `nks cluster ipacl`, `nks nodegroup autoscale` 은 table 출력용 최소 컬럼을 만들고 `--json` 에서는 raw 객체를 보존한다.
NKS 쓰기 명령 중 생성·resize·설정 변경·노드 action·애드온 변경은 `{ uuid }` 응답을 반환한다.
삭제 명령은 성공 메시지만 stderr에 쓰고 stdout은 비운다.
`nks cluster kubeconfig` 는 kubeconfig 문자열을 stdout 또는 파일로 저장한다.

예를 들어 `instance get --json`은 `.server.status`가 아니라 `.status`를 읽는다.

### 체이닝 예시

```bash
# 인스턴스 상태 확인
nhncloud instance get <instance-id> --json | jq -r '.status'

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

### 인스턴스 (Instance)

`~/.nhncloud/credentials.json` 에 `iaas` 블록을 추가하거나 `nhncloud configure` 로 설정한다.

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

```bash
# 인스턴스 목록 조회
nhncloud instance list

# 이미지 목록 (create --image <id> 에 넣을 image id 확인)
nhncloud instance images

# public 이미지만, 전체 필드 JSON
nhncloud instance images --visibility public --json

# 페이지네이션 — 다음 페이지
nhncloud instance images --limit 20 --marker <last-image-id>

# 인스턴스 타입(flavor) 목록 — id·name 만
nhncloud instance flavors

# 타입 상세 — vcpus·ram·disk 포함 (테이블은 핵심 5컬럼)
nhncloud instance flavors --detail

# 전체 필드(is_public·extra_specs 등)는 --json 으로
nhncloud instance flavors --detail --json

# RAM 8GB 이상 타입만 필터
nhncloud instance flavors --detail --min-ram 8192

# 가용성 영역(availability zone) 목록 (영역명·가용 여부)
nhncloud instance availability-zones

# 전체 응답(zoneState 등)은 --json 으로
nhncloud instance availability-zones --json

# 단일 인스턴스 상태 조회
nhncloud instance get <instance-id>

# 인스턴스 생성 (즉시 반환, BUILD 상태)
nhncloud instance create \
  --name my-server \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid>

# 인스턴스 생성 + ACTIVE 대기 (IP 할당까지 폴링)
nhncloud instance create \
  --name my-server \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --wait

# GPU(g2) 등 boot-from-volume 필수 flavor — --boot-volume-size 지정
nhncloud instance create \
  --name gpu-server \
  --flavor <gpu-flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --boot-volume-size 30 \
  --wait

# cloud-init user-data 주입 (부팅 시 자동 셋업 — NVIDIA 드라이버·docker 등)
nhncloud instance create \
  --name gpu-runner \
  --flavor <gpu-flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --boot-volume-size 30 \
  --user-data ./cloud-init.yaml \
  --wait

# --quiet --wait: 첫 IP 한 줄만 stdout (CI 파이프용)
IP=$(nhncloud instance create --name ci-runner \
  --flavor <flavor-id> --image <image-id> --network <network-uuid> \
  --wait --quiet)

# 인스턴스 삭제 (confirm 생략)
nhncloud instance delete <instance-id> --yes

# 인스턴스 타입(flavor) 변경 — 후보 id 는 instance flavors 로 조회
nhncloud instance flavors --detail
nhncloud instance resize <instance-id> --flavor <flavor-id>

# resize 후 VERIFY_RESIZE 상태 — 확정 또는 롤백
nhncloud instance resize-confirm <instance-id>
nhncloud instance resize-revert <instance-id>

# 인스턴스 정지 / 시작
nhncloud instance stop <instance-id>
nhncloud instance start <instance-id>

# 재부팅 (기본 SOFT)
nhncloud instance reboot <instance-id>

# HARD 재부팅 (강제 전원 cycle)
nhncloud instance reboot <instance-id> --hard

# 키페어 목록 (name·fingerprint)
nhncloud instance keypairs

# 단일 키페어 조회
nhncloud instance keypair get <keypair-name>

# 키페어 생성 — NHN 이 키쌍 생성, private_key 를 0600 파일로 저장 (한 번만 받을 수 있음)
nhncloud instance keypair create <keypair-name> -o ./my-key.pem

# 기존 공개키 등록 (private_key 미반환)
nhncloud instance keypair create <keypair-name> --public-key ~/.ssh/id_rsa.pub

# 키페어 삭제
nhncloud instance keypair delete <keypair-name>
```

> **private_key 안내**: 키페어 생성 시 NHN 이 만든 private_key 는 생성 응답 **한 번만** 반환됩니다.
> `-o <keyfile>` 로 저장하거나 stdout 을 안전한 곳에 보관하세요. 분실 시 복구할 수 없습니다.

지원 region: `kr1` / `kr2` / `kr3` / `jp1` (`--region` 으로 override 가능).

### 네트워크 (Network)

`instance create --network <uuid>` 에 넣을 VPC id 를 확인하거나 서브넷 구성을 조회한다.
`network` 명령군은 `instance` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유한다 — 별도 설정이 필요 없다.

```bash
# VPC 목록 (instance create --network <uuid> 에 넣을 VPC id 확인)
nhncloud network list

# 전체 필드 JSON
nhncloud network list --json

# 서브넷 목록 (소속 VPC·CIDR·가용 IP 확인)
nhncloud network subnet list

# 다른 region
nhncloud network list --region kr2

# create 흐름 — 확인한 VPC id 를 --network 에 사용 (--network 가 받는 uuid = VPC id, 실측 확정)
nhncloud instance create \
  --name web \
  --flavor <flavor-id> \
  --image <image-id> \
  --network <network-uuid>
```

> **`--network` 가 받는 id**: `network list` 의 VPC id 를 그대로 `--network` 에 사용한다.
> subnet id 가 아니다 — `instance list --json` 의 addresses 키와 VPC name 이 1:1 대응함을 실측으로 확인.

### Block Storage (Volume)

독립 블록 스토리지 볼륨을 관리한다.
`volume` 명령군은 `instance`·`network` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유한다 — 별도 설정이 필요 없다.

**볼륨 생성(`volume create`)·인스턴스 연결(`instance volume attach`)·연결 해제(`instance volume detach`)는 쓰기 작업이므로 실행 전 환경을 확인한다(수동 QA 필수).**

```bash
# 볼륨 목록 조회
nhncloud volume list

# 정렬·페이지네이션
nhncloud volume list --sort created_at:desc --limit 20

# 단일 볼륨 조회
nhncloud volume get <volume-id>

# 전체 필드 JSON
nhncloud volume get <volume-id> --json

# 볼륨 생성 — ⚠️ 쓰기 작업, 실행 전 환경 확인 필수
nhncloud volume create --size 10

# 이름·타입 지정
nhncloud volume create --size 50 --name my-volume --volume-type "General SSD"

# 인스턴스에 연결된 볼륨 목록 조회
nhncloud instance volumes <instance-id>

# 볼륨 연결 — ⚠️ 쓰기 작업 (--volume 플래그로 볼륨 ID 지정)
nhncloud instance volume attach <instance-id> --volume <volume-id>

# 볼륨 연결 해제 — ⚠️ 쓰기 작업 (인스턴스 ID + 볼륨 ID 위치 인수)
nhncloud instance volume detach <instance-id> <volume-id>
```

> **UX 비대칭**: `attach` 는 `--volume <id>` 플래그로 볼륨을 지정하고,
> `detach` 는 `<instanceId> <volumeId>` 위치 인수 두 개로 지정한다.

지원 region: `kr1` / `kr2` / `kr3` / `jp1` (`--region` 으로 override 가능).

### 공인 IP (Floating IP)

Floating IP 를 발급해 인스턴스에 부여하는 공인 IP 를 관리한다.
`floatingip` 명령군은 `network` 와 같은 `iaas` 자격증명·Keystone 토큰을 공유한다.

```bash
# Floating IP 목록
nhncloud floatingip list

# Floating IP 발급 (--network 미지정 시 외부 VPC 자동 조회)
nhncloud floatingip create
nhncloud floatingip create --network <network-uuid>

# 삭제
nhncloud floatingip delete <floatingip-id> --yes
```

> **associate**: `floatingip associate <floatingip-id> <instance-id>` 는 instance→port_id 매핑 경로 미확정으로 보류 중.
> 실측으로 경로가 확정되면 후속 task 에서 추가한다.

### NHN Container Registry (NCR)

NCR Management API 로 레지스트리를 조회한다.
인증은 공통 UAK(`X-TC-AUTHENTICATION-ID/SECRET` 정적 헤더)를 재사용하며 OAuth 토큰 교환이 없다.
appKey 는 NHN Cloud 콘솔 → Container Registry 서비스에서 확인한다.

```bash
# ncr appkey 설정 (비대화형)
nhncloud configure --ncr-appkey <appkey>

# 레지스트리 목록 조회
nhncloud ncr list --app-key <appkey>

# region 지정 (기본: kr1)
nhncloud ncr list --region kr2 --app-key <appkey>

# JSON 출력
nhncloud ncr list --app-key <appkey> --json

# 단일 레지스트리 조회 (이름 또는 ID)
nhncloud ncr get <registry-name> --app-key <appkey>
```

appKey 를 `nhncloud configure --ncr-appkey <appkey>` 로 저장해 두면 `--app-key` 없이도 호출할 수 있다.

```bash
# configure 로 저장 후 --app-key 생략
nhncloud configure --ncr-appkey <appkey>
nhncloud ncr list
nhncloud ncr get <registry-name>
```

이미지(repository)·태그는 레지스트리 데이터플레인 Harbor REST API 를 직접 호출한다.
UAK 를 Basic Auth 로 사용하며 추가 설정은 없다.

```bash
# 이미지(repository) 목록 조회
nhncloud ncr images <registry>

# region 지정
nhncloud ncr images <registry> --region kr2

# JSON 출력
nhncloud ncr images <registry> --json

# 특정 이미지의 태그 목록 조회
nhncloud ncr tags <registry> <repository>

# JSON 출력 (태그·push_time·size)
nhncloud ncr tags <registry> <repository> --json
```

### NHN Kubernetes Service (NKS)

NKS는 `iaas` 자격증명으로 Keystone 토큰을 발급하고 `container-infra` API를 호출한다.
지원 region은 `kr1`, `kr2`, `kr3` 이다.

```bash
# 지원 Kubernetes version / event type 조회
nhncloud nks supports

# 클러스터와 노드 그룹 조회
nhncloud nks cluster list
nhncloud nks cluster get <cluster>
nhncloud nks cluster events <cluster>
nhncloud nks cluster event <cluster> <event>
nhncloud nks cluster ipacl <cluster>
nhncloud nks nodegroup list <cluster>
nhncloud nks nodegroup get <cluster> <nodegroup>
nhncloud nks nodegroup autoscale <cluster> <nodegroup>

# kubeconfig stdout 출력 또는 mode 0600 파일 저장
nhncloud nks cluster kubeconfig <cluster>
nhncloud nks cluster kubeconfig <cluster> --output ./kubeconfig
nhncloud nks cluster kubeconfig <cluster> --output ./kubeconfig --force

# 애드온 조회
nhncloud nks addon-type list
nhncloud nks addon-type get <addon-type>
nhncloud nks addon list --k8s-version v1.30.1
nhncloud nks addon get <addon>
nhncloud nks cluster addon list <cluster>
nhncloud nks cluster addon get <cluster> <addon>
```

복잡한 쓰기 작업은 공식 API payload를 JSON 파일로 전달한다.
삭제·제거 명령은 비대화형 환경에서 `--yes` 가 필요하다.

```bash
# 클러스터 / 노드 그룹 생성
nhncloud nks cluster create --file ./cluster-create.json
nhncloud nks nodegroup create <cluster> --file ./nodegroup-create.json

# resize / upgrade
nhncloud nks cluster resize <cluster> --nodegroup worker --node-count 3
nhncloud nks nodegroup upgrade <cluster> worker --version v1.30.1

# 삭제 / 노드 action
nhncloud nks cluster delete <cluster> --yes
nhncloud nks nodegroup delete <cluster> worker --yes
nhncloud nks nodegroup stop-node <cluster> worker --nodes node-1,node-2
nhncloud nks nodegroup start-node <cluster> worker --nodes node-1,node-2

# 애드온 설치 / 업데이트 / 제거
nhncloud nks cluster addon install <cluster> \
  --name coredns \
  --version 1.0.0 \
  --resolve-conflicts overwrite

nhncloud nks cluster addon update <cluster> coredns \
  --version 1.0.1 \
  --resolve-conflicts preserve

nhncloud nks cluster addon remove <cluster> coredns --yes

# payload 파일 기반 변경
nhncloud nks cluster set-ipacl <cluster> --file ./ipacl.json
nhncloud nks cluster renew-certificate <cluster> --term-of-validity 3
nhncloud nks cluster update-sgw <cluster> --ncr-sgw <uuid> --obs-sgw <uuid>
nhncloud nks cluster set-control-plane-log <cluster> --file ./control-plane-log.json
nhncloud nks nodegroup set-autoscale <cluster> worker --file ./autoscale.json
nhncloud nks nodegroup set-metric-autoscale <cluster> worker --file ./metric-autoscale.json
nhncloud nks nodegroup set-userscript <cluster> worker --file ./userscript.sh
nhncloud nks nodegroup update-flavor <cluster> worker --flavor <flavor-uuid>
nhncloud nks nodegroup set-fip-auto-bind <cluster> worker --file ./fip-auto-bind.json
nhncloud nks nodegroup set-labels <cluster> worker --file ./labels.json
```

## 개발

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크
node dist/index.js instance --help
node dist/index.js logncrash search --help
node dist/index.js ncr --help
node dist/index.js nks --help
node dist/index.js commands --json
```
