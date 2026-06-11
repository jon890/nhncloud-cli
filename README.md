# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 통합 CLI.
현재 `configure`, `logncrash search/send` (Log & Crash 로그 검색·전송), `deploy` (배포·바이너리 조회·업로드·다운로드), `instance` (Compute 인스턴스 목록·발급·전원 제어·타입 변경·키페어 관리·이미지·가용성 영역 조회 포함), `network` (VPC·서브넷 목록 조회) 명령을 지원한다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정

`nhncloud configure` 를 실행하면 대화형 마법사가 자격증명을 안내한다.

```bash
nhncloud configure
```

- profile → UAK(id/secret) → logncrash appkey/secret → iaas 자격증명 순으로 입력한다.
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
```

시간은 상대시간 (`1h` / `30m` / `2d` / `now`) 또는 ISO8601 (`2026-05-01T00:00:00+09:00`) 로 입력한다.
API 제약상 검색 시작은 최근 90일 이내, 검색 범위는 31일 이하여야 한다 (초과 시 입력 오류로 거절).

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

## 개발

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크
node dist/index.js instance --help
node dist/index.js logncrash search --help
```
