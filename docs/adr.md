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
- [ADR-013](#adr-013): IaaS 멀티 서비스 endpoint 해석 — image·network·blockstorage catalog host 맵 추가 (정적 맵 유지)
- [ADR-014](#adr-014): Log & Crash collector — 검색과 별도 host + appkey-only 인증(secret 불요)
- [ADR-015](#adr-015): deploy 바이너리 전송 — ky multipart 업로드 + 봉투 우회 파일 스트림 다운로드
- [ADR-016](#adr-016): NCR Management API — 공통 UAK 정적 헤더 인증 + region 별 host (OAuth 교환 불요)

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

---

<a id="adr-013"></a>

## ADR-013: IaaS 멀티 서비스 endpoint 해석 — image·network·blockstorage catalog host 맵 추가 (정적 맵 유지)

- **결정**: image(Glance v2)·network(NHN VPC) endpoint 도 compute 와 동일하게 region 별 **정적 host 맵**으로 해석한다.
  - `endpoints.ts` 에 `IMAGE_HOST`·`NETWORK_HOST` 맵 + `imageHost(region)`·`networkHost(region)` 추가.
  - `getIaasToken` 이 `computeEndpoint`·`imageEndpoint`·`networkEndpoint`·`blockStorageEndpoint` 를 함께 반환하고, 한 토큰 캐시에 같이 보관한다.
  - image 는 `<region>-api-image-infrastructure...`, network 는 `<region>-api-network-infrastructure...` (둘 다 실측 확정), blockstorage 는 `<region>-api-block-storage-infrastructure...` (catalog type `volumev2`, **docs 추론 — 첫 호출 200 으로 확인 예정**)로 compute 와 다른 host 지만 **같은 Keystone 토큰**(`X-Auth-Token`)을 재사용한다.
  - Glance 경로는 tenant segment 가 없다(`/v2/images`, 실측 확정). NHN VPC 경로도 tenant segment 가 없다(`/v2.0/vpcs`·`/v2.0/vpcsubnets`, serviceCatalog 실측 확정). NHN VPC 는 raw Neutron `/v2.0/networks` 가 아니라 NHN 고유 경로다. **blockstorage(Cinder volumev2) 경로는 compute 처럼 tenant segment 를 포함한다**(`/v2/{tenantId}/volumes`) — image/network 와 다르다.
  - `instance create --network <uuid>` 의 uuid 는 **VPC id** 다 (Nova `networks[].uuid` = VPC id, 실측 확정: 인스턴스 addresses 키 = VPC name 1:1 일치). subnet id 가 아니다.
  - instance volume attach/detach 는 Nova 표준 `os-volume_attachments`(compute endpoint)로 한다 — read-only GET 200 으로 NHN 지원 확정, 응답 필드 camelCase(`device`/`id`/`serverId`/`volumeId`).
- **맥락**: instance images(image)·network list(network)·volume(blockstorage volumev2)는 service catalog type 이 compute 가 아닌 명령이다.
  - 기존 코드는 compute host 만 정적 맵으로 갖고 serviceCatalog 를 파싱하지 않는다([[adr-005]]).
  - region 별 image·network·blockstorage host 도 compute 와 같은 정적 패턴이라 맵을 더해 해결된다 — image 가 첫 사례, network 가 두 번째, blockstorage 가 세 번째 사례로 같은 패턴이 재사용됨을 확인.
- **대안 기각**:
  - **serviceCatalog 동적 파싱** — 토큰 발급 응답에서 type 별 endpoint 를 추출하면 host 맵이 필요 없어진다.
    하지만 토큰마다 catalog 파싱이 붙고(가드·실패 처리 증가), 캐시 구조도 type 별 endpoint 맵으로 커진다.
    서비스가 image 하나 더 느는 시점에 동적 파싱까지 도입하는 것은 과하다 — [[adr-005]] 의 정적 맵 노선을 연장한다.
    (서비스 type 이 더 늘어 맵 관리가 부담이 되는 시점에 재검토한다.)
  - **profile 에 endpoint 직접 저장** — 설정 부담 + region override 와 충돌.
- **트레이드오프**:
  - region 코드가 compute·image·network·blockstorage **네 host 맵**에 중복된다(image 둘 → network 셋 → blockstorage 넷) — region 추가 시 동기화 누락 위험.
    구현 시 네 맵 key 집합 일치를 성공 기준 grep 으로 확인한다 (상시 런타임 가드는 아님 — 추가 시 후속 task). 서비스 type 이 늘수록 맵 관리 부담이 커진다 — 동적 catalog 파싱 재검토 임계가 또 한 단계 가까워졌다.
  - host 패턴·tenant 유무를 docs 만으로 확정하지 못해 실측으로 확정했다(추측 구현 금지). 단 **blockstorage host 는 아직 docs 추론**(serviceCatalog publicURL 실측 미완) — 첫 호출 200 으로 확인 예정. image/network 와 톤 구분.
  - **kr1/kr2 만 publicURL 실측 확정. kr3/jp1 IMAGE_HOST·NETWORK_HOST·BLOCKSTORAGE_HOST 는 같은 패턴으로 추론**(미실측) — 자격증명 확보 시 후속 실측. 첫 호출이 host 에서 실패하면 `getaddrinfo ENOTFOUND` 로만 드러난다.

---

<a id="adr-014"></a>

## ADR-014: Log & Crash collector — 검색과 별도 host + appkey-only 인증(secret 불요)

- **결정**: 로그 전송(`logncrash send`)은 검색과 다른 collector host 와 인증 모델을 쓴다.
  - host: `POST https://api-logncrash.nhncloudservice.com/v2/log` (검색의 `api-lncs-search` 와 별도)
  - 인증: 헤더 인증 없음 — body 의 `projectName` 필드에 appkey 를 넣어 프로젝트를 식별한다 (검색의 `X-LNCS-SECRET` 와 다른 모델, secret 불요)
  - `endpoints.ts` 의 `ENDPOINTS` 맵에 `logncrash-collector` 키를 추가해 검색(`logncrash`)과 분리한다.
  - 응답은 검색과 같은 중첩 봉투 `{ header: { isSuccessful, resultCode(숫자 0=성공), resultMessage } }` 다 (공식 docs 수집 API 가이드 예제로 확정). `isSuccessful` 로만 성공 판정한다([[adr-006]]). body 는 없을 수 있어 쓰지 않는다.
- **맥락**: Log & Crash 는 검색(read)과 수집(write)의 host·인증이 서로 다르다.
  - 검색은 secret 기반 헤더 인증(`X-LNCS-SECRET`), 수집은 appkey 만으로 식별(secret 불요).
  - 두 동작을 같은 host·인증으로 가정하면 전송이 401 또는 404 로 실패한다.
- **대안 기각**:
  - 검색 host 재사용 — 수집 엔드포인트가 없어 404.
  - `X-LNCS-SECRET` 헤더 전송 — 수집은 헤더 인증을 받지 않으며 secret 을 요구하지 않는다.
  - endpoints 맵 키 공유(`logncrash` 하나) — read/write host 가 달라 한 키로 둘을 못 가린다. 별 키(`logncrash-collector`)로 분리.
- **트레이드오프**: 한 서비스(logncrash)가 endpoints 맵에서 키 2개를 갖는다. host 가 실제로 다르므로 분리가 정직하다.

---

<a id="adr-015"></a>

## ADR-015: deploy 바이너리 전송 — ky multipart 업로드 + 봉투 우회 파일 스트림 다운로드

- **결정**: `deploy upload`/`deploy download` 는 기존 JSON-only client 패턴에서 벗어나는 두 전송 경로를 도입한다.
  - **업로드**: ky `json:`(JSON body) 대신 `body: FormData` 로 `multipart/form-data` 전송. `Content-Type` 은 수동 지정하지 않는다 — ky 가 boundary 를 자동 설정한다. 파일 파트는 command 에서 statSync 가드 후 읽은 Buffer 를 Blob 으로 감싼다.
  - **다운로드**: 응답을 공통 봉투 JSON 으로 가정하지 않는다(`unwrap`·ADR-006 미적용). `.json()` 대신 `.arrayBuffer()` 로 받아 Buffer 를 반환하고 command 가 `writeFileSync` 로 파일에 쓴다. 성공/실패는 HTTP status(ky `throwHttpErrors`)로만 판정한다.
- **맥락**: 두 명령 모두 NHN Cloud Deploy v2.1 의 바이너리 전송 endpoint 다. upload 응답은 봉투 JSON(`body.{downloadUrl, binaryKey}`).
- **⚠️ 실측 pending (docs 봇차단 — 수동 QA 로 확정)**: 추측 머지 금지(CLAUDE.md). upload·download 둘 다 쓰기/실호출이라 수동 QA 에서 함께 확정한다.
  - endpoint 경로 세그먼트 단/복수: upload/download 는 `binary-group`(단수)로 추정하나 011 조회는 `binary-groups`(복수)다. 404 면 복수형으로 review-fix.
  - download 응답 형태: raw 파일 바이너리인지, `downloadUrl` 을 담은 JSON 메타인지 미확정(upload 가 downloadUrl 을 주므로 후자 가능성). 코드는 raw 바이너리 가정(`.arrayBuffer()` 저장)이고, JSON 판명 시 downloadUrl 2차 GET 으로 review-fix. round-trip diff 가 wrong-content 를 잡는다.
  - upload 응답 `binaryKey` 타입(number|string): 코드는 둘 다 수용 후 `Number()` 정규화(기존 isBinary 관례).
- **대안 기각**:
  - download 도 `.json<NhnEnvelope>()`+unwrap 으로 "통일" — 응답이 바이너리면 JSON 파싱이 깨진다. 봉투 우회가 endpoint 특성상 안전.
  - 진짜 스트리밍(ReadableStream → 디스크 pipe) — MVP 는 `.arrayBuffer()`(메모리 적재)로 충분. 초대형 파일 메모리 압박 확인 시 stream pipe 로 후속 전환(upload 한도 `MAX_UPLOAD_BYTES`).
  - axios 등 multipart 라이브러리 도입 — ky 단일 의존(ADR-002)을 깨므로 기각. ky 도 `body: FormData` 로 multipart 지원.
- **트레이드오프**: 두 경로 모두 파일을 메모리에 통째 적재. 단순·테스트 용이성을 얻는 대신 초대형 파일에서 메모리가 크기에 비례. 한도 가드(upload)와 후속 stream 전환 여지를 남긴다.

---

<a id="adr-016"></a>

## ADR-016: NCR Management API — 공통 UAK 정적 헤더 인증 + region 별 host (OAuth 교환 불요)

- **결정**: NCR(NHN Container Registry) Management API(레지스트리 조회)는 공통 UAK(`userAccessKey`)를 **정적 헤더로 직접 전송**한다. deploy 의 OAuth 토큰 교환([[adr-007]])을 쓰지 않으므로 토큰 캐시 계층이 없다.
  - 인증 헤더: `X-TC-AUTHENTICATION-ID: <uak-id>` + `X-TC-AUTHENTICATION-SECRET: <uak-secret>` ([[adr-004]] 의 공통 UAK 재사용 — 별도 ncr 비밀 없음).
  - host: region 별 `{region}-ncr.api.nhncloudservice.com` 정적 맵(`NCR_HOST`, [[adr-005]]·[[adr-013]] 의 region 맵 패턴 답습). IaaS region 과 별개 축이라 `--region` 옵션으로 받고 기본 `kr1`.
  - 경로: `GET /ncr/v2.0/appkeys/{appKey}/registries`(목록) / `.../registries/{registryNameOrId}`(조회). `appKey` 는 NCR 서비스 appkey — profile 의 `ncr` 블록(`{ appkey }`, [[adr-004]]) 또는 `--app-key` 옵션.
  - 응답: NHN 공통 봉투(`header.isSuccessful` + 숫자 `resultCode`, [[adr-006]] helper 재사용). 레지스트리 필드는 Harbor 파생 snake_case(`name`·`project_id`·`repo_count`·`uri`·`private_uri`).
- **맥락**: NCR 은 CNCF Harbor 를 NHN 이 래핑한 서비스다. public API 는 레지스트리(프로젝트)·정책(보호/정리/웹훅) 관리만 제공하고 **이미지/태그(artifact) 목록 조회 endpoint 가 없다**(콘솔 UI 전용). 이미지/태그는 Docker Registry HTTP API v2 데이터플레인 우회가 필요해 범위를 분리한다(task 022 에서 실측 후 ADR-017 신설 예정).
- **⚠️ 실측 pending(docs 봇차단 — 수동 QA 로 확정)**: 추측 머지 금지(CLAUDE.md). 조회 전용이라 첫 200 응답으로 함께 확정한다.
  - 인증 헤더 정확한 표기(`X-TC-AUTHENTICATION-ID/SECRET` 의 대소문자·하이픈) — 401 이면 표기 교정.
  - `{region}-ncr.api.nhncloudservice.com` host 패턴 — 첫 호출 DNS/200 으로 확인.
  - `appKey` 의 정확한 의미(NCR 서비스 appkey vs 레지스트리 식별자).
  - registries 응답이 봉투 `body` 안 배열인지 평면 배열인지 + 페이지네이션 파라미터 유무.
- **대안 기각**:
  - deploy OAuth 토큰 교환 재사용 — NCR 은 UAK 를 정적 헤더로 직접 받으므로 토큰 교환이 불필요한 복잡도. `x-nhn-authorization: Bearer` 도 지원하나 정적 헤더가 더 단순.
  - IaaS Keystone 토큰([[adr-010]]) — NCR 은 OpenStack 이 아니라 Harbor 라 Keystone 무관.
  - ncr 블록에 secret 저장 — 인증 비밀은 공통 UAK secret 이라 ncr 블록은 appkey 만 둔다(중복 비밀 방지).
- **트레이드오프**: NCR region 축이 IaaS region 과 분리돼 region 맵이 하나 더 는다. host 가 실제로 다른 도메인이라 분리가 정직하다.
