# NKS Reference

`nks` 명령군은 NHN Kubernetes Service를 관리한다.
IaaS 자격증명으로 Keystone token을 발급하고 `container-infra` API를 호출한다.
지원 region은 `kr1`, `kr2`, `kr3`이다.

## Discovery 순서

```bash
nhncloud commands --json | jq '.commands[] | select(.path|startswith("nks"))'
nhncloud nks supports --json
nhncloud nks cluster list --json
nhncloud nks cluster get <cluster> --json
nhncloud nks nodegroup list <cluster> --json
```

클러스터 생성이나 변경 전에는 지원 Kubernetes version, flavor, network, 기존 cluster/nodegroup 상태를 먼저 조회한다.

## Cluster 조회

```bash
nhncloud nks cluster list --json
nhncloud nks cluster get <cluster> --json
nhncloud nks cluster events <cluster> --json
nhncloud nks cluster event <cluster> <event> --json
nhncloud nks cluster ipacl <cluster> --json
nhncloud nks cluster kubeconfig <cluster>
nhncloud nks cluster kubeconfig <cluster> --output ./kubeconfig
```

`kubeconfig`는 문자열을 stdout으로 출력하거나 `--output` 파일에 저장한다.

## Nodegroup 조회와 변경

```bash
nhncloud nks nodegroup list <cluster> --json
nhncloud nks nodegroup get <cluster> <nodegroup> --json
nhncloud nks nodegroup autoscale <cluster> <nodegroup> --json
nhncloud nks nodegroup create <cluster> --file ./nodegroup-create.json
nhncloud nks nodegroup delete <cluster> <nodegroup> --yes
nhncloud nks nodegroup stop-node <cluster> <nodegroup> --nodes node-1,node-2
nhncloud nks nodegroup start-node <cluster> <nodegroup> --nodes node-1,node-2
nhncloud nks nodegroup set-autoscale <cluster> <nodegroup> --file ./autoscale.json
nhncloud nks nodegroup set-metric-autoscale <cluster> <nodegroup> --file ./metric-autoscale.json
nhncloud nks nodegroup upgrade <cluster> <nodegroup> --kube-version v1.30.1
nhncloud nks nodegroup set-userscript <cluster> <nodegroup> --file ./userscript.sh
nhncloud nks nodegroup update-flavor <cluster> <nodegroup> --flavor <flavor-uuid>
nhncloud nks nodegroup set-fip-auto-bind <cluster> <nodegroup> --file ./fip-auto-bind.json
nhncloud nks nodegroup set-labels <cluster> <nodegroup> --file ./labels.json
```

## Addon 조회와 변경

```bash
nhncloud nks addon-type list --json
nhncloud nks addon-type get <addon-type> --json
nhncloud nks addon list --k8s-version v1.30.1 --json
nhncloud nks addon get <addon> --json
nhncloud nks cluster addon list <cluster> --json
nhncloud nks cluster addon get <cluster> <addon> --json
nhncloud nks cluster addon install <cluster> --name coredns --addon-version 1.0.0 --resolve-conflicts overwrite
nhncloud nks cluster addon update <cluster> coredns --addon-version 1.0.1 --resolve-conflicts preserve
nhncloud nks cluster addon remove <cluster> coredns --yes
```

## Cluster 생성과 변경

복잡한 생성/설정 작업은 공식 API payload를 JSON 파일로 전달한다.
payload에는 민감값이 들어갈 수 있으므로 로그나 이슈에 그대로 붙이지 않는다.

```bash
nhncloud nks cluster create --file ./cluster-create.json
nhncloud nks cluster delete <cluster> --yes
nhncloud nks cluster resize <cluster> --nodegroup worker --node-count 3
nhncloud nks cluster set-ipacl <cluster> --file ./ipacl.json
nhncloud nks cluster renew-certificate <cluster> --term-of-validity 3
nhncloud nks cluster update-sgw <cluster> --ncr-sgw <uuid> --obs-sgw <uuid>
nhncloud nks cluster set-control-plane-log <cluster> --file ./control-plane-log.json
```

## JSON 출력

목록 조회는 배열 또는 목록 객체로 출력한다.
단건 조회와 설정 조회는 API raw 객체를 보존하는 쪽을 우선한다.
생성, resize, 설정 변경, 노드 action, 애드온 변경은 `{ uuid }` 응답을 반환한다.
삭제 명령은 성공 메시지만 stderr에 쓰고 stdout은 비운다.

## 에러 코드

| 상황 | exit code |
|------|-----------|
| IaaS 자격증명 누락 또는 불완전 | 4 |
| Keystone 또는 NKS 인증 실패 | 2 |
| 지원하지 않는 region, payload JSON 파싱 실패, `--yes` 누락 | 3 |
| NKS API 오류 또는 응답 형식 불일치 | 1 |
