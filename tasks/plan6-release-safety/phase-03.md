# Phase 03. pnpm 버전을 저장소에 고정하고 CI 에 패키지 검증을 더한다

**Execution profile**: fast

## 목표

로컬, CI, worktree 가 같은 pnpm 으로 돌게 하고, CI 가 빌드 뒤 phase 01 의 패키지 산출물 검증을 실행하게 한다.
지금은 `package.json` 에 `packageManager` 가 없고 CI(`.github/workflows/ci.yml`)만 `pnpm/action-setup` 의 `version: 10` 으로 고정한다. 로컬 pnpm 은 11 이다.

**범위 외**: 의존성 버전 업그레이드, 릴리스 워크플로(별도 계획).

## 컨텍스트

- `pnpm-lock.yaml` 의 `lockfileVersion` 은 `'9.0'` 이다. pnpm 10 과 11 이 같은 형식을 쓴다. 형제 저장소 dooray-cli 는 같은 형식으로 pnpm 11 을 쓴다.
- pnpm 11 은 `package.json` 의 `pnpm` 필드를 읽지 않는다. 의존성 build 스크립트 승인은 `pnpm-workspace.yaml` 의 `allowBuilds` 가 맡는다. 이 저장소는 tsup 과 vitest 를 통해 esbuild 를 쓴다.
- `pnpm/action-setup@v4` 는 `with.version` 이 없으면 `package.json` 의 `packageManager` 를 읽는다. 둘 다 있으면 충돌 오류로 끝난다.
- pnpm 11 은 Node 22.13 이상을 요구한다(`npm view pnpm@11.18.0 engines`). CI 는 `NODE_VERSION: "20"` 으로 돈다. `pnpm/action-setup` 의 `standalone: true` 는 Node 를 번들한 `@pnpm/exe` 를 설치해, CI 의 Node 버전과 무관하게 pnpm 이 돈다.
- `.gitignore` 13~15줄이 `pnpm-workspace.yaml` 을 무시한다. pnpm 이 승인을 물으며 만드는 템플릿을 커밋하지 않으려고 넣은 줄이다. 이 phase 는 그 파일을 커밋하므로 그 줄과 주석을 지운다. 지우지 않으면 파일이 커밋에서 빠지고, CI 의 pnpm 11 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패한다(계획 시점 실측).
- dooray-cli 의 `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    esbuild: true
  ```

**근거 문서**: `docs/code-architecture.md` 「테스트와 빌드」 절, `AGENTS.md` 「빌드와 검증」 절.

## 의도 메모

- 고정 버전은 이 phase 를 실행하는 머신의 `pnpm --version` 값으로 정한다(계획 시점 `11.18.0`). 그 값으로 `pnpm install --frozen-lockfile` 이 lockfile 을 바꾸지 않는지 확인한다. lockfile 이 바뀌면 멈추고 보고한다.
- CI 의 `NODE_VERSION` 은 20 으로 둔다. `package.json` 의 `engines` 가 `>=20` 이라 테스트와 빌드는 Node 20 에서 확인해야 한다.
- `AGENTS.md` 「빌드와 검증」 절의 esbuild 차단 우회 문장은 지우지 않는다. worktree 에서 실제로 필요 없어졌는지는 이 계획이 머지된 뒤 새 worktree 에서 확인한다.

## 작업 항목

### 1. `package.json`

`"packageManager": "pnpm@<pnpm --version 값>"` 을 더한다.

### 2. `pnpm-workspace.yaml` 신규

위 dooray-cli 형태로 `allowBuilds: { esbuild: true }` 를 두고, 머리 주석에 pnpm 11 이 `package.json` 의 `pnpm` 필드를 읽지 않아 이 파일이 build 승인을 맡는다는 것을 한 줄로 적는다.

### 3. `.gitignore`

`pnpm-workspace.yaml` 줄과 그 위 주석 두 줄을 지운다.

### 4. `.github/workflows/ci.yml`

- `Setup pnpm` 단계의 `with: version: 10` 을 `with: standalone: true` 로 바꾼다.
- `Run build` 다음에 단계를 더한다.

```yaml
      - name: Verify package artifact
        run: pnpm verify:package
```

### 5. `AGENTS.md`

「빌드와 검증」 절의 명령 블록에서 `pnpm run build` 다음 줄에 `pnpm verify:package` 를 더한다.

## 검증

```bash
pnpm install --frozen-lockfile
git diff --exit-code pnpm-lock.yaml
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
pnpm run build
pnpm verify:package
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(/version:\s*10/.test(y) || !/standalone:\s*true/.test(y) || !/NODE_VERSION:\s*\"20\"/.test(y)) process.exit(1)"
git check-ignore -q pnpm-workspace.yaml; test $? -eq 1
```

커밋한 뒤 `git ls-files --error-unmatch pnpm-workspace.yaml` 이 종료 코드 0 인지 확인한다.

- `git diff --exit-code pnpm-lock.yaml` 은 종료 코드 0 이어야 한다.
- `node -e` 줄과 `git check-ignore` 줄은 종료 코드 0 이어야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `package.json` | 수정 |
| `pnpm-workspace.yaml` | 신규 |
| `.gitignore` | 수정 |
| `.github/workflows/ci.yml` | 수정 |
| `AGENTS.md` | 수정 |
