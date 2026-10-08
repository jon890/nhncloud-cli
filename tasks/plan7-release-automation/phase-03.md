# Phase 03. 태그 push 로 도는 릴리스 검증 워크플로를 더한다

**Execution profile**: standard

## 목표

`v*` 태그를 push 하면 CI 가 게시할 커밋을 검증하는 `.github/workflows/release.yml` 을 만든다. 태그와 `package.json` 버전이 어긋나거나 pre-release 버전이면 실패한다. 게시 단계는 저장소 변수로만 켠다.

**범위 외**: npm Trusted Publishing 등록, 변수 켜기. 이 phase 는 워크플로 파일만 만든다.

## 컨텍스트

- 기존 `.github/workflows/ci.yml` 의 단계 순서와 설정(`pnpm/action-setup@v4` 의 `standalone: true`, `actions/setup-node@v4` 의 `NODE_VERSION`, `cache: "pnpm"`, 의존성 설치 전 `node scripts/check-pii.mjs`, 빌드 뒤 `pnpm verify:package`)을 그대로 따른다. 이 파일을 먼저 읽는다.
- 형제 프로젝트 dooray-cli 의 같은 워크플로가 본보기다: <https://github.com/jon890/dooray-cli/blob/main/.github/workflows/release.yml>.

**근거 문서**: `docs/adr/041-release-publish-local-ci-verify.md` 가 결정을 소유한다.

## Blocked 조건

- `.github/workflows/ci.yml` 에 `check-pii.mjs` 단계나 `verify:package` 단계가 없으면 `PHASE_BLOCKED: CI 검증 단계가 main 에 없다` 를 출력하고 끝낸다.

## 의도 메모

- `permissions` 는 `contents: read` 와 `id-token: write` 다. `id-token` 은 Trusted Publishing 을 켰을 때만 쓰이지만 미리 둔다.
- OIDC Trusted Publishing 은 npm CLI 11.5.1 이상이 필요하고 Node 20 에 번들된 npm 은 10.x 다. 게시 단계 바로 앞에 `npm install -g npm@^11.5.1` 단계를 같은 `if:` 조건으로 둔다. 변수를 켜기 전에 npm 쪽 Trusted Publishing 등록을 마쳐야 한다.
- 게시 단계는 `if: vars.NPM_TRUSTED_PUBLISHING == 'true'` 이고 명령은 `npm publish --access public --provenance` 다. `NODE_AUTH_TOKEN` 은 주지 않는다.
- 변수가 꺼져 있으면 게시를 건너뛰었다는 사실을 로그에 남기는 단계를 둔다.
- pre-release 검사는 태그 이름에 적용한다. 앞 단계가 태그와 `package.json` 버전의 일치를 보장하므로 둘은 같은 값이다. 검증에서는 `GITHUB_REF_NAME=v1.0.0-rc.1` 환경 변수로 셸 본문을 돌린다.
- `actions/setup-node` 에 `registry-url: "https://registry.npmjs.org"` 를 준다.

## 작업 항목

### 1. `.github/workflows/release.yml` 신규

단계 순서: checkout, pnpm 설정, Node 설정, 공개 정보 검사, 의존성 설치(`--frozen-lockfile`), 타입 검사, 테스트, 빌드, 패키지 산출물 검증, 태그와 `package.json` 버전 일치(`${GITHUB_REF_NAME#v}` 와 `node -p "require('./package.json').version"` 비교), pre-release 거부(태그 이름 `${GITHUB_REF_NAME#v}` 에 `*-*` 이면 실패), npm 11.5.1 이상 설치(변수 조건), 게시(변수 조건), 게시 건너뜀 보고(반대 조건). 각 단계 위에 그 단계가 막는 것을 한 줄 주석으로 적는다.

### 2. `docs/code-architecture.md`

「테스트와 빌드」 절에 `.github/workflows/release.yml`(태그 push 검증, ADR-041) 한 줄을 더한다.

### 3. 워크플로 형식 확인 테스트

이 phase 는 YAML 만 바꾸므로 저장소 테스트 전체를 돌려 다른 것이 깨지지 않았는지 보고, YAML 파싱과 핵심 조건은 검증 절의 명령으로 확인한다. 버전 일치 단계와 pre-release 단계의 셸 본문은 로컬에서 직접 실행해 실패하는 대조 표본을 넣는다.

## 검증

```bash
node_modules/.bin/vitest run
node -e "const y=require('fs').readFileSync('.github/workflows/release.yml','utf8'); const need=['tags:','v*','check-pii.mjs','verify:package','GITHUB_REF_NAME','NPM_TRUSTED_PUBLISHING','--provenance','standalone: true','id-token: write','registry-url','--frozen-lockfile',\"== 'true'\",\"!= 'true'\",'npm@^11.5.1']; const miss=need.filter(s=>!y.includes(s)); if(miss.length){console.error(miss); process.exit(1)}"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
actionlint .github/workflows/release.yml
VER=$(node -p "require('./package.json').version")
GITHUB_REF_NAME=v9.9.9; [ "${GITHUB_REF_NAME#v}" = "$VER" ]; echo "mismatch_expect1=$?"
for V in 1.0.0 1.0.0-rc.1; do case "$V" in *-*) echo "$V rejected";; *) echo "$V accepted";; esac; done
node scripts/check-pii.mjs
```

- 버전 일치 단계와 pre-release 단계는 워크플로에 적은 셸 본문을 그대로 옮겨 실행한다. 위 두 표본은 형태 예시이고, 실제로는 워크플로의 `run:` 본문을 `GITHUB_REF_NAME=v9.9.9` 와 임시 버전(`1.0.0-rc.1`)으로 돌려 두 경우 모두 종료 코드 1 이 나오는지 확인한다. 일치하는 표본(`GITHUB_REF_NAME=v$VER`)은 0 이어야 한다.
- `python3` 은 `yaml.safe_load` 가 예외 없이 끝나면 통과다. `yaml` 모듈이 없으면 그 줄은 건너뛰고 보고한다.
- `actionlint` 가 없으면 그 줄은 건너뛰고 보고한다. 있으면 종료 코드 0 이어야 한다.
- 나머지 줄은 모두 종료 코드 0 이어야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.github/workflows/release.yml` | 신규 |
| `docs/code-architecture.md` | 수정 |
