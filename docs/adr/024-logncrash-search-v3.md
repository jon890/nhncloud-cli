# ADR-024: Log & Crash Search v3 전환과 커서 페이지 이동

- **결정**: `logncrash search`와 `logncrash export`는 기존 Search API를 제거하고 v3만 호출한다.
  - 검색 인증은 profile 공통 UAK를 OAuth `client_credentials`로 교환한 토큰을 사용한다.
    토큰은 `X-NHN-Authorization: Bearer <token>` 헤더에 넣고 Deploy·NCS와 user-access-token 캐시를 공유한다.
  - `logncrash search`는 v3 커서 API를 사용한다.
    첫 요청은 `cursor`를 생략하고, 다음 요청은 직전 JSON 응답의 `nextCursor`를 그대로 전달한다.
    REAL API 실측 계약에 따라 모든 요청에 `sort: { "logTime": "DESC" }`를 보낸다.
  - `logncrash export`는 v3 scroll 시작·계속 API를 사용한다. 시작 요청에는 공개 명세가 정의한 `query`·`from`·`to`만 보낸다.
  - collector 기반 `logncrash send`는 검색 API 지원 종료와 무관하므로 [[adr-014]] 계약을 유지한다.
- **대체된 부분**: v3의 `available-token`을 전환 범위에서 제외한 결정은 [[adr-036]]이 대체한다.
  Symbol API 제외는 그대로 유지한다.
- **맥락**: 기존 Search API는 2026년 11월 말 지원 종료 예정이다.
  [v3 공개 명세](https://api-lncs-search.alpha-nhncloudservice.com/v3/lncs-api-gateway/openapi-public.yaml)의 일반 검색 요청에는 기존 `pageNumber`·`pageSize`가 없다.
  커서 요청에는 `pageSize`·`cursor`와 응답 `nextCursor`가 정의되어 있다.
  2026년 8월 3일 REAL API에서 같은 UAK·appkey로 확인한 결과,
  available-token과 일반 검색은 HTTP 200이었지만 커서 검색은 명세상 선택인 `sort`를 생략하면 HTTP 500이었다.
  `sort: { "logTime": "DESC" }`를 추가하면 `pageSize`가 1이어도 HTTP 200과 `nextCursor`를 반환했다.
  [UAK 토큰 가이드](https://docs.nhncloud.com/ko/nhncloud/ko/public-api/user-access-key-token/)의 `client_credentials` 발급 계약은 기존 공통 토큰 구현과 일치한다.
  기존 `--size`와 순차 페이지 이동을 보존하려면 커서 계약으로 옮겨야 한다.
- **대안 기각**:
  - v2·v3 이중 지원 — 종료 예정인 secret 인증과 두 요청 스키마를 함께 유지해 테스트와 사용자 선택만 늘린다.
  - v3 일반 검색 API에 문서화되지 않은 `pageNumber`·`pageSize` 전송 — 공식 공개 명세와 어긋나며 서버의 미문서 동작에 의존한다.
  - 커서 요청에서 `sort` 생략 — 공개 명세에서는 선택 필드지만 REAL API 실측에서 HTTP 500이 발생해 현재 운영 계약과 맞지 않는다.
  - Log & Crash 전용 토큰 저장 — 같은 UAK OAuth 토큰을 중복 발급·저장해 기존 자격 지문 무효화 규약을 우회한다.
- **트레이드오프**: 임의 page 번호 이동은 사라진다.
  전환 기간에는 `--page 0`만 호환하고, 다음 페이지는 불투명한(opaque) `nextCursor`를 사용한다.
  v3 scroll 요청은 `pageSize`를 받지 않으므로 기존 `export --size`는 값을 검증하고 경고한 뒤 무시한다.
  기존 credentials의 `logncrash.secret`은 읽지 않으며 새 설정에는 저장하지 않는다.
- **적용 범위**: 공개 REAL 검색 host를 기본으로 사용한다.
  공지의 BETA·ALPHA host 선택 기능과 v3 Symbol API는 이 전환 범위에 포함하지 않는다.
  `available-token` 조회와 검색 전 차단은 [[adr-036]]이 다룬다.
