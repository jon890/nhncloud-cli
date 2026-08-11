---
id: commander-reserved-flag-conflict
category: code-review
title: Commander 예약 플래그와 충돌하는 옵션명 (`--version` / `--help`)
triggers: [Commander, 예약 플래그, -v, -h]
tool_catchable: true
source: [PR16, ISSUE76]
related: []
---

**증상**: 서브커맨드에 `--version <ver>` 같은 옵션을 정의한다. root 프로그램이 `.version("x.y.z")` 를 호출하면 Commander 가 `--version`(및 `-V`)을 **버전 출력 플래그로 예약**해, 서브커맨드의 `--version <ver>` 가 값으로 파싱되지 않고 CLI 버전을 출력하고 종료한다. (`--help`/`-h` 도 동일하게 예약.)
사용자/스크립트가 `send --version 2.3.0` 을 주면 projectVersion 이 전달되는 대신 `0.3.0` 만 찍히는 묻혀버린 오작동.

**Good**: 예약 플래그와 겹치는 옵션명을 피한다. projectVersion 은 `--app-version`, 그 외도 `--xxx-version` 등으로 명명. rename 시 코드(`opts.appVersion` 등 camelCase 매핑)·docs(flow/README/SKILL)·phase 예시를 모두 동기화한다.

`src/commands/reserved-flags.test.ts` 가 커맨드 트리 전체를 걸어 이 충돌을 자동으로 잡는다.
root 에 전역 옵션을 추가하면 그 파일의 `RESERVED_ROOT_FLAGS` 도 함께 갱신한다.

```bash
# 수동 확인 — root .version() 가 있는데 서브커맨드가 예약 플래그를 재정의하는지
grep -rnE "\.(option|requiredOption)\(\"--(version|help|json|quiet|request-timeout)" src/commands/
```

**검증**: `echo hi | node dist/index.js <cmd> --version 9.9.9 ...` 가 CLI 버전("x.y.z")을 출력하지 않고 옵션 값으로 파싱되어 후속 로직에 도달하는지 확인. 버전만 찍고 종료하면 가로채진 것.

**범위는 version/help 만이 아니다**: commander 는 기본 설정에서 **root 의 모든 옵션**을 서브커맨드 인수 위치에서도 해석한다.
`--json`·`--quiet`·`--request-timeout` 도 서브커맨드가 재정의하면 같은 방식으로 가로채인다.

**왜 rename 인가**: `enablePositionalOptions()` 는 충돌을 없애지만 `instance list --json` 같은 전역 옵션 후치 사용을 전부 깨뜨린다.
root `.version()` 의 플래그를 `-V, --cli-version` 으로 바꾸면 `nhncloud --version` 자체가 사라진다.
실측 결과 옵션 rename 만이 다른 것을 깨지 않는다 (이슈 #76 에서 세 방식을 모두 측정).

**Why**: PR #16 (plan012) — `logncrash send --version <ver>` 가 root `.version("0.3.0")` 에 가로채여 `--app-version` 으로 rename. 새 명령에 버전·도움말류 옵션을 둘 때마다 재발 가능.
이슈 #76 에서 재발했다 — `nks nodegroup upgrade --version`, `nks cluster addon install/update --version` 3개 명령이 같은 방식으로 조용히 실패했다. 각각 `--kube-version`, `--addon-version` 으로 rename 하고 회귀 테스트를 추가했다.
