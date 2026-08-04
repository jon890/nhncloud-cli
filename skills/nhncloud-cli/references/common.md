# Common Reference

CLI와 공개 스킬 설치, configure, profile, 출력 모드, 에러 코드를 다룬다.
서비스별 세부 명령은 각 reference를 읽는다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## Claude Code 공개 스킬 관리

전역 설치한 CLI나 `npx`로 패키지의 공개 스킬을 관리 저장소에 설치할 수 있다.
관리 저장소는 실행 중인 npm 패키지 경로와 분리되므로 `npx`의 임시 패키지 경로가 사라져도 활성 스킬은 유지된다.

```bash
# 전역 설치한 CLI에서 설치
nhncloud skills install

# 전역 설치 없이 최신 공개 스킬 설치
npx --yes @bifos/nhncloud-cli@latest skills install

# 상태 확인 (`nhncloud skills`도 동일)
nhncloud skills status
```

npm 패키지와 설치된 공개 스킬은 자동으로 함께 갱신되지 않는다.
패키지를 먼저 갱신한 뒤 새 CLI로 스킬 갱신을 명시적으로 실행한다.

```bash
npm install -g @bifos/nhncloud-cli@latest
nhncloud skills update
```

상태별 의미와 복구 명령:

| 상태 | 의미 | 복구 명령 |
|------|------|-----------|
| `current` | 현재 CLI 버전과 콘텐츠 해시가 일치함 | 조치 없음 |
| `missing` | 활성 스킬이 설치되지 않음 | `nhncloud skills install` |
| `outdated` | 이전 버전 또는 기존 패키지·저장소 직접 링크 | `nhncloud skills update` |
| `broken` | 관리형 링크 또는 기존 패키지 링크의 대상이 없음 | `nhncloud skills update` |
| `modified` | 관리 저장소 콘텐츠가 설치 매니페스트와 다름 | 내용을 확인한 뒤 `nhncloud skills update --force` |
| `corrupt` | 관리 저장소 경로나 매니페스트가 손상됨 | 내용을 확인한 뒤 `nhncloud skills update --force` |
| `unmanaged` | 사용자가 만든 파일·디렉터리 또는 알 수 없는 링크가 설치 경로를 차지함 | 내용을 확인한 뒤 `nhncloud skills update --force` |

`--force`는 사용자 항목 또는 수정·손상된 관리 저장소를 삭제하지 않고 같은 상위 디렉터리에 백업한 뒤 교체한다.
`nhncloud skills uninstall`은 `~/.claude/skills/nhncloud-cli`의 활성 심볼릭 링크만 제거하며 버전별 관리 저장소는 보존한다.
설치 경로가 사용자 파일이나 실제 디렉터리이면 제거하지 않는다.

자동화에서는 모든 하위 명령에 전역 출력 옵션을 함께 사용할 수 있다.

```bash
# 전체 상태 객체
nhncloud skills status --json

# 상태 토큰 하나만 출력
nhncloud skills status --quiet

# 갱신 결과의 상태 전이와 백업 경로 확인
nhncloud skills update --force --json

# 제거 결과 토큰만 출력 (`missing`)
nhncloud skills uninstall --quiet
```

`--json`은 상태·변경 여부·백업 경로처럼 자동화에 필요한 필드를 제공한다.
`--quiet`은 상태 토큰 하나만 stdout에 출력한다.

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
  --logncrash-appkey <appkey> \
  --ncr-appkey <appkey> \
  --no-verify
```

Log & Crash Search v3는 서비스 appkey와 profile 공통 UAK를 함께 사용한다.
CLI가 UAK를 OAuth 토큰으로 교환하므로 별도 logncrash secret은 저장하지 않는다.

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "userAccessKey": {
        "id": "<uak-id>",
        "secret": "<uak-secret>"
      },
      "logncrash": {
        "appkey": "<appkey>"
      }
    }
  }
}
```

주요 옵션:

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 대상 profile. 기본값은 `default` |
| `--uak-id <id>` / `--uak-secret <secret>` | 공통 User Access Key |
| `--logncrash-appkey <key>` | Log & Crash 서비스 appkey |
| `--logncrash-secret <secret>` | 폐기 예정 호환 옵션. 경고 후 사용·저장하지 않음 |
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
| `logncrash search` | `{ totalItems, pageNumber, pageSize, data, nextCursor? }` |
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
