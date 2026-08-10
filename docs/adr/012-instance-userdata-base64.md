# ADR-012: instance create user_data — base64 주입과 65535 인코딩 후 한도

- **결정**: `--user-data <path>` 로 cloud-init 파일을 받아 base64 인코딩해 `server.user_data` 로 주입한다.
  - 인코딩·한도 검증은 client 가 아닌 command(파라미터 검증 단계)에서 수행해 네트워크 호출 전에 fail-fast 한다.
  - 65535 바이트 한도는 **base64 인코딩 후 결과 문자열** 기준으로 검사한다. 초과 시 `EXIT_PARAM_ERROR`.
- **맥락**: NHN Cloud Instance public-api docs 가 `user_data` 를 "base64 인코딩된 문자열 ... 65535 바이트까지 허용" 으로 명시한다.
  - 문구상 한도는 인코딩 후 문자열 기준 — base64 는 원본보다 약 33% 커지므로 원본 cloud-init 은 약 48KB 까지 들어간다.
  - 인코딩 전 65535 로 잡으면 API 가 거부할 요청을 통과시킬 수 있어, 보수적으로 인코딩 후 기준을 채택한다.
- **대안 기각**:
  - client 에서 인코딩(이슈 초안) — 한도 검증을 위해 command 에서 또 인코딩해야 해 이중 작업이 된다. command 단일 인코딩이 fail-fast 이고 중복도 없앤다.
  - 인코딩 전 65535 검증 — docs 문구와 어긋나고 API 가 거부할 요청을 과소 차단한다.

