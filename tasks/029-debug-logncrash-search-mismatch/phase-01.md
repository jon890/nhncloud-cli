# Phase 01 — Log & Crash 검색 UX 문서 보강

## 컨텍스트

Issue #4는 콘솔에는 존재하는 로그가 `nhncloud logncrash search`에서 `totalItems: 0`으로 나오는 문제다.
synthetic 로그로 search/export를 실측한 결과 CLI 검색 경로 자체는 정상 동작했다.

실측 요약:

- synthetic 로그 전송 직후에는 검색 결과가 0건이었다.
- 약 5초 뒤 bare keyword, `body:<keyword>`, `body:"<keyword>"`, `body:*<keyword>*`, `*<keyword>*` 모두 1건을 반환했다.
- `search`와 `export`는 같은 결과를 반환했다.
- 응답 필드는 `logBody`가 아니라 `body`로 왔다.
  현재 formatter는 `logBody`/`body`/`message` fallback을 모두 지원한다.
- 반복 검색 중 `Rate limit exceeded`가 발생했다.
  공식 문서도 검색 API가 토큰 기반 rate limit을 갖는다고 설명한다.

## 결정

코드 변경은 하지 않는다.
대신 사용자-facing 문서에 아래 UX 계약을 명시한다.

- `--query`는 콘솔 간편 검색어가 아니라 Log & Crash Search API의 Lucene 쿼리 원문이다.
- body 검색 의도가 명확하면 `body:<keyword>` 또는 `body:*<keyword>*`처럼 필드를 지정한다.
- 전송 직후에는 인덱싱 지연으로 잠시 0건이 나올 수 있다.
- 반복 검색이나 넓은 wildcard 검색은 rate limit에 걸릴 수 있으므로 시간 범위를 좁힌다.

## 변경 파일

- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `docs/flow.md`
- `tasks/029-debug-logncrash-search-mismatch/index.json`

## 성공 기준

- README에 body 검색과 body 부분 문자열 검색 예시가 있다.
- public skill에 AI 에이전트용 Lucene/body 쿼리 주의가 있다.
- `docs/flow.md`에 쿼리 해석, 인덱싱 지연, rate limit 주의가 있다.
- `git diff --check`가 통과한다.

## 주의사항

- 실제 appkey, secret, raw 로그 본문을 남기지 않는다.
- synthetic keyword는 문서에 남기지 않는다.
- 코드 변경을 섞지 않는다.
