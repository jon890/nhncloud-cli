# Phase 01 — 실측: instance→port_id 매핑 경로 확인 + associate 가능 여부 판정

## 목표

`floatingip associate` 의 핵심 미확인 항목을 **코드를 고치기 전에 실제 호출로 확정**한다.

NHN Cloud Floating IP 의 연결 API(`PUT /v2.0/floatingips/{id}`)는
연결 대상으로 **인스턴스 id 가 아니라 port_id** 를 요구한다(`{"floatingip": {"port_id": "<port>"}}`).
그런데 사용자가 손에 쥐고 있는 값은 인스턴스 id 뿐이다.
인스턴스 id → port_id 로 변환하는 경로가 NHN VPC public-api 가이드에 **명시되어 있지 않다**.

이 phase 는 그 변환 경로를 실측으로 확정하고, associate 명령을 phase-02 에서 구현할 수 있는지(가능/보류)를 판정한다.
**조사·검증만 한다 — 코드 변경 없음**(phase-02 가 코드).

## 미확인 항목 — 구현 전 실측. 추측 구현 금지

다음 두 가지를 실제 호출로 확인한 뒤에야 associate 설계를 확정한다.

1. **instance → port_id 매핑 경로** — `GET /v2.0/ports?device_id=<instance-id>` 로 **추정**이나 미확인.
   - Neutron 관례상 인스턴스에 붙은 port 는 `device_id == 인스턴스 id` 로 필터된다.
   - NHN VPC 가 raw Neutron `/v2.0/ports` 를 그대로 노출하는지, NHN 고유 경로(예: `/v2.0/vpcports` 류)인지 미확인.
   - 확인 방법(둘 중 가능한 쪽):
     - (a) network endpoint(013 의 `networkEndpoint`)에 `GET /v2.0/ports?device_id=<instance-id>` 를 `X-Auth-Token` 으로 호출해 200 + `ports[].id`(= port_id) 가 오는지 확인.
     - (b) 200 이 안 오면 다른 후보 경로(`/v2.0/vpcports` 등)를 docs(NHN VPC > Network public-api)에서 재확인 후 호출.
2. **연결 후 검증 형태** — `PUT /v2.0/floatingips/{id}` 응답이 `floatingip.port_id`·`floatingip.status` 를 돌려주는지, 무본문(202)인지 미확인.
   - 위 (a) 로 얻은 port_id 로 실제 `PUT` 을 1회 호출해 응답 본문 형태와 status 전이(DOWN→ACTIVE)를 확인한다.

> **판정 규칙**: 위 1 이 실측으로 확정되면 associate 를 phase-02 에 **포함**한다.
> 실측으로도 매핑 경로가 확정 안 되면 associate 를 **보류**하고 phase-02 에서 `list`/`create`/`delete` 만 낸다.
> 보류 사유를 phase-02 와 phase-03(docs/blocked)에 남긴다(CLAUDE.md "API 스펙 확인 절차" — 추측한 채 머지 금지).

## 013 선행 의존 확인

이 task 는 013(network endpoint 해석) 위에 얹힌다. **013 은 이미 base 에 머지 완료**다 (검증: `grep -c networkEndpoint src/api/keystone.ts` ≥1, `src/services/network/`·`resolveNetworkClient` 존재). blocked hedge 불요.

- 013 의 `networkEndpoint`(catalog type `network`, host 실측 확정)를 그대로 base 로 쓴다 — host/endpoint 를 새로 만들지 않는다.
- floatingip 도 `/v2.0/...`(tenantId segment 없음) 경로 형태를 013 과 동일하게 따른다.
- **phase-01 실측은 read-only**: `GET /v2.0/ports?device_id=<instance-id>` 는 읽기라 executor 가 직접 호출해 instance→port_id 매핑을 확인할 수 있다 (associate 의 쓰기 호출은 phase-02 가 아니라 수동 QA — 1-26).

> 013 이 아직 phase 파일조차 없는 pending 상태이면(현 시점), 013 의 `index.json` description 에 적힌 구조(services/network client + resolveNetworkClient + networkEndpoint)를 기준으로 실측만 진행하고, 013 구현 완료를 phase-02 의 선행 조건으로 명시한다.

## 산출물 (이 phase 가 남기는 것)

코드가 아니라 **확정된 사실**을 남긴다. 다음을 phase-02 작성 전에 확정:

- instance→port_id 매핑 경로(확정 URL·쿼리·응답 필드명).
- `PUT /v2.0/floatingips/{id}` 응답 형태(본문 유무·status 필드).
- associate 판정: 포함 / 보류 (보류면 사유 1줄).

판정 결과는 phase-02 의 "associate 포함 여부" 분기와 phase-03 의 docs/blocked 기록에 반영한다.

## 성공 기준 (검증 명령 + 기대값)

이 phase 는 코드 변경이 없으므로 빌드/타입 검증 대상이 아니다.
성공 기준은 **확정 사실의 존재**다.

```bash
# cwd: <repo root 또는 worktree>

# 1. 013 선행 의존 — network client / resolveNetworkClient 존재 확인
test -f src/services/network/client.ts && echo "network client OK" || echo "BLOCKED: 013 먼저"
grep -rn "resolveNetworkClient" src/commands/network/ src/commands/instance/ 2>/dev/null | head -1
# 기대: network client 파일 존재 + resolveNetworkClient 정의 1곳 (없으면 013 선행)
```

자동 검증은 위 한 가지(013 의존 확인)뿐이다 — 나머지는 자격증명이 필요한 실측이다.

## 수동 확인 (실측 — 자격증명 필요, 구현자 직접 수행)

```bash
# 개인 식별 정보는 placeholder — 실제 토큰/instance id 로 치환해 실행.
#   <token>: Keystone 발급 X-Auth-Token
#   <network-host>: 013 이 확정한 network host
#   <instance-id>: 실제 인스턴스 id
#   <floatingip-id> / <port-id>: 실측 중 얻는 값

# (0) floatingips 경로명·응답형 읽기 실측 (READ-ONLY — phase-02 types/guard 작성 전 확정)
#     NHN VPC 는 raw Neutron 이 아니라 고유 리소스명(/vpcs·/vpcsubnets)을 쓴다 → /floatingips 경로명 자체를 GET 으로 검증.
curl -s -H "X-Auth-Token: <token>" \
  "https://<network-host>/v2.0/floatingips" | head -c 800
# 기대: {"floatingips":[{"id":...,"floating_ip_address":...,"status":...,"port_id":<null|"...">,"fixed_ip_address":<null|"...">,"floating_network_id":...,"label":...}]}
# 확인: (a) 경로명 /v2.0/floatingips 가 200 (404 면 NHN 고유 경로 docs 재확인)
#       (b) port_id·fixed_ip_address·label 의 null 여부 → phase-02 types 의 `| null`/optional 확정
# 200 이 아니거나 다른 경로면 → phase-02 의 floatingips URL·types 를 실측값으로 정정 후 진행

# (1) instance → port_id 매핑 경로 (추정 — 200 + ports[].id 면 확정)
curl -s -H "X-Auth-Token: <token>" \
  "https://<network-host>/v2.0/ports?device_id=<instance-id>" | head -c 800
# 기대: {"ports":[{"id":"<port-id>","device_id":"<instance-id>",...}]} → port_id 확정
# 200 이 아니거나 ports 가 비면 → 다른 후보 경로 재확인 (NHN VPC docs)

# (2) 외부 네트워크 id 조회 (create 의 floating_network_id 소스 — 013 재사용)
curl -s -H "X-Auth-Token: <token>" \
  "https://<network-host>/v2.0/vpcs?router:external=true" | head -c 800
# 기대: 외부(external) VPC 의 id — create body 의 floating_network_id 에 사용

# (3) 위 (1) 로 얻은 port_id 로 PUT 연결 — 응답 본문 형태·status 전이 확인
curl -s -X PUT -H "X-Auth-Token: <token>" -H "Content-Type: application/json" \
  -d '{"floatingip":{"port_id":"<port-id>"}}' \
  "https://<network-host>/v2.0/floatingips/<floatingip-id>" | head -c 800
# 기대: {"floatingip":{"id":...,"port_id":"<port-id>","status":"ACTIVE",...}} 또는 무본문(202)
# 응답 형태를 phase-02 의 associate 응답 처리에 반영

# (4) 해제 검증 — port_id:null 로 PUT
curl -s -X PUT -H "X-Auth-Token: <token>" -H "Content-Type: application/json" \
  -d '{"floatingip":{"port_id":null}}' \
  "https://<network-host>/v2.0/floatingips/<floatingip-id>" | head -c 400
# 기대: status DOWN 전이 (또는 무본문) — disassociate 동작 확인
```

실측으로 (1) 이 확정되면 associate 를 phase-02 에 포함한다.
(1) 이 어떤 경로로도 확정 안 되면 associate 보류 — phase-02 는 list/create/delete 만, phase-03 에서 blocked 기록.
