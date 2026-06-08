# Phase 01 — 코드: user_data base64 주입 + 인코딩 후 65535 한도 검증

## 목표

`nhncloud instance create --user-data <path>` 로 cloud-init 파일을 받아 base64 인코딩해
`server.user_data` 로 주입한다. 한도 검증(인코딩 후 65535 바이트)은 command 단에서 fail-fast.

근거: ADR-012 (base64 주입 + 65535 인코딩 후 한도), Issue #7.
NHN Cloud Instance public-api docs 가 `server.user_data` 를
"base64 인코딩된 문자열 ... 65535 바이트까지 허용" 으로 명시 — 추측 아님.

## 변경 파일 (3개)

1. `src/services/instance/types.ts` — `CreateServerParams` 에 `userDataBase64?: string` 추가
2. `src/services/instance/client.ts` — `create()` 의 `serverBody` 구성에 user_data 분기 추가
3. `src/commands/instance/create.ts` — `--user-data` 옵션 + 파일 읽기·인코딩·한도 검증

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (validation 전 spinner 금지)**: user-data 파일 읽기·인코딩·한도 검증은 반드시
  `startSpinner` **앞** (파라미터 검증 단계) 에 둔다. spinner 떠 있는 채 param 에러 leak 방지.
- **9-1 (exit code 리터럴 금지)**: `EXIT_PARAM_ERROR` 상수를 import 해서 쓴다 (숫자 3 리터럴 금지).
  create.ts 는 이미 import 되어 있음.
- **1-10 (type 변경 → tsc)**: `CreateServerParams` 에 필드 추가 = type 변경 → 성공 기준에 `tsc --noEmit` 포함.

## 작업 상세

### 1. `src/services/instance/types.ts`

`CreateServerParams` 의 `protect?` 다음에 필드 추가:

```ts
  /**
   * base64 인코딩된 cloud-init user-data. 정의 시에만 payload 의 `user_data` 로 포함.
   * 파일 읽기·인코딩·65535 한도 검증은 command 단에서 끝낸다 ([[adr-012]]).
   */
  userDataBase64?: string;
```

### 2. `src/services/instance/client.ts`

`create()` 의 `serverBody` 구성에서 `protect` 분기 **다음**에 추가
(client 는 인코딩 안 함 — command 에서 끝낸 base64 문자열을 그대로 패스스루):

```ts
    if (params.userDataBase64 !== undefined) {
      serverBody["user_data"] = params.userDataBase64;
    }
```

함수 상단 JSDoc 의 "NHN 확장 필드(ephemeralDiskSize / protect)는 정의됐을 때만" 문구에
user_data 도 정의 시에만 포함됨을 한 구절 보강 (기존 JSDoc **수정**, 새 블록 덧붙이지 말 것 — 9-2).

### 3. `src/commands/instance/create.ts`

(a) import 추가 (파일 상단):

```ts
import { readFileSync } from "node:fs";
```

(b) `CreateGlobalOpts` 인터페이스에 필드 추가:

```ts
  userData?: string;
```

(c) `--protect` 옵션 **다음**, `--wait` 옵션 **앞**에 옵션 추가:

```ts
  .option("--user-data <path>", "cloud-init user-data 파일 경로 (base64 인코딩해 주입, 인코딩 후 65535 바이트 한도)")
```

(d) `// ── 1. 파라미터 검증 ──` 블록 안, `networks` 검증 **다음** (spinner 시작 전) 에 추가:

```ts
    // ── user-data: 파일 읽기 + base64 인코딩 + 한도 검증 (spinner 전, fail-fast) ──
    let userDataBase64: string | undefined;
    if (opts.userData !== undefined) {
      let raw: Buffer;
      try {
        raw = readFileSync(opts.userData);
      } catch {
        throw new NhnCloudCliError(
          `--user-data 파일을 읽을 수 없습니다: ${opts.userData}`,
          EXIT_PARAM_ERROR,
        );
      }
      userDataBase64 = raw.toString("base64");
      // base64 출력은 ASCII → .length 가 곧 바이트 수. docs: 인코딩 후 65535 바이트 한도 ([[adr-012]])
      if (userDataBase64.length > 65535) {
        throw new NhnCloudCliError(
          `--user-data 가 base64 인코딩 후 65535 바이트를 초과합니다 (${userDataBase64.length} 바이트). cloud-init 내용을 줄이세요.`,
          EXIT_PARAM_ERROR,
        );
      }
    }
```

(e) `client.create({ ... })` 호출 인자에 `protect: opts.protect,` **다음** 줄 추가:

```ts
        userDataBase64,
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: /Users/nhn/personal/nhncloud-cli

# 1. 타입 체크 — type 변경 포함 phase 라 필수 (tsup/build 는 type-check 우회)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. --user-data 옵션이 help 에 노출
node dist/index.js instance create --help 2>&1 | grep -c -- "--user-data"
# 기대: 1

# 4. exit code 리터럴 미사용 (9-1) — create.ts 의 NhnCloudCliError 2번째 인자가 모두 상수
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/create.ts | wc -l
# 기대: 0

# 5. base64 인코딩·한도 경로 수동 동작 확인 (자격증명 불필요 — param 에러로 차단되는지)
#    65535 초과 파일을 만들어 EXIT_PARAM_ERROR(3) 로 거부되는지
head -c 60000 /dev/zero | tr '\0' 'a' > /tmp/big-userdata.txt   # 원본 60000B → base64 80000B (>65535)
node dist/index.js instance create --name x --flavor x --image x --network x --user-data /tmp/big-userdata.txt; echo "exit=$?"
# 기대: stderr 에 "base64 인코딩 후 65535 바이트를 초과", exit=3
rm -f /tmp/big-userdata.txt

# 6. 존재하지 않는 파일 → EXIT_PARAM_ERROR(3)
node dist/index.js instance create --name x --flavor x --image x --network x --user-data /tmp/nonexistent-xyz.yaml; echo "exit=$?"
# 기대: stderr 에 "파일을 읽을 수 없습니다", exit=3

# 7. spinner-before-validation 회귀 없음 (1-2) — startSpinner 가 user-data 검증보다 뒤
awk '/\.action\(async/,/^  \}\)\;/' src/commands/instance/create.ts | grep -nE "(startSpinner|userDataBase64 =|readFileSync)" | head -5
# 기대: readFileSync / userDataBase64 = 가 startSpinner 보다 앞 줄번호
```

성공 기준 5/6 은 자격증명·네트워크 호출 전에 param 검증으로 차단되므로 실제 인스턴스를 만들지 않는다.
