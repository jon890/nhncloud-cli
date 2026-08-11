# ADR-027: API Gateway 조회 API — 인증 헤더, endpoint, 엔드포인트별 pagination 비대칭

- **결정**: API Gateway 조회를 `X-NHN-Authorization: Bearer <token>` 과 region 별 host 로 호출하고,
  pagination 은 응답에 `paging` 이 있는 엔드포인트에만 적용한다.
  - 인증은 공통 UAK OAuth 토큰을 재사용한다([[adr-007]]). 새 토큰 교환 경로를 만들지 않는다.
  - host 는 `https://{region}-apigateway.api.nhncloudservice.com` 이고 region 은 kr1·kr2·kr3 이다.
    appKey 는 경로 파라미터로 넣는다.
  - 응답은 공통 봉투를 쓴다([[adr-006]]).
    단 경로가 없으면 HTTP 404 로 오고, 권한 오류는 HTTP 200 에 `isSuccessful: false` 로 온다.
  - `services`·`stages`·`deploys` 만 `paging` 을 반환하므로 이 셋만 전수 수집하고,
    `resources` 와 스테이지 리소스는 단일 호출로 전체를 받는다.
- **맥락**: 공식 문서가 인증을 "User Access Key 토큰, Bearer 타입" 으로만 적고
  헤더 이름을 명시하지 않는다.
  - 표준 `Authorization: Bearer` 로 호출하면 유효한 토큰이어도 `403100000 Permission denied` 가 온다.
    실측으로 `X-NHN-Authorization` 이어야 통과함을 확인했고 소문자 표기도 동작한다.
  - 토큰은 발급 프로젝트 경계를 넘지 못한다.
    다른 프로젝트 UAK 로 발급한 토큰은 같은 region 에서도 같은 403 을 받는다.
    그래서 403 을 region 문제로 오진하기 쉽다.
  - 문서는 `page` 와 `limit`(기본 10, 최대 1000)을 전역 규칙처럼 서술하지만,
    실측에서 `resources` 는 `paging` 없이 68건을 한 번에 반환했다.
    문서 서술을 그대로 믿고 모든 목록에 pagination 을 넣으면 없는 계약을 가정하게 되고,
    반대로 빼면 `services`·`stages` 가 기본 10건에서 조용히 잘린다.
  - 목록과 단건의 최상위 키가 다르다(`apigwServiceList` 대 `apigwService`).
    언랩을 한 헬퍼로 공유할 수 없다.
- **대안 기각**:
  - 표준 `Authorization` 헤더 사용 — 실측에서 403 이다.
    문서에 헤더 이름이 없어 추측했다가 원인 파악에 시간을 썼다.
  - 서비스 전용 토큰 교환 계층 추가 — 기존 UAK OAuth 토큰이 그대로 통과하므로
    계층을 늘릴 이유가 없다.
  - 모든 목록에 pagination 일괄 적용 — `resources` 에는 `paging` 이 없어
    존재하지 않는 필드를 읽게 된다.
  - `GET` 으로 리소스·스테이지 단건 조회 — 그 경로는 없다.
    이 API 는 메서드별로 라우팅해 지원하지 않는 메서드에 404 를 주며
    `Allow` 헤더도 주지 않는다.
    그래서 404 는 "경로 없음" 이 아니라 "그 메서드로는 없음" 을 뜻한다.
- **트레이드오프**: 응답에 nullable 필드가 많다(`dedicatedId`·`parentPath`·`methodType`·
  `methodName`·`methodDescription`·`stageName`·`customBackendEndpointUrl`·`rollbackAt`).
  타입 가드를 string-only 로 좁히면 null 하나가 응답 전체를 거부하므로
  `string | null` 을 허용하고 출력에서 대체 문자를 쓴다.
- **적용 범위**: 이 ADR 은 조회에 한정한다.
  쓰기는 리소스 식별 요소(`path`·`methodType`)가 불변이고 변경을 스테이지에 가져온 뒤
  배포해야 반영되는 별도 흐름이라 [[adr-028]] 에서 결정했다.
