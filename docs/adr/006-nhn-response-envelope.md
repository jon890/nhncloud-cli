# ADR-006: NHN 공통 응답 봉투 정규화

- **결정**: `{ header: { isSuccessful, resultCode, resultMessage }, body }` 봉투를 단일 helper 로 unwrap. 실패 시 `NhnCloudCliError`.
- **맥락**: NHN PaaS 다수가 이 봉투를 공유 (dooray 와 동일 구조). HTTP 4xx 와 별개로 `isSuccessful: false` 가 올 수 있어 봉투 검사 필수.
- **트레이드오프**: `resultCode` 타입이 서비스마다 다르다.
  - Log & Crash 는 숫자, Deploy 는 문자열 (`"SUCCESS"`).
  - helper 는 `string | number` 를 모두 받아 `isSuccessful` 을 우선 판정한다.

