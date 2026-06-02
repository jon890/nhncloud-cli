# Phase 1: nhncloud-docs skill 작성 + CLAUDE.md 스킬 목록 등재

## 컨텍스트

NHN Cloud 공식 docs(`docs.nhncloud.com`)의 API 레퍼런스를 실시간 web 조회로 끌어오는 **내부 개발 skill** 을 만든다.
instance 작업에서 `block_device_mapping_v2` 구조를 docs 에서 못 찾아 헤맨 경험이 동기 — 다음엔 한 번에 정확히 끌어오게 한다.

skill 은 코드가 아니라 AI 에이전트 워크플로우 문서다. 새 라이브러리·CLI 코드·캐시 없음.

먼저 아래를 읽어라:

- `CLAUDE.md` "API 스펙 확인 절차" (이 skill 이 그 원칙의 실행 도구), "스킬 폴더 구분"
- `docs/adr.md` ADR-011 (boot-from-volume / POST 축약 응답 — docs 에서 확인해야 했던 실제 사례)
- 기존 skill 형식 참조: `.claude/skills/review-fix/SKILL.md` (워크플로우 단계 구조), `.claude/skills/docs-check/SKILL.md`

## 결정된 설계 (planning 확정)

- **형태**: skill 만 (`.claude/skills/nhncloud-docs/SKILL.md`). 공개 `skills/nhncloud-cli/` 와 구분
- **메커니즘**: 실시간 web 조회 — `WebSearch`(allowed_domains 도메인 한정) + `WebFetch`. 캐시·인덱싱 없음 (stateless)
- **범위**: API 레퍼런스 중심 (public-api 가이드 — endpoint, request/response body)

## 목표

`/nhncloud-docs` 호출 또는 키워드 트리거 시, NHN Cloud 공식 docs 에서 정확한 API 스펙을 출처와 함께 끌어오는 skill 문서.

## 작업 목록

- [ ] `.claude/skills/nhncloud-docs/SKILL.md` 작성. 아래 섹션 포함:
  - **frontmatter / 트리거**: 명시 호출(`/nhncloud-docs`) + 키워드 자동("NHN API 스펙", "엔드포인트 확인", "request/response 구조", "nhncloud docs", "공식 레퍼런스")
  - **입력 해석**: "어떤 서비스의 무슨 API/필드" (예: "Instance 생성 body", "Keystone 토큰 발급")
  - **URL 패턴 가이드** (skill 본문 임베드):
    - API 레퍼런스: `docs.nhncloud.com/ko/{Category}/{Service}/ko/public-api/` (예: `/ko/Compute/Instance/ko/public-api/`)
    - 특수 경로 예: `/ko/nhncloud/ko/public-api/iaas-token/`
    - Category/Service 표기가 다양하므로 정확한 URL 은 WebSearch 로 확정 (패턴은 후보 좁히기용)
  - **조회 워크플로우** (순차):
    1. WebSearch `allowed_domains: ["docs.nhncloud.com"]` 로 public-api 페이지 URL 확정
    2. WebFetch 로 해당 페이지 + 구체 질문 (예: "block_device_mapping_v2 하위 필드 + 예제 JSON 전문")
    3. **truncate/봇차단 우회 전략** (이번 실측 교훈 임베드): WebFetch 결과가 `Content truncated` 면 → 더 좁은 prompt 로 재질문 / WebSearch 스니펫 / `cmux-browser` 폴백
  - **출력 형식**: 스펙 요약 + **출처 URL(필수)** + (코드 반영 시) 타입·payload 예시. docs 로 확정 안 되는 필드(타입·boolean vs 0/1 등)는 "실측 필요" 명시 (CLAUDE.md API 스펙 확인 절차와 일관)
  - **원칙 박스**: 추측 금지 — endpoint 뿐 아니라 request/response body 구조도 docs 우선 (CLAUDE.md 거울)
- [ ] `CLAUDE.md` "스킬 폴더 구분" 섹션에 `nhncloud-docs` 1줄 등재 (내부 개발 skill 목록)
- [ ] index.json 완료 마킹 (status / current_phase=1 / phase status = completed)

## 성공 기준

```bash
# cwd: <레포 루트>
ls .claude/skills/nhncloud-docs/SKILL.md
# 핵심 섹션 존재
grep -c "docs.nhncloud.com" .claude/skills/nhncloud-docs/SKILL.md          # 기대: >=1
grep -c "WebSearch" .claude/skills/nhncloud-docs/SKILL.md                  # 기대: >=1
grep -c "WebFetch" .claude/skills/nhncloud-docs/SKILL.md                   # 기대: >=1
grep -cE "truncate|Content truncated|봇 차단|cmux-browser" .claude/skills/nhncloud-docs/SKILL.md   # 기대: >=1
grep -cE "public-api|/ko/\{Category\}" .claude/skills/nhncloud-docs/SKILL.md   # 기대: >=1
grep -cE "출처|실측" .claude/skills/nhncloud-docs/SKILL.md                  # 기대: >=2
# CLAUDE.md 등재
grep -c "nhncloud-docs" CLAUDE.md                                          # 기대: >=1
# 완료 마킹
grep -c '"status": "completed"' tasks/005-feat-nhncloud-docs-skill/index.json   # 기대: 2 (1 task + 1 phase)
```

## 주의사항

- skill 은 markdown 문서다 — 빌드·타입체크 무관. `pnpm run build` 불필요.
- 마크다운 가독성: 전역 `~/.claude/CLAUDE.md` + 프로젝트 `CLAUDE.md` "docs 작성 형식" 패턴 준수 (semantic line break, 인라인 나열 금지, 외래어 음차 합성 회피).
- 기존 skill (`review-fix`, `docs-check`) 의 문체·구조를 mirror.
- WebSearch `allowed_domains` 는 `docs.nhncloud.com` 으로 한정 — 노이즈 회피.
- 코드 docs (adr/README/공개 SKILL/data-schema) 는 **건드리지 않는다** (내부 개발 skill 이라 영향 없음).

## 커밋

```
git commit -m "feat(skill): add nhncloud-docs skill for official API reference lookup"
```

## Blocked 조건

- 없음 (독립 skill 문서 작성).
