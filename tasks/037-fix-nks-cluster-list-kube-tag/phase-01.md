# Phase 01 — nks cluster list kube_tag 위치 버그 수정 (이슈 #47)

## 목표

`nhncloud nks cluster list` 가 `kube_tag` 위치 오판으로 항상 실패하는 문제를 고친다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- 회귀 테스트: `labels.kube_tag` 만 있고 최상위 `kube_tag` 가 없는 cluster 응답이 통과하고, list 행에 버전이 표시된다.

## 원인 (실측 확정)

`GET /v1/clusters` 응답의 cluster 객체는 `kube_tag` 를 최상위가 아니라 `labels.kube_tag` 에 담는다.
`isNksClusterSummary`(`src/services/nks/types.ts`)가 최상위 `kube_tag: string` 을 요구해 모든 항목이 false → 배열 전체 invalid.
`getCluster` 등은 느슨한 `isNksNamedResource` 가드라 영향이 없다 — 버그는 `listClusters` 경로에 격리된다.

## 구현 항목

### 1. 응답 가드 완화 (`src/services/nks/types.ts`)

- `isNksClusterSummary` 에서 `typeof obj["kube_tag"] === "string"` 요구를 제거한다.
- `NksClusterSummary` interface: `kube_tag: string` → `kube_tag?: string` 로 완화하고 `labels?: Record<string, unknown>` 를 추가한다.
- 나머지 필수 필드(uuid·name·status·health_status·node_count)는 유지한다.

### 2. list 출력 (`src/commands/nks/cluster.ts`)

- list 행의 `kube_tag` 값을 `labels.kube_tag` 우선 → 최상위 `kube_tag` fallback → 없으면 `-` 로 표시한다.
- `labels.kube_tag` 는 `unknown` 이므로 `typeof === "string"` 확인 후 사용한다(타입 안전).

### 3. 테스트 (`src/services/nks/client.test.ts`)

- 기존 fixture 의 최상위 `kube_tag` 를 `labels: { kube_tag: "..." }` 로 옮긴다.
- 회귀 테스트: `labels.kube_tag` 만 있는 응답이 `listClusters()` 를 통과한다.
- (선택) 최상위 `kube_tag` 만 있는 구형 응답도 여전히 통과함을 확인(fallback 보장).

### 4. task 상태

- `tasks/037-fix-nks-cluster-list-kube-tag/index.json` 의 Phase 1 `status` 를 `completed` 로 갱신한다.

## 회피 항목

- `grep -n "kube_tag" src/services/nks/types.ts` → 가드에서 최상위 요구 0건(interface optional 표기만 남음).
- `grep -n "labels" src/commands/nks/cluster.ts` → list 출력이 `labels.kube_tag` 를 참조.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/nks src/commands/nks` → 0건(리터럴 exit code 금지).

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상(회귀 테스트 포함).
4. index.json Phase 1 `completed`.

## 변경 파일 (정확)

- `src/services/nks/types.ts`
- `src/commands/nks/cluster.ts`
- `src/services/nks/client.test.ts`
- `tasks/037-fix-nks-cluster-list-kube-tag/index.json`

## 커밋

```bash
git commit -m "fix(nks): read kube_tag from labels in cluster list (#47)"
```
