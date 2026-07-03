# Troubleshooting Reference

실패 시 exit code, 인증 모델, profile/region, JSON shape를 먼저 확인한다.

## 빠른 진단 순서

1. 명령에 `--profile <name>`을 명시했는지 확인한다.
2. IaaS/NKS/NCR 명령이면 `--region <region>`이 의도와 맞는지 확인한다.
3. 조회 명령을 `--json`으로 다시 실행해 stdout shape를 확인한다.
4. exit code를 확인한다.
5. 서비스별 인증 모델을 대조한다.

## 인증 모델

| 서비스 | 비밀 | 인증 방식 |
|--------|------|-----------|
| Log & Crash 검색/export | appkey + secret | `X-LNCS-SECRET` |
| Log & Crash send | appkey | body `projectName=appkey`, 인증 헤더 없음 |
| Deploy | UAK id + secret | OAuth Bearer token |
| Instance/network/volume/floatingip | tenantId + username + API password | Keystone `X-Auth-Token` |
| NKS | tenantId + username + API password | Keystone `X-Auth-Token` + container-infra API version |
| NCR registry | UAK id + secret + NCR appkey | `X-TC-AUTHENTICATION-*` |
| NCR images/tags | UAK id + secret | HTTP Basic Auth to Harbor REST |

## Exit code

| exit code | 의미 | 대표 원인 |
|-----------|------|-----------|
| 1 | API 오류 | 4xx/5xx, 봉투 실패, wait timeout |
| 2 | 인증 실패 | UAK/secret/password 오류, 권한 부족 |
| 3 | 입력 오류 | 필수 옵션 누락, region 미지원, 시간 범위 초과, `--yes` 누락 |
| 4 | config 오류 | profile 없음, 자격증명 블록 누락 |

## Profile 누락

profile은 다음 순서로 해석된다.

1. `--profile <name>`
2. `NHNCLOUD_PROFILE`
3. `~/.nhncloud/config.json`의 `defaultProfile`
4. `default`

자동화에서 의도와 다른 profile이 쓰이면 `--profile`을 명시한다.

## Region mismatch

IaaS/NKS/NCR은 region별 endpoint를 사용한다.
리소스가 보이지 않으면 같은 profile에서 다른 region을 조회했을 수 있다.

```bash
nhncloud instance list --region kr1 --json
nhncloud instance list --region kr2 --json
nhncloud nks cluster list --region kr1 --json
nhncloud ncr list --region kr2 --json
```

## JSON shape 혼동

CLI는 API wrapper를 일관되게 언랩한다.
예를 들어 `instance get --json`은 `.server.status`가 아니라 `.status`다.
목록과 단건의 shape가 다를 수 있으므로 jq path를 쓰기 전에 `--json` 원문을 확인한다.

```bash
nhncloud instance get <instance-id> --json | jq keys
nhncloud ncr list --json | jq '.[0] | keys'
```

## Log & Crash 검색 제한

- `--from`은 최근 90일 이내여야 한다.
- `--to - --from` 범위는 31일 이하여야 한다.
- scrollKey는 1분 만료다.
- export가 중간 실패하면 검색 범위를 좁히거나 `--size`를 키운다.

## 쓰기 명령 confirm

삭제, 제거, 비용 발생 가능 명령은 비대화형 환경에서 `--yes`가 필요할 수 있다.

```bash
nhncloud instance delete <instance-id> --yes
nhncloud floatingip delete <floatingip-id> --yes
nhncloud nks cluster delete <cluster> --yes
nhncloud nks cluster addon remove <cluster> <addon> --yes
```

## stdout/stderr 분리

데이터는 stdout에 출력된다.
진행 상황, 저장 완료, 성공 메시지, 에러는 stderr에 출력된다.
스크립트에서 stdout만 파싱하고 stderr는 로그로 분리한다.
