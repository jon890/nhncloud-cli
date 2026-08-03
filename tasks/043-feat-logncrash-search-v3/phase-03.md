# Phase 03 — 빌드 검증·테스트·사용자 가이드 갱신

**Execution profile**: fast
**Status**: pending

---

## 목표

v3 전환의 타입·단위·bundle·command catalog 회귀를 검증한다.
사용자와 AI 에이전트가 appkey + 공통 UAK, 커서 검색, v3 scroll 호환 제한을 공개 문서만으로 사용할 수 있게 한다.

**범위 외**: 실제 NHN Cloud 자격증명을 사용한 호출, package 버전 변경, v2 fallback, BETA·ALPHA host 선택은 하지 않는다.

---

## 작업 항목 (4)

### 1. 사용자·AI 에이전트 문서

아래 공개 문서를 실제 도움말과 구현 계약에 맞춘다.

- `README.md`: configure appkey-only 예시, UAK OAuth 인증, `--cursor` 페이지 이동, `--page 0` 호환, export `--size` 경고·무시를 설명한다.
- `skills/nhncloud-cli/SKILL.md`: Log & Crash 설명에 Search v3와 커서 이동을 반영한다.
- `skills/nhncloud-cli/references/common.md`: credentials 예시와 configure 옵션을 appkey + 공통 UAK로 정정한다.
- `skills/nhncloud-cli/references/logncrash.md`: 검색·내보내기 경로, JSON `nextCursor`, 실패 복구, `send` 비영향을 설명한다.
- `skills/nhncloud-cli/references/troubleshooting.md`: 인증 표와 page·size 마이그레이션 오류를 정정한다.

실제 credential, 사용자 리소스 ID, 사내 도메인·이메일·실명 대신 placeholder를 쓴다.

### 2. 도움말과 command catalog 계약

빌드 결과에서 아래를 확인한다.

- command catalog 전체 항목 수는 기존 147개다.
- `logncrash search`는 `--cursor`, `--page`, `--size`, `--profile`을 제공한다.
- `logncrash export`는 기존 path와 옵션을 유지하되 `--size` 설명이 폐기 예정·미전달을 명시한다.
- `configure`는 `--logncrash-appkey`와 전환 호환 `--logncrash-secret`을 모두 인식한다.
- `logncrash send` path와 도움말은 변하지 않는다.
- 데이터는 stdout, spinner·경고·오류는 stderr에 유지한다.

### 3. 전체 정적 검증과 잔재 제거

타입 검사, 전체 테스트, bundle build를 순서대로 실행한다.
실패하면 변경 범위의 원인을 고치고 같은 검증을 다시 실행한다.

다음 잔재는 0건이어야 한다.

- source·사용자 문서의 v2 검색 경로와 `X-LNCS-SECRET`.
- v3 scroll의 1분 TTL 단정.
- logncrash secret이 검색에 필요하다는 설정 안내.
- export `--size`가 v3 요청 `pageSize`를 제어한다는 설명.

ADR-014의 과거 계약 설명은 이미 docs-first 커밋에서 v3 비교로 정정되어 있으므로 예외를 두지 않는다.

### 4. 상태 갱신

Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.
task 상태 파일은 Phase 4의 실행 기록 커밋까지 작업 트리에 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | v3 설정·검색·내보내기 예시 |
| `skills/nhncloud-cli/SKILL.md` | router와 frontmatter 설명 |
| `skills/nhncloud-cli/references/common.md` | appkey + UAK 설정 계약 |
| `skills/nhncloud-cli/references/logncrash.md` | v3 자동화 시나리오 |
| `skills/nhncloud-cli/references/troubleshooting.md` | 인증·호환 오류 해결 |
| `tasks/043-feat-logncrash-search-v3/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
set -e
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js logncrash search --help
node dist/index.js logncrash export --help
node dist/index.js logncrash send --help
node dist/index.js configure --help
node dist/index.js commands --json | jq -e '.commands | length == 147'
node dist/index.js commands --json | jq -e '
  [.commands[].path | select(startswith("logncrash"))] as $paths
  | ($paths | sort) == (["logncrash", "logncrash export", "logncrash search", "logncrash send"] | sort)
'
test "$(rg -n 'X-LNCS-SECRET|/api/v2/search|scrollKey 유효기간은 1분|scrollKey 1분 만료' \
  README.md skills docs AGENTS.md src || true)" = ""
test "$(rg -n 'NHNCLOUD_LOGNCRASH_SECRET|<secretkey>|appkey / secret|logncrash (search|scroll) 에는 secret|자격증명에 secret 이 없습니다' \
  README.md skills docs AGENTS.md src || true)" = ""
git diff --check
```

```bash
# cwd: <repo root>
set -e
domain_findings="$(
  grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" \
    README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
    | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com" \
    || true
)"
secret_findings="$(
  grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" \
    README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
    || true
)"
test -z "$domain_findings"
test -z "$secret_findings"
```

성공 기준:

- 타입 검사, 전체 테스트, build, 네 도움말, catalog 검증, `git diff --check`가 종료 코드 0이다.
- command catalog는 147개이고 `logncrash` 아래 기존 4개 path 집합이 같다.
- v2 검색 인증·경로·TTL 단정 잔재와 개인 식별 정보 검사 출력이 0줄이다.
- 실제 NHN Cloud API 호출은 0회다.

## Blocked 조건

- command catalog path가 늘거나 줄면 `PHASE_BLOCKED: Log & Crash command catalog 회귀 조사 필요`를 보고한다.
- 도움말과 공개 문서의 deprecated 옵션 동작이 실제 코드와 다르면 문서만 통과시키지 않는다.
- 전체 테스트 실패가 범위 밖 기존 회귀라면 원본 로그와 실패 테스트를 보존해 leader에게 보고한다.
