# Phase 02 — NKS 조회 명령 전체

## 목표

공식 NKS Public API 의 읽기 기능을 모두 CLI에 등록한다.

## 구현 범위

- `nks cluster get <cluster>`
- `nks cluster events <cluster>`
- `nks cluster event <cluster> <event>`
- `nks cluster kubeconfig <cluster> [--output <file>]`
- `nks cluster ipacl <cluster>`
- `nks nodegroup list <cluster>`
- `nks nodegroup get <cluster> <nodegroup>`
- `nks nodegroup autoscale <cluster> <nodegroup>`
- `nks addon-type list|get`
- `nks addon list|get`
- `nks cluster addon list|get`

## 설계

- 공식 API 기준: <https://docs.nhncloud.com/ko/Container/NKS/ko/public-api/>
- `kubeconfig` 기본 출력은 stdout.
- `--output <file>` 저장 시 mode `0600`, 기존 파일은 기본 거부하고 `--force` 로만 덮어쓴다.
- `addon list` 는 `--k8s-version`, `--image`, `--platform-version` query 옵션을 제공한다.
- `cluster` 와 `nodegroup` 식별자는 공식 API 처럼 UUID 또는 이름을 허용한다.
- 작업 이력 API는 공식 문서의 `CLUSTER_UUID` 요구를 보존하되 CLI 인자명은 기존 범위에 맞춰 `<cluster>` 로 둔다.
- `tasks/030-feat-nks/index.json` 에서 Phase 2 `status` 를 `completed` 로, `current_phase` 를 `3` 으로 갱신한다.

## 검증

- `pnpm tsc --noEmit`
- `pnpm run build`
- `pnpm test`
- 각 명령 `--help` 는 exit code 0 이고 stdout 에 해당 leaf command 이름이 포함된다.
- 자격증명 가능 시 `supports`, `cluster list`, `addon list` 200 실측.

## 변경 파일 (정확)

- `src/services/nks/types.ts`
- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `src/commands/nks/cluster.ts`
- `src/commands/nks/nodegroup.ts`
- `src/commands/nks/addon.ts`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "feat(nks): add read command surface"
```
