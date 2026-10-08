# ADR-015: deploy 바이너리 전송 — ky multipart 업로드와 봉투 우회 파일 스트림 다운로드

- **결정**: `deploy upload`/`deploy download` 는 기존 JSON-only client 패턴에서 벗어나는 두 전송 경로를 도입한다.
  - **업로드**: ky `json:`(JSON body) 대신 `body: FormData` 로 `multipart/form-data` 전송. `Content-Type` 은 수동 지정하지 않는다 — ky 가 boundary 를 자동 설정한다. 파일 파트는 command 에서 statSync 가드 후 읽은 Buffer 를 Blob 으로 감싼다.
  - **다운로드**: 응답을 공통 봉투 JSON 으로 가정하지 않는다(`unwrap`·ADR-006 미적용). `.json()` 대신 `.arrayBuffer()` 로 받아 Buffer 를 반환하고 command 가 `writeFileSync` 로 파일에 쓴다. 성공/실패는 HTTP status(ky `throwHttpErrors`)로만 판정한다.
- **맥락**: 두 명령 모두 NHN Cloud Deploy v2.1 의 바이너리 전송 endpoint 다. upload 응답은 봉투 JSON(`body.{downloadUrl, binaryKey}`).
- **미실측**: upload·download 는 쓰기 호출이라 실측하지 못했다. 코드는 `binary-group`(단수) 경로와 raw 바이너리 응답(`.arrayBuffer()` 저장)을 가정하며, 조회 경로는 `binary-groups`(복수)다.
  - 단수 경로가 404 이거나 download 응답이 `downloadUrl` JSON 메타이면 가정을 고쳐야 한다.
  - upload 응답 `binaryKey` 는 number|string 을 모두 받아 `Number()` 로 정규화한다.
- **조회 응답 실측 갱신 (2026-06-23)**: `deploy binary-groups` 읽기 전용 live 호출에서 `description: null` 응답을 확인했다.
  따라서 `BinaryGroup.description` 은 optional `string | null` 로 취급한다.
  같은 target 의 `deploy binaries` 는 `totalCount: number`, `binaries: []` 였으므로 `Binary` 항목 필드 필수성은 아직 확정하지 않는다.
- **대안 기각**:
  - download 도 `.json<NhnEnvelope>()`+unwrap 으로 "통일" — 응답이 바이너리면 JSON 파싱이 깨진다. 봉투 우회가 endpoint 특성상 안전.
  - 진짜 스트리밍(ReadableStream → 디스크 pipe) — MVP 는 `.arrayBuffer()`(메모리 적재)로 충분. 초대형 파일 메모리 압박 확인 시 stream pipe 로 후속 전환(upload 한도 `MAX_UPLOAD_BYTES`).
  - axios 등 multipart 라이브러리 도입 — ky 단일 의존(ADR-002)을 깨므로 기각. ky 도 `body: FormData` 로 multipart 지원.
- **트레이드오프**: 두 경로 모두 파일을 메모리에 통째 적재. 단순·테스트 용이성을 얻는 대신 초대형 파일에서 메모리가 크기에 비례. 한도 가드(upload)와 후속 stream 전환 여지를 남긴다.
