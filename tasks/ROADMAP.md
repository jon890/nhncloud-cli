# nhncloud-cli 기능 로드맵

NHN Cloud 공식 docs 전수 조사(2026-06-09)로 도출한 미구현 기능 백로그.
각 항목은 `/planning` 방식 task 폴더(`tasks/{NNN}-*`)로 설계되어 있다.
구현은 우선순위·의존성 순서로 `/plan-and-build` 또는 `/build-with-teams` 에 넘긴다.

## 설계 원칙 (이 백로그 공통)

- **docs 즉시 반영 시점**: 제품 docs(CLAUDE.md 명령 카운트·flow·code-architecture)는 각 기능을 **실제 구현하는 task 의 phase** 에서 갱신한다. 백로그 생성 시점에 12개를 한꺼번에 박지 않는다 — 미구현 명령이 docs 에만 존재하는 mismatch 회피.
- **ADR 동반 기능**: endpoint 해석 확장(image/network/block-storage catalog), Log & Crash collector(별도 host·인증)는 직관에 반하므로 구현 task 에서 ADR 을 함께 남긴다.
- **미확인(실측 필요) 항목**: docs 로 확정 못 한 동작은 해당 task phase 에 "구현 전 실측" 단계를 명시했다. 추측 구현 금지(CLAUDE.md API 스펙 확인 절차).

## 우선순위 묶음

### high — 기존 명령과 직접 연계, docs 확정, 모호함 적음

| task | 기능 | 연계 | endpoint/ADR |
|------|------|------|------|
| 008 | `instance start/stop/reboot` | `instance list/get` 의 다음 동작 | 공용 `serverAction()` helper (POST .../action, 202 무응답) |
| 009 | `instance keypairs` (목록/get/생성/삭제) | `create --key-name` 사전 준비 | 기존 compute endpoint. 신규 생성 시 `private_key` 1회성 — 파일 저장 안내 |
| 010 | `instance images` (목록) | `create --image` id 소스 | catalog `image` 타입 + `/v2/images` 경로 → endpoint 해석 확장 (ADR) |
| 011 | `deploy binary-groups` + `deploy binaries` (조회) | prd 의 "후속" 바이너리 묶음 중 조회 | 기존 Deploy GET 패턴 재사용 |
| 012 | `logncrash send` (로그 전송) | `search` 의 대칭(쓰기) | 별도 collector host + appkey-only 인증 (ADR) |
| 013 | `network list` + `subnet list` (VPC 조회) | `create --network` UUID 소스 | catalog `network` host 맵 확장 (ADR) — floatingip/secgroup 의 기반 |

### medium — 가치 있으나 의존성·미확인·신규 인프라 동반

| task | 기능 | 비고 |
|------|------|------|
| 014 | `instance resize` (action) | `flavors` 와 연계. **실측**: VERIFY_RESIZE 후 confirm/revert 자동 여부 docs 미확인 |
| 015 | `instance availability-zones` (목록) | `create --availability-zone` 후보. 작은 조회, compute endpoint 그대로 |
| 016 | `deploy upload` + `deploy download` | multipart 전송 + 파일 스트림 저장 — 신규 출력 경로. binary-groups(011) 선행 |
| 017 | `volume list/create` (Block Storage) + `instance volume attach/detach` | catalog `volumev2` host 확장(013 패턴 재사용). **실측**: Nova os-volume_attachments NHN 지원 여부 |
| 018 | `floatingip list/create/associate` | catalog `network`(013 의존). **실측**: associate 의 instance→port_id 매핑 경로 미확인 |
| 019 | `logncrash export` (scroll 대량 추출) | scrollKey 1분 만료 루프. search 옵션 확장으로 흡수 가능 |

### low — 로드맵 기록만 (task 미생성)

가치가 낮거나 docs 미확인이라 현 시점 task 로 만들지 않는다. 필요 시 승격.

- `instance` 메타데이터 CRUD, 배치 정책(placement), 인스턴스 이름 수정(`PUT /servers/{id}`), 이미지 생성(`createImage` — U2 한정)
- `flavor` 단일 상세(`GET /flavors/{id}`) — 목록(`flavors`)으로 충분 + docs 미확인
- `secgroup` 자체 CRUD(목록/생성/규칙) — 발급 시 이름만 알면 되어 UUID 조회 필요성 낮음
- `logncrash tokens`(검색 토큰 잔량) — 부가 진단용
- Deploy scenario / project-stage / rollback — **public API 부재**(콘솔 전용, 구현 불가)

## 의존성 그래프

```
013 (network endpoint 확장) ──→ 018 (floatingip)
                            └─→ (secgroup, low)
017 (block storage endpoint 확장, 013 패턴 재사용) ──→ instance volume attach
011 (binary 조회) ──→ 016 (binary upload/download)
010 (image endpoint 확장) — 독립
012 (logncrash collector) — 독립
008/009/014/015 — 기존 compute endpoint, 독립
```

권장 착수 순서: 008 → 009 → 011 → 012 → 010 → 013 → (나머지 medium).

## 구현 시 주의 (백로그 전체 공통)

- **명령 카운트 충돌**: 각 task 의 phase 는 작성 시점 기준 "현재 11개"(007 머지 후)에서 자기 명령을 더해 CLAUDE.md `지원 명령 (N개)` 를 갱신하도록 적혀 있다. 여러 task 가 같은 11을 기준 삼으므로, **머지 순서대로 그 시점의 실제 카운트를 grep 으로 다시 읽어 +N** 한다. phase 에 하드코딩된 숫자(예: 008 의 "14개", 011 의 "13개")는 그대로 쓰지 말고 재계산.
- **endpoint 확장 선행 의존**: 010 이 ADR-013 으로 "IaaS 멀티 서비스 endpoint 해석(host 맵 + `getIaasToken` 다중 endpoint 반환)" 프레임을 먼저 세운다. 013(network)·017(block storage)·018(floatingip, 013 경유)은 그 위에 host 한 줄씩 더하는 구조다. **010 미머지 상태에서 013/017 의 endpoint phase 를 시작하면 phase-01 이 blocked** 되도록 각 task 에 게이트가 있다. 따라서 endpoint 확장 계열은 010 을 먼저 머지한다.
- **실측(미확인) 게이트**: 010(image host), 013(network host), 014(resize confirm/revert), 017(volume attach), 018(associate port_id)은 docs 로 확정 못 한 항목이 있어 phase 첫 단계가 실측이다. 실측 불가(테스트 자격증명 없음) 시 추측 구현 금지 — 해당 phase 를 `blocked` 로 두고 사용자에게 보고한다.
