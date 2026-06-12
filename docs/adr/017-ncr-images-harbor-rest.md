# ADR-017: NCR 이미지/태그 조회 — Harbor REST /api/v2.0 우회 + UAK Basic Auth (Docker v2 _catalog 기각)

- **결정**: NCR 이미지(repository)·태그(artifact) 목록은 Management API([[adr-016]])에 endpoint 가 없어 레지스트리 데이터플레인 host 의 **Harbor REST API v2.0** 을 직접 호출한다.
  - host: `ncr get <registry>` 의 `registry.uri` 에서 host 부분을 추출한다. uri 는 `{host}/{registryName}` 형태(`{projectId}-{region}-registry.container.nhncloud.com/{registryName}`)라 첫 `/` 앞이 host.
  - repository 목록: `GET https://{host}/api/v2.0/projects/{project}/repositories` → 평면 배열 `[{ name, artifact_count, pull_count, update_time, ... }]`. `name` 은 `{project}/{repo}` 형태.
  - 태그(artifact) 목록: `GET https://{host}/api/v2.0/projects/{project}/repositories/{repo}/artifacts` → `[{ digest, size, push_time, tags: [{ name, push_time, ... }] | null, ... }]`. `repo` 는 name 의 project 뒤 부분이며 `/` 를 `%2F` 로 인코딩한다. tag 는 artifact 마다 `tags` 배열로 매달려 있어 flatten 한다(tags 가 null 인 dangling artifact 도 있음).
  - `project` = 레지스트리 이름(Management API `registry.name`).
  - 인증: **UAK id/secret 을 Basic Auth** (Username=UAK id, Password=UAK secret) — docker login 자격과 동일. Management API 의 X-TC 정적 헤더와 다른 모델. Bearer 토큰 교환 불요.
  - 응답은 NHN 봉투가 **아니다** — Harbor 표준 평면 JSON 배열. `unwrap`/`unwrapHeader` 미적용([[adr-006]] 미적용·[[adr-015]] download 와 같은 봉투 우회 결). 성공/실패는 HTTP status(ky `throwHttpErrors`)로 판정하고 `toNhnCloudCliError` 로 매핑.
  - pagination: `?page=N&page_size=100`(Harbor 최대 100) + 응답 `Link: <...page=N+1...>; rel=\"next\"` 헤더. repository·artifact 목록은 커질 수 있어(실측: 한 repo 에 artifact 60개·`x-total-count` 헤더) `rel=\"next\"` 가 없을 때까지 전 페이지를 누적한다 — 기본 page_size 단일 호출은 앞부분만 와 묻혀버린 절단(silent truncation)이 된다.
- **맥락**: 당초 task 022 초안은 Docker Registry HTTP API v2(`/v2/_catalog`, `/v2/{repo}/tags/list`)를 우회로 가정했으나, 2026-06-12 실측에서 `/v2/_catalog` 는 Harbor 시스템 admin 전용이라 일반 UAK 토큰으로 **401**(catalog scope Bearer 토큰을 발급받아도 권한 없음). 반면 Harbor REST `/api/v2.0/projects/{project}/repositories` 와 `/artifacts` 는 UAK Basic Auth 로 **200**. Docker v2 의 Bearer 토큰 교환(`/service/token`)보다 단순하고 권한도 통과한다.
- **대안 기각**:
  - Docker Registry v2 `/v2/_catalog` — admin 전용 401. repository 열거 우회 불가(실측 확정).
  - Docker v2 Bearer 토큰 flow(`/service/token` 교환 후 `/v2/{repo}/tags/list`) — 토큰 교환 단계가 추가되고 catalog 권한은 여전히 막혀 repository 열거가 안 돼 반쪽. tags 만 되고 images 가 안 됨.
  - Management API 확장 대기 — 공식 repository/artifact endpoint 부재로 불가.
- **트레이드오프**: 데이터플레인 host(Management API 와 다른 도메인)에 별도 Basic Auth 로 호출하는 인증 모델이 하나 더 는다. 단 docker login 자격과 동일한 UAK 라 사용자 추가 설정은 없다. repository name 이 `{project}/{repo}` 합성이라 명령 인자(`<repository>`)는 project 를 제외한 짧은 이름으로 받고 내부에서 합성한다.

