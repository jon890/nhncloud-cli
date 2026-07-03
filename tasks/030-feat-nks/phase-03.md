# Phase 03 — NKS 클러스터 쓰기

## 목표

클러스터 단위 생성·삭제·변경 작업을 등록한다.

## 구현 범위

- `nks cluster create --file <json>`
- `nks cluster delete <cluster> [--yes]`
- `nks cluster resize <cluster> --nodegroup <name-or-uuid> --node-count <n> [--nodes-to-remove <csv>]`
- `nks cluster set-ipacl <cluster> --file <json>`
- `nks cluster renew-certificate <cluster> --term-of-validity <1-5>`
- `nks cluster update-sgw <cluster> --ncr-sgw <uuid> --obs-sgw <uuid>`
- `nks cluster set-control-plane-log <cluster> --file <json>`

## 설계

- 공식 API 기준: <https://docs.nhncloud.com/ko/Container/NKS/ko/public-api/>
- 클러스터 생성은 필드가 많아 `--file <json>` 만 Phase 3 기본 경로로 둔다.
- 삭제는 기존 `instance delete` 와 같은 confirm + `--yes`.
- resize 감축 시 `--nodes-to-remove` 가 없으면 API가 무작위로 삭제할 수 있으므로 stderr 에 명확히 경고한다.
- control plane log payload 는 appkey 등 민감값이 포함될 수 있어 로그에 payload 원문을 출력하지 않는다.
- `tasks/030-feat-nks/index.json` 에서 Phase 3 `status` 를 `completed` 로, `current_phase` 를 `4` 로 갱신한다.

## 검증

- payload 파일 파싱 오류는 `EXIT_PARAM_ERROR`.
- 쓰기 명령은 client 단위테스트에서 method/path/body/header 를 검증한다.
- 실제 자원 생성·삭제는 자격증명과 별도 승인 환경이 있을 때만 smoke 로 수행한다.

## 변경 파일 (정확)

- `src/services/nks/types.ts`
- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `src/commands/nks/helpers.ts`
- `src/commands/nks/cluster.ts`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "feat(nks): add cluster write commands"
```
