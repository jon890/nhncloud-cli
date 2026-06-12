# ADR-011: Instance 발급 — boot-from-volume 필수 + POST 축약 응답

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

