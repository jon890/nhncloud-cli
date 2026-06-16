---
id: commander-reserved-flag-conflict
category: code-review
title: Commander 예약 플래그와 충돌하는 옵션명 (`--version` / `--help`)
triggers: [Commander, 예약 플래그, -v, -h]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: 서브커맨드에 `--version <ver>` 같은 옵션을 정의한다. root 프로그램이 `.version("x.y.z")` 를 호출하면 Commander 가 `--version`(및 `-V`)을 **버전 출력 플래그로 예약**해, 서브커맨드의 `--version <ver>` 가 값으로 파싱되지 않고 CLI 버전을 출력하고 종료한다. (`--help`/`-h` 도 동일하게 예약.)
사용자/스크립트가 `send --version 2.3.0` 을 주면 projectVersion 이 전달되는 대신 `0.3.0` 만 찍히는 묻혀버린 오작동.

**Good**: 예약 플래그와 겹치는 옵션명을 피한다. projectVersion 은 `--app-version`, 그 외도 `--xxx-version` 등으로 명명. rename 시 코드(`opts.appVersion` 등 camelCase 매핑)·docs(flow/README/SKILL)·phase 예시를 모두 동기화한다.

```bash
# root .version() 가 있는데 서브커맨드 옵션에 --version/--help 정의가 있는지
grep -rnE "\.option\(\"--(version|help)" src/commands/
```

**검증**: `echo hi | node dist/index.js <cmd> --version 9.9.9 ...` 가 CLI 버전("x.y.z")을 출력하지 않고 옵션 값으로 파싱되어 후속 로직에 도달하는지 확인. 버전만 찍고 종료하면 가로채진 것.

**Why**: PR #16 (plan012) — `logncrash send --version <ver>` 가 root `.version("0.3.0")` 에 가로채여 `--app-version` 으로 rename. 새 명령에 버전·도움말류 옵션을 둘 때마다 재발 가능.

# 5. 타입 안전성
