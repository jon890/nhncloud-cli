/**
 * `--file` 로 받는 JSON 입력의 크기 상한 (1 MB).
 * JSON spec 과 플러그인 설정은 보통 수 KB 라, 잘못 지정한 파일을 통째로 읽는 것을 막는 보수적 값이다.
 * deploy upload 의 바이너리 상한(512 MiB)은 성격이 달라 공유하지 않는다.
 */
export const MAX_JSON_INPUT_BYTES = 1_000_000;
