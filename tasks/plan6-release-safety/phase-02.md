# Phase 02. 공개 정보 검사를 스크립트로 만들고 CI 에서 강제한다

**Execution profile**: standard

## 목표

`AGENTS.md` 「공개 저장소 정보 보호」 절이 사람에게 실행하라고 적어 둔 grep 두 줄을 `scripts/check-pii.mjs` 로 옮기고, CI 가 매 PR 과 main push 에서 실행하게 한다.
공개 저장소라 사내 도메인이나 비밀값은 한 번 새면 되돌릴 수 없는데, 지금은 사람이 실행하지 않으면 아무것도 막지 않는다.

**범위 외**: 정책(무엇을 노출하면 안 되는가, 대체 표기 표)은 `AGENTS.md` 에 그대로 둔다. 릴리스 스킬 문서 수정과 릴리스 워크플로는 별도 계획이다. pnpm 고정은 phase 03 이다.

## 컨텍스트

지금 검사는 `AGENTS.md` 「공개 저장소 정보 보호」 절 끝의 bash 블록이다.

- 도메인 grep: `(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)` 를 뽑고 `nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com` 를 **부분 문자열**로 걸러 낸다. 부분 문자열이라 `evil-nhncloud.com.attacker.net` 같은 값도 통과한다.
- 비밀값 grep: `(secret|password|appkey)['"]?[[:space:]]*[:=][[:space:]]*['"][A-Za-z0-9]{16,}`.
- 대상 경로: `README.md skills/ docs/ AGENTS.md CLAUDE.md src/ tasks/ .agents/ .claude/ .github/`. 앞선 변경으로 `.codex/` 는 빠졌을 수 있다. 실제 블록을 읽고 그 경로를 기준으로 삼는다.

형제 저장소 dooray-cli 의 `scripts/check-pii.mjs` 와 `scripts/check-pii.test.mjs` 가 같은 목적의 구현이다(경로: `/Users/nhn/personal/dooray-cli/scripts/`). 구조를 따른다.

- `SCAN`(없으면 종료 코드 2)과 `OPTIONAL_SCAN`(없으면 건너뜀, `tasks/`)으로 경로를 나눈다.
- 심볼릭 링크와 `.git`, `node_modules`, `dist`, `worktrees` 디렉터리는 건너뛴다. `CLAUDE.md` 는 `AGENTS.md` 를 가리키는 링크라 따로 넣지 않는다.
- 호스트를 허용 목록과 **호스트 경계로** 비교한다(부분 문자열 금지).
- 찾은 위치를 `파일:줄:값` 으로 stdout 에 내고 종료 코드 1, 깨끗하면 0, 필수 경로를 못 읽으면 2.
- 함수(`walkFiles`, `findForeignDomains`, `findSecrets`, `main`)를 export 하고, 직접 실행될 때만 `main()` 을 돈다.
- 도메인은 dooray-cli 와 같은 정규식으로 뽑는다: `/(https?:\/\/|@)([A-Za-z0-9.-]+\.(?:com|co\.kr|net)[A-Za-z0-9.-]*)/g`. 끝의 `[A-Za-z0-9.-]*` 가 없으면 허용 도메인 뒤에 다른 도메인을 붙인 주소가 허용 호스트로 잘려 통과한다. 호스트는 소문자로 바꿔 비교한다.
- `SCAN` 은 `README.md`, `skills/`, `docs/`, `AGENTS.md`, `src/`, `.agents/`, `.claude/`, `.github/`, `scripts/` 다. `.codex/` 는 넣지 않는다(다른 PR 이 그 디렉터리를 없앤다). `OPTIONAL_SCAN` 은 `tasks/` 다.

**근거 문서**: `docs/code-architecture.md` 「최상위 경계」 표의 `scripts/` 행, `AGENTS.md` 「공개 저장소 정보 보호」 절.

## 의도 메모

- 허용 도메인은 두 종류로 둔다. 계획 시점에 검사 대상 경로에서 실제로 나온 호스트를 모아 정했다.
  - `OK_DOMAIN_SUFFIXES`: 호스트가 그 값과 같거나, 그 값 앞에 `.` 을 붙인 문자열로 끝나면 허용. `nhncloud.com`, `gov-nhncloud.com`, `nhncloudservice.com`, `gov-nhncloudservice.com`, `example.com`.
  - `OK_DOMAINS`: 정확히 같을 때만 허용. `github.com`, `npmjs.com`, `www.npmjs.com`, `anthropic.com`, `openai.com`, `claude.com`, `api-lncs-search.alpha-nhncloudservice.com`.
  - alpha 호스트는 ADR-024, ADR-036 이 링크한 공개 명세 주소다. 다른 alpha 호스트가 새로 들어오면 걸리도록 접미사로 허용하지 않는다.
- 비밀값 패턴은 지금 grep 과 같은 뜻을 유지한다. 넓히지 않는다. 새로 걸리는 것이 생기면 이 phase 의 범위를 넘는다.
- 테스트는 대조 표본으로 검출력을 확인한다. 허용 도메인 뒤에 다른 도메인을 붙인 주소, 허용 도메인 앞에 글자를 붙인 주소가 걸리는지, 허용 도메인의 하위 호스트(`api-keymanager.nhncloudservice.com`)는 통과하는지를 본다.
- `scripts/` 도 검사 대상이므로, 테스트의 위반 표본 문자열은 런타임에 조각을 이어 만든다. 예: `"https://wiki.internal-corp" + ".com"`. 그대로 쓰면 테스트 파일 자신이 검사에 걸린다.
- `.gitignore` 의 다른 항목과 `dist/`, `node_modules/`, `worktrees/` 는 건너뛰는 디렉터리로 처리한다.

## 작업 항목

### 1. `scripts/check-pii.mjs` 신규

위 컨텍스트와 의도 메모대로 만든다. 머리 주석에 무엇을 검사하는지, 정책은 `AGENTS.md` 「공개 저장소 정보 보호」 가 소유하고 허용 목록은 이 파일이 소유한다는 것, 사용법(`node scripts/check-pii.mjs`, cwd 는 저장소 루트), 종료 코드를 적는다.

### 2. `scripts/check-pii.test.mjs` 신규

- `findForeignDomains`: 허용 호스트와 하위 호스트는 빈 결과다. 표본은 런타임에 조각을 이어 만든다.
  - 걸려야 하는 표본: `docs.nhncloud` 뒤에 `.com.evil.io` 를 붙인 주소, `evilnhncloud` 뒤에 `.com` 을 붙인 주소, `wiki.internal-corp` 뒤에 `.com` 을 붙인 주소
  - 통과해야 하는 표본: 대문자로 쓴 허용 도메인 `DOCS.NHNCLOUD.COM`
- `findSecrets`: `secret` 키에 16자 이상 영숫자 값을 따옴표로 준 줄은 걸리고, 짧은 값과 `<secret>` placeholder 는 걸리지 않는다.
- `main({ cwd })`: 임시 디렉터리(`fs.mkdtemp`)에 필수 경로를 만들고 위반 파일 하나를 넣으면 1, 지우면 0, 필수 경로 하나를 빼면 2.

### 3. `package.json`

`scripts` 에 `"check:pii": "node scripts/check-pii.mjs"` 를 더한다.

### 4. `.github/workflows/ci.yml`

`Setup Node.js` 다음, `Install dependencies` 앞에 단계를 넣는다. 의존성 없이 도는 스크립트라 설치 전에 실패를 알린다.

```yaml
      - name: Check for exposed identifiers
        run: node scripts/check-pii.mjs
```

### 5. `AGENTS.md`

「공개 저장소 정보 보호」 절 끝의 bash 블록(grep 두 줄)을 아래로 바꾼다. 정책 문장과 대체 표기 표는 그대로 둔다.

```bash
node scripts/check-pii.mjs
```

「커밋, 이슈 작성, 릴리스 전에 다음 검사가 모두 0건인지 확인한다」 문장은 「… 다음 검사가 종료 코드 0 으로 끝나는지 확인한다. CI 도 같은 검사를 실행한다」 로 바꾼다. 허용 목록을 고칠 곳이 스크립트라는 것을 한 줄 더한다.

## 검증

```bash
node_modules/.bin/vitest run scripts/check-pii.test.mjs
node scripts/check-pii.mjs; echo "exit=$?"
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
git grep -n 'grep -rnoE\|grep -rnE' -- AGENTS.md
```

- 두 번째 줄은 `exit=0` 이어야 한다. 지금 저장소에 위반이 있으면 고치지 말고 위치를 보고한다.
- 마지막 줄은 0건이어야 한다.
- 대조 표본: `docs/` 에 사내처럼 보이는 도메인(`wiki.internal-corp` 에 `.com` 을 붙인 주소) 한 줄을 담은 임시 파일을 만들어 `exit=1` 과 그 위치가 출력되는지 보고 파일을 지운다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/check-pii.mjs` | 신규 |
| `scripts/check-pii.test.mjs` | 신규 |
| `package.json` | 수정 |
| `.github/workflows/ci.yml` | 수정 |
| `AGENTS.md` | 수정 |
