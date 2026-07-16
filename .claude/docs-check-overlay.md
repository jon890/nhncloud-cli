# docs-check 오버레이 — nhncloud-cli

공용 코어(`~/.claude/skills/docs-check`)에 nhncloud-cli 특화를 주입한다.
코어가 뼈대, 여기는 이 레포에서만 다른 값만 채운다 — 코어·`AGENTS.md`(`CLAUDE.md` 심링크)와 중복 기재하지 않는다.

## docs 구조 + 대상 파일

- `docs/prd.md` / `docs/flow.md` / `docs/adr/`(ADR 1개 = 파일 1개, `docs/adr/INDEX.md` 라우터) / `docs/data-schema.md` / `docs/code-architecture.md`
- `AGENTS.md`(`CLAUDE.md` 심링크) — 코드 규칙 + ADR 참조 표 + 서비스별 인증 모델 표
- `skills/nhncloud-cli/SKILL.md` + `skills/nhncloud-cli/references/*.md` — 공개 사용자 가이드(npm 배포 대상, dogfooding 필수)
- `.agents/skills/*/SKILL.md` + `.agents/skills/_shared/*.md` — 내부 개발 워크플로우 스킬

```bash
# cwd: <repo root>
ls docs/*.md docs/adr/*.md skills/nhncloud-cli/SKILL.md skills/nhncloud-cli/references/*.md .agents/skills/*/SKILL.md .agents/skills/_shared/*.md
```

## 부패 검사 grep (레포 특화)

- ADR Index sync·bloat 검사의 `<ADR_DIR>` = `docs/adr/`
- 개인 식별 정보 사전 점검 — `AGENTS.md` "개인 식별 정보 / 사내 식별자 노출 금지" 절의 grep 2개(공개 도메인 화이트리스트 밖 도메인, 비밀 형태 문자열)를 그대로 실행. 이 repo 는 GitHub·npm 양쪽 public 이라 필수.
- 공개 skill dogfooding — 새/삭제/변경된 명령·옵션이 `skills/nhncloud-cli/SKILL.md` + `references/*.md` 에 반영됐는지 확인. 변경 유형별 해당 여부는 `.claude/planning-overlay.md` "docs 영향 표" 참조.

## 검증 위임 (단일 소스)

의미 6축(A~E) 판정은 `nhncloud-cli-docs-verifier` 에이전트(`.claude/agents/nhncloud-cli-docs-verifier.md` / `.codex/agents/nhncloud-cli-docs-verifier.toml`)에 위임한다.
grep 명령·도메인 지식은 그 agent 본문이 단일 소스 — 여기서 반복하지 않는다.
