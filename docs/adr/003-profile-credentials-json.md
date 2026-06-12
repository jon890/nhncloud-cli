# ADR-003: profile 기반 자격증명 — JSON + credentials/config 분리

- **결정**: `~/.nhncloud/credentials.json`(비밀, mode 0600) + `~/.nhncloud/config.json`(설정) 두 파일. JSON 포맷.
- **맥락**: 여러 프로젝트·환경을 profile 로 전환 (AWS 방식). 비밀과 설정 분리로 권한 관리가 깔끔하다. JSON 은 `JSON.parse` 로 끝나 구현이 가장 단순.
- **대안 기각**: INI(파서 직접 구현 필요), 단일 파일(비밀·설정 혼재).

