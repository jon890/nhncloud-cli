# Deploy Reference

`deploy` 명령군은 NHN Cloud Deploy v2.1 API를 호출한다.
UAK를 OAuth `client_credentials`로 교환한 Bearer token으로 인증하고, token은 만료 전까지 캐시한다.

## 설정

`~/.nhncloud/credentials.json`에 profile 공통 `userAccessKey`가 필요하다.
`nhncloud configure` 사용을 권장한다.

`~/.nhncloud/config.json`에는 named deploy target을 둔다.

```json
{
  "version": 1,
  "defaultProfile": "default",
  "deploy": {
    "targets": {
      "my-service": {
        "appKey": "<appKey>",
        "artifactId": "<artifactId>",
        "serverGroupId": "<serverGroupId>",
        "scenarioIds": "<id1,id2>"
      }
    }
  }
}
```

## 배포 실행

```bash
nhncloud deploy run my-service
nhncloud deploy run my-service --async
nhncloud deploy run my-service --target-hosts <host1,host2>
```

`<target>`은 config의 deploy target 이름이다.

| 옵션 | 설명 |
|------|------|
| `--app-key <k>` | target의 appKey override |
| `--artifact-id <id>` | target의 artifactId override |
| `--server-group-id <id>` | target의 serverGroupId override |
| `--scenario-ids <csv>` | target의 scenarioIds override |
| `--target-hosts <csv>` | 대상 호스트. 생략 시 서버그룹 전체 |
| `--concurrent <n>` | 병렬 배포 수. 기본 1 |
| `--next-when-fail` | 시나리오 실패 시에도 진행 |
| `--note <s>` | 배포 메모 |
| `--async` | 즉시 반환. 기본은 완료 대기 |
| `--profile <name>` | 사용할 profile |

동기 모드는 서버가 배포 완료까지 응답을 보류한다.
비동기 모드는 `deploying` 상태를 즉시 반환하고, 완료 확인은 `deploy histories`로 한다.

## 조회 명령

```bash
nhncloud deploy artifacts my-service --json
nhncloud deploy server-groups my-service --json
nhncloud deploy histories my-service --json
nhncloud deploy binary-groups my-service --json
nhncloud deploy binaries my-service --binary-group <key> --json
```

의도별 명령:

| 의도 | 명령 |
|------|------|
| 아티팩트 목록 | `deploy artifacts <target>` |
| 서버그룹 목록 | `deploy server-groups <target>` |
| 배포 이력 | `deploy histories <target>` |
| 바이너리 그룹 목록 | `deploy binary-groups <target>` |
| 바이너리 목록 | `deploy binaries <target> --binary-group <key>` |

`deploy binary-groups --json`은 `binaryGroups` wrapper를 언랩한 배열이다.
`deploy binaries --json`은 `{ totalCount, binaries }` 객체다.

## 바이너리 전송

```bash
nhncloud deploy upload <target> --file ./app.tgz --binary-group <key>
nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o ./app.tgz
```

`upload`는 multipart로 로컬 파일을 업로드한다.
`--quiet`이면 `binaryKey`만 출력한다.

`download`는 바이너리를 파일로 저장한다.
대상 파일이 이미 있으면 기본 거부하고, `--force`가 있을 때만 덮어쓴다.

## 체이닝 예시

```bash
nhncloud deploy artifacts my-service --json | jq -r '.[0].artifactId'
nhncloud deploy run my-service --artifact-id <artifactId>
nhncloud deploy histories my-service --json | jq '.[0] | {deployKey, deployStatus}'
```

## 에러 코드

| 상황 | exit code |
|------|-----------|
| UAK 누락 또는 config target 없음 | 4 또는 3 |
| OAuth 인증 실패 | 2 |
| Deploy API 오류 또는 봉투 실패 | 1 |
