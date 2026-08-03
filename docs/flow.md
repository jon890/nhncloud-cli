# User Flow — nhncloud-cli

## 최초 설정 — `nhncloud configure`

대화형 마법사로 자격증명을 설정한다 ([[adr-009]]).

```bash
nhncloud configure                    # 기본 profile 대화형
nhncloud configure --profile playground
```

### 대화형 흐름

1. profile 이름 (기본 `default`). profile = 프로젝트 하나에 대응한다 — 여러 프로젝트는 profile 을 나눠 `--profile` 로 전환한다.
2. 개인 UAK — id, secret (password 입력). 기존 profile 에 UAK 가 있으면 재사용할지 먼저 묻는다(멀티 프로젝트에서 계정 단위 UAK 중복 입력을 줄임).
3. 서비스별 자격증명 — logncrash appkey, ncr appkey, ncs appkey (각 건너뛰기 가능, appkey 는 빈값 검증).
4. 연결 테스트 (UAK → OAuth 발급, logncrash → 최소 검색, ncr·ncs → kr1 목록 조회).
5. 기존 값과 머지 저장 (`credentials.json` 0600, all-or-nothing).

### 비대화형 (flag — CI·자동화)

flag 가 하나라도 있으면 비대화형으로 동작한다.

```bash
nhncloud configure --profile playground \
  --uak-id <id> --uak-secret <secret> \
  --logncrash-appkey <appkey> \
  [--ncr-appkey <appkey>] [--ncs-appkey <appkey>] [--no-verify]
```

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 대상 profile (기본 default) |
| `--uak-id` / `--uak-secret` | 개인 UAK |
| `--logncrash-appkey` | logncrash 프로젝트 appkey. 검색 인증은 profile 공통 UAK 토큰을 사용 |
| `--logncrash-secret` | 전환 호환용 폐기 예정 옵션. 경고 후 값을 저장하거나 사용하지 않음 |
| `--ncr-appkey <key>` | NCR(Container Registry) appkey (인증 secret 은 공통 UAK 재사용) |
| `--ncs-appkey <key>` | NCS(Container Service) appkey (인증 토큰은 공통 UAK OAuth 재사용) |
| `--no-verify` | 연결 테스트 생략 |

### 연결 테스트

- UAK — OAuth `token/create` 호출 성공 여부로 검증
- logncrash — profile 공통 UAK 토큰과 appkey로 짧은 범위(예: 1분) v3 검색을 호출해 인증(401/403) 검증. UAK가 없으면 검증을 건너뛰지 않고 설정 오류로 종료
- ncr — kr1 레지스트리 목록 조회로 검증. 인증 secret 이 공통 UAK 라 UAK 가 없으면 검증을 건너뛰고 경고만 출력한다. configure verify 는 **kr1 가정** — kr2/kr3 만 쓰는 경우 첫 `ncr list --region kr2` 호출이 사실상의 검증이 된다.
- ncs — kr1 template 목록 조회로 검증. 인증 토큰이 공통 UAK OAuth 라 UAK 가 없으면 검증을 건너뛰고 경고만 출력한다. ncr 과 동일하게 **kr1 가정**.
- 실패 시 저장 여부를 다시 확인 (또는 비대화형은 비-0 종료)

## Agent command discovery 흐름

AI 에이전트나 자동화 스크립트는 실행 전 command catalog를 먼저 읽는다.

```bash
nhncloud commands --json
nhncloud commands --json | jq '.commands[] | select(.path=="nks cluster list")'
```

권장 순서:

1. `nhncloud commands --json`으로 command path와 option을 확인한다.
2. 필요한 서비스 reference(`skills/nhncloud-cli/references/*.md`)를 읽는다.
3. discovery 명령을 `--json`으로 호출한다.
4. 쓰기/삭제 명령은 `--yes`, payload file, region, profile을 명시한다.

`commands`는 Commander tree metadata만 출력하며 외부 API를 호출하지 않는다.

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
| `--cursor <value>` | 아니오 | 직전 JSON 응답의 `nextCursor`. 첫 페이지에서는 생략 |
| `--page <n>` | 아니오 | 전환 호환용. `0`만 허용하며 그 외 값은 `--cursor` 사용을 안내하고 입력 오류로 종료 |
| `--size <n>` | 아니오 | 커서 검색의 `pageSize` (기본 10, 최대 100) |
| `--profile <name>` | 아니오 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 쿼리 해석

`--query` 는 Log & Crash Search API 의 Lucene 쿼리 원문이다.
콘솔의 간편 body 키워드 검색과 동일하다고 가정하지 않는다.

- body 단어 검색: `body:request_received`
- body 부분 문자열 검색: `body:*request_received*`
- logType 검색: `logType:"ERROR"`

전송 직후에는 인덱싱 지연으로 잠시 0건이 나올 수 있다.
반복 검색이나 넓은 wildcard 검색은 API rate limit 에 걸릴 수 있으므로 시간 범위를 좁혀 확인한다.

### 시간 입력 해석

- 상대시간 (`1h`/`30m`/`2d`) 과 `now` 는 호출 시점 기준으로 ISO8601 로 변환해 API 전달.
- ISO8601 직접 입력은 그대로 통과.
- API 제약: 최근 90일 이내, 범위 31일 이하 (초과 시 사전 에러).

### 출력

- 기본(테이블): 고정 컬럼 `logTime` / `logType` / 본문 요약.
- `--json`: API `body` 의 `data` 배열 raw + 페이지 메타 + 다음 페이지가 있을 때 `nextCursor`.
- `--quiet`: 자동화용 최소 출력 (행별 핵심 식별 정보).

### 에러 경로

| 상황 | exit code |
|------|-----------|
| 자격증명 누락 | `EXIT_CONFIG_ERROR` |
| UAK 토큰 또는 appkey 인증 실패 (401/403) | `EXIT_AUTH_ERROR` |
| 봉투 `isSuccessful: false` / 기타 4xx·5xx | `EXIT_API_ERROR` |
| 시간 범위 초과 등 입력 오류 | `EXIT_PARAM_ERROR` |

## logncrash export 흐름

검색 결과 전체를 v3 scroll API 로 순회해 파일로 추출한다 (search 단발 조회와 별도 명령).
search 와 같은 host(`api-lncs-search`)·UAK OAuth 토큰·봉투 helper 를 재사용한다 ([[adr-024]]).

### scroll 순회

1. `POST /v3/{appkey}/logs/scroll` 로 시작한다 (body: query/from/to). 응답 `body` 에 `scrollKey`·`totalItems`·`pageSize`·`data` 가 온다 (`NhnEnvelope` + `unwrap`).
2. `data`가 비지 않고 `scrollKey`가 있으면
   `POST /v3/{appkey}/logs/scroll/{scrollKey}`(body 없음)로 다음 페이지를 이어 받는다.
   계속 응답의 `pageSize`는 선택 필드다.
3. `data` 가 빌 때까지 (또는 안전 상한 10만 건까지) 반복한다. 상한을 넘으면 잘렸음을 stderr 로 경고한다.

v3 공개 명세는 scroll 시작 요청에 `pageSize`를 정의하지 않는다.
기존 `--size`는 전환 호환을 위해 인식하되, 값을 검증하고 경고한 뒤 요청에는 넣지 않는다.

### scroll 계속 요청 실패

v3 공개 명세는 `scrollKey` 유효기간을 정의하지 않는다.
다음 페이지 실패 시 만료라고 단정하지 않고 원본 오류 메시지를 보존한다.
키 만료, 5xx, 네트워크 일시 오류가 같은 종료 코드로 보일 수 있으므로 검색 범위를 좁혀 처음부터 다시 실행하도록 안내한다.

### 출력

- `--output <file>` 필수. 기본 JSON Lines (한 줄당 한 로그), `--format json` 이면 JSON 배열. 기존 파일은 기본 거부 — `--force` 로만 덮어쓴다 (deploy download 와 동일 정책).
- 진행 상황(수집/전체 건수)은 spinner(stderr), 데이터는 파일에만 쓴다. 페이지 수신 즉시 temp 파일에 스트리밍 append (전량 메모리 적재 회피) 후 원자적으로 교체한다 (중단 시 부분 파일 방지, 실패 시 temp 정리).
- 시간 범위 제한은 search 와 동일 (90일 이내·31일 이하).

## logncrash send 흐름

검색에 대칭되는 쓰기 명령이다. 검색과 **다른 collector host(`api-logncrash`) + appkey-only 인증(secret 불요)** 을 쓴다 ([[adr-014]]).

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

- 검색의 `X-NHN-Authorization` 헤더가 없다. body 의 `projectName` 에 appkey 를 넣어 식별한다 (UAK 토큰과 서비스 secret 불요·[[adr-014]], [[adr-024]]).
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

`<target>` 은 config.json 의 deploy target 이름이다. target 이 좌표(appKey·artifactId·serverGroupId·scenarioIds)를 공급하며, 아래 flag 로 개별 override 한다.

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

`password` 는 NHN 콘솔 IAM 의 API 비밀번호다 (로그인 비밀번호가 아니다).

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
| `--min-disk <gb>` | flavors | 최소 블록 스토리지 크기(GB) 이상만 필터 (0 이상의 정수) |
| `--min-ram <mb>` | flavors | 최소 RAM 크기(MB) 이상만 필터 (0 이상의 정수) |
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

instance 와 동일하다 — `iaas` 블록 + Keystone `X-Auth-Token` 을 재사용한다(새 토큰 발급이 없다).
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
nhncloud volume create --size <GB> [options]   # 볼륨 발급 (쓰기 — --name/--description/--volume-type/--availability-zone)
```

- `volume list`/`get` 은 읽기. `volume create` 는 실제 볼륨 발급(비용)이라 쓰기 — 정리(삭제)는 현재 콘솔 (volume delete 는 후속 ROADMAP).
- `--availability-zone <az>` 로 `instance availability-zones` 의 `zoneName` 을 지정하면 인스턴스와 같은 AZ에 볼륨을 만들어 attach 시 AZ 불일치 400을 피할 수 있다.
- `instance volume attach/detach`(쓰기)·`instance volumes`(읽기)는 Nova `os-volume_attachments`(compute endpoint)로 인스턴스↔볼륨 연결을 다룬다 (read-only GET 200 으로 지원 확정).
- `volume list` 의 id 를 `instance volume attach --volume <id>` 에 넣어 연결한다.

### volume 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| `--size` 누락/형식 오류 또는 공백-only `--availability-zone` | `EXIT_PARAM_ERROR` |
| Cinder/Nova API 4xx · 5xx | `EXIT_API_ERROR` |

## floatingip (공인 IP) 흐름

Floating IP 명령군이다. network(VPC) 와 같은 catalog type `network` 라 [[adr-013]] 의 `networkEndpoint`(host·`/v2.0` 경로, tenant segment 없음)를 그대로 재사용한다 — 새 host·새 endpoint·새 ADR 이 없다.

```
nhncloud floatingip list [options]               # Floating IP 목록 (id·공인 IP·status·port_id·fixed_ip_address)
nhncloud floatingip create [options]             # 발급 (쓰기 — --network 미지정 시 외부 VPC 자동 조회)
nhncloud floatingip delete <id> [options]        # 삭제 (쓰기 — 기본 confirm, --yes 즉시)
```

두 가지 비자명한 흐름:

- **create 의 외부 네트워크 자동 조회**: `--network` 미지정 시 `GET /v2.0/vpcs?router:external=true` 로 외부 VPC id 를 찾아 `floating_network_id` 로 쓴다.
  `router:external` 은 콜론 포함 리터럴 키라 bracket 으로 접근한다.
  외부 VPC 가 없으면 `--network` 직접 지정을 요구한다(`EXIT_PARAM_ERROR`).
  external VPC 가 둘 이상이면 첫 매칭을 쓰고, 선택된 id 를 발급 spinner 에 노출한다.
- **associate 보류**: 연결 API(`PUT /v2.0/floatingips/{id}`)는 인스턴스 id 가 아니라 port_id 를 요구한다.
  instance→port_id 매핑 경로(`GET /v2.0/ports?device_id`)를 실측할 instance id 가 없어 보류했다.
  실측 확정 후 후속 task 에서 `floatingip associate` 를 추가한다.

### floatingip 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 외부 네트워크 미발견(create `--network` 미지정) / 비대화형 delete `--yes` 누락 | `EXIT_PARAM_ERROR` |
| Floating IP API 4xx · 5xx | `EXIT_API_ERROR` |

## loadbalancer IP ACL 흐름

Load Balancer와 IP ACL은 network endpoint와 Keystone `X-Auth-Token`을 재사용한다([[adr-013]], [[adr-022]]).
그룹·대상 목록과 Load Balancer 적용 상태를 먼저 조회한 뒤, 별도 변경 명령으로 전체 교체와 재바인딩을 수행한다.

### 명령 시그니처

```text
nhncloud loadbalancer list
nhncloud loadbalancer get <lb>

nhncloud loadbalancer ipacl list
nhncloud loadbalancer ipacl get <group>
nhncloud loadbalancer ipacl create --name <name> --action <ALLOW|DENY> [--description <text>]
nhncloud loadbalancer ipacl delete <group> --yes

nhncloud loadbalancer ipacl target list <group>
nhncloud loadbalancer ipacl target add <group> --cidr <ip-or-cidr> [--description <text>] [--no-rebind] --yes
nhncloud loadbalancer ipacl target remove <target-id> [--no-rebind] --yes

nhncloud loadbalancer set-ipacl <lb> --group <group> [--group <group>...] --yes
nhncloud loadbalancer clear-ipacl <lb> --yes
```

모든 명령은 `--region`, `--profile`, 전역 `--json`·`--quiet`를 지원한다.
`<lb>`와 `<group>`은 UUID 또는 이름을 받는다.
동일한 이름이 둘 이상이면 임의로 선택하지 않고 후보 UUID를 포함한 입력 오류를 반환한다.
IP ACL 대상에는 이름이 없으므로 `target remove`는 UUID만 받는다.

### 조회 흐름

1. profile과 region을 해석하고 기존 IaaS Keystone 토큰과 network endpoint를 재사용한다.
2. Load Balancer, IP ACL 그룹, 대상 API를 한 번 호출한다.
   공식 API에 페이지 입력이나 다음 페이지 응답이 없어 CLI 페이지 옵션을 추가하지 않는다.
3. 빈 목록은 기본 출력에서 `결과 없음`, `--json`에서 `[]`, `--quiet`에서 빈 stdout으로 반환한다.
4. 기본 표는 자동화에 필요한 식별자와 상태만 보여주고, 전체 원본 필드는 `--json`으로 반환한다.

### 전체 교체와 해제

- `set-ipacl`은 `--group`을 한 번 이상 요구하며 기존 적용 그룹을 전부 입력 목록으로 교체한다.
- `clear-ipacl`만 빈 배열을 전송해 모든 그룹을 해제한다.
- 두 명령은 대화형 확인을 열지 않는다.
  `--yes`가 없으면 자격증명 해석과 API 호출 전에 `EXIT_PARAM_ERROR`로 실패한다.
- 여러 그룹의 action이 섞이면 API 호출 전에 차단한다.

### 대상 변경과 자동 재바인딩

`target add`와 `target remove`는 기본으로 대상 그룹이 적용된 모든 Load Balancer를 재바인딩한다.
자동 재바인딩을 생략하려면 `--no-rebind`를 명시해야 하며, 이 경우 규칙이 즉시 반영되지 않을 수 있음을 stderr로 경고한다.

1. `--yes`, CIDR, 필수 인자를 먼저 검증한다.
2. 그룹과 적용된 Load Balancer를 해석한다.
3. 각 Load Balancer의 전체 IP ACL 그룹 ID 목록을 변경 전에 저장한다.
4. 대상을 추가하거나 삭제한다.
5. 저장한 전체 목록으로 관련 Load Balancer를 모두 재바인딩한다.
   한 건이 실패해도 나머지는 계속 시도한다.
6. 실패한 Load Balancer가 있으면 자동 원복하지 않는다.
   성공·실패 ID, 원래 그룹 ID, 재시도 명령을 구조화해 반환하고 실패 종료 코드를 설정한다.

API 성공은 데이터 경로 반영 완료를 뜻하지 않는다.
실측으로 반영 시점이 Load Balancer마다 다르고 10~20초가 걸릴 수 있어, CLI는 고정 대기나 조회 API 폴링을 성공 판정으로 사용하지 않는다.
ALLOW 그룹은 외부 주소뿐 아니라 Load Balancer가 속한 VPC 사설 대역이 없으면 전체 차단될 수 있음을 변경 전에 stderr로 경고한다.

### 출력과 오류

- `stdout`: 조회 데이터와 변경 결과. 부분 실패의 `--json` 결과에는 성공·실패 Load Balancer, 그룹 목록, 재시도 명령을 포함한다.
- `stderr`: 진행 상태, 안전 경고, 사람이 읽는 실패 요약.
- 변경 전 실패는 stdout을 비운다.
  대상 변경 뒤 재바인딩 일부가 실패하면 구조화된 결과를 stdout에 남기고 `EXIT_API_ERROR`로 종료한다.
- 모든 위험 변경은 `--yes`가 필수이며 대화형 입력을 기다리지 않는다.

[[adr-022]]가 전체 교체, 자동 재바인딩, 자동 원복 금지의 근거를 소유한다.

## ncr (NHN Container Registry) 흐름

레지스트리 조회 명령군. NCR Management API 는 공통 UAK 를 정적 헤더(`X-TC-AUTHENTICATION-ID/SECRET`)로 받고 region 별 host 를 쓴다([[adr-016]]) — deploy 의 OAuth 토큰 교환이 없다.

```
nhncloud ncr list [options]                          # 레지스트리 목록 (name·repo_count·uri)
nhncloud ncr get <registry> [options]                # 단일 레지스트리 조회 (이름 또는 id)
nhncloud ncr images <registry> [options]             # 이미지(repository) 목록 (Harbor REST, [[adr-017]])
nhncloud ncr tags <registry> <repository> [options]  # 특정 이미지의 태그 목록 (artifact tags flatten)
```

| 옵션 | 설명 |
|------|------|
| `--region <region>` | NCR region (기본 `kr1`. IaaS region 과 별개 축) |
| `--app-key <key>` | NCR 서비스 appkey. 미지정 시 profile 의 `ncr.appkey` 사용 |
| `--profile <name>` | 사용할 profile |

두 가지 비자명한 흐름:

- **appKey 해석 순서**: `--app-key` 옵션 > profile 의 `ncr` 블록(`{ appkey }`). 둘 다 없으면 설정 안내와 함께 `EXIT_CONFIG_ERROR`. 인증 비밀은 공통 UAK secret 을 재사용하므로 ncr 블록에 secret 을 따로 두지 않는다.
- **이미지/태그 조회 경로**: NCR Management API 에는 이미지·태그 목록 endpoint 가 없어, 레지스트리 데이터플레인 host 의 **Harbor REST `/api/v2.0`** 을 직접 호출한다([[adr-017]]).
  host 는 `ncr get` 의 `registry.uri` 에서 추출한다.
  인증은 UAK `Basic Auth` 로, Management API 의 X-TC 헤더와 다른 모델이다.
  응답은 NHN 봉투가 아닌 Harbor 평면 JSON 이다.
  당초 가정한 Docker Registry v2 `/v2/_catalog` 는 admin 전용 401 이라 기각했다(실측).
  - `ncr images <registry>`: `/api/v2.0/projects/{registry}/repositories` → repository 목록(name·artifact_count·pull_count).
  - `ncr tags <registry> <repository>`: `/api/v2.0/projects/{registry}/repositories/{repo}/artifacts` → 각 artifact 의 `tags` 를 flatten(tag·push_time·size).

### ncr 에러 경로

| 상황 | exit code |
|------|-----------|
| 공통 UAK 누락 / 인증 실패(401·403) | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| appKey 미지정(옵션·자격증명 모두 없음) / 미등록 region | `EXIT_CONFIG_ERROR` / `EXIT_PARAM_ERROR` |
| NCR API 4xx · 5xx | `EXIT_API_ERROR` |

## nks (NHN Kubernetes Service) 흐름

NKS는 Container 서비스지만 인증은 NCR 이 아니라 IaaS Keystone 계열이다([[adr-019]]).
profile 의 `iaas` 블록에서 Keystone 토큰을 발급하고, region 별 NKS endpoint 에 `container-infra` API 로 호출한다.

### 인증 흐름

1. profile 의 `iaas` 블록에서 tenantId · username · password · region 로드
2. 캐시된 Keystone token 이 만료 전이면 재사용, 아니면 발급 후 캐시
3. `X-Auth-Token: <tokenId>` 와 `OpenStack-API-Version: container-infra latest` 헤더로 NKS API 호출

### 명령 시그니처

```
nhncloud nks supports
nhncloud nks cluster list|get|create|delete|resize|kubeconfig|events|event|ipacl|set-ipacl|renew-certificate|update-sgw|set-control-plane-log
nhncloud nks nodegroup list|get|create|delete|start-node|stop-node|autoscale|set-autoscale|set-metric-autoscale|upgrade|set-userscript|update-flavor|set-fip-auto-bind|set-labels
nhncloud nks addon-type list|get
nhncloud nks addon list|get
nhncloud nks cluster addon list|get|install|update|remove
```

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--region <r>` | 전체 | `iaas.region` override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 전체 | profile 선택 |
| `--file <json>` | create/update 계열 | 공식 API payload 를 담은 JSON 파일 |
| `--yes` | delete/remove 계열 | confirm 생략 |
| `--output <file>` | kubeconfig | kubeconfig 를 mode 0600 파일로 저장 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 구현 순서

- Phase 1: endpoint/auth/client 골격과 `nks supports`, `nks cluster list`.
- Phase 2: 클러스터·노드 그룹·애드온 조회 기능 전체.
- Phase 3: 클러스터 생성·삭제·resize·IP 접근 제어·인증서·서비스 게이트웨이·control plane log.
- Phase 4: 노드 그룹 생성·삭제·노드 시작/중지·autoscale·upgrade·userscript·flavor·floating IP·Kubernetes label.
- Phase 5: 클러스터 애드온 설치·업데이트·제거.
- Phase 6: README 와 공개 skill 반영.

### kubeconfig

`nks cluster kubeconfig <cluster>` 는 기본으로 kubeconfig 본문을 stdout 에 출력한다.
`--output <file>` 을 지정하면 파일을 mode 0600 으로 저장한다.
기존 kubeconfig 병합은 이번 범위에서 제외한다.

### 쓰기 payload 정책

클러스터 생성, 노드 그룹 생성, 지표 기반 autoscale, control plane log 처럼 중첩 필드가 많은 명령은 `--file <json>` 을 기본 입력으로 둔다.
자주 쓰는 단순 변경만 flag 로 직접 받는다.
삭제 계열은 기존 `instance delete` 와 같은 confirm + `--yes` 정책을 따른다.

### nks 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 잘못된 region / payload 파일 파싱 실패 / 필수 인자 누락 | `EXIT_PARAM_ERROR` |
| NKS API 4xx · 5xx / 응답 형식 불일치 | `EXIT_API_ERROR` |

## ncs (NHN Container Service) 흐름

NCS 는 Container 서비스지만 인증은 NKS(Keystone)·NCR(정적 헤더)이 아니라 Deploy 와 같은 UAK OAuth Bearer 토큰이다([[adr-020]]).
profile 의 UAK 로 OAuth 토큰을 발급(Deploy 와 캐시 공유)하고, region 별 NCS endpoint 에 appkey 를 경로에 넣어 호출한다.
응답은 NHN 공통 봉투(숫자 `resultCode`)이고 모든 API 가 HTTP 200 으로 응답하므로 성공·실패는 `header` 로 판별한다([[adr-006]]).

### 인증 흐름

1. profile 의 UAK(id·secret) 로 OAuth `access_token` 발급 — 캐시 유효하면 재사용([[adr-007]] Deploy 와 공유)
2. profile 의 `ncs` 블록에서 appkey 로드(또는 `--app-key` override)
3. `x-nhn-authorization: Bearer <token>` 헤더 + 경로 `/ncs/v1.0/appkeys/{appKey}/...` 로 NCS API 호출

### 리소스 관계

- **Template**: 컨테이너 실행 설계도(이미지·CPU/메모리·포트·네트워크). 자체 상태값 없음. 버전으로 관리한다.
- **Workload**: 템플릿을 실제 실행하는 런타임(replica `desired` 개). LB·오토스케일·예약실행을 워크로드 레벨에서 설정. 개별 실행 단위는 task.
- **History**: 워크로드 배포 이력. 악성코드 검사 결과가 history 에 붙는다.
- 관계: Template → Version → Workload(task N개) → History.

### 명령 시그니처

```
nhncloud ncs template list|get|create|delete
nhncloud ncs template version list|get|create|delete
nhncloud ncs workload list|get|logs|events|history|schedule-history
nhncloud ncs workload create|update|patch|pause|resume|restart|delete
nhncloud ncs malware config get|set
nhncloud ncs malware result <workloadId> <historyId>
```

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--region <r>` | 전체 | ncs region override (kr1/kr3, 기본 kr1) |
| `--app-key <key>` | 전체 | profile `ncs.appkey` override |
| `--profile <name>` | 전체 | profile 선택 |
| `--file <json>` | template/workload create·update·patch | 공식 API payload 를 담은 JSON 파일 (patch 는 json-patch 배열) |
| `--wait` | workload create | Running 상태까지 폴링 |
| `--task <id>` / `--container <name>` | workload logs·events·restart | 대상 task·컨테이너 지정 |
| `--from <time>` / `--to <time>` | workload logs·events | 시간대 포함 RFC3339, `now`, 0 이상의 정수와 `m`·`h`·`d` 단위 |
| `--yes` | delete 계열 | confirm 생략 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### logs·events 시간 필터

NCS API는 `from`·`to`에 UTC `Z` 형식만 정상 처리한다([[adr-023]]).
CLI는 시간대 포함 RFC3339와 상대시간을 한 번 캡처한 기준 시각으로 UTC 초 단위 문자열에 맞춘다.

두 옵션을 모두 생략하면 쿼리 매개변수도 보내지 않아 API 기본 범위를 유지한다.
한쪽만 입력하면 입력한 쪽만 전송한다.
형식 오류, 시간대 없는 절대시간, 존재하지 않는 날짜, `from > to`는 자격증명과 API 접근 전에 `EXIT_PARAM_ERROR`로 종료한다.

### 구현 순서

- Phase(task 1): endpoint/auth/client 골격 + template 조회 4개 + workload 조회 7개.
- Phase(task 2): template 생성·삭제·버전 쓰기 + workload 실행 제어(pause/resume/restart/delete).
- Phase(task 3): workload create(`--wait`)·update·patch(`--file`) + malware 3개.

### 쓰기 payload 정책

workload·template 생성은 중첩 필드가 많아 `--file <json>` 을 기본 입력으로 둔다([[adr-020]], NKS 선례).
workload patch 는 `application/json-patch+json` Content-Type 의 json-patch 배열 파일을 받는다.
삭제 계열은 `instance delete` 와 같은 confirm + `--yes` 정책을 따른다.

### ncs 에러 경로

| 상황 | exit code |
|------|-----------|
| UAK 누락 / OAuth 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| appkey 누락 / 잘못된 region / payload 파일 파싱 실패 / 필수 인자 누락 / 잘못된 시간 필터 | `EXIT_PARAM_ERROR` |
| 봉투 `header.isSuccessful=false` (resultCode 10000번대) / 응답 형식 불일치 | `EXIT_API_ERROR` |
