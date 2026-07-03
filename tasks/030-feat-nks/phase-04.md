# Phase 04 — NKS 노드 그룹 쓰기

## 목표

노드 그룹 단위 생성·삭제·운영 변경 작업을 등록한다.

## 구현 범위

- `nks nodegroup create <cluster> --file <json>`
- `nks nodegroup delete <cluster> <nodegroup> [--yes]`
- `nks nodegroup stop-node <cluster> <nodegroup> --nodes <csv>`
- `nks nodegroup start-node <cluster> <nodegroup> --nodes <csv>`
- `nks nodegroup set-autoscale <cluster> <nodegroup> --file <json>`
- `nks nodegroup set-metric-autoscale <cluster> <nodegroup> --file <json>`
- `nks nodegroup upgrade <cluster> <nodegroup> --version <v> [--num-buffer-nodes <n>] [--num-max-unavailable-nodes <n>]`
- `nks nodegroup set-userscript <cluster> <nodegroup> --file <script>`
- `nks nodegroup update-flavor <cluster> <nodegroup> --flavor <uuid> [--num-buffer-nodes <n>] [--num-max-unavailable-nodes <n>]`
- `nks nodegroup set-fip-auto-bind <cluster> <nodegroup> --file <json>`
- `nks nodegroup set-labels <cluster> <nodegroup> --file <json>`

## 설계

- 공식 API 기준: <https://docs.nhncloud.com/ko/Container/NKS/ko/public-api/>
- `--nodes <csv>` 는 API body 의 colon 구분 `node_list` 로 변환한다.
- `set-userscript --file` 은 파일 내용을 `contents` 로 보낸다.
- `upgrade` 는 컨트롤 플레인 업그레이드 시 nodegroup 이름 `default-master` 를 그대로 받는다.
- metric autoscale 과 fip/labels 는 PATCH `/nodegroups/{id}` 에 `type` discriminator 를 넣는다.
- `tasks/030-feat-nks/index.json` 에서 Phase 4 `status` 를 `completed` 로, `current_phase` 를 `5` 로 갱신한다.

## 검증

- client 단위테스트에서 path/body/header 를 검증한다.
- 삭제와 변경 명령은 입력 요약을 stderr 로 출력하되 payload 원문 전체는 출력하지 않는다.

## 변경 파일 (정확)

- `src/services/nks/types.ts`
- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `src/commands/nks/helpers.ts`
- `src/commands/nks/nodegroup.ts`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "feat(nks): add nodegroup write commands"
```
