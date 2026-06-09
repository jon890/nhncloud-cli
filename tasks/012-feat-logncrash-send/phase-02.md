# Phase 02 — 공개 docs (README + SKILL) 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 공개 docs 두 곳에 `logncrash send` 사용 예를 반영한다.
이 두 문서는 코드 산출물(실제 옵션/동작)에 의존하므로 **마지막 phase 에서** 갱신한다 (planning SKILL 갱신 시점 분리 원칙).

핵심: "본문은 `--body`/`--file`/stdin 으로 받고, secret 없이 appkey 만으로 전송한다 (검색과 다른 collector·인증)" 를 사용 예에 명시한다.

> 공개 OSS — 실제 appkey/secret/도메인 등 식별자를 박지 말 것. placeholder(`<appkey>` 등)만 사용 (CLAUDE.md 개인 식별 정보 정책).

## 변경 파일 (3개)

1. `README.md` — logncrash 사용 예 블록에 send 추가
2. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + send 시나리오 반영
3. `tasks/012-feat-logncrash-send/index.json` — status `completed` + 두 phase `completed` + `updated_at` 갱신

## 작업 상세

### 1. `README.md`

logncrash 사용 예 코드블록에서 `search` 예시 **다음** 에 send 예시를 추가:

````
# 로그 한 건 전송 — 본문 직접
nhncloud logncrash send --body "결제 완료" --level INFO

# 파일에서 본문 읽어 전송
nhncloud logncrash send --file ./error.log --level ERROR

# 파이프(stdin)로 전송
echo "배치 작업 종료" | nhncloud logncrash send --level INFO

# 프로젝트 버전·소스 지정
nhncloud logncrash send --body "deploy 시작" --app-version 2.3.0 --source batch
````

검색과 다른 인증을 한 줄로 안내한다 (코드블록 인접 산문):

```
> logncrash send 는 검색과 다른 collector 로 전송하며 appkey 만 사용한다 (secret 불요). 단일 로그 본문은 8MB 까지.
```

(c) **intro "지원 명령" 문구 갱신 (회고 PR #11·#13 — 메타 문구 누락 방지)**: README.md 상단 intro 가 `logncrash search` 만 언급하면 `logncrash search/send` 병기 또는 현재 명령 커버리지를 반영하도록 갱신한다 (산문 + bullet 양쪽 점검).

### 2. `skills/nhncloud-cli/SKILL.md`

(b-0) **프론트매터 description 갱신 (회고 PR #13 — SKILL 은 프론트매터 + 본문 두 곳)**: `skills/nhncloud-cli/SKILL.md` 의 `description:` 이 logncrash 를 `로그 검색` 만 언급하면 `로그 검색·전송(search/send)` 으로 send 를 병기한다. 프론트매터 description 은 AI 에이전트 스킬 선택 트리거라 누락 시 send 작업이 매칭에서 빠진다 (본문 갱신과 별개 위치 — 둘 다 손댄다).

(a) 빠른 참조 표에서 "Log & Crash 로그 검색" 행 **다음** 에 추가:

```
| Log & Crash 로그 전송 | `nhncloud logncrash send --body "<메시지>" --level INFO` |
```

(b) logncrash 섹션에 send 사용 안내 문단/시나리오를 한 곳 추가 (에이전트가 자연어→명령 변환 시 참고):

```
### logncrash send 전송

- `nhncloud logncrash send --body "<메시지>"` — 로그 한 건을 Log & Crash 로 전송. 본문은 `--body`, 또는 `--file <path>`, 또는 stdin(파이프) 으로 전달한다.
- `--level` 로 DEBUG/INFO/WARN/ERROR/FATAL 을 지정한다. `--app-version`(projectVersion)·`--source`/`--type`/`--host` 로 부가 필드를 설정한다.
- 검색과 달리 collector 로 전송하며 **appkey 만 사용**한다 (secret 불요·ADR-014). 단일 로그 본문은 8MB 한도이며 초과 시 입력 오류로 차단된다.
```

### 3. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

그리고 `phases[0].status`, `phases[1].status` 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 plan012 worktree>

# 1. README 에 send 예시 반영
grep -c "logncrash send" README.md
# 기대: 3 이상

# 2. README 에 appkey-only/8MB 안내 포함
grep -Ec "appkey 만|secret 불요|8MB" README.md
# 기대: 1 이상

# 3. SKILL 빠른 참조 표 + 시나리오에 send
grep -c "logncrash send" skills/nhncloud-cli/SKILL.md
# 기대: 2 이상

# 4. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 5. 실제 비밀 형태 점검 (placeholder <...> 제외)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 6. index.json 완료 마킹
grep -c '"status": "completed"' tasks/012-feat-logncrash-send/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# 실제 로그 전송 (profile 의 logncrash.appkey 설정 후)
node dist/index.js logncrash send --body "nhncloud-cli send 테스트" --level INFO
echo "hi from pipe" | node dist/index.js logncrash send --level DEBUG

# 전송 후 search 로 역확인 (대칭 동작 검증)
node dist/index.js logncrash search --query 'logLevel:"INFO"' --from 10m --to now
```

> 수동 확인 시 실제 appkey 는 `~/.nhncloud/credentials.json` 의 profile 자격증명에서 읽는다. 명령줄·docs 에 실제값을 노출하지 않는다.
