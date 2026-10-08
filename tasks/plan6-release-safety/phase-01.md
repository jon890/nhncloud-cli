# Phase 01. CLI 버전을 package.json 하나로 관리하고 패키지 산출물을 검증한다

**Execution profile**: standard

## 목표

`nhncloud --version` 이 `package.json` 의 `version` 과 항상 같게 하고, 게시할 산출물이 그 버전과 공개 스킬 파일을 담았는지 검사하는 스크립트를 만든다.
지금은 `src/index.ts` 의 `.version("0.18.0")` 과 `package.json` 을 릴리스 때 손으로 함께 바꿔야 한다.

**범위 외**: 공개 정보 검사(phase 02), pnpm 고정과 CI 단계 추가(phase 03). 릴리스 자동화는 다음 계획(plan7)이 맡지만, 이 phase 가 없애는 문자열을 가리키는 릴리스 스킬 두 줄은 여기서 고친다.

## 컨텍스트

- `src/index.ts:165` 근처에 `.version("0.18.0")` 이 하드코딩돼 있다.
- `tsup.config.ts` 는 `entry`, `format: ["cjs"]`, `target: "node20"`, `clean`, `banner` 만 둔다.
- `vitest.config.ts` 의 `test.include` 는 `["src/**/*.test.ts"]` 다.
- 공개 스킬 상태 판정(`src/skill/context.ts`, `src/skill/manager.ts`)은 런타임에 `package.json` 을 읽으므로 이 변경과 무관하다.
- 형제 저장소 dooray-cli 가 같은 구조를 쓴다. 구조만 참고하고 이 저장소의 이름으로 바꾼다.
  - `tsup.config.ts` 가 `package.json` 을 읽어 `define: { __DOORAY_CLI_VERSION__: JSON.stringify(version) }` 으로 주입한다.
  - `src/version.ts` 는 `declare const __DOORAY_CLI_VERSION__: string | undefined;` 와 `typeof` 판정으로 주입되지 않으면 `"0.0.0-dev"` 를 쓴다.
  - `scripts/verify-package.mjs` 가 `node dist/index.js --version` 과 `package.json` 버전을 비교하고 공개 스킬 파일이 있는지 본다.

**근거 문서**: `docs/code-architecture.md` 의 「최상위 경계」 표(`src/version.ts`, `scripts/`)와 「테스트와 빌드」 절.

## 의도 메모

- 공개 스킬 파일 목록을 스크립트에 하드코딩하지 않는다. `git ls-files skills/nhncloud-cli` 로 추적 중인 파일을 뽑고, 그 각각이 `package.json` 의 `files` 규칙에 의해 패키지에 들어가는지를 `npm pack --dry-run --json` 결과와 집합 비교한다. reference 를 추가할 때 목록을 고칠 필요가 없게 하기 위해서다.
- `npm pack --dry-run --json` 은 네트워크 없이 돈다. 출력의 `[0].files[].path` 를 읽는다.
- 상수 이름은 `__NHNCLOUD_CLI_VERSION__` 이다. 저장소에 같은 이름이 없는지 `git grep -n "__NHNCLOUD_CLI_VERSION__"` 로 먼저 확인한다(계획 시점 0건).

## 작업 항목

### 1. `tsup.config.ts`

`package.json` 을 `readFileSync` 로 읽고 `version` 이 문자열인지 확인한 뒤(아니면 `throw`), `define: { __NHNCLOUD_CLI_VERSION__: JSON.stringify(version) }` 을 더한다. 기존 설정 값은 그대로 둔다.

### 2. `src/version.ts` 신규

```ts
declare const __NHNCLOUD_CLI_VERSION__: string | undefined;

/** 빌드 때 package.json 에서 주입한 CLI 버전. 주입되지 않은 테스트와 개발 실행에서는 0.0.0-dev 다. */
export const CLI_VERSION: string =
  typeof __NHNCLOUD_CLI_VERSION__ === "string" ? __NHNCLOUD_CLI_VERSION__ : "0.0.0-dev";
```

### 3. `src/index.ts`

`.version("0.18.0")` 을 `.version(CLI_VERSION)` 으로 바꾸고 `import { CLI_VERSION } from "./version.js";` 를 더한다.

### 4. `src/version.test.ts` 신규

- 주입이 없는 vitest 실행에서 `CLI_VERSION` 이 `"0.0.0-dev"` 임을 확인한다.

### 5. `scripts/verify-package.mjs` 신규

- cwd 는 저장소 루트다. 머리 주석에 사용법과 종료 코드(0 통과, 1 실패, 2 `package.json` 이나 `dist/index.js` 가 없음)를 적는다.
- 검사 1: `node dist/index.js --version` 의 stdout 을 trim 한 값이 `package.json` 의 `version` 과 같다.
- 검사 2: `git ls-files skills/nhncloud-cli` 의 모든 파일이 `npm pack --dry-run --json` 의 파일 목록에 있다. `README.md` 와 `dist/index.js` 도 있어야 한다.
- 실패는 모아서 stderr 에 한 줄씩 내고 종료 코드 1 로 끝낸다. 자식 프로세스는 `spawnSync` 로 부르고 종료 코드를 그 자리에서 읽는다.

### 6. `package.json`

`scripts` 에 `"verify:package": "node scripts/verify-package.mjs"` 를 더한다. `version` 은 바꾸지 않는다.

### 7. `.agents/skills/release/SKILL.md` 「5. 버전 범프」 절

「`package.json` 의 `version` 과 `src/index.ts` 의 `.version("x.y.z")` 두 곳을 …」 두 줄을 「`package.json` 의 `version` 만 `$VERSION` 으로 바꾼다. CLI 버전은 빌드 때 그 값에서 주입된다.」 로 바꾸고, 같은 절의 `git add package.json src/index.ts` 를 `git add package.json` 으로 바꾼다. 다른 절은 건드리지 않는다.

### 8. 테스트 실행 범위

`vitest.config.ts` 의 `test.include` 를 `["src/**/*.test.ts", "scripts/**/*.test.mjs"]` 로 넓힌다. 이 phase 에는 `scripts/` 테스트가 없지만 phase 02 가 쓴다.

## 검증

먼저 의존성을 설치한다. `pnpm install` 이 esbuild 승인 문제로 실패하면 `AGENTS.md` 「빌드와 검증」 절의 우회 절차를 따른다.

```bash
pnpm install
git grep -n '"0\.18\.0"' -- src
git grep -n '\.version("' -- src/index.ts
node_modules/.bin/vitest run src/version.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/tsup
node dist/index.js --version
node scripts/verify-package.mjs; echo "exit=$?"
```

- 두 `git grep` 은 모두 0건이어야 한다. `src/commands/*.test.ts` 의 `.version("1.0.0")` 같은 테스트 전용 리터럴은 대상이 아니다.
- `node dist/index.js --version` 은 `package.json` 의 `version` 과 같아야 한다.
- `verify-package.mjs` 는 `exit=0` 이어야 한다.
- 실패를 잡는지 대조 표본으로 확인한다: `package.json` 의 `version` 을 임시로 `9.9.9` 로 바꾸고 빌드하지 않은 채 `node scripts/verify-package.mjs` 를 돌려 `exit=1` 과 버전 불일치 메시지를 확인한 뒤 되돌린다. 되돌린 뒤 `git diff package.json` 에 `version` 변화가 없어야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `tsup.config.ts` | 수정 |
| `src/version.ts` | 신규 |
| `src/version.test.ts` | 신규 |
| `src/index.ts` | 수정 |
| `scripts/verify-package.mjs` | 신규 |
| `package.json` | 수정 |
| `vitest.config.ts` | 수정 |
| `.agents/skills/release/SKILL.md` | 수정 |
