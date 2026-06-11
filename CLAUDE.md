# CLAUDE.md — nhncloud-cli

## 프로젝트 개요

NHN Cloud 서비스를 AWS CLI 처럼 호출하는 통합 CLI.
TypeScript + Commander.js 기반. dooray-cli 의 기반·하네스를 재사용.

## 지원 명령 (24개)

- `configure` — 자격증명 설정 마법사 (대화형 + flag, UAK + 서비스별 키, 연결 테스트).
- `logncrash search` — Log & Crash 로그 검색 (시간 범위는 90일 이내·31일 이하로 제한, 초과 시 입력 오류).
- `logncrash send` — 로그를 Log & Crash 로 전송 (검색의 대칭 쓰기, collector host + appkey-only 인증·ADR-014). 본문은 `--body`/`--file`/stdin, 단일 로그 8MB 한도.
- `deploy run` — 배포 실행 (named target + flag override, 동기/`--async`).
- `deploy artifacts` — 아티팩트 목록 조회.
- `deploy server-groups` — 서버그룹 목록 조회.
- `deploy histories` — 배포 이력 조회.
- `deploy binary-groups` — 바이너리 그룹 목록 조회.
- `deploy binaries` — 특정 바이너리 그룹의 바이너리 목록 조회 (`--binary-group <key>` 필수, 페이지네이션·정렬).
- `instance list` — Compute 인스턴스 목록 조회 (region 별).
- `instance flavors` — 인스턴스 타입(flavor) 조회 (기본 id·name, `--detail` 로 스펙, `--min-disk`/`--min-ram` 필터, 전체 필드는 `--json`).
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
- `network list` — VPC 목록 조회 (`instance create --network <uuid>` 의 uuid = VPC id·실측 확정. id·name·cidrv4·state·external, 전체 필드는 `--json`).
- `network subnet list` — 서브넷 목록 조회 (id·cidr·소속 VPC·gateway·가용 IP).

## API 스펙 확인 절차

NHN Cloud 공식 docs 를 단일 소스로 삼는다 (<https://docs.nhncloud.com>).

- **endpoint 뿐 아니라 request/response body 구조도 공식 레퍼런스 먼저 확인** — 추측 금지.
  - 서비스별 public-api 가이드를 본다 (예: Compute Instance → `docs.nhncloud.com/ko/Compute/Instance/ko/public-api/`).
  - 요청 페이로드 (예: `block_device_mapping_v2`), 응답 형태 (예: `POST /servers` 는 축약형 — `server.id` 만 보장) 모두 docs 의 예제 JSON 으로 대조한다.
  - 코드의 타입 가드·payload 구성은 docs 예제와 1:1 이어야 한다.
- docs 가 봇 차단으로 `WebFetch` 안 될 때는 `WebSearch` 또는 `cmux-browser` 로 우회.
- docs 로도 확정 안 되는 부분 (필드 타입, boolean vs 0/1 등) 은 **실측 (실제 호출) 으로 검증** 후 확정한다. 추측한 채로 구현·머지하지 않는다.

직관에 반하는 동작은 `docs/adr.md` 에 ADR 로 보존.

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
  commands/<svc>/   # Commander 커맨드
```

## 스킬 폴더 구분

- `skills/` — 공개 스킬 (사용자·AI 에이전트용 `skills/nhncloud-cli/SKILL.md`)
- `.claude/skills/` — 내부 개발 워크플로우 스킬 (planning, plan-and-build 등)

## 코드 컨벤션

- HTTP: `ky` 전용 (axios 금지)
- 에러: `NhnCloudCliError(message, exitCode)` — exit code 는 `src/utils/exit-codes.ts`
- 출력: 데이터 = stdout / 스피너·에러 = stderr
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
| Log & Crash 로그 전송 (collector host·appkey-only 인증) | ADR-014 |

신규 ADR 추가 시 본 표에 행 추가.

## NHN Cloud 인증 모델 (서비스별 상이 — 핵심)

| 서비스 | 비밀 | 인증 헤더 |
|--------|------|----------|
| Log & Crash 검색 | appkey + secret | `X-LNCS-SECRET: <secret>` |
| Log & Crash 전송(collector) | appkey (secret 불요) | 인증 헤더 없음 — body 의 projectName=appkey |
| Deploy v2.1 | UAK(id+secret) | `X-NHN-AUTHORIZATION: Bearer <token>` |
| Instance (OpenStack Nova v2) | tenantId + username + API 비밀번호 | `X-Auth-Token: <tokenId>` (Keystone v2 발급, ADR-010) |

- Deploy 토큰은 정적이 아니라 OAuth `client_credentials` 로 교환한 단기 토큰 (ADR-007).
  - OAuth: `oauth.api.nhncloudservice.com/oauth2/token/create`
  - Deploy API: `api-deploy.nhncloudservice.com` (공식 docs 의 `api-tcd` 와 다른 현행 도메인 — 함정)
- `resultCode` 타입이 서비스마다 다름 — Log & Crash 숫자, Deploy 문자열. 봉투 helper 는 둘 다 수용.

## 한국어 표현 정책 / 마크다운 가독성

전역 `~/.claude/CLAUDE.md` 정책을 따른다.
외래어 음차 합성 회피, semantic line break, 인라인 나열 금지.
프로젝트별 외래어 매핑 표·문장 종결 규칙·자가 점검은 `korean-style.md` 가 단일 소스.

## planning / 구현 워크플로우

새 기능은 `/planning` (8단계, CLI 는 4단계 압축) 으로 설계 후 docs 반영,
`/plan-and-build` 또는 `/build-with-teams` 로 구현.
docs 는 task 생성 전에 commit (docs-first).

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

이 repo 는 GitHub public + npm public (`@bifos/nhncloud-cli`) 이므로 다음 식별자는 **README / skills / docs / CLAUDE.md / 이슈 본문 + src 코드 (테스트 fixture·에러 메시지 예시 포함) 어디에도 노출 금지**.
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
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 0건이어야 함 (남으면 사내/미허용 도메인 가능성 — placeholder 또는 화이트리스트 검토)

# 2) 실제 비밀 형태 (placeholder <...> 제외) — secret/password/appkey 뒤 16자 이상 영숫자
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 0건이어야 함 (남으면 실제값 가능성 — placeholder 로 교체)
```

**자동화**: `/release` 스킬의 개인 식별 정보 사전 점검 단계가 위 grep 두 명령을 release 전 자동 실행한다.

**예외**: 사용자가 명시적으로 "내부용이라 OK" 등 동의한 경우만. 디폴트는 placeholder.
