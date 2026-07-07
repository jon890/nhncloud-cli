# NCS Reference

`ncs` 명령군은 NHN Container Service 의 template(설계도)과 workload(런타임 실행)를 조회한다.
이 문서는 조회 명령만 다룬다 — 생성·변경·malware 검사 명령은 후속 릴리스에서 추가된다.

## 설정

공통 UAK와 NCS appkey가 필요하다.
인증은 Deploy 와 같은 UAK OAuth Bearer 토큰을 재사용한다(profile 토큰 캐시 공유).

`configure` 마법사는 아직 ncs를 지원하지 않는다.
`--app-key` 옵션 또는 `~/.nhncloud/credentials.json` 의 `profiles.<profile>.ncs.appkey` 를 직접 추가한다.

```bash
nhncloud ncs template list --app-key <appkey>
```

`--app-key <key>`는 profile의 `ncs.appkey`보다 우선한다.
기본 region은 `kr1`이고, `kr1`, `kr3`만 지원한다(판교·광주).

## Template(설계도) 조회

```bash
nhncloud ncs template list --app-key <appkey> --json
nhncloud ncs template list --region kr3 --app-key <appkey> --json
nhncloud ncs template get <template-id> --app-key <appkey> --json
nhncloud ncs template version list <template-id> --app-key <appkey> --json
nhncloud ncs template version get <template-id> <version> --app-key <appkey> --json
```

## Workload(런타임 실행) 조회

```bash
nhncloud ncs workload list --app-key <appkey> --json
nhncloud ncs workload list --q <워크로드 이름> --app-key <appkey> --json
nhncloud ncs workload get <workload-id> --app-key <appkey> --json
```

컨테이너 로그와 이벤트는 특정 task 를 지정해야 한다.
`--task`는 `workload get` 응답의 `tasks[].id`에서 얻는다.

```bash
nhncloud ncs workload logs <workload-id> --task <task-id> --container <name> --app-key <appkey> --json
nhncloud ncs workload logs <workload-id> --task <task-id> --container <name> --from 1h --to now --app-key <appkey>
nhncloud ncs workload events <workload-id> --task <task-id> --app-key <appkey> --json
nhncloud ncs workload events <workload-id> --task <task-id> --type Warning --app-key <appkey> --json
```

실행 히스토리와 예약 실행 히스토리는 workload 단위로 조회한다.

```bash
nhncloud ncs workload history <workload-id> --app-key <appkey> --json
nhncloud ncs workload history get <workload-id> <history-id> --app-key <appkey> --json
nhncloud ncs workload schedule-history <workload-id> --app-key <appkey> --json
```

## 체이닝 예시

```bash
nhncloud ncs template list --app-key <appkey> --json | jq -r '.[].id'
nhncloud ncs workload list --app-key <appkey> --json | jq -r '.[] | select(.status=="Failed") | .id'
nhncloud ncs workload get <workload-id> --app-key <appkey> --json | jq -r '.tasks[].id'
```

## 옵션

| 옵션 | 설명 |
|------|------|
| `--region <region>` | NCS region. 기본 `kr1`. `kr1`·`kr3`만 지원 |
| `--app-key <key>` | NCS appkey |
| `--profile <name>` | 사용할 profile |
| `--page <page>` / `--size <size>` | 페이지네이션 (기본 size는 명령별 상이 — `--help` 확인) |
| `--q <query>` | workload list·events 필터 |
| `--task <taskId>` | `workload logs`·`workload events` 필수 |
| `--container <name>` | `workload logs` 필수 |
| `--sort <sort>` | `workload history` 정렬 (역순은 필드명 앞에 `-`) |

## 주의사항

- appkey는 NCS service appkey다. 인증 secret은 공통 UAK secret을 사용한다.
- `workload logs`·`workload events`는 task 단위 조회라 `--task` 없이는 입력 오류다.
- `workload schedule-history`는 page/size를 아직 노출하지 않는다(대량 이력 시 첫 페이지만 반환될 수 있음 — ADR-020).
- template/workload id, history id 인수가 공백이면 입력 오류다.

## 에러 코드

| 상황 | exit code |
|------|-----------|
| UAK 누락 또는 NCS appkey 미설정 | 4 |
| UAK 인증 실패 | 2 |
| 지원하지 않는 region, 빈 id 인수, `--task`/`--container` 누락 | 3 |
| NCS API 오류 | 1 |
