---
id: path-migration-agents-missing
category: plan
title: 경로 이전 검색에서 역할과 워크플로 정의를 빠뜨림
triggers: [경로 마이그레이션, 역할 정의, 워크플로]
tool_catchable: false
source: [PR29]
related: [decision-surface-sweep-incomplete]
---

**증상**: 파일이나 디렉터리 경로를 옮긴 뒤 코드와 스킬만 검색해 역할 정의, 오버레이 또는 CI 프롬프트가 없어진 경로를 계속 가리킨다. 이 파일들은 실행 절차와 검증 명령을 포함할 수 있어 참조가 깨져도 컴파일러가 잡지 못한다.

**Good**: 경로 이전 전후에 저장소의 지침·문서·스킬·역할·워크플로·코드·task 전체에서 이전 경로를 검색한다. 검색 범위에는 `AGENTS.md`, `docs/`, `.agents/`, `.claude/`, `.codex/`, `.github/`, `README.md`, `skills/`, `src/`, `tasks/`를 포함한다.

**검출**:

```bash
rg -n --hidden --glob '!.git/**' '<old-path>' \
  AGENTS.md docs .agents .claude .codex .github README.md skills src tasks
```

**Self-check**: 역할 정의와 오버레이, CI 프롬프트까지 검색했는가? 이전 경로가 현재 문서에 남지 않았는가? 역사적 기록이라 보존한 결과는 현재 지침과 구분되는가?

**Why**: PR29의 ADR 경로 이전에서 코드와 스킬 밖의 역할 정의가 검색 범위에서 빠졌다. 역할 파일 자체가 공용 스크립트를 복제한다고 가정할 필요는 없지만, 경로와 명령을 소비하는 독립 표면이라는 점은 계속 유효하다.

관련: [[decision-surface-sweep-incomplete]]
