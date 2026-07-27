# AGENTS.md / CLAUDE.md — nhncloud-cli

## 프로젝트 개요

NHN Cloud 서비스를 AWS CLI 처럼 호출하는 통합 CLI다.
TypeScript + Commander.js 기반이다. dooray-cli 의 기반과 하네스를 재사용한다.

## 지원 명령 (147개 command catalog 항목)

- `configure` — 자격증명 설정 마법사 (대화형 + flag, UAK + 서비스별 키, 연결 테스트).
- `commands` — Commander tree에서 command path·argument·option·description catalog를 출력하는 metadata 명령 (`--json` 권장, 외부 API 호출 없음).
- `logncrash search` — Log & Crash 로그 검색 (시간 범위는 90일 이내·31일 이하로 제한, 초과 시 입력 오류).
- `logncrash export` — Log & Crash 로그 scroll 대량 추출 (검색 결과 전체를 파일로, scrollKey 1분 만료 루프, pageSize 10~100, `--output` JSON Lines/`--format json`. search host·인증 재사용·읽기).
- `logncrash send` — 로그를 Log & Crash 로 전송 (검색의 대칭 쓰기, collector host + appkey-only 인증·ADR-014). 본문은 `--body`/`--file`/stdin, 단일 로그 8MB 한도.
- `deploy run` — 배포 실행 (named target + flag override, 동기/`--async`).
- `deploy artifacts` — 아티팩트 목록 조회.
- `deploy server-groups` — 서버그룹 목록 조회.
- `deploy histories` — 배포 이력 조회.
- `deploy binary-groups` — 바이너리 그룹 목록 조회.
- `deploy binaries` — 특정 바이너리 그룹의 바이너리 목록 조회 (`--binary-group <key>` 필수, 페이지네이션·정렬).
- `deploy upload <target> --file <path> --binary-group <key>` — 로컬 파일을 바이너리 그룹에 업로드 (multipart, ADR-015).
- `deploy download <target> --binary-group <key> --binary-key <key> -o <file>` — 바이너리를 로컬 파일로 다운로드 (봉투 우회, 기본 덮어쓰기 거부·`--force`, ADR-015).
- `instance list` — Compute 인스턴스 목록 조회 (region 별).
- `instance flavors` — 인스턴스 타입(flavor) 조회 (기본 id·name, `--detail` 로 스펙, `--min-disk`/`--min-ram` 필터, 전체 필드는 `--json`).
- `instance availability-zones` — 가용성 영역 목록 조회 (zoneName·available, 발급 가능 영역 확인용).
- `instance get` — 단일 인스턴스 상태 조회.
- `instance create` — 인스턴스 발급 (기본 비동기, `--wait` 로 ACTIVE+IP 대기).
- `instance delete` — 인스턴스 삭제 (기본 confirm, `--yes` 즉시).
- `instance start` — 인스턴스 시작 (SHUTOFF→ACTIVE).
- `instance stop` — 인스턴스 정지 (ACTIVE/ERROR→SHUTOFF).
- `instance reboot` — 인스턴스 재부팅 (기본 SOFT, `--hard` 로 HARD).
- `instance keypairs` — 키페어 목록 조회 (name·fingerprint, 전체 필드는 `--json`).
- `instance keypair get <name>` — 단일 키페어 조회.
- `instance keypair create <name>` — 키페어 생성. `--public-key` 미지정 시 NHN 이 키쌍 생성 — private_key 1회성 반환, `--output <keyfile>` 로 0600 저장.
- `instance keypair delete <name>` — 키페어 삭제.
- `instance images` — 이미지 목록 조회 (`create --image <id>` 소스, `--visibility`/`--name`/`--owner`/`--status` 필터, marker 페이지네이션, 전체 필드는 `--json`).
- `instance resize <id> --flavor <flavorId>` — 인스턴스 타입(flavor) 변경 (Nova v2 표준 — VERIFY_RESIZE 후 confirm/revert 2단계). fire-and-return.
- `instance resize-confirm <id>` — resize 확정 (VERIFY_RESIZE → ACTIVE, 새 flavor 고정).
- `instance resize-revert <id>` — resize 롤백 (VERIFY_RESIZE → ACTIVE, 이전 flavor 복귀).
- `instance volume attach <id> --volume <volumeId>` — 인스턴스에 볼륨 연결 (os-volume_attachments, 쓰기).
- `instance volume detach <id> <volumeId>` — 인스턴스에서 볼륨 해제 (쓰기).
- `instance volumes <id>` — 인스턴스에 연결된 볼륨 목록 조회.
- `network list` — VPC 목록 조회 (`instance create --network <uuid>` 의 uuid = VPC id·실측 확정. id·name·cidrv4·state·external, 전체 필드는 `--json`).
- `network subnet list` — 서브넷 목록 조회 (id·cidr·소속 VPC·gateway·가용 IP).
- `volume list` — Block Storage 볼륨 목록 조회 (id·name·size·status, 전체 필드는 `--json`).
- `volume get <id>` — 단일 볼륨 상태 조회.
- `volume create --size <GB>` — 볼륨 발급 (Cinder volumev2, 쓰기. `--name`/`--description`/`--volume-type`/`--availability-zone`).
- `floatingip list` — Floating IP(공인 IP) 목록 조회 (id·floating_ip_address·status·port_id·fixed_ip_address, 전체 필드는 `--json`).
- `floatingip create` — Floating IP 발급 (network endpoint 재사용·쓰기. `--network` 미지정 시 `router:external=true` VPC 자동 조회).
- `floatingip delete <id>` — Floating IP 삭제 (기본 confirm, `--yes` 즉시·쓰기). associate(인스턴스 연결)는 instance→port_id 매핑 실측 미확정으로 보류.
- `loadbalancer list|get` — Load Balancer 목록과 단일 상태 조회. 이름 또는 UUID를 받고, IP ACL 적용 그룹과 action을 함께 표시한다.
- `loadbalancer ipacl list|get` — IP ACL 그룹 목록과 상세 조회. 그룹 이름 또는 UUID를 받고, 대상 수와 적용된 Load Balancer를 표시한다.
- `loadbalancer ipacl target list <group>` — 그룹의 IP ACL 대상 목록 조회.
- `loadbalancer ipacl create|delete` — IP ACL 그룹 생성·삭제. 삭제는 대상과 적용 규칙까지 연쇄 삭제하므로 `--yes`가 필수다.
- `loadbalancer ipacl target add|remove` — IP ACL 대상 추가·삭제. `--yes`가 필수이며, 기본으로 관련 Load Balancer를 모두 재바인딩하고 `--no-rebind`로만 생략한다.
- `loadbalancer set-ipacl <lb> --group <group>` — Load Balancer의 IP ACL 그룹 전체 교체. `--group` 반복과 `--yes`가 필수다.
- `loadbalancer clear-ipacl <lb>` — 빈 그룹 배열을 적용해 IP ACL을 모두 해제한다. `--yes`가 필수다.
- `ncr list` — NHN Container Registry 레지스트리 목록 조회 (공통 UAK 정적 헤더 인증·ADR-016, `--region` 기본 kr1, `--app-key` 또는 ncr 자격증명). Harbor 파생 필드 name·repo_count·uri.
- `ncr get <registry>` — 단일 레지스트리 조회 (이름 또는 id).
- `ncr images <registry>` — 레지스트리의 이미지(repository) 목록 조회 (Harbor REST `/api/v2.0` 우회·UAK Basic Auth·ADR-017, name·artifact_count·pull_count).
- `ncr tags <registry> <repository>` — 특정 이미지의 태그 목록 조회 (artifact 의 tags flatten·ADR-017, tag·push_time·size).
- `nks` — NHN Kubernetes Service 명령군 (Keystone 토큰 + `container-infra` API·ADR-019).
  `supports`, cluster/nodegroup/addon 조회, kubeconfig, 작업 이력, IP 접근 제어, 생성·삭제·resize·upgrade·autoscale·설정 변경을 지원한다.
- `ncs template list|get|create|delete` — NCS(NHN Container Service) 설계도(template) 관리 (Deploy OAuth Bearer 토큰 재사용 + appkey 경로·ADR-020, region kr1/kr3). `create` 는 `--file <json>` spec 입력(ADR-019 선례).
- `ncs template version list|get|create|delete` — 설계도 버전 관리. `version create` 의 `--file` payload 는 `sourceVersion` 필드 필수.
- `ncs workload list|get|logs|events|history|schedule-history` — 워크로드(런타임 실행) 조회. `logs`/`events` 는 `--task <taskId>` 필수, `history get <id> <historyId>` 로 단건 조회.
- `ncs workload create|update|patch|pause|resume|restart|delete` — 워크로드 생성·변경·실행제어. `create --file <json> [--wait] [--timeout <sec>]` (비동기 생성, `--wait` 로 Running 상태 폴링), `update`(PUT 전체 교체)·`patch`(PATCH `application/json-patch+json` 부분 변경), `restart` 는 `--task <taskId>` 필수.
- `ncs malware config get|set` — 악성코드 검사 설정 조회/변경 (`set --enabled <true|false>`, appkey-scoped).
- `ncs malware result <workloadId> <historyId>` — 워크로드 실행 히스토리의 악성코드 검사 결과 조회.
- `skills` — Claude Code 스킬(`~/.claude/skills/nhncloud-cli`) 설치 관리. 서브커맨드 없이 호출하면 설치 상태를 출력한다.
- `skills install [--force]` — 패키지 동봉 스킬을 `~/.claude/skills` 에 심볼릭 링크로 설치 (npx 환경 가드, 기존 심링크는 갱신, 실제 디렉터리는 `--force` 필요·전역 설치 전제).
- `skills uninstall` — 설치된 스킬 심볼릭 링크 제거 (심링크만 제거, 실제 디렉터리는 보호).
- `doctor` — 자격증명·스킬 설치 상태 진단 (오프라인 — profile 목록·defaultProfile·심링크 유효성. 연결 테스트는 `configure`).

## API 스펙 확인 절차

NHN Cloud 공식 docs 를 단일 소스로 삼는다 (<https://docs.nhncloud.com>).

- **endpoint 뿐 아니라 request/response body 구조도 공식 레퍼런스 먼저 확인** — 추측 금지.
  - 서비스별 public-api 가이드를 본다 (예: Compute Instance → `docs.nhncloud.com/ko/Compute/Instance/ko/public-api/`).
  - 요청 페이로드 (예: `block_device_mapping_v2`), 응답 형태 (예: `POST /servers` 는 축약형 — `server.id` 만 보장) 모두 docs 의 예제 JSON 으로 대조한다.
  - 코드의 타입 가드·payload 구성은 docs 예제와 1:1 이어야 한다.
- docs 가 봇 차단으로 `WebFetch` 안 될 때는 `WebSearch` 또는 `cmux-browser` 로 우회.
- docs 로도 확정 안 되는 부분 (필드 타입, boolean vs 0/1 등) 은 **실측 (실제 호출) 으로 검증** 후 확정한다. 추측한 채로 구현·머지하지 않는다.

직관에 반하는 동작은 `docs/adr/` 에 ADR 로 보존(번호별 파일·INDEX).

## 빌드 & 실행

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크 전용
node dist/index.js    # 직접 실행
```

## 디렉터리 구조

`docs/code-architecture.md` 단일 소스. 요약:

```
src/
  index.ts          # entrypoint
  config/           # credentials/config 로드 + profile 해석
  api/              # endpoints 맵, envelope unwrap, httpError 매핑
  services/<svc>/   # 서비스별 client + types
  utils/            # errors, exit-codes, spinner, time
  formatters/       # table/json/quiet 출력
  commands/commands.ts # Commander tree 기반 command catalog
  commands/<svc>/   # Commander 커맨드
```

## 스킬 폴더 구분

- `skills/` — 공개 스킬 (사용자·AI 에이전트용 `skills/nhncloud-cli/SKILL.md` router + `skills/nhncloud-cli/references/` 서비스별 reference)
- `.agents/skills/` — 내부 개발 워크플로우 스킬의 단일 원본 (planning, build-with-teams 등)
- `.claude/skills` — Claude 진입점. `.agents/skills` 로 향하는 심링크로 유지한다.
- `.codex/agents/`, `.claude/agents/` — custom agent adapter. 포맷이 달라 skill 처럼 단일 파일로 합치지 않는다.

## 코드 컨벤션

- HTTP: `ky` 전용 (axios 금지)
- 에러: `NhnCloudCliError(message, exitCode)` — exit code 는 `src/utils/exit-codes.ts`
- 출력: 데이터 = stdout / 스피너·에러 = stderr
- AI 에이전트 우선: 새 명령은 대화형 입력을 기다리지 않는다. 위험한 변경은 `--yes`를 API 호출 전에 검증하고, `--json`·`--quiet` 결과와 종료 코드를 결정적으로 유지한다.
- 자격증명: `~/.nhncloud/credentials.json` (mode 0600) + `~/.nhncloud/config.json`
- profile: `--profile` > `NHNCLOUD_PROFILE` env > `config.defaultProfile` > `"default"`
- 패키지 매니저: `pnpm`
- 빌드: `tsup` (CJS 단일 번들)

## 상황별 ADR 필수 참조

| 상황 | 확인 ADR |
|------|----------|
| 새 HTTP 요청 (retry·timeout·error 분기) | ADR-002 (ky) |
| profile/자격증명 파일 구조 | ADR-003, ADR-004 |
| 새 서비스 엔드포인트 추가 | ADR-005 |
| 응답 봉투 처리 (`isSuccessful`/`resultCode`) | ADR-006 |
| Deploy OAuth 토큰 교환·캐시 | ADR-007 |
| deploy target 좌표 / config 구조 | ADR-008 |
| configure 마법사 / 자격증명 쓰기 | ADR-009, ADR-004 |
| Instance (OpenStack) 인증·region endpoint | ADR-010, ADR-005 |
| Instance 발급 (boot-from-volume·POST 축약 응답) | ADR-011 |
| Instance user_data 주입 (base64·65535 인코딩 후 한도) | ADR-012 |
| Instance image endpoint 해석 (compute 외 type 확장) | ADR-013, ADR-005, ADR-010 |
| Network(VPC) endpoint 해석 (compute·image 외 type 확장) | ADR-013, ADR-005, ADR-010 |
| Block Storage(volume) endpoint 해석 (volumev2·tenant 포함 경로) | ADR-013, ADR-005, ADR-010 |
| Log & Crash 로그 전송 (collector host·appkey-only 인증) | ADR-014 |
| deploy 바이너리 전송 (multipart 업로드·봉투 우회 다운로드) | ADR-015, ADR-002, ADR-006 |
| NCR(Container Registry) 레지스트리 조회 (공통 UAK 정적 헤더·region host) | ADR-016, ADR-004, ADR-005, ADR-006 |
| NCR 이미지/태그 조회 (Harbor REST /api/v2.0 우회·UAK Basic Auth·봉투 미적용) | ADR-017, ADR-016, ADR-006 |
| 하네스 누적 docs 구조 (ADR·pitfalls 디렉터리화·INDEX 라우터) | ADR-018 |
| NKS(Container Kubernetes) endpoint·인증·봉투 미적용 | ADR-019, ADR-010, ADR-013, ADR-005 |
| NCS(Container Service) endpoint·인증(Deploy OAuth 토큰 재사용)·appkey 경로 | ADR-020, ADR-007, ADR-006, ADR-005 |
| 토큰 캐시 무효화 (자격 변경 시 stale 토큰·캐시 파일명) | ADR-021, ADR-007, ADR-010, ADR-020 |
| Load Balancer IP ACL 전체 교체·자동 재바인딩·부분 실패 복구 | ADR-022, ADR-002, ADR-010, ADR-013 |

신규 ADR 추가 시 본 표에 행 추가.

## NHN Cloud 인증 모델 (서비스별 상이 — 핵심)

| 서비스 | 비밀 | 인증 헤더 |
|--------|------|----------|
| Log & Crash 검색 | appkey + secret | `X-LNCS-SECRET: <secret>` |
| Log & Crash 전송(collector) | appkey (secret 불요) | 인증 헤더 없음 — body 의 projectName=appkey |
| Deploy v2.1 | UAK(id+secret) | `X-NHN-AUTHORIZATION: Bearer <token>` |
| Instance (OpenStack Nova v2) | tenantId + username + API 비밀번호 | `X-Auth-Token: <tokenId>` (Keystone v2 발급, ADR-010) |
| Load Balancer / IP ACL | tenantId + username + API 비밀번호 | `X-Auth-Token: <tokenId>` + network endpoint 재사용 (ADR-022, ADR-013) |
| NKS (Kubernetes Infrastructure) | tenantId + username + API 비밀번호 | `X-Auth-Token: <tokenId>` + `OpenStack-API-Version: container-infra latest` (ADR-019) |
| NCR (Container Registry, Harbor 기반) | 공통 UAK(id+secret) + NCR appkey | `X-TC-AUTHENTICATION-ID` + `X-TC-AUTHENTICATION-SECRET` (정적, 토큰 교환 없음·ADR-016) |
| NCR 이미지/태그 (Harbor REST 데이터플레인) | 공통 UAK(id+secret) | HTTP Basic Auth (`Authorization: Basic base64(uak-id:uak-secret)`, 봉투 미적용·ADR-017) |
| NCS (Container Service) | UAK(id+secret) + NCS appkey | `x-nhn-authorization: Bearer <token>` (Deploy OAuth 토큰 재사용, appkey 는 경로·ADR-020) |

- Deploy 토큰은 정적이 아니라 OAuth `client_credentials` 로 교환한 단기 토큰 (ADR-007).
  - OAuth: `oauth.api.nhncloudservice.com/oauth2/token/create`
  - Deploy API: `api-deploy.nhncloudservice.com` (공식 docs 의 `api-tcd` 와 다른 현행 도메인 — 함정)
- `resultCode` 타입이 서비스마다 다름 — Log & Crash·NCS 숫자, Deploy 문자열. 봉투 helper 는 둘 다 수용.
- NCS 는 Deploy 와 같은 UAK OAuth 토큰(계정 단위 `client_credentials`)을 공유하므로 profile 토큰 캐시를 그대로 재사용 (ADR-020).

## 한국어 표현 정책 / 마크다운 가독성

전역 Codex/Claude 에이전트 정책을 따른다.
외래어 치환표·문장 종결 규칙·자가 점검은 전역 `~/.claude/rules/korean-style.md` 를 단일 소스로 삼는다.
프로젝트 고유 예외가 필요할 때만 별도 문서를 추가한다.

문서, 스킬, 리포트 템플릿, task 파일처럼 사람과 LLM이 함께 읽고 유지보수하는 산출물은 한국어로 작성한다.
GitHub PR 본문, GitHub issue 본문, release note 처럼 외부에 게시되는 프로젝트 설명 텍스트도 한국어를 기본으로 작성한다.
워크플로우 이름, CLI 명령, 파일 경로, 코드 식별자, API 필드, `agent_type`, `$workflow` 같은 기계 계약 토큰은 번역하지 않는다.
영문 자료를 요약해 반영할 때도 최종 저장 문서는 한국어를 기본으로 하며, 필요한 경우에만 원문 용어를 괄호로 남긴다.

## planning / 구현 워크플로우

새 기능은 `/planning` (8단계, CLI 는 4단계 압축) 으로 설계 후 docs 반영,
`/build-with-teams` 로 구현.
docs 는 task 생성 전에 commit (docs-first).

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

이 repo 는 GitHub public + npm public (`@bifos/nhncloud-cli`) 이므로 다음 식별자는 **README / skills / docs / AGENTS.md / CLAUDE.md / 이슈 본문 + src 코드 (테스트 fixture·에러 메시지 예시 포함) 어디에도 노출하지 않는다**.
코드 예시·시나리오·issue body 작성 시 항상 placeholder 를 쓴다.

| 노출 금지 | 대체 |
|---|---|
| NHN Cloud UAK (Deploy id/secret) | `<uak-id>` / `<uak-secret>` |
| Log & Crash appkey / secret | `<appkey>` / `<secret>` |
| Instance tenantId / username / API 비밀번호 | `<tenant-id>` / `<username>` / `<password>` |
| NHN 사내 도메인 (구체 도메인은 공개 repo 라 여기 명시하지 않음) | `example.com` |
| 사내 이메일 | `user@example.com` |
| 실제 인스턴스 ID / 네트워크 UUID (사용자 리소스) | `<instance-id>` / `<network-uuid>` |
| 실명 (본인 + 동료 한국어 이름) | 가상 이름 (`홍길동` 등) — 가상은 OK |

**검증 grep** (commit / 이슈 작성 / release 전 실행):

사내 도메인 블랙리스트를 여기 적으면 그 자체가 노출이므로, **공개 도메인 화이트리스트 외의 도메인을 검출**하는 방식을 쓴다.

```bash
# cwd: <repo root>
# 1) 공개 도메인 화이트리스트 밖의 URL/이메일 도메인 (사내 도메인 가능성) — 사내 도메인은 여기 명시하지 않는다
#    https:// 또는 @ prefix 를 요구해 코드의 property 접근(.com/.net) false positive 를 배제
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"
# 0건이어야 함 (남으면 사내/미허용 도메인 가능성 — placeholder 또는 화이트리스트 검토)

# 2) 실제 비밀 형태 (placeholder <...> 제외) — secret/password/appkey 뒤 16자 이상 영숫자
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
# 0건이어야 함 (남으면 실제값 가능성 — placeholder 로 교체)
```

**자동화**: `/release` 스킬의 개인 식별 정보 사전 점검 단계가 위 grep 두 명령을 release 전 자동 실행한다.

**예외**: 사용자가 명시적으로 "내부용이라 OK" 등 동의한 경우만. 디폴트는 placeholder.
