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

## logncrash export 흐름

검색 결과 전체를 scroll API 로 순회해 파일로 추출한다 (search 단발 조회와 별도 명령).
search 와 같은 host(`api-lncs-search`)·인증(`X-LNCS-SECRET`)·봉투 helper 를 재사용한다 — 새 endpoint·인증·ADR 없음.

### scroll 순회

1. `POST /api/v2/search/scroll/{appkey}` 로 시작한다 (body 는 search 와 동일: query/from/to/pageSize). 응답 `body` 에 `scrollKey`·`totalItems`·`data` 가 온다 (`NhnEnvelope` + `unwrap`).
2. `data` 가 비지 않고 `scrollKey` 가 있으면 `POST /api/v2/search/scroll/{appkey}/{scrollKey}` (body 없음) 로 다음 페이지를 이어 받는다.
3. `data` 가 빌 때까지 (또는 안전 상한 10만 건까지) 반복한다. 상한을 넘으면 잘렸음을 stderr 로 경고한다.

`pageSize` 는 docs 한도 10~100 이며 `--size` 로 조정한다.

### scrollKey 만료

scrollKey 유효기간은 1분이다. 한 페이지 처리 후 1분 안에 다음 호출을 못 하면 키가 무효화되어 `EXIT_API_ERROR` 가 난다.
다음 페이지 실패 시 만료라고 단정하지 않고 원본 오류 메시지를 보존한 채 만료 가능성을 안내한다 (5xx·네트워크 일시 오류도 같은 코드라 진단 정보를 잃지 않기 위함). 만료면 검색 범위를 좁히거나 `--size` 를 키워 페이지 수를 줄인 뒤 다시 시도한다.

### 출력

- `--output <file>` 필수. 기본 JSON Lines (한 줄당 한 로그), `--format json` 이면 JSON 배열. 기존 파일은 기본 거부 — `--force` 로만 덮어쓴다 (deploy download 와 동일 정책).
- 진행 상황(수집/전체 건수)은 spinner(stderr), 데이터는 파일에만 쓴다. 페이지 수신 즉시 temp 파일에 스트리밍 append (전량 메모리 적재 회피) 후 원자적으로 교체한다 (중단 시 부분 파일 방지, 실패 시 temp 정리).
- 시간 범위 제한은 search 와 동일 (90일 이내·31일 이하).

## logncrash send 흐름

검색의 대칭 쓰기. 검색과 **다른 collector host(`api-logncrash`) + appkey-only 인증(secret 불요)** 을 쓴다 ([[adr-014]]).

```bash
nhncloud logncrash send --body "결제 완료" --level INFO
echo "배치 종료" | nhncloud logncrash send --level INFO
nhncloud logncrash send --file ./error.log --level ERROR
```

### 명령 시그니처

```
nhncloud logncrash send [options]
```

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--body <text>` | 조건 | 로그 메시지 본문 (미지정 시 `--file` 또는 stdin) |
| `--file <path>` | 조건 | 본문을 읽을 파일 경로 (stat 가드 + 8MB 한도) |
| `--level <level>` | 아니오 | DEBUG/INFO/WARN/ERROR/FATAL |
| `--app-version <ver>` | 아니오 | projectVersion (기본 `1.0.0`). `--version` 은 CLI 버전 플래그라 `--app-version` 사용 |
| `--source <s>` / `--type <t>` / `--host <h>` | 아니오 | logSource(기본 http)·logType(기본 log)·host |
| `--profile <name>` | 아니오 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 입력 해석 순서

`--body` > `--file` > stdin(파이프) 순으로 본문을 해석한다. 셋 다 없으면 입력 오류.
본문 byte 길이(`Buffer.byteLength`)가 **8MB(단일 로그 한도)** 초과면 전송 전 차단한다 (collector 는 base64 인코딩하지 않아 원본 byte 기준).

### 인증·전송

- 검색의 `X-LNCS-SECRET` 헤더가 없다. body 의 `projectName` 에 appkey 를 넣어 식별한다 (secret 불요·[[adr-014]]).
- 응답은 검색과 같은 중첩 봉투 `{ header: { isSuccessful, resultCode(숫자), resultMessage } }` — `isSuccessful` 로만 판정한다 ([[adr-006]]).

### 에러 경로

| 상황 | exit code |
|------|-----------|
| appkey 누락 | `EXIT_CONFIG_ERROR` |
| 본문 없음 / 빈 본문 / 8MB 초과 / 잘못된 level / 파일 stat 실패 | `EXIT_PARAM_ERROR` |
| 봉투 `isSuccessful: false` / 기타 4xx·5xx | `EXIT_API_ERROR` |

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
nhncloud deploy binary-groups <target> [options]   # 바이너리 그룹 목록
nhncloud deploy binaries <target> --binary-group <key> [options]  # 바이너리 목록
nhncloud deploy upload <target> --file <p> --binary-group <key>   # 바이너리 업로드 (multipart)
nhncloud deploy download <target> --binary-group <k> --binary-key <bk> -o <f>  # 바이너리 다운로드 (--force)
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
| `--binary-group <key>` | binaries | 조회할 바이너리 그룹 key (필수) |
| `--page-num <n>` | binaries | 페이지 번호 (1 이상) |
| `--page-size <n>` | binaries | 페이지 크기 (1 이상) |
| `--sort-key <k>` | binaries | 정렬 기준 (예: UPLOAD_DATE) |
| `--sort-direction <d>` | binaries | 정렬 방향 (예: DESC) |

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

## instance 흐름

OpenStack Nova v2 호환 Compute 명령군. Keystone 토큰을 발급해 region 별 compute endpoint 로 호출한다 ([[adr-010]]).

### 인증 흐름

1. profile 의 `iaas` 블록에서 tenantId · username · password · region 로드
2. 캐시된 Keystone token 이 만료 전이면 재사용, 아니면 발급 후 캐시
3. `X-Auth-Token: <tokenId>` 헤더로 region 별 compute API 호출

`password` 는 NHN 콘솔 IAM 의 API 비밀번호 (로그인 비번 아님).

### 명령 시그니처

```
nhncloud instance list [options]                # 인스턴스 목록
nhncloud instance images [options]              # 이미지 목록 (create --image 소스)
nhncloud instance flavors [options]             # 인스턴스 타입(flavor) 조회
nhncloud instance availability-zones [options]  # 가용성 영역(AZ) 목록 조회
nhncloud instance get <id> [options]            # 단일 인스턴스 상태 조회
nhncloud instance create [options]              # 인스턴스 발급
nhncloud instance delete <id> [options]         # 인스턴스 삭제
nhncloud instance start <id> [options]          # 인스턴스 시작
nhncloud instance stop <id> [options]           # 인스턴스 정지
nhncloud instance reboot <id> [options]         # 인스턴스 재부팅 (--hard 로 HARD)
nhncloud instance resize <id> --flavor <id>     # 타입(flavor) 변경 (VERIFY_RESIZE 후 confirm/revert)
nhncloud instance resize-confirm <id>           # resize 확정
nhncloud instance resize-revert <id>            # resize 롤백
nhncloud instance volumes <id>                  # 인스턴스 연결 볼륨 목록
nhncloud instance volume attach <id> --volume <vid>  # 볼륨 연결 (쓰기)
nhncloud instance volume detach <id> <vid>      # 볼륨 해제 (쓰기)
nhncloud instance keypairs [options]            # 키페어 목록
nhncloud instance keypair get <name> [options]  # 단일 키페어 조회
nhncloud instance keypair create <name> [opts]  # 키페어 생성 (private_key 1회성)
nhncloud instance keypair delete <name> [opts]  # 키페어 삭제
```

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--region <r>` | 전체 | `iaas.region` override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 전체 | profile 선택 |
| `--detail` | flavors | `GET /flavors/detail` — vcpus·ram·disk 등 스펙 포함 (없으면 id·name 만) |
| `--min-disk <gb>` | flavors | 최소 블록 스토리지 크기(GB) 이상만 필터 (양의 정수) |
| `--min-ram <mb>` | flavors | 최소 RAM 크기(MB) 이상만 필터 (양의 정수) |
| `--limit <n>` | images | 한 페이지 최대 개수 |
| `--marker <id>` | images | 이 image id 다음부터 조회 (페이지네이션) |
| `--visibility <v>` | images | 노출 범위 필터 (public/private/shared) |
| `--name <name>` | images | 이름으로 필터 |
| `--owner <id>` | images | 소유자(프로젝트 id)로 필터 |
| `--status <status>` | images | 상태로 필터 (예: active) |
| `--name <n>` | create | 인스턴스 이름 (필수) |
| `--flavor <id>` | create | flavor UUID (필수) |
| `--image <id>` | create | image UUID (필수) |
| `--network <id>` | create | network UUID (필수, 반복 가능) |
| `--boot-volume-size <gb>` | create | boot-from-volume root 볼륨 크기(GB). GPU(g2) 등 일부 flavor 는 필수 ([[adr-011]]) |
| `--key-name <k>` | create | SSH 키페어 이름 |
| `--security-group <sg>` | create | 보안 그룹 이름 (반복) |
| `--ephemeral-disk-size <n>` | create | NHN 확장 — 추가 로컬 디스크 크기(GB) |
| `--protect` | create | NHN 확장 — 삭제 보호 설정 |
| `--user-data <path>` | create | cloud-init user-data 파일 경로 — base64 인코딩해 `user_data` 주입 (인코딩 후 65535 바이트 한도, [[adr-012]]) |
| `--wait` | create | ACTIVE + IP 할당까지 폴링 대기 |
| `--timeout <s>` | create | `--wait` timeout (기본 300) |
| `--yes` | delete | confirm 생략 (CI·자동화용) |
| `--hard` | reboot | HARD 재부팅 (강제 전원 cycle, 기본은 SOFT) |
| `--public-key <path\|key>` | keypair create | 기존 공개키 등록 (파일 경로 또는 키 문자열). 지정 시 private_key 미반환 |
| `-o, --output <keyfile>` | keypair create | NHN 이 생성한 private_key 를 파일(mode 0600)로 저장 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### flavors 조회

- 기본(`instance flavors`)은 `GET /flavors` — id·name 만 테이블에 표시한다. create 에 넣을 flavor id 를 고르는 단계.
- `--detail` 은 `GET /flavors/detail` — 테이블에 vcpus·ram(MB)·disk(GB)를 더한다.
- 테이블은 핵심 5컬럼(id·name·vcpus·ram·disk)만 보여준다. is_public·extra_specs 등 나머지 필드는 `--json` 으로 확인한다.
- `--min-disk`·`--min-ram` 은 그대로 쿼리 파라미터로 전달해 NHN API 가 필터링한다.

### keypair 관리

- `instance keypairs` — name·fingerprint 목록.
  create 의 `--key-name` 에 넣을 키페어를 고르는 단계.
- `instance keypair get <name>` — 단건 상세 (name·fingerprint·user_id·created_at·public_key).
- `instance keypair create <name>` — 키페어 생성.
  두 경로로 동작한다.
  - `--public-key <path|key>` 지정: 기존 공개키를 등록한다.
    NHN 은 private_key 를 만들지 않으므로 응답에 private_key 가 없다.
  - 미지정: NHN 이 키쌍을 생성하고 응답에 **private_key 를 한 번만** 포함한다 (이후 `keypair get` 으로도 재조회 불가).
    - `--output <keyfile>` 지정 시 private_key 를 mode 0600 파일로 원자적으로 저장한다 (자동화 권장).
    - 미지정 시 stderr 에 "한 번만 표시됨" 경고와 함께 private_key 를 stdout 으로 출력한다.
  - `--output` 과 `--public-key` 동시 지정은 모순이라 `EXIT_PARAM_ERROR` 로 차단한다 (등록 경로엔 private_key 가 없다).
- `instance keypair delete <name>` — 삭제 (202/204 무응답).

### create 비동기 + `--wait`

- 기본은 비동기 — create 호출이 성공하면 `BUILD` 상태로 즉시 반환한다.
- `--wait` 지정 시 5초 간격으로 `GET /servers/{id}` 폴링해 `ACTIVE` 상태 + 첫 IP 할당까지 대기한다.
- `--timeout` 초과 시 `EXIT_API_ERROR` 로 종료 (생성된 인스턴스는 남으므로 사용자가 delete 또는 재시도).
- `--quiet` + `--wait` 조합은 ACTIVE 도달 후 IP 한 줄만 stdout — CI 에서 다음 step 으로 바로 파이프.

### 전원 제어 (start / stop / reboot)

- 전원 제어(`start`/`stop`/`reboot`)는 모두 `POST /servers/{id}/action` 한 경로다 (응답 202 무본문).
  client 의 공용 `serverAction(id, payload)` 가 action body(`os-start`/`os-stop`/`reboot.type`)만 달리해 호출한다.
  조회가 아니라 동작이라 출력은 성공 메시지(stderr)뿐이고 stdout 은 비운다 (delete 와 동일).
  상태 전이 확인은 후속 `instance get <id>` 로 한다.

### resize (타입 변경 — 2단계)

- `instance resize <id> --flavor <flavorId>` 는 같은 `serverAction` 경로로 `{ "resize": { "flavorRef": "..." } }` 를 보낸다 (응답 202 무본문, fire-and-return).
- OpenStack Nova v2 표준상 resize 는 **2단계**다 ([[adr-010]]). resize 호출 → 서버가 `VERIFY_RESIZE` 로 전이 → 사용자가 확정/롤백을 별도 호출해야 `ACTIVE` 가 된다.
  - `instance resize-confirm <id>` — `{ "confirmResize": null }` (새 flavor 고정).
  - `instance resize-revert <id>` — `{ "revertResize": null }` (이전 flavor 복귀).
- resize 후 `instance get <id>` 로 `VERIFY_RESIZE` 를 확인한 뒤 confirm/revert 한다. (NHN 이 자동 confirm 하면 바로 `ACTIVE` — 그 경우 confirm/revert 가 불필요할 뿐 명령은 에러 없이 무해.) `--flavor` 후보 id 는 `instance flavors` 로 조회한다.

### delete 안전 정책

- 대화형 TTY: `y/N` confirm 후 삭제. 기본 답은 No.
- `--yes` 또는 non-TTY: 즉시 삭제.
- `--quiet --yes` 조합은 자동화 전용 (회수 step 등).

### instance 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 잘못된 region | `EXIT_PARAM_ERROR` |
| `--wait` timeout | `EXIT_API_ERROR` (메시지에 마지막 status 포함) |
| Compute API 4xx · 5xx | `EXIT_API_ERROR` |

## network 흐름

NHN VPC 명령군. instance 와 같은 Keystone 토큰을 발급해 region 별 network endpoint 로 호출한다 ([[adr-013]], [[adr-010]]).
VPC 목록은 `instance create --network <uuid>` 에 넣을 **VPC id** 를 고르는 단계다 (Nova `networks[].uuid` = VPC id, 실측 확정).

### 인증 흐름

instance 와 동일하다 — `iaas` 블록 + Keystone `X-Auth-Token` 재사용(새 토큰 발급 없음).
endpoint 만 network host(`<region>-api-network-infrastructure...`, tenant segment 없음)로 다르다.

### 명령 시그니처

```
nhncloud network list [options]              # VPC 목록 (create --network 소스)
nhncloud network subnet list [options]       # 서브넷 목록
```

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--region <r>` | 전체 | `iaas.region` override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 전체 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 출력

- `network list` 테이블: `id` / `name` / `cidrv4` / `state` / `external`(router:external). 전체 필드는 `--json`.
- `network subnet list` 테이블: `id` / `cidr` / `vpc_id` / `gateway` / `available_ip`. 전체 필드는 `--json`.
- `--quiet` 는 id 만 — `network list --quiet` 의 VPC id 를 `instance create --network <uuid>` 로 바로 파이프한다 (uuid = VPC id, 실측 확정).

### network 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 잘못된 region | `EXIT_PARAM_ERROR` |
| VPC API 4xx · 5xx | `EXIT_API_ERROR` |

## volume (Block Storage) 흐름

Cinder(volumev2) 명령군. instance 와 같은 Keystone 토큰을 발급해 region 별 block storage endpoint 로 호출한다 ([[adr-013]], [[adr-010]]).
host 만 다르고 경로는 compute 처럼 **tenant segment 를 포함**한다(`/v2/{tenantId}/volumes`).

```
nhncloud volume list [options]                 # 볼륨 목록 (id·name·size·status)
nhncloud volume get <id> [options]             # 단일 볼륨
nhncloud volume create --size <GB> [options]   # 볼륨 발급 (쓰기 — --name/--description/--volume-type)
```

- `volume list`/`get` 은 읽기. `volume create` 는 실제 볼륨 발급(비용)이라 쓰기 — 정리(삭제)는 현재 콘솔 (volume delete 는 후속 ROADMAP).
- `instance volume attach/detach`(쓰기)·`instance volumes`(읽기)는 Nova `os-volume_attachments`(compute endpoint)로 인스턴스↔볼륨 연결을 다룬다 (read-only GET 200 으로 지원 확정).
- `volume list` 의 id 를 `instance volume attach --volume <id>` 에 넣어 연결한다.

### volume 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| `--size` 누락/형식 오류 | `EXIT_PARAM_ERROR` |
| Cinder/Nova API 4xx · 5xx | `EXIT_API_ERROR` |

## floatingip (공인 IP) 흐름

Floating IP 명령군. network(VPC) 와 같은 catalog type `network` 라 [[adr-013]] 의 `networkEndpoint`(host·`/v2.0` 경로, tenant segment 없음)를 그대로 재사용한다 — 새 host·새 endpoint·새 ADR 없음.

```
nhncloud floatingip list [options]               # Floating IP 목록 (id·공인 IP·status·port_id·fixed_ip_address)
nhncloud floatingip create [options]             # 발급 (쓰기 — --network 미지정 시 외부 VPC 자동 조회)
nhncloud floatingip delete <id> [options]        # 삭제 (쓰기 — 기본 confirm, --yes 즉시)
```

두 가지 비자명한 흐름:

- **create 의 외부 네트워크 자동 조회**: `--network` 미지정 시 `GET /v2.0/vpcs?router:external=true` 로 외부 VPC id 를 찾아 `floating_network_id` 로 쓴다. `router:external` 은 콜론 포함 리터럴 키라 bracket 접근. 외부 VPC 가 없으면 `--network` 직접 지정을 요구한다(`EXIT_PARAM_ERROR`). external VPC 가 둘 이상이면 첫 매칭을 쓰고, 선택된 id 를 발급 spinner 에 노출한다.
- **associate 보류**: 연결 API(`PUT /v2.0/floatingips/{id}`)는 인스턴스 id 가 아니라 port_id 를 요구하는데, instance→port_id 매핑 경로(`GET /v2.0/ports?device_id`)를 실측할 instance id 가 없어 보류했다. 실측 확정 후 후속 task 에서 `floatingip associate` 를 추가한다.

### floatingip 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 외부 네트워크 미발견(create `--network` 미지정) / 비대화형 delete `--yes` 누락 | `EXIT_PARAM_ERROR` |
| Floating IP API 4xx · 5xx | `EXIT_API_ERROR` |

## ncr (NHN Container Registry) 흐름

레지스트리 조회 명령군. NCR Management API 는 공통 UAK 를 정적 헤더(`X-TC-AUTHENTICATION-ID/SECRET`)로 받고 region 별 host 를 쓴다([[adr-016]]) — deploy 의 OAuth 토큰 교환이 없다.

```
nhncloud ncr list [options]                      # 레지스트리 목록 (name·repo_count·uri)
nhncloud ncr get <registry> [options]            # 단일 레지스트리 조회 (이름 또는 id)
```

| 옵션 | 설명 |
|------|------|
| `--region <region>` | NCR region (기본 `kr1`. IaaS region 과 별개 축) |
| `--app-key <key>` | NCR 서비스 appkey. 미지정 시 profile 의 `ncr.appkey` 사용 |
| `--profile <name>` | 사용할 profile |

두 가지 비자명한 흐름:

- **appKey 해석 순서**: `--app-key` 옵션 > profile 의 `ncr` 블록(`{ appkey }`). 둘 다 없으면 설정 안내와 함께 `EXIT_CONFIG_ERROR`. 인증 비밀은 공통 UAK secret 을 재사용하므로 ncr 블록에 secret 을 따로 두지 않는다.
- **이미지/태그 조회 부재**: NCR public API 에는 이미지·태그 목록 조회 endpoint 가 없다(콘솔 UI 전용). Docker Registry HTTP API v2(`/v2/_catalog`·`/v2/{repo}/tags/list`) 우회는 실측 확정 후 후속 task 022 에서 `ncr images`·`ncr tags` 로 도입한다.

### ncr 에러 경로

| 상황 | exit code |
|------|-----------|
| 공통 UAK 누락 / 인증 실패(401·403) | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| appKey 미지정(옵션·자격증명 모두 없음) / 미등록 region | `EXIT_CONFIG_ERROR` / `EXIT_PARAM_ERROR` |
| NCR API 4xx · 5xx | `EXIT_API_ERROR` |
