# ADR-014: Log & Crash collector — 검색과 별도 host + appkey-only 인증(secret 불요)

- **결정**: 로그 전송(`logncrash send`)은 검색과 다른 collector host 와 인증 모델을 쓴다.
  - host: `POST https://api-logncrash.nhncloudservice.com/v2/log` (검색의 `api-lncs-search` 와 별도)
  - 인증: 헤더 인증 없음 — body 의 `projectName` 필드에 appkey 를 넣어 프로젝트를 식별한다 (검색의 `X-LNCS-SECRET` 와 다른 모델, secret 불요)
  - `endpoints.ts` 의 `ENDPOINTS` 맵에 `logncrash-collector` 키를 추가해 검색(`logncrash`)과 분리한다.
  - 응답은 검색과 같은 중첩 봉투 `{ header: { isSuccessful, resultCode(숫자 0=성공), resultMessage } }` 다 (공식 docs 수집 API 가이드 예제로 확정). `isSuccessful` 로만 성공 판정한다([[adr-006]]). body 는 없을 수 있어 쓰지 않는다.
- **맥락**: Log & Crash 는 검색(read)과 수집(write)의 host·인증이 서로 다르다.
  - 검색은 secret 기반 헤더 인증(`X-LNCS-SECRET`), 수집은 appkey 만으로 식별(secret 불요).
  - 두 동작을 같은 host·인증으로 가정하면 전송이 401 또는 404 로 실패한다.
- **대안 기각**:
  - 검색 host 재사용 — 수집 엔드포인트가 없어 404.
  - `X-LNCS-SECRET` 헤더 전송 — 수집은 헤더 인증을 받지 않으며 secret 을 요구하지 않는다.
  - endpoints 맵 키 공유(`logncrash` 하나) — read/write host 가 달라 한 키로 둘을 못 가린다. 별 키(`logncrash-collector`)로 분리.
- **트레이드오프**: 한 서비스(logncrash)가 endpoints 맵에서 키 2개를 갖는다. host 가 실제로 다르므로 분리가 정직하다.

