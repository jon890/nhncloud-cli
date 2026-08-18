# Phase 04 — 공개 가이드를 새 구조에 맞추고 완료 마킹

**Execution profile**: standard

---

## 목표

phase-01~03 이 바꾼 구조를 공개 문서에 반영한다.

이 저장소는 공개 npm 패키지라 `README.md` 와 `skills/nhncloud-cli/` 가 사용자와 AI 에이전트가 읽는 안내다.
코드에서 없앤 인수와 옵션이 문서에 남으면 사용자가 그것을 따라 쓰다 실패한다.

**범위 외**: `docs/` 아래 문서는 planning 이 이미 갱신하고 커밋했다.
`docs/adr/033`·`docs/adr/008`·`docs/adr/INDEX.md`·`docs/data-schema.md`·`docs/flow.md`·`docs/code-architecture.md` 가 그 대상이다.
이 파일들을 phase 안에서 고치면 이중 편집이 된다.

`docs/flow.md` 에 남아 있는 `--app-key` 4건은 `ncr`·`ncs` 서술이라 **plan 064 의 범위**다. 손대지 않는다.

---

## 작업 항목 (4)

### 1. `skills/nhncloud-cli/references/deploy.md` — target 서술을 걷어낸다

착수 전에 실제 위치를 확인한다.

```bash
# cwd: <repo root>
grep -n "target\|app-key" skills/nhncloud-cli/references/deploy.md
```

`target` 이 17건, `--app-key` 가 1건이다. 종류별로 다르게 다룬다.

- **명령 시그니처** — `nhncloud deploy run <target>` 형태를 좌표 옵션 형태로 바꾼다.
- **옵션 표** — `--app-key` 행을 지운다. `--artifact-id` 등의 설명에서 "target override" 를 걷어낸다. 이제 override 가 아니라 정식 입력이다.
- **target 개념 설명** — `config.json` 에 이름 붙인 좌표를 두고 참조한다는 서술을 지운다.

담을 내용이다.

- appkey 는 `nhncloud configure --deploy-appkey <key>` 로 profile 에 설정한다.
- 배포 좌표는 명령 옵션으로 넘긴다. 반복되는 값은 호출하는 쪽의 스크립트나 CI 변수가 관리한다.
- **여러 배포 대상을 쓰려면 profile 을 나눈다.** profile 하나에 appkey 하나다.

```text
nhncloud configure --profile projA --deploy-appkey <keyA>
nhncloud deploy run --profile projA --artifact-id <id> --server-group-id <id> --scenario-ids <ids>
```

- `config.json` 에 `deploy.targets` 가 남아 있으면 경고가 나오며 읽지 않는다.

### 2. `README.md` — 사용 예를 확인한다

```bash
# cwd: <repo root>
grep -n "deploy " README.md
```

`nhncloud deploy artifacts` 한 줄이 있고 이 명령은 좌표가 필요 없어 **그대로 유효하다.**
다른 deploy 예시가 없으면 손대지 않고, 그 사실을 phase 보고에 적는다.

`--app-key` 나 target 을 쓰는 예시가 나오면 새 형태로 바꾼다.

### 3. `AGENTS.md` — 자격증명 관련 서술을 확인한다

```bash
# cwd: <repo root>
grep -n "appkey\|config.json\|credentials.json" AGENTS.md
```

"자격증명은 `~/.nhncloud/credentials.json`, 일반 설정은 `~/.nhncloud/config.json`" 같은 서술이 있으면 그대로 유효하다 — 이번 변경이 그 경계를 더 정확히 지키게 만들었다.
`deploy` 만 예외였다는 언급이 있으면 지운다.

바꿀 것이 없으면 손대지 않고 그 판정을 phase 보고에 적는다.

### 4. `tasks/065-feat-deploy-appkey-profile/index.json` 완료 마킹

- `status` 를 `completed` 로 바꾼다.
- `current_phase` 를 `4` 로 바꾼다.
- `phases` 배열 네 항목의 `status` 를 모두 `completed` 로 바꾼다.
- `updated_at` 을 실행 시점 ISO 8601 값으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/deploy.md` | 수정 |
| `README.md` | 대조 후 필요 시 수정 |
| `AGENTS.md` | 대조 후 필요 시 수정 |
| `tasks/065-feat-deploy-appkey-profile/index.json` | 수정 — 완료 마킹 |

## 검증

```bash
# cwd: <repo root>
# deploy.md 에 --app-key 가 남지 않았는지 — 0 이어야 한다 (변경 전 1)
grep -c '\-\-app-key' skills/nhncloud-cli/references/deploy.md || true

# configure 안내가 있는지 — 1 이상이어야 한다
grep -c 'deploy-appkey' skills/nhncloud-cli/references/deploy.md || true

# profile 을 나누라는 안내가 있는지 — 1 이상이어야 한다
grep -c 'profile 을 나눈' skills/nhncloud-cli/references/deploy.md || true

# 폐지된 개념이 남지 않았는지 — 출력이 없어야 한다
grep -n 'deploy.targets' skills/nhncloud-cli/references/deploy.md || true
```

마크다운 가독성 검사를 통과해야 한다. 출력이 없으면 통과다.

```bash
# cwd: <repo root>
python3 ~/.claude/scripts/check-readability.py skills/nhncloud-cli/references/deploy.md README.md AGENTS.md
```

공개 저장소 정보 노출 검사도 통과해야 한다. 두 명령 모두 출력이 0줄이어야 한다.

```bash
# cwd: <repo root>
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"

grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
```

빌드 후 명령 카탈로그가 **170** 이어야 한다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js commands --json | jq '.commands | length'
```

pnpm 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패하면 `./node_modules/.bin/tsup` 을 직접 실행한다.

문서의 명령 예시가 실제로 동작하는지 대조한다. 도움말에 없는 옵션을 문서가 쓰고 있으면 안 된다.

```bash
# cwd: <repo root>
node dist/index.js deploy run --help
node dist/index.js deploy artifacts --help
```

## 의도 메모 (왜)

- profile 을 나누라는 안내를 명시하는 이유는 이것이 이번 변경의 실질적 제약이기 때문이다.
  profile 하나에 appkey 하나가 되어, 여러 배포 대상을 쓰던 사용자는 방식을 바꿔야 한다.
  [[adr-029]] 가 트레이드오프로 적어 둔 내용이고 문서에서 사용자가 볼 수 있어야 한다.
- `README.md` 와 `AGENTS.md` 를 "대조 후 필요 시" 로 둔 이유는 실제로 바꿀 것이 없을 수 있기 때문이다.
  없는데 억지로 고치면 범위 밖 변경이 된다. 판정을 보고에 남기는 것으로 충분하다.
