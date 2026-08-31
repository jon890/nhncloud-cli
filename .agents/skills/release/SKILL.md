---
name: release
description: "nhncloud-cli 새 버전 릴리스 자동화: 빌드 검증, 버전 범프, git tag, GitHub Release, npm publish, 해결된 이슈 자동 close 순으로 진행. /release, 릴리스, 버전 범프, npm publish, 새 버전 배포 같은 요청 시 반드시 이 스킬 사용."
---

# /release로 nhncloud-cli 릴리스

nhncloud-cli의 새 버전을 릴리스한다.

## 사용법

```
/release <version> [--notes "릴리스 노트"]
```

- `<version>`: semver 버전 (예: `0.4.0`, `0.3.2`)
- `--notes`: 릴리스 노트 (생략 시 git log에서 자동 생성)

## 릴리스 절차

아래 단계를 **순서대로** 실행한다. 각 단계 실패 시 즉시 중단하고 사용자에게 보고한다.

### 1. 사전 검증

```bash
# 작업 디렉토리가 clean한지 확인
git status --porcelain

# 빌드 성공 확인
pnpm run build
```

- uncommitted 변경이 있으면 먼저 커밋 여부를 사용자에게 확인
- 빌드 실패 시 중단

### 2. 이전 버전 대비 변경사항 분석

이전 태그 이후 커밋을 모아 사용자에게 변경 요약을 제시한다.

```bash
# 직전 태그 식별
LAST_TAG=$(git describe --tags --abbrev=0)
LAST_TAG_DATE=$(git log -1 --format=%cs "$LAST_TAG")

# 커밋 목록
git log --oneline ${LAST_TAG}..HEAD

# 분류용 (feat/fix/refactor/docs/chore)
git log ${LAST_TAG}..HEAD --pretty=format:"%s" | sort
```

다음을 도출:
- **신규 명령** (`feat(commands)` 등): 사용자에게 노출되는 새 명령/서브커맨드
- **신규 옵션** (`feat(...)` 메시지에 `--xxx` 등장): 기존 명령에 추가된 플래그
- **버그 수정** / **리팩토링** / **문서/인프라**

추가로 **해결된 GitHub 이슈**를 식별:

```bash
# 열린 이슈 목록
gh issue list --state open --json number,title --jq '.[] | "#\(.number)  \(.title)"'

# 커밋 메시지와 PR 본문에서 "Issue #N" 또는 "#N" 참조 추출
git log ${LAST_TAG}..HEAD --grep="#[0-9]" --oneline
gh pr list --state merged --search "merged:>=${LAST_TAG_DATE}" \
  --json number,title,body --jq '.[] | [.number, .title, .body] | @tsv'
```

같은 날짜의 이전 릴리스 PR도 후보에 들어올 수 있으므로 `${LAST_TAG}..HEAD` 커밋과 대조해 제외한다.

각 열린 이슈에 대해 "이번 릴리스로 해결되었는가?" 판단:
- 이슈 제목/본문 ↔ 이번 릴리스의 신규 명령/옵션 매핑
- 후속 이슈(`feat(... ) follow-up`)는 release 시점에 close하지 않음: 별도 task가 필요

**결과를 사용자에게 제시**하고 close 대상 이슈 목록을 확정. 이 목록은:
- GitHub Release 노트 하단에 `Closes #N, #M` 으로 기록
- Step 10에서 release publish 후 자동 close

이 결과는 다음 단계(문서 동기화 검증)와 GitHub Release 노트에 그대로 활용한다.

### 3. 문서 동기화 검증 (README + nhncloud-cli 스킬)

위에서 식별된 **신규 명령/옵션이 있다면**, 다음 두 위치에 반영되었는지 확인한다.

```bash
# 신규 명령/옵션 키워드를 README.md / 공개 skill router + references에서 grep
grep -nE "<신규 옵션|신규 명령>" README.md
grep -nE "<신규 옵션|신규 명령>" skills/nhncloud-cli/SKILL.md skills/nhncloud-cli/references/*.md
```

**검증 기준**:

| 위치 | 무엇을 확인 |
|---|---|
| `README.md` | "사용 예" 섹션에 신규 명령/옵션이 등장. 새 명령은 적절한 카테고리(### 배포(Deploy) / ### 인스턴스(Instance) / ### 로그 검색 등)에 추가 |
| `skills/nhncloud-cli/SKILL.md`와 `skills/nhncloud-cli/references/*.md` | AI 에이전트가 사용하는 공개 스킬 router와 서비스별 reference. 신규 명령/옵션이 적절한 reference에 반영되어야 함 |

**누락 발견 시**:
- 사용자에게 누락 항목을 보고하고, 어느 위치에 어떤 문장으로 추가할지 제안
- 보완 commit을 별도로 작성한 후 다음 단계 진행 (`docs(readme): document <feature>` 또는 `docs(skill): add <feature> to nhncloud-cli references`)
- 보완을 건너뛰면 사용자가 명시적으로 동의했을 때만 (예: "이번 릴리스는 인프라만, 기능 추가 없음")

**버그 수정이나 리팩토링만 있는 릴리스**라면 본 단계를 통과할 수 있다. 사용자에게 그 사실을 알리고 진행한다.

### 4. 공개 저장소 정보 보호 검증 (필수, 실패 시 중단)

`AGENTS.md` "공개 저장소 정보 보호" 섹션의 검증 grep 두 명령을 모두 실행한다.
grep 패턴 정의는 거기에서 단일 소스로 관리한다. 본 skill은 실행 시점과 후속 처리만 정의한다.

**히트가 있으면**:
- 사용자에게 즉시 보고하고 위치를 보여준다.
- AGENTS.md의 placeholder 가이드(`<tenant-id>`, `<instance-id>`, `<network-uuid>` 등)나 dummy 패턴으로 교체한 뒤 보완 commit
- 보완 commit 후 grep 재실행 → 0건 확인 후 다음 단계 진행
- **사용자가 "내부 사용 OK" 로 명시 동의하지 않는 한 release 차단**

### 5. 버전 범프

**사전 가드 (필수)**: 현재 branch가 `main`인지 확인한다. PR branch에서 bump하면 commit이 다른 branch에 남고 tag가 엉뚱한 commit을 가리킨다.

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ]; then
  echo "⚠  현재 branch: $CURRENT: main 으로 switch 필요"
  git switch main && git pull --ff-only
fi
```

버전 변경:

- `package.json`의 `version` 필드를 `<version>`으로 변경
- `src/index.ts`의 `.version("x.y.z")`를 `<version>`으로 변경
- 변경 후 다시 `pnpm run build`로 빌드 검증

### 6. 커밋 & 푸시

```bash
# 커밋 직전 branch 재확인 (위 가드와 중복이지만 자기 방어)
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: not on main"; exit 1; }

git add package.json src/index.ts
git commit -m "chore: bump version to v<version>"
git push origin main
```

**실수로 PR branch에 bump commit을 넣었을 때 복구**:
- 해당 commit 이 main 의 linear 자식이면 (대부분의 경우): `git switch main && git merge <bump-sha> --ff-only && git push origin main`. force-push 불요
- linear 아니면 `cherry-pick` 후 PR branch 의 commit 정리

### 7. Git Tag & GitHub Release

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

릴리스 노트는 **2단계 분석 결과를 그대로 활용**해 작성한다.

**언어 원칙**: AGENTS.md "한국어 표현 정책 / 마크다운 가독성"을 따른다.
GitHub Release 노트도 사용자-facing 문서이므로 한국어로 작성한다.
CLI 명령, 파일 경로, package 이름, API 필드, `Closes`, `Full Changelog` URL 같은 기계 계약 토큰은 원문을 유지한다.

권장 섹션:
- 주요 변경
- 새 명령
- 새 옵션
- 수정
- 문서
- Closes
- 전체 변경

**전달 방식은 `--notes-file <path>`가 필수다.** 인라인 `--notes "..."`와 quoted heredoc은 쓰지 않는다.

```bash
# 1. 임시 파일에 본문 작성 (Write 도구 / cat / EDITOR 어느 쪽이든 OK)
#    → /tmp/release-v<version>-notes.md

# 2. 파일 경로로 전달
gh release create v<version> --title "v<version>: <요약>" --notes-file /tmp/release-v<version>-notes.md
```

**Why**:

- quoted heredoc (`<<'EOF'`) 안에서는 `` ` ``·`$`·`\` 모두 이미 비활성화 → escape 불요
- 그런데 "안전하게" `` \` ``이나 `\$`를 넣으면 backslash가 리터럴로 본문에 남아 Markdown이 깨진다.
- `--notes-file`은 파일 경로를 전달하므로 shell quoting과 escape 함정을 피한다.

**자가 점검**: release create나 edit 직후 실행한다.

```bash
gh release view v<version> --json body -q .body | tr -cd '\\' | wc -c
# 기대: 0 (backslash 잔재 없음)
```

0 이 아니면 `--notes-file` 로 즉시 `gh release edit v<version> --notes-file <path>` 재발행.

릴리스 노트 본문 마지막에 다음 섹션을 포함:

```markdown
## Closes

이번 릴리스로 해결된 이슈 (release publish 후 자동 close):
- #7 feat(instance): instance create --user-data 옵션
```

자동 생성으로 대체할 경우:
```bash
gh release create v<version> --title "v<version>" --generate-notes
```

### 8. npm Publish

npm publish는 2FA OTP가 필요하므로 사용자에게 직접 실행을 요청한다:

```
npm publish --access public --otp=<code>
```

사용자에게 위 명령을 안내하고, 완료 후 결과를 확인한다.

### 9. 최종 확인

- `https://github.com/jon890/nhncloud-cli/releases/tag/v<version>` 릴리스 확인
- `https://www.npmjs.com/package/@bifos/nhncloud-cli` 버전 확인 (반영에 수 분 소요)

### 10. 해결된 이슈 close

2단계에서 식별한 close 대상 이슈를 일괄 close. release publish 완료 후에만 실행 (publish 실패 시 close 금지).

```bash
RELEASE_URL="https://github.com/jon890/nhncloud-cli/releases/tag/v<version>"
for n in <이슈번호 목록>; do
  gh issue close $n --comment "v<version>에서 구현 완료되어 close합니다. ${RELEASE_URL}"
done
```

각 close에 release 링크 코멘트를 붙여 이슈에서 release notes로 바로 이동할 수 있게 한다.

**close 금지 케이스**:
- 후속 작업이 남은 이슈 (예: MVP만 구현되고 추가 옵션 후속)
- 이슈 본문 범위와 구현 범위가 부분적으로만 일치
→ 이런 사례는 close 대신 **comment**로 진행 상황만 기록하고 이슈를 open으로 유지한다.

## 주의사항

- **빌드 실패 시 릴리스하지 않는다**
- **README/스킬 문서 동기화 누락 시**: 사용자에게 보고하고 보완 commit 후 진행 (사용자가 명시적으로 건너뛰기를 동의하지 않는 한)
- **npm publish는 사용자가 직접 OTP를 입력해야 한다**
- 이전 태그를 force-update하지 않는다 (새 태그만 생성)
- **이슈 close는 publish 완료 후에만**: npm publish 실패하면 release는 미완성, close 보류
