# API Gateway 조회 안내

`apigateway` 명령군은 API Gateway 서비스, 리소스, 스테이지, 배포 이력을 조회하고 스테이지의 Swagger를 내보낸다.
현재는 조회만 지원하며 플러그인 적용, 스테이지 수정, 배포, 롤백 같은 쓰기 작업은 지원하지 않는다.

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
| `nhncloud apigateway stage list` | `<service-id>` | 공통 옵션 |
| `nhncloud apigateway stage swagger` | `<service-id> <stage-id>` | 공통 옵션, `--output <file>`, `--force` |
| `nhncloud apigateway stage resources` | `<service-id> <stage-id>` | 공통 옵션 |
| `nhncloud apigateway stage deploy list` | `<service-id> <stage-id>` | 공통 옵션 |
| `nhncloud apigateway stage deploy latest` | `<service-id> <stage-id>` | 공통 옵션 |

`--quiet`가 식별자를 출력하는 명령은 다음과 같다.

- `service list`·`service get`: `apigwServiceId`
- `resource list`: `resourceId`
- `stage list`: `stageId`
- `stage resources`: `stageResourceId`
- `stage deploy list`·`stage deploy latest`: `deployId`

`resource parameters`와 `resource responses`는 식별자 출력이 없어 `--quiet`에서 아무것도 출력하지 않는다.
`stage swagger`는 `--output`을 생략하면 Swagger JSON을 stdout에 출력하고, 지정하면 파일을 새로 만든 뒤 경로를 출력한다.
기존 파일을 덮어쓰려면 `--force`를 함께 지정한다.

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
