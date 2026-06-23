---
id: path-migration-agents-missing
category: plan
title: 파일 경로/구조 이전 시 참조 grep 범위에 `.claude/agents/` 누락 (custom agent 가 스킬 스크립트를 복제 보유)
triggers: [경로 마이그레이션, .agents]
tool_catchable: false
source: [PR29]
related: []
---

**증상**: 단일 파일 → 디렉터리 같은 경로/구조 이전에서 참조 갱신 grep 범위를 `.agents/skills/` 까지만 잡고 `.claude/agents/`·`.codex/agents/` 를 빠뜨린다. custom agent 정의(executor·docs-verifier 등)가 스킬의 임베드 검증 스크립트를 **복제 보유**하는 경우가 있어, 스킬만 갱신하고 agent 를 누락하면 그 agent 의 스크립트가 없어진 옛 경로를 가리켜 **조용히 깨진다**(파일 부재 → 에러 또는 garbage pass).

**Good**: 경로/구조 이전 phase 의 참조 grep 범위에 `.claude/agents/` 와 `.codex/agents/` 를 항상 포함한다 — `grep -rn "<옛경로>" AGENTS.md docs/ .agents/skills/ .claude/agents/ .codex/agents/ README.md skills/ src/`. 특히 검증 에이전트(docs-verifier 등)는 docs-check SKILL 의 검증 스크립트를 복제하므로 둘을 같은 로직으로 동기화한다(가능하면 단일 출처화).

**Self-check**: 경로 이전 grep 범위에 `.claude/agents/` 가 있는가? custom agent 의 임베드 스크립트(ADR/docs 검증 등)가 새 구조를 반영하는가?

**Why**: PR #29 (plan023) code-reviewer FIX_NEEDED — adr.md → docs/adr/ 이전에서 phase-02 grep 이 `.claude/skills/` 만 봐 `.claude/agents/nhncloud-cli-docs-verifier.md` 의 ADR 검증 스크립트(docs-check 복제) 10건 + executor.md 1건을 놓침. critic 도 grep 범위를 못 잡음. 경로/구조 이전 task 마다 재발 가능.
