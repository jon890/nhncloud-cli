# Phase 02 — 공개 docs (README + SKILL) 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 공개 docs 두 곳에 `instance flavors` 사용 예를 반영한다.
이 두 문서는 코드 산출물(실제 옵션/출력)에 의존하므로 **마지막 phase 에서** 갱신한다(planning SKILL 갱신 시점 분리 원칙).

핵심: "테이블은 핵심 5컬럼만 보여주고, **나머지 필드는 `--json` 으로 본다**" 를 사용 예에 명시한다(사용자 요청).

## 변경 파일 (3개)

1. `README.md` — instance 사용 예 블록에 flavors 추가
2. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + 옵션/시나리오 반영
3. `tasks/007-feat-instance-flavors/index.json` — status `completed` + current_phase 갱신

## 작업 상세

### 1. `README.md`

instance 사용 예 코드블록에서 `# 단일 인스턴스 상태 조회` **앞** (즉 `nhncloud instance list` 다음) 에 flavors 예시를 추가:

````
# 인스턴스 타입(flavor) 목록 — id·name 만
nhncloud instance flavors

# 타입 상세 — vcpus·ram·disk 포함 (테이블은 핵심 5컬럼)
nhncloud instance flavors --detail

# 전체 필드(is_public·extra_specs 등)는 --json 으로
nhncloud instance flavors --detail --json

# RAM 8GB 이상 타입만 필터
nhncloud instance flavors --detail --min-ram 8192
````

### 2. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표(`| 인스턴스 목록 조회 | ... |` 행이 있는 표)에서 "인스턴스 목록 조회" 행 **다음** 에 추가:

```
| 인스턴스 타입(flavor) 목록 | `nhncloud instance flavors` |
| 인스턴스 타입 상세 (스펙 포함) | `nhncloud instance flavors --detail` (전체 필드는 `--json`) |
```

(b) instance 섹션에 flavors 사용 안내 문단/시나리오를 한 곳 추가(에이전트가 자연어→명령 변환 시 참고). 예시 위치는 "instance create 옵션" 섹션 인접:

```
### instance flavors 조회

- `nhncloud instance flavors` — 인스턴스 타입 id·name 목록. create 의 `--flavor` 에 넣을 id 를 고를 때.
- `--detail` 로 vcpus·ram(MB)·disk(GB) 스펙을 본다. 테이블은 핵심 5컬럼이며, is_public·extra_specs 등 나머지 필드는 `--json` 으로 확인한다.
- `--min-disk <gb>` / `--min-ram <mb>` 로 조건에 맞는 타입만 필터한다.
```

> SKILL.md 는 공개 OSS — 실제 flavor id·tenant 등 식별자를 박지 말 것. placeholder(`<flavor-id>` 등)만 사용(CLAUDE.md 개인 식별 정보 정책).

### 3. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

그리고 phases[0].status, phases[1].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: /Users/nhn/personal/nhncloud-cli

# 1. README 에 flavors 예시 반영
grep -c "instance flavors" README.md
# 기대: 3 이상

# 2. README 에 --json 안내 포함 (나머지 필드는 --json)
grep -c "instance flavors --detail --json" README.md
# 기대: 1

# 3. SKILL 빠른 참조 표에 flavors 행
grep -c "instance flavors" skills/nhncloud-cli/SKILL.md
# 기대: 2 이상

# 4. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 5. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ 2>/dev/null
# 기대: 0건

# 6. index.json 완료 마킹
grep -c '"status": "completed"' tasks/007-feat-instance-flavors/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# 실제 flavor 목록 (profile 설정 후)
node dist/index.js instance flavors
node dist/index.js instance flavors --detail
node dist/index.js instance flavors --detail --json | head
```
