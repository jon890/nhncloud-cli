# API Gateway 조회·변경 안내

`apigateway` 명령군은 API Gateway 서비스, 리소스, 스테이지, 배포 이력을 조회하고 스테이지의 Swagger를 내보낸다.
스테이지의 백엔드 URL·설명 수정과 리소스 경로·메서드 플러그인 설정도 지원한다.

## 인증과 설정

공통 UAK와 API Gateway `appKey`가 필요하다.
`nhncloud configure --apigateway-appkey <appkey>`로 `profile`의 `apigateway.appkey`를 설정한다.

API 요청은 공통 UAK로 발급한 Bearer 토큰을 `X-NHN-Authorization` 헤더에 담는다.
표준 `Authorization` 헤더가 아니므로 직접 API를 호출할 때 혼동하지 않는다.

지원 `region`은 `kr1`, `kr2`, `kr3`이며 기본값은 `kr1`이다.

```bash
nhncloud apigateway service list --region kr1 --json
```

## 명령

아래 표의 공통 옵션은 `--region <region>`, `--profile <name>`이다.
루트 전역 옵션인 `--json`과 `--quiet`도 사용할 수 있다.

| 명령 경로 | 인수 | 명령 옵션 |
|---|---|---|
| `nhncloud apigateway service list` | 없음 | 공통 옵션 |
| `nhncloud apigateway service get` | `<service-id>` | 공통 옵션 |
| `nhncloud apigateway resource list` | `<service-id>` | 공통 옵션 |
| `nhncloud apigateway resource parameters` | `<service-id> <resource-id>` | 공통 옵션 |
| `nhncloud apigateway resource responses` | `<service-id> <resource-id>` | 공통 옵션 |
| `nhncloud apigateway resource set-path-plugin` | `<service-id> <resource-id>` | 공통 옵션, `--config-file <path>`, `--dry-run`, `--yes` |
| `nhncloud apigateway resource set-method-plugin` | `<service-id> <resource-id>` | 공통 옵션, `--config-file <path>`, `--dry-run`, `--yes` |
| `nhncloud apigateway stage list` | `<service-id>` | 공통 옵션 |
| `nhncloud apigateway stage swagger` | `<service-id> <stage-id>` | 공통 옵션, `--output <file>`, `--force` |
| `nhncloud apigateway stage resources` | `<service-id> <stage-id>` | 공통 옵션 |
| `nhncloud apigateway stage update` | `<service-id> <stage-id>` | 공통 옵션, `--backend-endpoint-url <url>`, `--description <text>`, `--yes` |
| `nhncloud apigateway stage import-resources` | `<service-id> <stage-id>` | 공통 옵션, `--yes` |
| `nhncloud apigateway stage deploy create` | `<service-id> <stage-id>` | 공통 옵션, `--description <text>`, `--no-wait`, `--timeout <sec>`, `--yes` |
| `nhncloud apigateway stage deploy list` | `<service-id> <stage-id>` | 공통 옵션 |
| `nhncloud apigateway stage deploy latest` | `<service-id> <stage-id>` | 공통 옵션 |
| `nhncloud apigateway stage deploy rollback` | `<service-id> <stage-id> <deploy-id>` | 공통 옵션, `--yes` |

`--quiet`가 식별자를 출력하는 명령은 다음과 같다.

- `service list`·`service get`: `apigwServiceId`
- `resource list`: `resourceId`
- `stage list`: `stageId`
- `stage resources`: `stageResourceId`
- `stage import-resources`·`stage deploy rollback`: `stageResourceId`
- `stage deploy list`·`stage deploy latest`: `deployId`
- `stage deploy create`: 대기 경로는 `deployId`, `--no-wait`는 출력 없음

`resource parameters`와 `resource responses`는 식별자 출력이 없어 `--quiet`에서 아무것도 출력하지 않는다.
`stage swagger`는 `--output`을 생략하면 Swagger JSON을 stdout에 출력하고, 지정하면 파일을 새로 만든 뒤 경로를 출력한다.
기존 파일을 덮어쓰려면 `--force`를 함께 지정한다.

## 플러그인 설정 파일

`set-path-plugin`과 `set-method-plugin`은 API 요청 본문 형태의 JSON 파일을 `--config-file`로 받는다.
경로 플러그인의 `applyChildPath`와 공통 필드인 `delete`는 모두 각 플러그인 항목에 넣는다.

`path-plugins.json` 예시:

```json
{
  "pathPluginList": [
    {
      "pluginType": "ADD_REQUEST_QUERY_PARAMETER",
      "pluginConfigJson": {},
      "applyChildPath": true,
      "delete": false
    }
  ]
}
```

`method-plugins.json` 예시:

```json
{
  "methodPluginList": [
    {
      "pluginType": "HTTP",
      "pluginConfigJson": {
        "url": "https://backend.example.com"
      },
      "delete": false
    }
  ]
}
```

`delete` 가 `true`면 해당 플러그인을 삭제하므로 `pluginConfigJson`을 생략할 수 있다.
`applyChildPath`는 경로 플러그인에만 사용하며 메서드 설정에 넣으면 입력 오류로 거부된다.

`set-path-plugin`과 `set-method-plugin`만 `--dry-run`을 제공한다.
하위 적용 범위를 서버가 판정하고 CORS 플러그인이 기존 OPTIONS 메서드를 삭제·대체하므로,
다른 위험 명령의 `--yes` 확인만으로는 되돌릴 수 없는 범위를 적용 전에 확인할 수 없기 때문이다.

리소스 플러그인 변경을 스테이지에 반영하려면 별도의 리소스 반영과 배포가 필요하다.

## 반영·배포·롤백

리소스 변경이 트래픽에 적용되려면 서비스 리소스를 스테이지로 반영한 뒤 스테이지를 배포하는 두 단계를 거친다.
반영·배포·롤백 명령은 모두 API 호출 전에 `--yes`가 필요하다.

```text
nhncloud apigateway stage import-resources <service-id> <stage-id> --yes
nhncloud apigateway stage deploy create <service-id> <stage-id> [--description <text>] [--no-wait] [--timeout <sec>] --yes
nhncloud apigateway stage deploy rollback <service-id> <stage-id> <deploy-id> --yes
```

배포 요청과 배포 결과 조회는 별도 API이므로 `deploy create`는 기본적으로 최신 배포 결과를 조회하며 완료까지 기다린다.
요청 직후 반환하려면 `--no-wait`를 사용하고, 기다리는 시간의 상한은 `--timeout <sec>`로 지정한다.

**대기가 끊겨 명령이 실패해도 배포 요청은 취소되지 않는다.**
`--timeout` 초과나 결과 조회 실패로 끝나면 명령은 아래 경고를 함께 낸다.

```text
주의: 배포 요청은 이미 접수됐습니다. 재실행하지 말고 apigateway stage deploy latest 로 결과를 확인하세요.
```

이 경고가 나오면 재실행하지 않는다. 같은 스테이지에 두 번째 배포가 나간다.
`deploy latest`로 결과를 확인한 뒤 다음 동작을 정한다.

배포가 `FAILURE`로 끝난 경우에는 이 경고가 나오지 않는다.
결과가 이미 확정됐으므로 원인을 고쳐 다시 배포하면 된다.

바꿀 것이 없으면 반영과 배포 모두 오류로 끝난다(종료 코드 1). 빈 결과를 돌려주지 않는다.

```text
반영: API 오류: The latest resource has already been applied.
배포: API 오류: Failed to deploy because stage is not changed.
```

반복 실행하는 자동화는 이 오류를 실패로 볼지 "이미 최신"으로 볼지 미리 정해 둔다.
현재 상태만 알고 싶다면 `deploy latest`로 조회한다.

`deploy rollback`은 선택한 배포 이력으로 스테이지 설정만 되돌린다.
되돌린 설정을 트래픽에 적용하려면 `deploy create`를 다시 실행해야 한다.
되돌리면 직전까지의 스테이지 설정은 남지 않는다.
명령은 실행 후 `완료: 직전까지의 스테이지 설정은 이 배포 이력의 내용으로 대체됐습니다.`라고 알린다.

## JSON 구조

API 응답 봉투의 `header`를 검사한 뒤 CLI는 아래 데이터를 꺼내 `--json`으로 출력한다.
따라서 목록은 JSON 배열, 단건은 JSON 객체로 출력된다.
특히 서비스 목록의 최상위 키는 `apigwServiceList`이고 서비스 단건은 `apigwService`로 서로 다르다.

| 명령 | API 응답의 최상위 키 | CLI JSON 구조 |
|---|---|---|
| `service list` | `apigwServiceList`, `paging` | service 객체 배열 |
| `service get` | `apigwService` | service 객체 |
| `resource list` | `resourceList` | resource 객체 배열 |
| `resource parameters` | `queryStringList`, `headerList`, `formDataList`, `requestBody`, `contentTypeList` | 같은 키를 가진 객체 |
| `resource responses` | `responseList`, `contentTypeList` | 같은 키를 가진 객체 |
| `stage list` | `stageList`, `paging` | stage 객체 배열 |
| `stage swagger` | `swaggerData` | Swagger 객체 |
| `stage resources` | `stageResourceList` | stage resource 객체 배열 |
| `stage deploy list` | `stageDeployHistoryList`, `paging` | deploy 객체 배열 |
| `stage deploy latest` | `latestStageDeployResult` | 최신 deploy 객체 |

`stage list`의 `resourceUpdatedAt`은 배포 시점이 아니다.
서비스 리소스를 해당 스테이지로 가져온 일시를 뜻하며, 실제 배포 시점은 배포 응답의 `deployedAt`으로 확인한다.

## 목록 수집 방식

페이지네이션은 엔드포인트마다 다르다.

- `service list`, `stage list`, `stage deploy list`는 응답의 `paging.totalCount`까지 다음 페이지를 요청해 전수 수집한다.
- `resource list`와 `stage resources`는 `paging`이 없으며 한 번의 단일 호출로 전체 목록을 받는다.

모든 목록 명령에 `page`나 `limit`을 임의로 적용하지 않는다.

## 자동화 예시

서비스 식별자를 얻어 스테이지를 조회하고, 선택한 스테이지의 Swagger를 저장소 파일과 비교할 수 있다.

```bash
SERVICE_ID=$(nhncloud apigateway service list --quiet | head -n 1)
nhncloud apigateway stage list "$SERVICE_ID" --json

STAGE_ID=$(nhncloud apigateway stage list "$SERVICE_ID" --quiet | head -n 1)
nhncloud apigateway stage swagger "$SERVICE_ID" "$STAGE_ID" \
  --output /tmp/apigateway-swagger.json

diff -u specs/apigateway-swagger.json /tmp/apigateway-swagger.json
```

`service list --quiet`과 `stage list --quiet`은 결과가 없으면 아무것도 출력하지 않는다.
자동화에서는 빈 식별자를 다음 명령에 넘기기 전에 검사한다.

플러그인 일괄 적용은 같은 설정 파일로 영향 범위를 먼저 확인한 뒤 실행한다.

```bash
nhncloud apigateway resource set-path-plugin <service-id> <resource-id> \
  --config-file path-plugins.json --dry-run --json

nhncloud apigateway resource set-path-plugin <service-id> <resource-id> \
  --config-file path-plugins.json --yes
```

변경된 서비스 리소스를 스테이지에 반영하고 배포 완료까지 기다릴 수 있다.

```bash
nhncloud apigateway stage import-resources <service-id> <stage-id> --yes
nhncloud apigateway stage deploy create <service-id> <stage-id> --yes
```
