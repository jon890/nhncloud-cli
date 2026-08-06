---
id: quiet-mode-identifier-missing
category: code-review
title: `--quiet` 모드에서 식별자 출력 누락
triggers: [quiet, 식별자]
tool_catchable: false
source: [PR40]
related: []
---

**증상**: 자동화 / 파이프 친화 모드 (`--quiet`) 에서 instance id, volume id, floating IP id, binaryKey 같은 후속 처리에 필요한 식별자를 stdout 에 출력하지 않음. 호출자 (스킬 / shell pipe) 가 `nhncloud ... --quiet | xargs ...` 패턴으로 체이닝 불가.
**Good**: `--quiet` 분기에서 사람용 메시지는 생략하되 **식별자 1 줄** (`instanceId`, `volumeId`, `binaryKey` 등) 은 stdout 출력. `--json` 과 별개로 quiet 도 자동화 진입점.
**검출**: `--quiet` 분기에서 `stdout.write` 가 0 줄인 명령 — 신규 명령 PR review 시 grep.
**Why**: 자동화 명령에서 `--quiet`가 식별자를 내지 않으면 다음 조회·삭제·다운로드 명령으로 안전하게 체이닝할 수 없다.
