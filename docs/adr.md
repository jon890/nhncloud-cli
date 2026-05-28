# ADR — nhncloud-cli 기술 결정 기록

## ADR Index

- [ADR-001](#adr-001): TypeScript + Commander.js + tsup
- [ADR-002](#adr-002): ky (HTTP 클라이언트)
- [ADR-003](#adr-003): profile 기반 자격증명 — JSON + credentials/config 분리
- [ADR-004](#adr-004): profile 안 서비스별 자격증명 블록
- [ADR-005](#adr-005): 엔드포인트 하드코딩 맵 (gov 제외)
- [ADR-006](#adr-006): NHN 공통 응답 봉투 정규화

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

## ADR-004: profile 안 서비스별 자격증명 블록

- **결정**: profile 아래 서비스 키(`logncrash`/`deploy`)별로 appkey·secret·token 을 분리 저장.
- **맥락**: NHN Cloud 는 서비스마다 인증이 다르다.
  - Log & Crash 검색 — appkey + secret (`X-LNCS-SECRET`)
  - Deploy — appkey + Bearer token (`X-NHN-AUTHORIZATION`)
  - AWS 의 단일 access-key 모델과 다르다.
- **대안 기각**: 전역 단일 키(NHN 현실과 불일치), 평탄 키(`logncrash_appkey` 등 — 서비스 늘면 충돌).

---

<a id="adr-005"></a>

## ADR-005: 엔드포인트 하드코딩 맵 (gov 제외)

- **결정**: 서비스별 고정 도메인을 코드 맵으로 관리. v1 은 일반(real) 엔드포인트만.
- **맥락**: NHN PaaS 는 서비스별 고정 도메인을 쓴다 (`api-lncs-search.nhncloudservice.com` 등). IaaS 의 serviceCatalog 동적 발견과 달라 정적 맵이 단순·명확.
- **대안 기각**: profile 에 endpoint 직접 저장(설정 부담). gov 분기는 후속 — `region` 필드로 도메인 교체 예정.

---

<a id="adr-006"></a>

## ADR-006: NHN 공통 응답 봉투 정규화

- **결정**: `{ header: { isSuccessful, resultCode, resultMessage }, body }` 봉투를 단일 helper 로 unwrap. 실패 시 `NhnCloudCliError`.
- **맥락**: NHN PaaS 다수가 이 봉투를 공유 (dooray 와 동일 구조). HTTP 4xx 와 별개로 `isSuccessful: false` 가 올 수 있어 봉투 검사 필수.
- **트레이드오프**: `resultCode` 타입이 서비스마다 다르다.
  - Log & Crash 는 숫자, Deploy 는 문자열 (`"SUCCESS"`).
  - helper 는 `string | number` 를 모두 받아 `isSuccessful` 을 우선 판정한다.
