# Phase 02 — 공개 docs 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 docs 를 갱신한다.
docs 는 코드 산출물(실제 옵션/출력)에 의존하므로 **마지막 phase 에서** 갱신한다 (planning SKILL 갱신 시점 분리 원칙).

핵심: "create 의 private_key 는 1회성 — `--output` 으로 0600 저장, 미지정 시 한 번만 표시" 를 사용 예·옵션 표에 명시한다 (사용자 요청).

## 변경 파일 (5개)

1. `CLAUDE.md` — 지원 명령 카운트 + keypair 명령 행 추가
2. `docs/flow.md` — instance 시그니처/옵션 표 + keypair 절 추가
3. `docs/code-architecture.md` — client 메서드 + command 파일 목록 갱신
4. `README.md` — instance 사용 예 블록에 keypair 예시 추가
5. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + 시나리오 반영
6. `tasks/009-feat-instance-keypairs/index.json` — status `completed` + current_phase 갱신

## 작업 상세

### 1. `CLAUDE.md`

(a) `## 지원 명령 (11개)` → `## 지원 명령 (15개)` (keypairs + keypair get/create/delete = 4 추가).

(b) `- \`instance delete\` ...` 행 **뒤** 에 추가:

```
- `instance keypairs` — 키페어 목록 조회 (name·fingerprint, 전체 필드는 `--json`).
- `instance keypair get <name>` — 단일 키페어 조회.
- `instance keypair create <name>` — 키페어 생성. `--public-key` 미지정 시 NHN 이 키쌍 생성 — private_key 1회성 반환, `--output <keyfile>` 로 0600 저장.
- `instance keypair delete <name>` — 키페어 삭제.
```

> ADR 표는 건드리지 않는다 — 이 기능은 ADR 미동반 (표준 Nova os-keypairs CRUD).

### 2. `docs/flow.md`

(a) `### 명령 시그니처` 코드블록의 `nhncloud instance delete <id> ...` **뒤** 에 추가:

```
nhncloud instance keypairs [options]            # 키페어 목록
nhncloud instance keypair get <name> [options]  # 단일 키페어 조회
nhncloud instance keypair create <name> [opts]  # 키페어 생성 (private_key 1회성)
nhncloud instance keypair delete <name> [opts]  # 키페어 삭제
```

(b) 옵션 표(`| --yes | delete | ... |` 행이 있는 표)의 `--yes` 행 **뒤** 에 추가:

```
| `--public-key <path\|key>` | keypair create | 기존 공개키 등록 (파일 경로 또는 키 문자열). 지정 시 private_key 미반환 |
| `-o, --output <keyfile>` | keypair create | NHN 이 생성한 private_key 를 파일(mode 0600)로 저장 |
```

(c) `### create 비동기 + --wait` 절 **앞** 에 keypair 절 추가:

```
### keypair 관리

- `instance keypairs` — name·fingerprint 목록. create 의 `--key-name` 에 넣을 키페어를 고르는 단계.
- `instance keypair get <name>` — 단건 상세 (name·fingerprint·user_id·created_at·public_key).
- `instance keypair create <name>` — 키페어 생성. 두 경로:
  - `--public-key <path|key>` 지정: 기존 공개키를 등록한다. NHN 은 private_key 를 만들지 않으므로 응답에 private_key 가 없다.
  - 미지정: NHN 이 키쌍을 생성하고 응답에 **private_key 를 1회만** 포함한다 (이후 `keypair get` 으로도 재조회 불가).
    - `--output <keyfile>` 지정 시 private_key 를 mode 0600 파일로 원자적으로 저장한다 (자동화 권장).
    - 미지정 시 stderr 에 "한 번만 표시됨" 경고와 함께 private_key 를 stdout 으로 출력한다.
  - `--output` 과 `--public-key` 동시 지정은 모순이라 `EXIT_PARAM_ERROR` 로 차단한다 (등록 경로엔 private_key 가 없다).
- `instance keypair delete <name>` — 삭제 (202/204 무응답).
```

### 3. `docs/code-architecture.md`

(a) `client.ts` 주석:

```
      client.ts             # InstanceClient — list / get / create / delete / listFlavors / listKeypairs / getKeypair / createKeypair / deleteKeypair + waitForActive
```

(b) `types.ts` 주석에 키페어 타입 추가:

```
      types.ts              # Server / CreateServerParams / Flavor / FlavorDetail / Keypair / KeypairDetail / CreateKeypair* (NHN 확장 필드 포함)
```

(c) `instance/` command 파일 목록의 `delete.ts ...` 행 **뒤** 에 추가:

```
      keypairs.ts           # nhncloud instance keypairs (목록)
      keypair.ts            # nhncloud instance keypair get/create/delete (--public-key / --output, private_key 0600 저장)
```

### 4. `README.md`

instance 사용 예 코드블록에서 `nhncloud instance delete <instance-id> --yes` **뒤** 에 keypair 예시 추가:

````
# 키페어 목록 (name·fingerprint)
nhncloud instance keypairs

# 단일 키페어 조회
nhncloud instance keypair get <keypair-name>

# 키페어 생성 — NHN 이 키쌍 생성, private_key 를 0600 파일로 저장 (한 번만 받을 수 있음)
nhncloud instance keypair create <keypair-name> -o ./my-key.pem

# 기존 공개키 등록 (private_key 미반환)
nhncloud instance keypair create <keypair-name> --public-key ~/.ssh/id_rsa.pub

# 키페어 삭제
nhncloud instance keypair delete <keypair-name>
````

> README 본문에 "private_key 는 생성 시 한 번만 표시되며 분실 시 복구할 수 없다" 한 줄 안내를 코드블록 인접에 둔다.

### 5. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표에서 "인스턴스 타입 상세" 행 **뒤** 에 추가:

```
| 키페어 목록 | `nhncloud instance keypairs` |
| 키페어 생성 (키 저장) | `nhncloud instance keypair create <keypair-name> -o ./key.pem` |
| 키페어 삭제 | `nhncloud instance keypair delete <keypair-name>` |
```

(b) `### instance flavors 조회` 절 **뒤** 에 keypair 시나리오 추가 (에이전트 자연어→명령 변환 참고):

```
### instance keypair 관리

- `nhncloud instance keypairs` — 키페어 name·fingerprint 목록. create 의 `--key-name` 에 넣을 키를 고를 때.
- `nhncloud instance keypair create <keypair-name> -o <keyfile>` — NHN 이 키쌍을 생성하고 private_key 를 `<keyfile>` 에 mode 0600 으로 저장한다. **private_key 는 생성 시 한 번만 받을 수 있으므로** 자동화에서는 항상 `-o` 로 저장한다.
- `--public-key <path|key>` 로 기존 공개키를 등록하면 private_key 는 반환되지 않는다.
- `nhncloud instance keypair delete <keypair-name>` — 삭제.
```

> SKILL.md / README 는 공개 OSS — 실제 키페어 이름·private_key·tenant 등 식별자를 박지 말 것. placeholder(`<keypair-name>` 등)만 사용 (CLAUDE.md 개인 식별 정보 정책).

### 6. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

phases[0].status, phases[1].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. CLAUDE.md 명령 카운트 갱신 (11 → 15)
grep -c "## 지원 명령 (15개)" CLAUDE.md
# 기대: 1

# 2. CLAUDE.md 에 keypair 명령 4개 행
grep -Ec "instance keypairs|instance keypair (get|create|delete)" CLAUDE.md
# 기대: 4 이상

# 3. flow.md 시그니처 + 옵션 + keypair 절
grep -c "instance keypair" docs/flow.md
# 기대: 4 이상
grep -Ec -- "--public-key|--output" docs/flow.md
# 기대: 2 이상

# 4. code-architecture.md client 메서드 + command 파일
grep -Ec "listKeypairs|keypair.ts" docs/code-architecture.md
# 기대: 2 이상

# 5. README 에 keypair 예시
grep -c "instance keypair" README.md
# 기대: 4 이상

# 6. SKILL 빠른 참조 + 시나리오
grep -c "instance keypair" skills/nhncloud-cli/SKILL.md
# 기대: 3 이상

# 7. private_key 1회성 안내가 docs 에 명시
grep -Ec "한 번만|1회성|복구" README.md docs/flow.md skills/nhncloud-cli/SKILL.md
# 기대: 3 이상 (각 문서에 안내)

# 8. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 9. 실제 비밀 형태 점검 (private_key·secret 실값 미노출)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ 2>/dev/null
# 기대: 0건

# 10. index.json 완료 마킹
grep -c '"status": "completed"' tasks/009-feat-instance-keypairs/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# 실제 키페어 생성 → 0600 파일 저장 확인
node dist/index.js instance keypair create <keypair-name> -o /tmp/k.pem && ls -l /tmp/k.pem
# -rw------- 기대

node dist/index.js instance keypairs
node dist/index.js instance keypair get <keypair-name>
node dist/index.js instance keypair delete <keypair-name>
```
