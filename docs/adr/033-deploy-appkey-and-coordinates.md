# ADR-033: deploy 의 appkey 는 자격증명이다 — 좌표에서 분리하고 named target 을 폐지한다

- **결정**: `deploy` 의 appkey 를 profile 자격증명으로 옮기고, `config.json` 의 named target 을 없앤다.
  - appkey 는 `credentials.json` 의 `profiles.<name>.deploy.appkey` 에 둔다.
    다른 네 서비스와 같은 자리다.
  - `configure --deploy-appkey <key>` 로 설정한다. 대화형 흐름에도 넣는다.
  - `artifactId`·`serverGroupId`·`scenarioIds` 는 자격증명이 아니다. 명령 옵션으로만 받는다.
    이미 있는 `--artifact-id`·`--server-group-id`·`--scenario-ids` 를 정식 입력으로 승격한다.
  - `deploy.targets` 를 읽지 않는다. 남아 있으면 무시하고 경고 한 줄로 옮기는 방법을 알린다.
  - `target` 인수를 없앤다. `deploy artifacts` 는 좌표가 필요 없어 인수 자체가 사라진다.
- **대체된 부분**: [[adr-008]] 이 appkey 를 "비밀이 아닌 좌표" 로 분류하고 `config.json` 에 둔 결정을 뒤집는다.
  좌표 네 개 중 appkey 만 자격증명이고 나머지 셋은 그대로 좌표다.
  named target 자체도 폐지하므로 [[adr-008]] 의 저장 위치 결정은 유지되지 않는다.
- **맥락**: appkey 가 `0644` 파일에 평문으로 있었다.
  - `config.json` 은 `0644`, `credentials.json` 은 `0600` 이다.
    `ncr`·`ncs`·`logncrash`·`apigateway` 의 appkey 는 모두 `0600` 쪽에 있고 `deploy` 만 예외였다.
    저장소가 이미 appkey 를 비밀로 다루고 있었고 한 서비스만 어긋나 있었다.
  - appkey 는 유출되면 교체해야 하는 값이다. 그 성질이 비밀의 정의다.
    반면 `artifactId` 같은 값은 프로젝트 내부 번호라 그것만으로 아무것도 할 수 없다.
  - profile 을 바꿔도 `config.json` 의 appkey 는 그대로라 자격증명 회전이 조용히 누락된다.
    [[adr-029]] 가 `--app-key` 오버라이딩에서 지적한 위험과 같은 구조다.
  - 배포 좌표는 프로젝트 정보다. 사용자 홈의 전역 파일에 있으면 저장소를 옮기거나
    CI 에서 돌릴 때 따라가지 못한다. CI 에는 `~/.nhncloud/config.json` 이 없다.
    그래서 `--artifact-id` 같은 override 옵션이 이미 만들어져 쓰이고 있었다.
  - named target 은 초기 검증을 빠르게 하려고 도입됐다. 지속적인 필요에서 나온 것이 아니다.
    [[adr-008]] 이 근거로 든 "좌표 네 개를 매번 flag 로 받으면 장황하다" 는 그 편의의 다른 표현이다.
- **대안 기각**:
  - `--app-key` 만 제거하고 target 유지 — appkey 가 `0644` 에 남는다.
    회전 누락도 그대로다. 옵션 표면만 정리하고 실제 위험은 손대지 않는 셈이다.
  - 반대로 다른 네 서비스의 appkey 를 `config.json` 으로 옮기기 — [[adr-003]] 의 비밀 분리를
    일관되게 지키는 방향이지만, appkey 를 비밀이 아니라고 본 전제 자체가 틀렸다.
    네 서비스의 자격증명을 `0644` 로 내리는 것은 보호를 약화한다.
  - target 을 `credentials.json` 으로 통째로 옮기기 — 비밀 아닌 좌표가 비밀 파일에 들어간다.
    [[adr-008]] 이 기각한 이유가 이 부분에서는 여전히 맞다.
  - 좌표를 읽는 `--config-file` 을 지금 추가하기 — 없어도 스크립트로 된다.
    실제로 불편한지 보기 전에 표면을 늘리지 않는다.
- **트레이드오프**: `deploy run docparser` 한 줄이던 것이 옵션 세 개를 쓰게 된다.
  그 반복은 클라이언트의 스크립트나 CI 변수가 흡수한다.
- **적용 범위**: 이 ADR 은 `deploy` 의 appkey 위치와 좌표 입력 경로에 한정한다.
  `config.json` 의 `defaultProfile` 은 CLI 동작 설정이라 그대로 둔다.
  다른 서비스의 자격증명 위치도 바꾸지 않는다.
