# Phase 02 — 공개 docs (README + SKILL) 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 공개 docs 두 곳에 바이너리 조회 사용 예를 반영한다.
이 두 문서는 코드 산출물(실제 옵션/출력)에 의존하므로 **마지막 phase 에서** 갱신한다 (planning SKILL 갱신 시점 분리 원칙).

핵심 메시지: "`binary-groups` 로 그룹 `key` 를 확인한 뒤 그 key 를 `binaries --binary-group <key>` 에 넣는다" 는 연쇄 사용법을 사용 예에 명시한다.

## 변경 파일 (3개)

1. `README.md` — deploy 사용 예 블록에 binary-groups / binaries 추가.
2. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + 시나리오 반영.
3. `tasks/011-feat-deploy-binaries/index.json` — status `completed` + phase 상태 갱신.

## 작업 상세

### 1. `README.md`

deploy 사용 예 코드블록에서 `nhncloud deploy histories ...` 예시 **다음** 에 추가:

````
# 바이너리 그룹 목록 — 그룹 key 확인
nhncloud deploy binary-groups <target>

# 위에서 확인한 key 로 바이너리 목록 조회
nhncloud deploy binaries <target> --binary-group <key>

# 업로드 최신순 정렬 + 전체 필드는 --json
nhncloud deploy binaries <target> --binary-group <key> --sort-key UPLOAD_DATE --sort-direction DESC --json
````

> 실제 appKey·artifactId·그룹 key 등 식별자는 박지 말 것 — `<target>` / `<key>` placeholder 만 사용 (CLAUDE.md 개인 식별 정보 정책).

### 2. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표에서 "배포 이력 조회" (`deploy histories`) 행 **다음** 에 추가:

```
| 바이너리 그룹 목록 | `nhncloud deploy binary-groups <target>` |
| 바이너리 목록 | `nhncloud deploy binaries <target> --binary-group <key>` (전체 필드는 `--json`) |
```

(b) deploy 섹션에 사용 안내 문단을 한 곳 추가 (에이전트가 자연어→명령 변환 시 참고):

```
### deploy 바이너리 조회

- `nhncloud deploy binary-groups <target>` — 아티팩트의 바이너리 그룹 목록. 출력의 key 를 binaries 입력으로 쓴다.
- `nhncloud deploy binaries <target> --binary-group <key>` — 해당 그룹의 바이너리 목록 (version·binaryName·size(bytes)·uploadDate·uploader). `--binary-group` 은 필수다.
- 정렬은 `--sort-key UPLOAD_DATE --sort-direction DESC`, 페이지는 `--page-num` / `--page-size`. size 는 bytes 정수이며 KB/MB 변환 없이 원시값 출력 — 정밀값은 `--json`.
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. README 에 두 명령 예시 반영
grep -c "deploy binary-groups" README.md
# 기대: 1 이상
grep -c "deploy binaries" README.md
# 기대: 1 이상

# 2. README 에 연쇄 사용 (--binary-group <key>) 포함
grep -c -- "--binary-group <key>" README.md
# 기대: 1 이상

# 3. SKILL 빠른 참조 표에 두 행
grep -Ec "deploy binary-groups|deploy binaries" skills/nhncloud-cli/SKILL.md
# 기대: 2 이상

# 4. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 5. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ 2>/dev/null
# 기대: 0건

# 6. index.json 완료 마킹
grep -c '"status": "completed"' tasks/011-feat-deploy-binaries/index.json
# 기대: 3  (task 1 + phase 2)
```

## index.json 완료 마킹

phase-01·02 완료 후:

- 최상위 `"status": "pending"` → `"completed"`.
- `"current_phase": 1` → `2`.
- `phases[0].status` / `phases[1].status` 각각 `"pending"` → `"completed"`.
- `"updated_at"` 을 완료 시각으로 갱신.

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# profile + deploy target 설정 후 실제 흐름 검증
node dist/index.js deploy binary-groups <target>          # key 확인
node dist/index.js deploy binaries <target> --binary-group <key>
node dist/index.js deploy binaries <target> --binary-group <key> --sort-key UPLOAD_DATE --sort-direction DESC --json | head
```
