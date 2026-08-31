---
id: new-command-docs-required-skip
category: plan
title: 새 명령의 공개 사용 표면 갱신을 범위에서 빠뜨림
triggers: [신규 명령, README, 공개 스킬]
tool_catchable: false
source: [PR1, PR10]
related: [integrated-command-partial-surface]
---

**증상**: 새 명령을 구현하고 생성 명령 카탈로그에는 나타나지만 `README.md`의 사용 흐름이나 공개 `skills/nhncloud-cli/references/`는 이전 상태로 남는다. 내부 지침에 명령 개수를 복제하는 방식은 숫자만 다시 낡게 만든다.

**Good**: Commander 트리에서 생성한 `nhncloud commands --json`과 실제 help를 명령 표면의 단일 소스로 삼는다. 사용자가 새 명령을 발견하거나 실행하는 방식이 바뀌면 `README.md`와 해당 공개 스킬 reference를 함께 대조하고, 자연어 라우팅 범위가 바뀔 때만 `SKILL.md` description과 router를 고친다. `AGENTS.md`에는 명령 목록이나 개수를 추가하지 않는다.

**검출**:

```bash
node dist/index.js commands --json > /tmp/nhncloud-commands.json
rg -n '<new-command>|<new-service>' README.md skills/nhncloud-cli/
```

카탈로그와 실제 help에 나온 명령이 사용자 가이드의 관련 흐름에 반영됐는지 사람이 대조한다.

**Self-check**: 생성 카탈로그와 help를 확인했는가? README와 공개 reference 중 실제 영향이 있는 곳을 갱신했는가? 명령 개수를 다른 문서에 복제하지 않았는가?

**Why**: 여러 신규 명령 PR에서 구현과 reference 일부만 갱신하고 README 요약이나 스킬 라우팅을 놓쳤다. 반대로 명령 개수를 `AGENTS.md`에 적는 대응은 새로운 부패 지점을 만들었으므로 현재 단일 소스 정책에서 제외한다.

관련: [[integrated-command-partial-surface]]
