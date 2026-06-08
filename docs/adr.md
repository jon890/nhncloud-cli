# ADR — nhncloud-cli 기술 결정 기록

## ADR Index

- [ADR-001](#adr-001): TypeScript + Commander.js + tsup
- [ADR-002](#adr-002): ky (HTTP 클라이언트)
- [ADR-003](#adr-003): profile 기반 자격증명 — JSON + credentials/config 분리
- [ADR-004](#adr-004): profile 안 서비스별 자격증명 블록
- [ADR-005](#adr-005): 엔드포인트 하드코딩 맵 (gov 제외)
- [ADR-006](#adr-006): NHN 공통 응답 봉투 정규화
- [ADR-007](#adr-007): Deploy OAuth client_credentials 토큰 교환 + 단기 캐시
- [ADR-008](#adr-008): deploy 좌표 named target (config) + UAK/좌표 분리
- [ADR-009](#adr-009): configure 대화형 마법사 + 비대화형 flag + 연결 테스트
- [ADR-010](#adr-010): IaaS Keystone 토큰 인증 + region 별 compute endpoint 캐시
- [ADR-011](#adr-011): Instance 발급 — boot-from-volume 필수 + POST 축약 응답
- [ADR-012](#adr-012): instance create user_data — base64 주입 + 65535 인코딩 후 한도

---

<a id="adr-001"></a>

## ADR-001: TypeScript + Commander.js + tsup

- **결정**: dooray-cli 와 동일 스택 (TypeScript + Commander.js + tsup 단일 번들 + vitest).
- **맥락**: 검증된 CLI 기반을 재사용해 PoC 속도를 높인다. 사용자가 Node 생태계 선호.
- **대안 기각**: Go(공식 gophercloud 재사용 가능하나 PaaS REST 와 거리), Python(openstackclient 참고용이나 PaaS 와 무관).

---

<a id="adr-002"></a>

## ADR-002: ky (HTTP 클라이언트)

- **결정**: 모든 HTTP 호출은 `ky` 인스턴스 통과.
- **맥락**: retry·timeout·에러 분기 정책을 한 곳에서 통일. dooray-cli 검증됨.
- **대안 기각**: axios(번들 큼), node-fetch/got(정책 일관성 약함).

---

<a id="adr-003"></a>

## ADR-003: profile 기반 자격증명 — JSON + credentials/config 분리

- **결정**: `~/.nhncloud/credentials.json`(비밀, mode 0600) + `~/.nhncloud/config.json`(설정) 두 파일. JSON 포맷.
- **맥락**: 여러 프로젝트·환경을 profile 로 전환 (AWS 방식). 비밀과 설정 분리로 권한 관리가 깔끔하다. JSON 은 `JSON.parse` 로 끝나 구현이 가장 단순.
- **대안 기각**: INI(파서 직접 구현 필요), 단일 파일(비밀·설정 혼재).

---

<a id="adr-004"></a>

## ADR-004: profile 공통 UAK + 서비스별 자격증명 블록

- **결정**: profile 아래에 공통 `userAccessKey`(개인 UAK) 1개 + 서비스별 블록(`logncrash` 등)을 둔다.
  - `userAccessKey` — deploy 등 OAuth 서비스가 공유 (개인/계정 단위, [[adr-007]])
  - 서비스 블록 — 서비스 고유 appkey·secret (logncrash 등)
- **맥락**: NHN Cloud 는 서비스마다 인증이 다르다.
  - Log & Crash 검색 — appkey + secret (`X-LNCS-SECRET`)
  - Deploy — UAK 로 OAuth 토큰 교환 후 `X-NHN-AUTHORIZATION: Bearer`
  - UAK 는 한 번 설정하면 여러 OAuth 서비스가 공유하므로 서비스 밑이 아니라 profile 공통으로 올린다.
- **대안 기각**: UAK 를 서비스 블록(`deploy.uakId`) 에 중첩(OAuth 서비스 늘면 UAK 중복), 전역 단일 키(서비스별 appkey 현실과 불일치).

---

<a id="adr-005"></a>

## ADR-005: 엔드포인트 하드코딩 맵 (gov 제외) — IaaS 는 region 분기

- **결정**: 서비스별 고정 도메인을 코드 맵으로 관리한다.
  - PaaS 는 단일 도메인 (`api-lncs-search.nhncloudservice.com` 등)
  - IaaS instance 는 `<region>-api-instance-infrastructure.nhncloudservice.com` 으로 region prefix 가변
- **맥락**: NHN PaaS 는 서비스별 고정 도메인을 쓴다. IaaS instance 는 kr1/kr2/kr3/jp1 4개 region 이 각각 다른 host 다.
  - 정적 맵 + region 분기로 충분 (Keystone serviceCatalog 도 같은 host 를 반환)
- **대안 기각**: serviceCatalog 동적 파싱(token 발급마다 추출 + 파싱 복잡), profile 에 endpoint 직접 저장(설정 부담). gov 분기는 후속.

---

<a id="adr-006"></a>

## ADR-006: NHN 공통 응답 봉투 정규화

- **결정**: `{ header: { isSuccessful, resultCode, resultMessage }, body }` 봉투를 단일 helper 로 unwrap. 실패 시 `NhnCloudCliError`.
- **맥락**: NHN PaaS 다수가 이 봉투를 공유 (dooray 와 동일 구조). HTTP 4xx 와 별개로 `isSuccessful: false` 가 올 수 있어 봉투 검사 필수.
- **트레이드오프**: `resultCode` 타입이 서비스마다 다르다.
  - Log & Crash 는 숫자, Deploy 는 문자열 (`"SUCCESS"`).
  - helper 는 `string | number` 를 모두 받아 `isSuccessful` 을 우선 판정한다.

---

<a id="adr-007"></a>

## ADR-007: Deploy OAuth client_credentials 토큰 교환 + 단기 캐시

- **결정**: UAK(id+secret) 를 Basic 인증으로 OAuth 에 보내 `access_token` 을 받아 캐시한다.
  - OAuth: `POST oauth.api.nhncloudservice.com/oauth2/token/create`, `grant_type=client_credentials`
  - `~/.nhncloud/cache/` 에 만료시각과 함께 저장, 만료 전 재사용
- **맥락**: Deploy 인증은 정적 토큰이 아니라 단기 Bearer 토큰이다.
  - 실사용 스크립트 `nhn-deploy-trigger.sh` 로 확인 (공식 docs 는 "별도 발급" 으로만 표기)
  - 호출마다 발급하면 OAuth 왕복이 매번 붙는다
- **대안 기각**: 정적 토큰 저장(만료로 곧 무효), 호출마다 발급(불필요한 OAuth 왕복).
- **적용 범위**: 엔드포인트 함정 — Deploy 는 `api-deploy.nhncloudservice.com` (공식 docs 의 `api-tcd` 와 다른 현행 도메인). OAuth 는 `oauth.api.nhncloudservice.com`.

---

<a id="adr-008"></a>

## ADR-008: deploy 좌표 named target (config) + UAK/좌표 분리

- **결정**: 배포 좌표를 `config.json` 에 이름 붙인 target 으로 저장하고 `nhncloud deploy run <target>` 으로 참조한다.
  - 좌표: appKey·artifactId·serverGroupId·scenarioIds
  - 개별 flag 로 override 가능
  - UAK(id+secret) 비밀은 `credentials.json` 의 profile 공통 `userAccessKey` 에 둔다 ([[adr-004]])
- **맥락**: 한 배포에 좌표 4개가 필요해 매번 flag 로 받으면 장황하다.
  - 좌표는 비밀이 아니므로 config, UAK 만 비밀이라 credentials (비밀/비밀아님 분리, [[adr-003]])
- **대안 기각**: 전부 flag(장황·반복), 좌표를 credentials 에 혼재(비밀 아닌 값이 비밀 파일에).

---

<a id="adr-009"></a>

## ADR-009: configure 대화형 마법사 + 비대화형 flag + 연결 테스트

- **결정**: `nhncloud configure` 로 자격증명을 설정한다.
  - 대화형 (`@inquirer/prompts`) — profile → UAK(id/secret) → 서비스별 appkey/secret 순 입력
  - 비대화형 flag (`--uak-id` 등) — CI·자동화용. flag 가 하나라도 있으면 비대화형
  - 저장 전 연결 테스트 — UAK 는 OAuth 토큰 발급, logncrash 는 최소 검색으로 검증 (`--no-verify` 로 생략)
  - 기존 값과 머지 저장 (all-or-nothing), `credentials.json` 은 mode 0600
- **맥락**: 지금은 사용자가 JSON 을 손으로 편집해야 한다. dooray setup (ADR-016/018) 의 검증된 마법사 패턴을 재사용한다.
- **대안 기각**: 대화형만(자동화 불가), flag 만(첫 설정 UX 나쁨), 검증 없음(잘못된 키를 실제 명령에서야 발견).
- **트레이드오프**: `@inquirer/prompts` 의존성 추가. 대화형 첫 설정 UX 이득이 더 크다.

---

<a id="adr-010"></a>

## ADR-010: IaaS Keystone 토큰 인증 + region 별 compute endpoint 캐시

- **결정**: NHN Cloud Instance(OpenStack Nova v2 호환) 인증은 Keystone v2 token 발급으로 처리하고, profile·region 단위로 캐시한다.
  - 발급: `POST api-identity-infrastructure.nhncloudservice.com/v2.0/tokens`
    - body: `{ auth: { tenantId, passwordCredentials: { username, password } } }`
  - 호출: `X-Auth-Token: <tokenId>` 헤더
  - 캐시: `~/.nhncloud/cache/iaas-token-<profile>-<region>.json` 에 `{ tokenId, expiresAt, computeEndpoint }`
  - `iaas` 자격증명 블록은 instance 외에도 IaaS 서비스가 공유한다 ([[adr-004]])
- **맥락**: instance API 는 logncrash·deploy 와 또 다른 세 번째 인증 모델이다 (Keystone).
  - 호출마다 token 을 새로 받으면 매번 발급 왕복이 붙는다.
  - region 별 compute endpoint 는 정적 host 맵(ADR-005)으로 구성해 token 과 함께 캐시한다.
- **대안 기각**:
  - 호출마다 발급 — 불필요한 왕복.
  - 자격증명 파일에 token 직접 저장 — 만료 관리를 사용자에게 떠넘김.
  - Keystone v3 — NHN 은 v2 로 발급한다. v3 도 가능하지만 표준화 이득 없음.
- **트레이드오프**:
  - password 는 NHN 콘솔 IAM 의 API 비밀번호 — 사용자가 로그인 비번과 혼동할 수 있어 configure 마법사·docs 에서 명시한다.
  - username 은 NHN Cloud 계정 이메일 **또는 IAM 계정 ID(사번)** 이다. tenantId 와 비슷한 32자리 hex "API 사용자 ID"(UUID)가 아니다 — 이를 username 으로 넣으면 Keystone 이 `Could not find user` 401 을 반환한다. (실측: 사번으로 발급 성공)

---

<a id="adr-011"></a>

## ADR-011: Instance 발급 — boot-from-volume 필수 + POST 축약 응답

- **결정**: `instance create` 는 두 부팅 방식을 지원하고, POST 응답은 id 만 신뢰해 get 으로 재조회한다.
  - `--boot-volume-size <GB>` 지정 시 `block_device_mapping_v2`(source image → destination volume, boot_index 0, delete_on_termination true)로 발급. 미지정 시 `imageRef` 단순(로컬 디스크) 발급.
  - `POST /servers` 응답은 축약형 — `server.id` 만 보장하고 name/status/addresses 가 없다. id 추출 후 `GET /servers/{id}` 로 전체 Server 를 재조회한다.
- **맥락**: 실제 호출로만 드러난 NHN Cloud 제약 (smoke·docs 검증으로는 안 잡힘).
  - GPU(g2) 등 일부 flavor 는 로컬 디스크 부팅을 지원 안 해 boot-from-volume 이 필수다. imageRef 단독 발급은 `Missing Block Device Mapping attribute` 400.
  - Nova POST 응답 축약은 OpenStack 표준이나, list/get 용 타입 가드로 검증하면 항상 실패한다.
- **대안 기각**:
  - 항상 boot-from-volume — 로컬 디스크 부팅 flavor 의 단순 발급 경로를 잃는다.
  - POST 응답을 그대로 출력 — name/status/IP 가 비어 사용자에게 불완전한 정보.
- **트레이드오프**: create 가 get 을 1회 더 호출(왕복 +1)하지만, 발급 직후 완전한 상태·IP 를 보장하는 가치가 더 크다. `--wait` 경로는 어차피 폴링하므로 영향 없음.

<a id="adr-012"></a>

## ADR-012: instance create user_data — base64 주입 + 65535 인코딩 후 한도

- **결정**: `--user-data <path>` 로 cloud-init 파일을 받아 base64 인코딩해 `server.user_data` 로 주입한다.
  - 인코딩·한도 검증은 client 가 아닌 command(파라미터 검증 단계)에서 수행해 네트워크 호출 전에 fail-fast 한다.
  - 65535 바이트 한도는 **base64 인코딩 후 결과 문자열** 기준으로 검사한다. 초과 시 `EXIT_PARAM_ERROR`.
- **맥락**: NHN Cloud Instance public-api docs 가 `user_data` 를 "base64 인코딩된 문자열 ... 65535 바이트까지 허용" 으로 명시한다.
  - 문구상 한도는 인코딩 후 문자열 기준 — base64 는 원본보다 약 33% 커지므로 원본 cloud-init 은 약 48KB 까지 들어간다.
  - 인코딩 전 65535 로 잡으면 API 가 거부할 요청을 통과시킬 수 있어, 보수적으로 인코딩 후 기준을 채택한다.
- **대안 기각**:
  - client 에서 인코딩(이슈 초안) — 한도 검증을 위해 command 에서 또 인코딩해야 해 이중 작업이 된다. command 단일 인코딩이 fail-fast + 중복 제거.
  - 인코딩 전 65535 검증 — docs 문구와 어긋나고 API 가 거부할 요청을 과소 차단한다.
