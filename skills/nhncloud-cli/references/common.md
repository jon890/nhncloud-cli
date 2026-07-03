# Common Reference

설치, configure, profile, 출력 모드, 에러 코드를 다룬다.
서비스별 세부 명령은 각 reference를 읽는다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정

첫 설정은 `nhncloud configure`로 한다.
대화형 마법사가 profile, UAK, 서비스별 자격증명을 묻고 저장 전 연결을 테스트한다.

```bash
nhncloud configure
nhncloud configure --profile staging
```

CI나 자동화에서는 flag로 비대화형 저장을 한다.

```bash
nhncloud configure \
  --uak-id <uak-id> --uak-secret <uak-secret> \
  --logncrash-appkey <appkey> --logncrash-secret <secret> \
  --ncr-appkey <appkey> \
  --no-verify
```

주요 옵션:

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 대상 profile. 기본값은 `default` |
| `--uak-id <id>` / `--uak-secret <secret>` | 공통 User Access Key |
| `--logncrash-appkey <key>` / `--logncrash-secret <secret>` | Log & Crash 검색 자격증명 |
| `--ncr-appkey <key>` | NCR appkey |
| `--iaas-tenant-id <id>` / `--iaas-username <name>` / `--iaas-password <password>` | IaaS/NKS 자격증명 |
| `--iaas-region <region>` | IaaS 기본 region |
| `--no-verify` | 연결 테스트 생략 |

저장 파일은 `~/.nhncloud/credentials.json`이고 mode 0600으로 관리된다.
기본 profile은 선택적으로 `~/.nhncloud/config.json`의 `defaultProfile`로 지정한다.

## Profile 우선순위

profile 해석 순서:

1. `--profile <name>`
2. `NHNCLOUD_PROFILE`
3. `config.defaultProfile`
4. `"default"`

자동화에서는 `--profile`을 명시해 실행 환경 차이를 줄인다.

## 출력 모드

| 플래그 | 출력 | 용도 |
|--------|------|------|
| 없음 | 사람이 읽기 좋은 table | 터미널 확인 |
| `--json` | JSON stdout | 파싱, 자동화, AI 에이전트 |
| `--quiet` | 핵심 식별자만 stdout | 단순 체이닝 |

`--json`은 CLI 출력 계약이다.
API 원본 wrapper를 항상 보존하지 않는다.
예를 들어 `nhncloud instance get <instance-id> --json`은 `.server.status`가 아니라 `.status`를 읽는다.

## Command catalog

`nhncloud commands`는 Commander tree에서 command path, argument, option, description을 출력한다.
외부 API를 호출하지 않는 read-only metadata 명령이다.

```bash
nhncloud commands
nhncloud commands --json
nhncloud commands --json | jq '.commands[] | select(.path=="nks cluster list")'
```

AI 에이전트는 먼저 `commands --json`으로 실제 command path와 option 이름을 확인하고, 그다음 서비스 reference를 읽는다.

## JSON shape 요약

| 명령 | `--json` 출력 shape |
|------|---------------------|
| `commands` | `{ commands: [{ path, description, arguments, options, subcommands }] }` |
| `logncrash search` | `{ totalItems, pageNumber, pageSize, data }` |
| `deploy binary-groups` | `binaryGroups` wrapper를 언랩한 배열 |
| `deploy binaries` | `{ totalCount, binaries }` |
| `instance list` | `servers` wrapper를 언랩한 server 배열 |
| `instance get` | `server` wrapper를 언랩한 단일 server |
| `instance flavors` | `flavors` wrapper를 언랩한 flavor 배열 |
| `instance images` | `images` wrapper를 언랩한 image 배열 |
| `instance availability-zones` | `availabilityZoneInfo` wrapper를 언랩한 배열 |
| `instance keypairs` | `keypairs[].keypair`를 flatten한 keypair 배열 |
| `network list` | VPC 배열 |
| `network subnet list` | subnet 배열 |
| `volume list` | volume 배열 |
| `volume get` | 단일 volume 객체 |
| `floatingip list` | Floating IP 배열 |
| `ncr list` | `registries` wrapper를 언랩한 registry 배열 |
| `ncr get` | `registry` wrapper를 언랩한 단일 registry |
| `ncr images` | repository 배열 |
| `ncr tags` | tag 배열 |
| `nks supports` | 지원 Kubernetes version / event type 객체 |
| `nks cluster list` | cluster 배열 |
| `nks cluster events` | event 배열 |
| `nks nodegroup list` | nodegroup 배열 |
| `nks addon-type list` | addon type 배열 |
| `nks addon list` | addon 배열 |
| `nks cluster addon list` | cluster addon 배열 |

NKS 단건 조회와 일부 설정 조회는 table 출력용 최소 컬럼을 만들고 `--json`에서는 raw 객체를 보존한다.
NKS 쓰기 명령 중 생성, resize, 설정 변경, 노드 action, 애드온 변경은 `{ uuid }` 응답을 반환한다.
삭제 명령은 성공 메시지를 stderr에 쓰고 stdout은 비운다.
`nks cluster kubeconfig`는 kubeconfig 문자열을 stdout 또는 파일로 저장한다.

## 에러 코드

| 상황 | exit code |
|------|-----------|
| API 오류 / 봉투 실패 | 1 |
| 인증 실패 | 2 |
| 입력 오류 / 필수 옵션 누락 / confirm 누락 | 3 |
| 자격증명 또는 config 오류 | 4 |

## Agent 기본 규칙

- 조회는 먼저 `--json`으로 실행하고 필요한 id를 추출한다.
- 쓰기 명령 전에 `--profile`, `--region`, 대상 id를 명시한다.
- `--quiet`는 해당 명령이 식별자 출력을 문서화한 경우에만 사용한다.
- 삭제 명령은 비대화형 환경에서 `--yes`를 명시한다.
- stdout은 데이터로만 취급하고, 진행 메시지는 stderr로 분리된다고 가정한다.
