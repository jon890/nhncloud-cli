# Phase 01 — 실측: resize 후 상태 전이 확인 + confirm/revert 설계 확정

## 목표

`instance resize` 구현 전에 **NHN Cloud 가 resize 를 어떻게 마무리하는지** 를 실제 호출로 확정한다.
이 결과에 따라 phase-02 의 범위(단순 resize 1개 vs resize + confirm/revert 명령)가 갈리므로,
phase-01 은 **blocked 가능 지점**이다 (실측 못 하면 phase-02 진행 불가 → status `blocked` + `blocked_reason` 기록).

## 왜 실측이 필요한가 (미확인 항목)

API 스펙은 docs 로 확인됐다.

- resize: `POST /v2/{tenantId}/servers/{serverId}/action`, body `{ "resize": { "flavorRef": "<flavor-id>" } }`, 응답 202 무본문.
- 사전 상태: ACTIVE 또는 SHUTOFF (ACTIVE 면 NHN 측에서 중지 후 재시작).

**미확인** — OpenStack Nova 표준에서 resize 는 2단계다.

1. `{ "resize": { "flavorRef": "..." } }` 호출 → 서버가 `RESIZE` → `VERIFY_RESIZE` 상태로 전이.
2. 사용자가 `{ "confirmResize": null }` (확정) 또는 `{ "revertResize": null }` (롤백) 을 별도 호출해야 최종 `ACTIVE` 가 됨.

NHN Cloud 가 이 2단계를 **자동으로 confirm 해 주는지**, 아니면 표준대로 `VERIFY_RESIZE` 에서 멈춰 사용자 호출을 기다리는지 **공식 docs 에 명시가 없다**.
추측으로 구현하면 사용자가 `resize` 후 인스턴스가 `VERIFY_RESIZE` 에 갇히는 함정이 생긴다 (CLAUDE.md "추측한 채로 구현·머지하지 않는다").

## 작업 상세

### 1. docs 재확인 (실측 전 1차)

NHN Cloud Compute Instance public-api docs 에서 server action 의 resize 절을 다시 확인한다.

- 본다: `docs.nhncloud.com/ko/Compute/Instance/ko/public-api/` 의 server action(`POST /servers/{id}/action`) 항목.
- 확인 대상: `resize` body 형태, `confirmResize`/`revertResize` action 의 존재 여부와 body 형태, resize 후 상태 전이 설명.
- docs 가 봇 차단으로 `WebFetch` 안 되면 `WebSearch` 또는 cmux-browser 로 우회 (CLAUDE.md API 스펙 확인 절차).
- docs 에 "자동 confirm" 또는 "VERIFY_RESIZE 확정 필요" 가 명시돼 있으면 그 문장을 본 phase 의 "실측 결과" 절에 인용하고 실측 호출은 생략 가능.

### 2. 실측 (docs 로 확정 안 되면 필수)

자격증명이 설정된 profile 로 **삭제해도 되는 테스트 인스턴스** 1개에 resize 를 실제로 호출하고 상태를 관찰한다.

사전 준비:

```bash
# 후보 flavor id 조회 (007 instance flavors 재사용 — --flavor 에 넣을 다른 타입 id 선택)
node dist/index.js instance flavors --detail
# 대상 인스턴스 현재 flavor 확인
node dist/index.js instance get <instance-id>
```

실측 호출 (현 시점엔 resize 메서드 미구현 → 직접 호출하거나 임시 스크립트로):

```bash
# 실제 resize action 호출 후 상태 전이를 폴링 관찰
#   POST {computeEndpoint}/servers/<instance-id>/action
#   headers: X-Auth-Token: <token>
#   body: {"resize": {"flavorRef": "<new-flavor-id>"}}
# 호출 직후부터 instance get 으로 status 를 반복 관찰한다.
node dist/index.js instance get <instance-id>   # status 반복 확인
```

관찰 항목 (둘 중 하나로 확정):

- **(A) 자동 confirm** — resize 후 status 가 `RESIZE` → (잠시 후) `ACTIVE` 로 돌아오고 flavor 가 새 값으로 바뀜. `VERIFY_RESIZE` 가 관찰되지 않음.
- **(B) 수동 confirm 필요** — status 가 `VERIFY_RESIZE` 에서 멈춤. `{ "confirmResize": null }` 를 별도 호출해야 `ACTIVE` 가 되고, `{ "revertResize": null }` 는 이전 flavor 로 롤백.

> 실측은 사용자/QA 의 자격증명·실제 인스턴스가 필요하다. 자격증명·테스트 인스턴스가 없어 실측 불가하면
> 이 phase 를 `blocked` 로 두고 `blocked_reason` 에 "resize 후 상태 전이 실측 필요 (자격증명+테스트 인스턴스)" 를 기록한다.
> 추측으로 phase-02 를 진행하지 않는다.

### 3. 설계 확정 (실측 결과 → phase-02 범위 결정)

실측 결과를 본 phase 문서의 "실측 결과" 절에 기록하고, 아래 중 하나로 phase-02 범위를 확정한다.

| 실측 결과 | phase-02 범위 | client 메서드 | 명령 |
|---|---|---|---|
| (A) 자동 confirm | resize 단일 | `resize(id, flavorRef)` 만 | `instance resize` 1개 |
| (B) 수동 confirm 필요 | resize + confirm/revert | `resize` + `confirmResize` + `revertResize` | `instance resize` + `instance resize-confirm` + `instance resize-revert` (3개) |

> (B) 에서 대안으로 `instance resize --wait` (VERIFY_RESIZE 까지 폴링 후 자동 confirm) 를 둘 수도 있다.
> 단 자동 confirm 은 롤백 기회를 없애므로, **명시적 `resize-confirm`/`resize-revert` 명령을 기본으로 두고
> `--wait` 자동 confirm 은 phase-02 에서 선택 옵션으로만** 검토한다 (사용자가 의도적으로 확정을 미룰 수 있어야 함).
> 명령 개수가 갈리므로 index.json 의 total_phases 는 3 으로 유지하되, phase-03 의 CLAUDE.md 명령 카운트는 실측 결과(+1 또는 +3)에 맞춰 기록한다.

## 실측 결과 (이 절을 실측 후 채운다)

- docs 명시 여부: (채울 것)
- 관찰된 상태 전이: (채울 것 — 예: `ACTIVE → RESIZE → VERIFY_RESIZE` 또는 `ACTIVE → RESIZE → ACTIVE`)
- 확정: (A) 자동 confirm / (B) 수동 confirm 필요 — (채울 것)
- phase-02 범위: (채울 것 — resize 단일 / resize + confirm/revert)

## 회피 항목 (code-review-pitfalls 사전 확인 — phase-02 로 전달)

phase-01 은 실측·설계라 코드 산출물이 없지만, 확정된 설계가 phase-02 에서 아래를 만족하도록 미리 못박는다.

- **1-2 (spinner leak)**: phase-02 의 resize/confirm/revert command 는 client 호출을 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `delete.ts` 가 reference.
- **다단계 spinner 전환 시 직전 stop (1-2 재발 패턴)**: (B) 에서 `--wait` 자동 confirm 을 채택하면 "resize 중..." spinner 를 `stopSpinner(true)` 로 닫은 뒤에 "VERIFY_RESIZE 대기 중..." 두 번째 spinner 를 시작한다 (create `--wait` 의 PR #6 회귀 패턴).
- **9-1 (exit code 리터럴 금지)**: 입력 검증 실패는 `EXIT_PARAM_ERROR` **상수** 사용 (숫자 3 리터럴·주석 금지).
- **`--flavor` requiredOption (4-3 dead code 회피)**: `--flavor` 는 `requiredOption` 으로 진입 전 강제하므로 action 내부 `if (!opts.flavor)` 수동 재검증을 두지 않는다 (절대 false 가 안 되는 dead code).
- **DRY (serverAction 재사용)**: resize/confirm/revert 가 각자 `ky.post(...action)` 을 중복 작성하지 않고 008 의 `serverAction(id, payload)` 1곳을 경유한다.

## 성공 기준 (검증 + 실측 확인 분리)

### 자동 검증 (자격증명 불필요)

```bash
# cwd: <repo root 또는 worktree>

# 1. 008 의 serverAction helper 가 존재하는지 (선행 의존 — phase-02 가 재사용할 대상)
grep -cE "private async serverAction\(id: string, payload: Record<string, unknown>\)" src/services/instance/client.ts
# 기대: 1  (0 이면 008(instance power) 선행 구현이 머지 안 된 것 → phase-01 을 blocked 로, blocked_reason 에 "008 serverAction 선행 필요")

# 2. 이 phase 문서의 "실측 결과" 절이 채워졌는지 (placeholder 가 남아있지 않은지)
grep -c "(채울 것)" tasks/014-feat-instance-resize/phase-01.md
# 기대: 0  (실측·설계 확정 후 모든 placeholder 가 실제 값으로 치환됨)
```

### 실측 확인 (자격증명 + 테스트 인스턴스 필요 — 사용자/QA)

```bash
# resize 호출 후 상태 전이 관찰 (위 "작업 상세 2" 참조)
node dist/index.js instance get <instance-id>
# 기대: VERIFY_RESIZE 관찰 여부로 (A)/(B) 확정. 결과를 "실측 결과" 절에 기록.
```

> 실측 불가(자격증명·인스턴스 없음) 시 phase 를 완료 처리하지 말고 `blocked` 로 두고 `blocked_reason` 기록.
> docs 에 자동/수동 confirm 이 명시돼 있으면 실측 없이 그 문장 인용으로 확정 가능 (작업 상세 1).
