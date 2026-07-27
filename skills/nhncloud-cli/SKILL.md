---
name: nhncloud-cli
description: >-
  NHN Cloud 서비스 CLI. commands --json catalog, configure,
  Log & Crash(logncrash search/send/export),
  Deploy(deploy run/artifacts/server-groups/histories/binary-groups/binaries/upload/download),
  Compute(instance), VPC/network, Block Storage(volume), Floating IP(floatingip),
  Load Balancer와 IP ACL(loadbalancer 조회), NHN Container Registry(ncr),
  NHN Kubernetes Service(nks supports/cluster/nodegroup/addon/kubeconfig),
  NHN Container Service(ncs template/workload 조회·생성·변경·실행제어,
  malware 검사 설정·결과 조회) 등 NHN Cloud API를 터미널과 AI 에이전트에서 호출한다.
---

# nhncloud-cli

NHN Cloud 서비스를 AWS CLI 방식으로 호출하는 TypeScript CLI다.
이 파일은 router다.
작업하려는 서비스에 맞는 reference를 먼저 읽고, 필요한 명령은 `--json`으로 확인한다.

## 먼저 읽을 것

| 상황 | 읽을 reference |
|------|----------------|
| 명령 경로, 인수, option metadata 확인 | `nhncloud commands --json` 실행 후 필요한 reference 선택 |
| 설치, configure, profile, 출력 모드, 에러 코드, 자동화 기본 규칙 | [common.md](references/common.md) |
| Log & Crash 검색, scroll export, 로그 전송 | [logncrash.md](references/logncrash.md) |
| Deploy 실행, 배포 조회, 바이너리 업로드/다운로드 | [deploy.md](references/deploy.md) |
| Compute instance, network, volume, floatingip | [iaas.md](references/iaas.md) |
| Load Balancer와 IP ACL 그룹·대상 조회 | [loadbalancer.md](references/loadbalancer.md) |
| NCR 레지스트리, 이미지, 태그 조회 | [ncr.md](references/ncr.md) |
| NKS 클러스터, 노드 그룹, 애드온, kubeconfig | [nks.md](references/nks.md) |
| NCS template, workload 조회·생성·변경·실행제어, malware 검사 설정·결과 조회 | [ncs.md](references/ncs.md) |
| 인증 실패, profile 누락, region mismatch, JSON shape 혼동, scroll 제한 | [troubleshooting.md](references/troubleshooting.md) |

## 공통 우선 규칙

- 구조화 출력이 필요하면 `--json`을 우선 사용한다.
- 스크립트 체이닝은 해당 명령이 `--quiet` 식별자 출력을 문서화했는지 확인한 뒤 사용한다.
- profile은 기본값에 의존하지 말고 가능하면 `--profile <name>`을 명시한다.
- IaaS 계열(`instance`, `network`, `volume`, `floatingip`, `loadbalancer`, `nks`)은 region이 중요하면 `--region <region>`을 명시한다.
- 삭제, 제거, 비용 발생, 리소스 생성 같은 파괴적/쓰기 명령은 `--yes` 없으면 대화형 confirm이 있을 수 있다.
- 데이터는 stdout, 진행 상황과 에러는 stderr에 출력한다.
- 비밀값, appkey, tenantId, 실제 instance/network id는 문서나 이슈에 그대로 쓰지 않고 placeholder를 사용한다.

## 빠른 시작

```bash
npm install -g @bifos/nhncloud-cli
nhncloud configure
nhncloud logncrash search --query '*' --from 1h --to now --json
```

## 주요 명령군

| 명령군 | 용도 |
|--------|------|
| `configure` | 자격증명 설정 마법사와 비대화형 profile 저장 |
| `logncrash` | 로그 검색, 대량 export, collector 전송 |
| `deploy` | NHN Cloud Deploy 실행과 배포/바이너리 조회·전송 |
| `instance` | Compute 인스턴스, flavor, image, keypair, volume attach 관리 |
| `network` | VPC와 subnet 조회 |
| `volume` | Block Storage volume 조회·생성 |
| `floatingip` | Floating IP 조회·발급·삭제 |
| `loadbalancer` | Load Balancer와 IP ACL 그룹·대상 조회 |
| `ncr` | Container Registry registry/image/tag 조회 |
| `nks` | Kubernetes cluster/nodegroup/addon/kubeconfig 관리 |
| `ncs` | Container Service template/workload 조회·생성·변경·실행제어, malware 검사 설정·결과 조회 |

## 안전한 탐색 순서

1. [common.md](references/common.md)에서 profile과 출력 모드를 확인한다.
2. 대상 서비스 reference를 읽는다.
3. 조회/discovery 명령을 `--json`으로 먼저 실행한다.
4. 쓰기 명령은 대상 id, region, profile, `--yes`, payload file을 명시한다.
5. 실패하면 [troubleshooting.md](references/troubleshooting.md)의 exit code와 서비스별 인증 모델을 대조한다.
