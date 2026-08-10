# ADR-019: NKS API — Keystone 토큰과 container-infra endpoint

- **결정**: NHN Kubernetes Service(NKS)는 `iaas` Keystone 토큰을 재사용하되, endpoint 는 region 별 `api-kubernetes-infrastructure` host 의 `/v1` 로 분리한다.
  - `endpoints.ts` 에 `NKS_HOST` 맵과 `nksHost(region)` 를 추가한다.
    공식 API 문서가 endpoint 를 제시한 region 은 `kr1`, `kr2`, `kr3` 이므로 `jp1` 은 추가하지 않는다.
  - `getIaasToken` 은 `nksEndpoint` 를 `https://<region>-api-kubernetes-infrastructure.nhncloudservice.com/v1` 형태로 함께 반환하고 토큰 캐시에 보관한다.
  - NKS client 는 모든 요청에 `X-Auth-Token: <tokenId>` 와 `OpenStack-API-Version: container-infra latest` 를 붙인다.
  - NKS 응답은 NHN 공통 `{ header, body }` 봉투가 아니라 OpenStack 계열 평면 JSON 또는 무본문 응답이다.
    `unwrap` / `unwrapHeader` 를 호출하지 않고 HTTP status 와 endpoint 별 타입 가드로 판정한다.
- **맥락**: 공식 NKS Public API 는 클러스터, 노드 그룹, 애드온, 지원 버전/작업 종류를 `container-infra` API 로 제공한다.
  기존 CLI 는 IaaS Keystone 계열에서 compute·image·network·blockstorage endpoint 만 보유한다([[adr-010]], [[adr-013]]).
  NKS는 Container 카테고리지만 NCR 과 달리 UAK 정적 헤더나 Harbor Basic Auth 가 아니라 Keystone `X-Auth-Token` 을 쓴다.
- **대안 기각**:
  - **NCR 인증 모델 재사용**: NKS 는 Container 서비스지만 공식 API 인증 헤더가 `X-Auth-Token` 이다.
    NCR 의 `X-TC-AUTHENTICATION-*` 나 Harbor Basic Auth 와 섞으면 profile 구조와 오류 안내가 틀어진다.
  - **serviceCatalog 동적 파싱으로 전환**: NKS 추가만으로 전체 IaaS endpoint 해석을 동적 catalog 기반으로 바꾸면 변경 범위가 커진다.
    ADR-005/013의 정적 host 맵 노선을 유지하고, 서비스 type 이 더 늘어 맵 관리 비용이 커질 때 재검토한다.
  - **payload 전 필드 flag 화**: 클러스터 생성·노드 그룹 생성·autoscale·control plane log payload 는 필드가 많고 중첩 구조가 있다.
    전부 flag 로 펼치면 CLI 표면이 과도하게 커진다.
    복잡한 쓰기 명령은 `--file <json>` 을 기본 입력으로 삼고, 조회와 단순 변경만 flag 중심으로 둔다.
- **트레이드오프**:
  - `iaas-token-<profile>-<region>.json` 캐시 스키마가 `nksEndpoint` 를 추가로 요구한다.
    구버전 캐시는 가드 실패 후 자연 재발급하도록 유지한다.
  - `kr1/kr2/kr3` host 는 공식 NKS API 문서가 제시한 endpoint 로 시작한다.
    `jp1` 은 기존 IaaS host 패턴에서 유추할 수 있지만 공식 NKS API 문서에 endpoint 가 없으므로 이번 구현에서 지원하지 않는다.
    향후 `jp1` 추가는 실제 200 응답 또는 공식 문서 갱신으로 확인한 뒤 별도 ADR 업데이트와 함께 진행한다.
  - `kubeconfig` 는 민감한 인증 정보를 포함한다.
    기본은 stdout, `--output <file>` 지정 시 mode `0600` 으로 저장하고 kubeconfig merge 기능은 이번 범위에서 제외한다.
