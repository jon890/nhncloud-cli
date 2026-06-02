# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 통합 CLI.
현재 `logncrash search` (Log & Crash 로그 검색) 를 지원한다.

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

# --quiet --wait: 첫 IP 한 줄만 stdout (CI 파이프용)
IP=$(nhncloud instance create --name ci-runner \
  --flavor <flavor-id> --image <image-id> --network <network-uuid> \
  --wait --quiet)

# 인스턴스 삭제 (confirm 생략)
nhncloud instance delete <instance-id> --yes
```

지원 region: `kr1` / `kr2` / `kr3` / `jp1` (`--region` 으로 override 가능).

## 개발

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크
node dist/index.js instance --help
node dist/index.js logncrash search --help
```
