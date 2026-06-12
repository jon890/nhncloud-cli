# ADR-008: deploy 좌표 named target (config) + UAK/좌표 분리

- **결정**: 배포 좌표를 `config.json` 에 이름 붙인 target 으로 저장하고 `nhncloud deploy run <target>` 으로 참조한다.
  - 좌표: appKey·artifactId·serverGroupId·scenarioIds
  - 개별 flag 로 override 가능
  - UAK(id+secret) 비밀은 `credentials.json` 의 profile 공통 `userAccessKey` 에 둔다 ([[adr-004]])
- **맥락**: 한 배포에 좌표 4개가 필요해 매번 flag 로 받으면 장황하다.
  - 좌표는 비밀이 아니므로 config, UAK 만 비밀이라 credentials (비밀/비밀아님 분리, [[adr-003]])
- **대안 기각**: 전부 flag(장황·반복), 좌표를 credentials 에 혼재(비밀 아닌 값이 비밀 파일에).

