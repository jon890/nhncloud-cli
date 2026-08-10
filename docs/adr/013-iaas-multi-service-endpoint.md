# ADR-013: IaaS 멀티 서비스 endpoint 해석 — image·network·blockstorage catalog host 맵 추가 (정적 맵 유지)

- **결정**: image(Glance v2)·network(NHN VPC) endpoint 도 compute 와 동일하게 region 별 **정적 host 맵**으로 해석한다.
  - `endpoints.ts` 에 `IMAGE_HOST`·`NETWORK_HOST` 맵과 `imageHost(region)`·`networkHost(region)` 추가.
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
  - **profile 에 endpoint 직접 저장** — 설정 부담이 있고 region override 와 충돌.
- **트레이드오프**:
  - region 코드가 compute·image·network·blockstorage **네 host 맵**에 중복된다(image 둘 → network 셋 → blockstorage 넷) — region 추가 시 동기화 누락 위험.
    구현 시 네 맵 key 집합 일치를 성공 기준 grep 으로 확인한다 (상시 런타임 가드는 아님 — 추가 시 후속 task). 서비스 type 이 늘수록 맵 관리 부담이 커진다 — 동적 catalog 파싱 재검토 임계가 또 한 단계 가까워졌다.
  - host 패턴·tenant 유무를 docs 만으로 확정하지 못해 실측으로 확정했다(추측 구현 금지). 단 **blockstorage host 는 아직 docs 추론**(serviceCatalog publicURL 실측 미완) — 첫 호출 200 으로 확인 예정. image/network 와 톤 구분.
  - **kr1/kr2 만 publicURL 실측 확정. kr3/jp1 IMAGE_HOST·NETWORK_HOST·BLOCKSTORAGE_HOST 는 같은 패턴으로 추론**(미실측) — 자격증명 확보 시 후속 실측. 첫 호출이 host 에서 실패하면 `getaddrinfo ENOTFOUND` 로만 드러난다.

