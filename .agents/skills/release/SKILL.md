---
name: release
description: "nhncloud-cli 새 버전을 main 에서 태그, GitHub Release, npm 배포까지 릴리스한다. /release, 릴리스, 버전 범프, npm publish, 새 버전 배포 같은 요청이면 스킬 이름을 말하지 않아도 이 스킬을 쓴다."
---

# /release로 nhncloud-cli 릴리스

**목표: 직전 태그 이후 main 의 변경을 검증하고, 새 버전의 태그와 한국어 GitHub Release 를 만든 뒤 사용자가 npm 게시를 마칠 수 있게 한다.**

- 입력은 새 semver 버전과, 직전 태그 이후의 커밋·머지된 PR·닫힌 이슈다.
- 산출은 bump 커밋, `v$VERSION` 태그, GitHub Release, 사용자에게 안내한 `npm publish` 명령이다.
- 어느 단계든 실패하면 그 자리에서 멈추고 사용자에게 보고한다.

## 워크플로우 개요

| 단계 | 이름 | 통과 조건 |
| --- | --- | --- |
| 1 | 사전 검증 | 현재 브랜치가 `main` 이고 `git status --porcelain` 이 비어 있으며 `node .agents/skills/release/scripts/preflight.mjs` 가 종료 코드 0 으로 끝난다 |
| 2 | 변경 분석 | 커밋·PR·닫힌 이슈 목록을 사용자에게 보였고, 아직 열린 이슈 중 이번에 닫을 것이 확정됐다 |
| 3 | 문서 동기화 | `node .agents/skills/release/scripts/doc-sync-check.mjs` 가 종료 코드 0 으로 끝난다 |
| 4 | 버전 범프 | bump 커밋이 `origin/main` 에 push 됐다 |
| 5 | 태그와 GitHub Release | 태그가 push 됐고 태그 run 이 success 이며 Release 가 만들어졌다 |
| 6 | npm 게시 | `node .agents/skills/release/scripts/verify-release.mjs $VERSION` 이 종료 코드 0 으로 끝난다 |
| 7 | 남은 이슈 처리 | 2단계에서 확정한 열린 이슈를 닫았다. 없으면 건너뛴다 |

아래 블록은 다음 변수를 전제로 한다. 1단계에서 한 번 채운다.

```bash
VERSION=                             # 새 버전을 넣는다. 예: 0.19.0
[ -n "$VERSION" ] || { echo "STOP: VERSION 이 비었다"; exit 1; }
TAG="v$VERSION"
NOTES="/tmp/release-$TAG-notes.md"
LAST_TAG=$(git describe --tags --abbrev=0)
LAST_TAG_DATE=$(git log -1 --format=%cI "$LAST_TAG")
```

## 1. 사전 검증

main 가드를 가장 먼저 둔다. 1·3단계의 보완 커밋도 main 에 쌓여야 하기 때문이다.

```bash
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: main 이 아니다"; exit 1; }
git pull --ff-only
git status --porcelain
```

- `git status --porcelain` 에 출력이 있으면 커밋할지 사용자에게 확인한다.
- 이어서 `node .agents/skills/release/scripts/preflight.mjs` 를 실행한다. `AGENTS.md` 의 검증 명령과 `node scripts/check-pii.mjs` 공개 정보 검사를 포함한다.
- 공개 정보 검사에 걸리면 위치를 보이고 `AGENTS.md` 「공개 저장소 정보 보호」 절의 placeholder 로 바꾼 보완 커밋을 만든 뒤 다시 실행한다.
- 사용자가 내부 값 사용에 명시적으로 동의하지 않으면 릴리스를 멈춘다.

## 2. 변경 분석

```bash
git log --oneline "$LAST_TAG"..HEAD
gh pr list --state merged --search "merged:>=$LAST_TAG_DATE" --json number,title --jq '.[] | "#\(.number) \(.title)"'
gh issue list --state closed --search "closed:>=$LAST_TAG_DATE" --json number,title --jq '.[] | "#\(.number) \(.title)"'
gh issue list --state open --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

- 커밋을 새 명령, 새 옵션, 수정, 리팩터링, 문서와 인프라로 나눠 사용자에게 보인다.
- 이슈는 대부분 PR 본문의 `Closes #N` 으로 머지 때 이미 닫힌다. 닫힌 이슈 목록을 Release 노트에 그대로 적는다.
- 열린 이슈 중 이번 변경으로 해결된 것이 있으면 사용자와 닫을 목록을 확정한다.
  후속 작업이 남았거나 이슈 범위와 구현 범위가 일부만 맞으면 닫지 않고 진행 상황 댓글만 남긴다.
- `LAST_TAG_DATE` 와 같은 시각에 머지된 직전 릴리스 PR 이 목록에 섞일 수 있다. 커밋 목록과 대조해 뺀다.

## 3. 문서 동기화

`node .agents/skills/release/scripts/doc-sync-check.mjs` 를 실행한다.
종료 코드가 1 이면 출력된 대상의 보완 커밋을 만든 뒤 다시 실행한다.

| 위치 | 확인할 것 |
| --- | --- |
| `README.md` | 「에이전트 없이 직접 쓰기」 목록에 새 명령이 있고, 새 서비스면 「할 수 있는 일」 표에 행이 있다 |
| `skills/nhncloud-cli/references/*.md` | 해당 서비스 reference 에 새 명령과 옵션이 있다 |

- 빠졌으면 무엇을 어디에 넣을지 제안하고 보완 커밋을 따로 만든다.
- 사용자가 건너뛰기에 명시적으로 동의했을 때만 보완 없이 진행한다.
- 새 명령이나 옵션이 없는 릴리스면 그 사실을 알리고 이 단계를 통과한다.
- 변수로 이름을 넘기는 팩토리와 흔한 이름의 옵션은 스크립트가 거르지 못한다. 이런 명령은 2단계 목록에서 직접 찾아 문서에 있는지 확인한다.

## 4. 버전 범프

`package.json` 의 `version` 만 `$VERSION` 으로 바꾼다. CLI 버전은 빌드 때 그 값에서 주입된다.

```bash
pnpm run build
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: main 이 아니다"; exit 1; }
git add package.json
git commit -m "chore: bump version to $TAG"
git push origin main
```

## 5. 태그와 GitHub Release

```bash
git tag -a "$TAG" -m "$TAG"
git push origin "$TAG"
```

태그를 push 한 뒤 태그 워크플로를 기다린다. `gh release create` 는 태그 run 이 success 일 때만 실행한다.

```bash
RUN_ID=
for _ in $(seq 12); do
  RUN_ID=$(gh run list --workflow release.yml --branch "$TAG" --limit 1 --json databaseId -q '.[0].databaseId // empty')
  [ -n "$RUN_ID" ] && break
  sleep 10
done
[ -n "$RUN_ID" ] || { echo "STOP: 태그 run 이 2분 안에 시작되지 않았다"; exit 1; }
gh run watch "$RUN_ID" --exit-status
```

- run 이 아직 없으면 10초 간격으로 최대 2분(12회) 다시 조회하고, 그래도 없으면 사용자에게 보고한다.
- run 이 실패하면 npm 게시 단계로 가지 않고 사용자에게 보고한다. 이미 push 한 태그는 그대로 두고(force 로 갱신하지 않는다) 원인을 고친 뒤 새 패치 버전으로 다시 릴리스한다.

Release 노트는 2단계 결과로 `$NOTES` 파일에 한국어로 쓴다.
CLI 명령, 경로, 패키지 이름, API 필드, `Closes`, 전체 변경 URL 은 원문을 유지한다.

- 반드시 넣는 절: 주요 변경, `Closes`(닫힌 이슈 목록. 없으면 없다고 적는다), 전체 변경 링크
- 필요하면 넣는 절: 새 명령, 새 옵션, 수정, 검증, 깨는 변경, 후속으로 남긴 것

```bash
gh release create "$TAG" --title "$TAG: 요약" --notes-file "$NOTES"
```

- 본문은 `--notes-file` 로만 넘긴다. 인라인 `--notes` 에 `` \` `` 나 `\$` 를 넣으면 백슬래시가 본문에 그대로 남는다.
- `--generate-notes` 는 쓰지 않는다. 닫힌 이슈 목록이 빠진다.

## 6. npm 게시

계정의 2단계 인증 때문에 사용자가 직접 게시해야 한다.
게시 경로와 절차는 [references/publish.md](references/publish.md) 를 읽고 수행한다.

```bash
node .agents/skills/release/scripts/verify-release.mjs "$VERSION"
```

- 종료 코드 0 이면 통과다. registry 반영 대기와 Release 본문 점검을 이 스크립트가 맡는다.
- 사용자의 완료 알림만으로 7단계로 가지 않는다.
- Release 본문에 백슬래시 잔재가 있어 실패했으면 `$NOTES` 파일을 고쳐 `gh release edit "$TAG" --notes-file "$NOTES"` 로 다시 올린 뒤 스크립트를 다시 실행한다.
- Release 페이지는 `https://github.com/jon890/nhncloud-cli/releases/tag/$TAG` 에서 확인한다.

## 7. 남은 이슈 처리

2단계에서 닫기로 확정한 열린 이슈가 있을 때만 수행한다. npm 게시가 실패했으면 닫지 않는다.

```bash
ISSUES="101 102"                     # 2단계에서 확정한 번호
for n in $ISSUES; do
  gh issue close "$n" --comment "$TAG 에서 해결되어 닫습니다. https://github.com/jon890/nhncloud-cli/releases/tag/$TAG"
done
```

이전 태그는 force 로 갱신하지 않는다. 새 태그만 만든다.
