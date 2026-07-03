# Phase 05 — NKS 애드온 쓰기

## 목표

클러스터 애드온 설치·업데이트·제거 명령을 등록한다.

## 구현 범위

- `nks cluster addon install <cluster> --name <name> --version <version> --resolve-conflicts <none|overwrite|preserve>`
- `nks cluster addon update <cluster> <addon> --version <version> --resolve-conflicts <none|overwrite|preserve>`
- `nks cluster addon remove <cluster> <addon> [--yes]`

## 설계

- 공식 API 기준: <https://docs.nhncloud.com/ko/Container/NKS/ko/public-api/>
- conflict 옵션은 공식 API 값 `none`, `overwrite`, `preserve` 만 허용한다.
- remove 는 confirm + `--yes`.
- install/update 응답은 cluster uuid 만 반환하므로 출력은 대상 cluster uuid 와 작업 요청 성공 여부 중심으로 둔다.
- `tasks/030-feat-nks/index.json` 에서 Phase 5 `status` 를 `completed` 로, `current_phase` 를 `6` 으로 갱신한다.

## endpoint/body/response matrix

| 명령 | Method / path | Body | Response guard |
|---|---|---|---|
| `nks cluster addon install <cluster>` | `POST /clusters/{cluster}/addons/` | `{ name, version, resolve_conflicts, options? }` | `{ uuid: string }` |
| `nks cluster addon update <cluster> <addon>` | `PATCH /clusters/{cluster}/addons/{addon}` | `{ version, resolve_conflicts, options? }` | `{ uuid: string }` |
| `nks cluster addon remove <cluster> <addon>` | `DELETE /clusters/{cluster}/addons/{addon}` | 없음 | `{ uuid: string }` |

## 검증

- 옵션 enum 검증.
- client 단위테스트에서 method/path/body/header 를 검증한다.
- 각 명령 `--help` 는 exit code 0 이고 stdout 에 해당 leaf command 이름이 포함된다.

## 변경 파일 (정확)

- `src/services/nks/types.ts`
- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `src/commands/nks/addon.ts`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "feat(nks): add cluster addon write commands"
```
