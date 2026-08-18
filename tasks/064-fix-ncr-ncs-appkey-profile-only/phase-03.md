# Phase 03 — 공개 가이드에서 --app-key 를 걷어내고 완료 마킹

**Execution profile**: standard

---

## 목표

phase-01·02 가 없앤 옵션을 공개 문서에서도 걷어낸다.

이 저장소는 공개 npm 패키지라 `skills/nhncloud-cli/` 가 사용자와 AI 에이전트가 읽는 안내다.
코드에서 지우고 문서에 남기면 사용자가 없는 옵션을 따라 쓰다 `unknown option` 을 만난다.

**범위 외**: `deploy.md` 의 `--app-key` 1건은 **손대지 않는다.**
`deploy` 는 이 plan 이 다루지 않으므로 그 옵션이 아직 살아 있다.
지우면 문서가 실제 동작보다 앞서 나간다. 별도 plan(065)이 처리한다.

`docs/` 아래 문서는 planning 이 이미 갱신하고 커밋했다(ADR-029). 다시 손대지 않는다.

---

## 작업 항목 (3)

### 1. `skills/nhncloud-cli/references/ncr.md` — 7건 정리

착수 전에 실제 위치를 확인한다.

```bash
# cwd: <repo root>
grep -n '\-\-app-key' skills/nhncloud-cli/references/ncr.md
```

세 종류가 섞여 있다. 각각 다르게 다룬다.

- **우선순위 서술** — `` `--app-key <key>`는 profile의 `ncr.appkey`보다 우선한다. `` 같은 문장은 **지운다.** 우선순위 자체가 없어졌다.
- **명령 예시** — `nhncloud ncr list --app-key <appkey> --json` 은 옵션을 뺀 형태로 바꾼다.
- **옵션 표의 행** — `--app-key` 행이 있으면 지운다.

appkey 를 어디서 설정하는지 안내가 없으면 한 줄 넣는다.
`nhncloud configure --ncr-appkey <appkey>` 형태이며, 다른 서비스 문서의 표현과 맞춘다.

### 2. `skills/nhncloud-cli/references/ncs.md` — 39건 정리

같은 방식이다. 건수가 많으므로 종류별로 훑는다.

```bash
# cwd: <repo root>
grep -n '\-\-app-key' skills/nhncloud-cli/references/ncs.md
```

39건이 대부분 명령 예시일 것으로 보이나 확인 후 처리한다.
우선순위 서술과 옵션 표 행이 섞여 있으면 각각 위 규칙을 적용한다.

### 3. `tasks/064-fix-ncr-ncs-appkey-profile-only/index.json` 완료 마킹

- `status` 를 `completed` 로 바꾼다.
- `current_phase` 를 `3` 으로 바꾼다.
- `phases` 배열 세 항목의 `status` 를 모두 `completed` 로 바꾼다.
- `updated_at` 을 실행 시점 ISO 8601 값으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/ncr.md` | 수정 |
| `skills/nhncloud-cli/references/ncs.md` | 수정 |
| `tasks/064-fix-ncr-ncs-appkey-profile-only/index.json` | 수정 — 완료 마킹 |

## 검증

```bash
# cwd: <repo root>
# ncr·ncs 문서에 --app-key 가 남지 않았는지 — 각각 0 이어야 한다 (변경 전 7, 39)
grep -c '\-\-app-key' skills/nhncloud-cli/references/ncr.md || true
grep -c '\-\-app-key' skills/nhncloud-cli/references/ncs.md || true

# deploy.md 는 그대로여야 한다 — 1 이 나와야 한다
grep -c '\-\-app-key' skills/nhncloud-cli/references/deploy.md || true

# configure 안내가 있는지 — 각각 1 이상이어야 한다
grep -c 'ncr-appkey' skills/nhncloud-cli/references/ncr.md || true
grep -c 'ncs-appkey' skills/nhncloud-cli/references/ncs.md || true
```

마크다운 가독성 검사를 통과해야 한다. 출력이 없으면 통과다.

```bash
# cwd: <repo root>
python3 ~/.claude/scripts/check-readability.py skills/nhncloud-cli/references/ncr.md skills/nhncloud-cli/references/ncs.md
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

## 의도 메모 (왜)

- `deploy.md` 를 남기는 이유는 그 옵션이 아직 코드에 있기 때문이다.
  문서가 구현보다 앞서 나가면 사용자가 없는 동작을 기대한다.
- 우선순위 서술을 지우고 `configure` 안내를 넣는 이유는, 옵션이 사라진 뒤 사용자가 다음에 무엇을 할지 알아야 하기 때문이다.
