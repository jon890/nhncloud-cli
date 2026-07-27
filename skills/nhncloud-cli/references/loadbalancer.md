# Load Balancer Reference

`loadbalancer` 명령군은 Load Balancer와 IP ACL 그룹·대상을 조회한다.
`network`와 같은 IaaS 자격증명, Keystone 토큰, network endpoint를 공유한다.
region이 중요하면 `--region <region>`을 명시한다.

## 탐색 순서

자동화와 AI 에이전트는 실제 명령 표면을 확인한 뒤 목록에서 UUID를 찾는다.

```bash
nhncloud commands --json \
  | jq '.commands[] | select(.path|startswith("loadbalancer"))'

nhncloud loadbalancer list --profile <profile> --region <region> --json
nhncloud loadbalancer ipacl list --profile <profile> --region <region> --json
nhncloud loadbalancer ipacl target list <group> \
  --profile <profile> \
  --region <region> \
  --json
```

## 명령

| 명령 | 용도 | 기본 테이블 컬럼 |
|------|------|------------------|
| `loadbalancer list` | Load Balancer 목록 조회 | `id`, `name`, `vip_address`, `provisioning_status`, `operating_status`, `ipacl_group_action` |
| `loadbalancer get <loadbalancer>` | 이름 또는 UUID로 단건 조회 | `field`, `value` |
| `loadbalancer ipacl list` | IP ACL 그룹 목록 조회 | `id`, `name`, `action`, `ipacl_target_count`, `loadbalancer_count` |
| `loadbalancer ipacl get <group>` | 이름 또는 UUID로 IP ACL 그룹 단건 조회 | `field`, `value` |
| `loadbalancer ipacl target list <group>` | 그룹의 IP ACL 대상 목록 조회 | `id`, `cidr_address`, `description`, `ipacl_group_id` |

단건 Load Balancer 테이블에는 `id`, `name`, `vip_address`, `provisioning_status`, `operating_status`, `ipacl_group_action`, `ipacl_group_ids`가 행으로 출력된다.
단건 IP ACL 그룹 테이블에는 `id`, `name`, `action`, `ipacl_target_count`, `loadbalancer_ids`가 행으로 출력된다.

## 이름과 UUID 해석

`<loadbalancer>`와 `<group>`에는 이름 또는 UUID를 넣는다.

1. UUID가 정확히 일치하면 해당 리소스를 선택한다.
2. UUID가 아니면 정확히 일치하는 이름을 찾는다.
3. 이름이 하나만 일치하면 해당 리소스를 선택한다.
4. 같은 이름이 여러 개면 입력 오류와 후보 UUID를 출력한다.
5. 일치하는 리소스가 없으면 입력 오류로 종료한다.

중복 이름으로 자동화가 불안정해지는 것을 막으려면 목록에서 UUID를 확인한 뒤 다음 명령에 전달한다.

```bash
profile_name="<profile>"
region_name="<region>"
loadbalancer_id="<loadbalancer-id>"

nhncloud loadbalancer list \
  --profile "$profile_name" \
  --region "$region_name" \
  --json \
  | jq -r '.[] | [.name, .id] | @tsv'

nhncloud loadbalancer get "$loadbalancer_id" \
  --profile "$profile_name" \
  --region "$region_name" \
  --json
```

## 출력 모드

| 명령 | `--json` 출력 | `--quiet` 출력 |
|------|----------------|----------------|
| `loadbalancer list` | Load Balancer 배열 | Load Balancer UUID를 한 줄에 하나씩 출력 |
| `loadbalancer get` | 단일 Load Balancer 객체 | 선택한 Load Balancer UUID 한 줄 |
| `loadbalancer ipacl list` | IP ACL 그룹 배열 | IP ACL 그룹 UUID를 한 줄에 하나씩 출력 |
| `loadbalancer ipacl get` | 단일 IP ACL 그룹 객체 | 선택한 IP ACL 그룹 UUID 한 줄 |
| `loadbalancer ipacl target list` | IP ACL 대상 배열 | IP ACL 대상 UUID를 한 줄에 하나씩 출력 |

옵션을 생략하면 사람이 읽기 좋은 테이블을 출력한다.
목록이 비어 있으면 기본 모드는 `결과 없음`을 stdout에 출력하고, `--json`은 빈 배열을 출력하며, `--quiet`는 출력하지 않는다.
`--json`은 NHN Cloud 응답의 최상위 래퍼를 제거한 객체 또는 배열이다.

## 공통 옵션

| 옵션 | 설명 |
|------|------|
| `--region <region>` | region override. 생략하면 IaaS 자격증명의 region을 사용 |
| `--profile <name>` | 사용할 profile |
| `--json` | 객체 또는 배열을 JSON으로 stdout에 출력 |
| `--quiet` | 리소스 UUID만 stdout에 출력 |

## stdout과 stderr

- 테이블, JSON, UUID, 정상 빈 결과는 stdout에 출력한다.
- 조회 진행 상황과 오류는 stderr에 출력한다.
- 파이프라인에서는 stdout만 다음 명령에 전달하고 stderr는 진단 로그로 분리한다.

## 에러 코드

| 상황 | exit code |
|------|-----------|
| Load Balancer 또는 IP ACL API 오류 | 1 |
| Keystone 인증 실패 | 2 |
| 빈 이름·UUID, 리소스 없음, 중복 이름 | 3 |
| IaaS 자격증명 누락 또는 미등록 region | 4 |
