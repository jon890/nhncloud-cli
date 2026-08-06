# planning 오버레이 — nhncloud-cli

공용 코어(`~/.claude/skills/planning`)에 nhncloud-cli 특화를 주입한다.
코어의 8단계 skeleton 을 이 레포의 도메인(TypeScript CLI)·docs 컨벤션·검증·실행기 스키마에 맞춰 채운다.

## 도메인: CLI (TypeScript / Commander.js)

- **3단계 (호출 시나리오)**: 명령 인자·플래그 조합, 서비스별 인증 모델(UAK/OAuth/Keystone), `--json` 출력 여부를 구체화한다.
  - 엣지 케이스: 정상 / 에러(봉투 `resultCode` 서비스별 차이) / 빈 목록 / 인증 만료 점검
- **4단계 (인터페이스)**: 명령 시그니처, 옵션 이름, `stdout`(데이터) / `stderr`(에러·안내) 출력 분리를 설계한다.
- **5단계 (API)**: 기존 서비스 클라이언트(`src/api/*.ts`) 메서드 재사용 가능 여부를 확인한다.
  - 새 endpoint 면 봉투 정규화(ADR-006)·토큰 캐시 재사용(ADR-007/010/020) 적용 여부 점검
- **6단계 (코드 구조)**: 레이어는 `api/` → `cache/` → `commands/` → `formatters/`.
  - 새 서비스 도입 시 인증 모델(UAK 단독 / OAuth 토큰 교환 / Keystone)이 기존 표 중 무엇과 같은 패턴인지 확인

### CLI 레포 전 규모 4단계 압축

전 규모에서 8단계를 4단계로 압축 가능 — 단 압축된 각 단계 내부에서 모호함 제거는 동일하게 수행한다.

| 압축 단계 | 원 단계 |
|---|---|
| (1+2) | 구현 가능성 + 기술 스택 |
| (3+4) | 호출 시나리오 + 인터페이스 |
| (5+6) | API + 코드 구조 |
| (7+8) | docs 영향 + task 생성 |

## docs 컨벤션

핵심 docs — `docs/prd.md` / `docs/flow.md` / `docs/adr/`(ADR 1개 = 파일 1개, 목록은 `docs/adr/INDEX.md`) / `docs/data-schema.md` / `docs/code-architecture.md`.
ADR 번호 확인은 `ls docs/adr/{N}-*.md`.
`AGENTS.md`(`CLAUDE.md` 는 symlink)는 코드 작업 가이드, 서비스별 인증 모델 표, ADR 참조를 담는다.
`README.md`, `skills/nhncloud-cli/SKILL.md`, `skills/nhncloud-cli/references/*.md` 는 외부 facing 사용자 가이드(공개 npm 패키지)다.

### 변경 유형별 docs 영향 표 (필수 — 누락 0 화)

신규 작업 시 해당 행을 찾아 **표시된 모든 docs 를 손댄다**. "(해당 시)" 같은 모호한 어휘 금지 — 표시되어 있으면 변경, 표시 없으면 미손.
복수 변경 유형에 해당하면 합집합으로 손댄다.

| 변경 유형 | AGENTS.md | docs/adr/ | code-architecture.md | prd.md | flow.md | data-schema.md | README.md | skills/nhncloud-cli/SKILL.md + references/*.md |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 신규 CLI 명령 (소) | 주의사항 1줄 + "N개 명령" 카운트 | — | 디렉터리 트리 + 필요 시 utils 추가 | MVP 범위 한 줄 | 사용자 흐름 섹션 + 새 옵션 시 옵션 표 행 | (캐시 도입 시) | 사용 예 섹션 + intro "지원 명령" 문구 | 빠른 참조 표 + 자동화 시나리오 + 프론트매터 description |
| 공개 skill 구조 / 내부 agent workflow 변경 | 스킬 폴더 구분 + 검증 grep 갱신 | — | 스킬 구조 요약 갱신 | — | 자동화 흐름 변경 시 갱신 | — | 사용자-facing discovery 변경 시 갱신 | router + references 구조 갱신, `.agents/skills/`·`.claude/agents/`·`.codex/agents/`의 stale 참조 grep |
| 신규 ADR 동반 변경 | 주의사항 + ADR 참조 표 행 | ADR 본문 + 상단 ADR Index 등재 + 선행 ADR 이 이 작업을 "후속 예정"으로 가리켰으면 정정 | 해당 영역 ADR-NNN 역참조 한 줄 | (사용자 facing 시) | (사용자 흐름 변경 시) | (스키마 결정 시) | 사용 예 (해당 명령) | 시나리오 (해당 명령) |
| 캐시 schema / TTL 변경 | 캐시 규약 행 | ADR 갱신 (ADR-004/007/010) | utils/cache 섹션 | — | — | 캐시 디렉터리 + 스키마 본문 | — | — |
| 새 API 호출 패턴 (재시도/리다이렉트 등) | — | 정책 결정 ADR (예: ADR-015, ADR-019) | api/ 섹션 + ADR-NNN 역참조 | — | — | — | — | — |
| 기존 resolver 입력 형식 확대 | 주의사항 resolver 설명 1줄 갱신 | — | resolver 주석 1줄 갱신 | — | 사용 예 (자동 분기 시나리오) | — | 사용 예 (해당 명령) | 빠른 참조 표 + 관련 시나리오 |
| 기존 type 의 필드 시그니처 변경 | 주의사항의 관련 동작 1줄 (영향 있을 때) | (ADR 가치 있을 때) | resolver/cache 줄에 동작 변경 1줄 | — | — | interface 정의 정정 (필수) + TTL/예시 동기화 | 사용 예 (영향 명령) | 시나리오 (영향 시) |
| 자격증명/인증 모델 위치 변경 | 인증 모델 표 갱신 (서비스별 비밀·헤더) | 결정 ADR (예: ADR-004) | config/ 섹션 (해당 시) | — | 인증 흐름 섹션 정정 (필수) | 스키마 위치 정정 (필수) | 설정 안내 (해당 시) | 저장 구조 예시 (해당 시) |
| 의존성 추가 / 빌드 설정 | 빌드 명령 (해당 시) | ADR 작성 전 점검 후 ADR | 기술 스택 표 | — | — | — | — | — |

**갱신 시점 분리**: planning 결정 docs(`docs/adr/`·`code-architecture.md`·`AGENTS.md`·`data-schema.md`·`flow.md`·`prd.md`)는 **task 생성 전 즉시 반영 + commit**.
`README.md`·`skills/nhncloud-cli/SKILL.md`·`skills/nhncloud-cli/references/*.md`(사용자 가이드)는 코드 산출물에 의존하므로 **마지막 phase(N-1)**에서 갱신한다.
planning 결정 docs 를 phase 안에서 고치면 critic REVISE 또는 docs-verifier VIOLATION 사유.

### ADR 작성 전 점검 (필수 자문)

아래 3개에 **모두 NO** 여야 ADR 로 기록한다. 하나라도 YES 면 대안 채널(`AGENTS.md` 규칙 / 코드 주석 / 커밋 메시지 / 다른 docs)로 내려보낸다.

1. `package.json`·lockfile·`tsup.config`·`src/api/types.ts`·디렉터리 트리 중 어느 하나를 보면 같은 정보를 얻는가?
2. "왜 X 를 선택했다"를 1~2 문장 이상으로 설명하기 어려운가?
3. 다른 프로젝트에서도 일반적으로 하는 선택인가?

**유지 적격**(3개 모두 NO):

- 라이브러리 고유 함정(ky retry 정책 등)
- 실험 결과(cold·warm 벤치마크)
- 대안 기각 근거
- 정책·규칙
- 비용·성능 트레이드오프

**ADR 구조**: `## ADR-NNN: {제목}` → **결정** → **맥락** → **대안 기각** → (선택) **트레이드오프**/**적용 범위**.

**금지**: 코드 블록 10줄 이상(1~3줄 식별자 예시만 허용) / 파일 경로 3개 이상 나열 / "변경 항목 1/2/3/4" 작업 내역 / `AGENTS.md` 스택 규칙 반복.

### 문서 책임 표 (단일 소스 + 역참조)

신규 내용 작성 전 "이 정보의 단일 소스는 어디인가" 확인한다. 다른 문서에는 **링크 또는 한 줄 참조**만 남긴다.

| 내용 유형 | 단일 소스 | 역참조 / 링크해야 할 곳 |
|---|---|---|
| 명령 동작 / 옵션 / 주의사항 | `AGENTS.md` 주의사항 표 | `README.md`(사용 예만), `skills/nhncloud-cli/SKILL.md` router + `references/*.md`(자동화 시나리오) |
| 디렉터리 구조 / 레이어 | `docs/code-architecture.md` | `AGENTS.md`(요약 한 블록) |
| 기술 결정 근거 (왜) | `docs/adr/`(해당 ADR 파일) | `AGENTS.md` ADR 참조 표, `docs/code-architecture.md` 해당 영역 ADR-NNN 한 줄 |
| 캐시 / 파일 레이아웃 | `docs/adr/`(해당 ADR 파일) | `AGENTS.md` 캐시 규약 행 |
| API 호출 패턴 / 엔드포인트 함정 | `docs/adr/`(해당 ADR 파일) | `docs/code-architecture.md` api/ 섹션 |
| DB / 데이터 스키마 | `docs/data-schema.md` | `docs/adr/`(스키마 결정 ADR 파일) |
| 사용자 흐름 / 시나리오 | `docs/flow.md` | `docs/prd.md`(기능 → 흐름 매핑) |

**역참조 규칙 (필수)**: 새 ADR 추가 시, 해당 영역의 `docs/code-architecture.md` 또는 `AGENTS.md` ADR 참조 표 **둘 중 한 곳**에 ADR-NNN 한 줄 추가.

## 검증

- **critic/code-review 회피 패턴**: task 파일 제출 전 아래 경로를 self-check 한다.
  - `docs/pitfalls/plan/` — critic 의 plan 평가 회피
  - `docs/pitfalls/team/` — team 협업 회피
  - `docs/pitfalls/code-review/` — code-reviewer 의 코드 검사 회피
  - self-check 는 `docs/pitfalls/INDEX.md` 라우터로 변경 유형에 맞는 카테고리 파일을 선택
- **docs-verifier 흡수 원칙**: `nhncloud-cli-docs-verifier`(`.claude/agents/nhncloud-cli-docs-verifier.md` / `.codex/agents/nhncloud-cli-docs-verifier.toml`)의 반복 지적은
  별도 회고 docs 를 신설하지 않는다.
  - 위 "변경 유형별 docs 영향 표"에 행 추가/보강으로 흡수한다.
  - `nhncloud-cli-docs-verifier` agent 본문(4절)이 이 표를 거울처럼 참조한다 — 별도 체크리스트를 두지 않는다.
    표 수정 시 agent 본문도 자연스럽게 커버되는지 확인한다.
  - 새 반복 지적 발생 시 절차는 `.agents/skills/_shared/retros/docs-verifier-retro.md` 참조.
- **개인 식별 정보 / 사내 식별자 노출 금지 (public OSS — 필수)**: 이 repo 는 GitHub·npm(`@bifos/nhncloud-cli`) 양쪽 모두 public 이다.
  `README.md`/`skills/`/`docs/`/`AGENTS.md`/`CLAUDE.md`/이슈 본문/`src/`(테스트 fixture·에러 메시지 예시 포함) 어디에도
  실제 UAK·appkey·tenantId·사내 도메인·사내 이메일·실명을 노출하지 않는다.
  상세 대체표는 `AGENTS.md` "개인 식별 정보 / 사내 식별자 노출 금지" 섹션 참조.

```bash
# cwd: <repo root>
# 1) 공개 도메인 화이트리스트 밖의 URL/이메일 도메인 (사내 도메인 가능성)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"
# 0건이어야 함

# 2) 실제 비밀 형태 (placeholder <...> 제외)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
# 0건이어야 함
```

- 코어 `verify-task.sh` 5 패턴에 추가로 위 두 grep 도 task 제출 전 self-check 대상.

## plan 네이밍

**형식**: `tasks/{NNN}-{task-name}/` — 코어 기본값(`plan{N}-{slug}`)과 다르다. `plan` 접두어를 붙이지 않는다.

- `NNN` = 3자리 zero-padded 순차 번호. Issue 연결은 폴더명이 아니라 `index.json`의 `description` 필드에 남긴다.
- `task-name` = 케밥 케이스 간결 요약. `index.json`의 `name` 필드는 폴더명과 **동일**하게 설정.

### 번호 충돌 방지 (필수)

```bash
# cwd: <repo root>
ls tasks/ | grep -E "^[0-9]{3}-" | sort
gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.headRefName) \(.title)"'
```

다음 가용 번호(가장 큰 번호 + 1) 사용. 번호 없는 레거시 폴더는 count 에서 제외(소급 rename 금지).

### 서브넘버 규칙

동일 도메인 확장/동일 패턴 복제 후속 작업은 같은 번호에 서브넘버를 붙인다
(예: `036-feat-ncs-foundation-read` → `036-2-feat-ncs-write-control` → `036-3-feat-ncs-create-malware`).
서로 다른 도메인/독립 실행 가능이면 별도 번호.

### index.json 스키마 (레포 특화)

아래 필드가 필수다. 코어 예시(`related_docs`/`depends_on`)와 다른 점:

- task 레벨 — `updated_at`/`current_phase`/`error_message`/`blocked_reason` 필수
- phase 레벨 — `allowedTools` 필수 (`model` 은 선택)

```jsonc
{
  "name": "{NNN}-{task-name}",          // 디렉터리명과 일치
  "description": "무엇을 구현하는 task인지 한 줄 설명",
  "created_at": "2026-07-14T00:00:00Z",  // ISO 8601
  "updated_at": "2026-07-14T00:00:00Z",  // 실행 중 갱신
  "status": "pending",                   // pending | running | completed | failed | blocked
  "current_phase": 0,                    // 0 = 미시작
  "total_phases": 3,                     // phases 배열 길이와 일치
  "error_message": null,
  "blocked_reason": null,
  "phases": [
    {
      "number": 1,                       // 1부터 순차 증가
      "title": "phase 제목",
      "file": "phase-01.md",
      "status": "pending",
      "allowedTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "model": "sonnet"                  // (선택) haiku | sonnet | opus
    }
  ]
}
```

검증 체크리스트:

- `total_phases` == `phases` 배열 길이
- 모든 phase 에 `number`·`title`·`file`·`status`·`allowedTools` 존재
- `number` 가 1부터 순차 증가
- 각 `file` 이 실제 존재

### 마지막 2 phase 표준 (필수)

모든 task 의 마지막 2개 phase 는 아래 구조를 따른다.

| Phase | 제목 | 모델 | 내용 |
|---|---|---|---|
| N-1 | 빌드 검증 + 테스트 + 사용자 가이드 docs 갱신 | `haiku` | `pnpm build`, 금지사항 grep, `README.md` + `skills/nhncloud-cli/SKILL.md` + `skills/nhncloud-cli/references/*.md` 갱신 (위 docs 영향 표의 해당 행 따라) |
| N | 커밋 + push | `haiku` | 변경 파일 `git add` → `git commit` → `git push`. task 파일도 포함. |

**커밋 phase 규칙**:

- `git status --porcelain`으로 전체 목록 확인
- task 관련 파일(암묵적 의존성 포함)만 `git add`(`git add -A` 금지)
- 무관 변경은 로그에 명시하고 제외
- 커밋 메시지 `feat/fix/chore(scope): 설명`
- push 실패 시 `PHASE_BLOCKED: push 실패 — 원격 변경사항 확인 필요`

## branch / 커밋 / 핸드오프

- **docs-first**: docs 갱신 커밋(`docs(scope): ...`) → push → task 파일 커밋 → push → task 실행. `AGENTS.md` "planning / 구현 워크플로우" 절 참조.
- **branch prefix**: `{category}/{NNN}-{task-name}` 형태.
  - 관측된 category — `feat`(신규 기능·확장), `fix`(버그 수정), `refactor`(구조 개선)
  - task 폴더명 접두(`feat-`/`fix-`/`refactor-`/`maintenance-`/`debug-` 등)와 branch category 가 항상 1:1은 아니다
    - 과거 `maintenance-` 접두 폴더도 `feat/` branch 로 진행된 사례가 있다
  - 신규 task 는 폴더명 접두와 branch category 를 일치시키는 쪽을 기본으로 하되, 예외가 필요하면 이유를 커밋 로그에 남긴다
- **PR 제목 형식**: `type(scope): description` (예: `chore(task): add 040 volume list /volumes/detail 전환`).
- **핸드오프**: `/build-with-teams` 로 안내한다 (`tasks/{NNN}-{task-name}` 디렉터리를 인자로 받는다) — Agent Teams 가시적 협업 (team-lead·critic·executor·docs-verifier).
