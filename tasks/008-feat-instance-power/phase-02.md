# Phase 02 — 내부/공개 docs 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/동작에 맞춰 내부 docs 와 공개 docs 에 `instance start/stop/reboot` 를 반영한다.
docs 는 코드 산출물(실제 옵션·동작)에 의존하므로 **마지막 phase 에서** 갱신한다 (planning 의 SKILL 갱신 시점 분리 원칙).

이 task 는 백로그라 명령 카운트·flow.md·code-architecture.md 갱신을 **이 phase 안에서** 한다 (미리 박지 않는다).

## 변경 파일 (6개)

1. `CLAUDE.md` — "지원 명령 (N개)" 카운트 +3, instance 명령 목록에 3행 추가
2. `docs/flow.md` — instance 명령 시그니처 블록에 3줄 추가 + 전원 제어 흐름 설명
3. `docs/code-architecture.md` — InstanceClient 메서드 목록에 start/stop/reboot 추가, power.ts 행 추가
4. `README.md` — instance 사용 예 블록에 전원 제어 예시 추가
5. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 3행 + 전원 제어 안내 문단
6. `tasks/008-feat-instance-power/index.json` — status `completed` + current_phase + phases status 갱신

## 작업 상세

### 1. `CLAUDE.md`

(a) 8번 줄 `## 지원 명령 (11개)` → `## 지원 명령 (14개)` (start/stop/reboot 3개 추가).

(b) instance 명령 목록 (`instance delete` 행) **다음** 에 추가:

```
- `instance start` — 인스턴스 시작 (SHUTOFF→ACTIVE).
- `instance stop` — 인스턴스 정지 (ACTIVE/ERROR→SHUTOFF).
- `instance reboot` — 인스턴스 재부팅 (기본 SOFT, `--hard` 로 HARD).
```

> ADR 표 (상황별 ADR 필수 참조) 에는 행을 추가하지 않는다 — 이 기능은 기존 `resolveInstanceClient`(ADR-010) 재사용이라 신규 ADR 이 없다.

### 2. `docs/flow.md`

(a) instance 명령 시그니처 블록 (156~160줄, `nhncloud instance delete <id>` 다음) 에 추가:

```
nhncloud instance start <id> [options]          # 인스턴스 시작
nhncloud instance stop <id> [options]           # 인스턴스 정지
nhncloud instance reboot <id> [options]         # 인스턴스 재부팅 (--hard 로 HARD)
```

(b) instance flavors 설명 문단 근처에 전원 제어 흐름을 1문단 추가:

```
- 전원 제어(`start`/`stop`/`reboot`)는 모두 `POST /servers/{id}/action` 한 경로다 (응답 202 무본문).
  client 의 공용 `serverAction(id, payload)` 가 action body(`os-start`/`os-stop`/`reboot.type`)만 달리해 호출한다.
  조회가 아니라 동작이라 출력은 성공 메시지(stderr)뿐이고 stdout 은 비운다 (delete 와 동일).
  상태 전이 확인은 후속 `instance get <id>` 로 한다.
```

### 3. `docs/code-architecture.md`

(a) 36번 줄 InstanceClient 메서드 목록 갱신:

```
client.ts             # InstanceClient — list / get / create / delete / listFlavors / start / stop / reboot + waitForActive (전원 제어는 공용 serverAction 경유)
```

(b) `delete.ts` 행 (59번 줄) **다음** 에 power.ts 행 추가:

```
      power.ts              # nhncloud instance start/stop/reboot <id> (전원 제어, serverAction 재사용)
```

### 4. `README.md`

instance 사용 예 코드블록에서 `instance delete` 예시 **다음** 에 추가:

````
# 인스턴스 정지 / 시작
nhncloud instance stop <instance-id>
nhncloud instance start <instance-id>

# 재부팅 (기본 SOFT)
nhncloud instance reboot <instance-id>

# HARD 재부팅 (강제 전원 cycle)
nhncloud instance reboot <instance-id> --hard
````

### 5. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표 (`인스턴스 삭제` 행, 314번 줄) **다음** 에 3행 추가:

```
| 인스턴스 시작 | `nhncloud instance start <id>` |
| 인스턴스 정지 | `nhncloud instance stop <id>` |
| 인스턴스 재부팅 | `nhncloud instance reboot <id>` (`--hard` 로 HARD) |
```

(b) `### instance flavors 조회` 섹션 인접에 전원 제어 안내 섹션 추가 (에이전트 자연어→명령 변환용):

```
### instance 전원 제어 (start / stop / reboot)

- `nhncloud instance start <id>` — 정지된(SHUTOFF) 인스턴스를 켠다 (→ ACTIVE).
- `nhncloud instance stop <id>` — 동작 중인(ACTIVE) 인스턴스를 끈다 (→ SHUTOFF).
- `nhncloud instance reboot <id>` — 재부팅한다. 기본은 SOFT(OS graceful), `--hard` 는 강제 전원 cycle.
- 세 명령 모두 요청만 보내고(202 무본문) 상태 전이는 비동기다. 전이 확인은 `nhncloud instance get <id>` 로 한다.
```

> SKILL.md 는 공개 OSS — 실제 인스턴스 id 를 박지 말 것. placeholder(`<id>` / `<instance-id>`)만 사용 (CLAUDE.md 개인 식별 정보 정책).

### 6. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

그리고 phases[0].status, phases[1].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. CLAUDE.md 명령 카운트 갱신 (+3)
grep -c "지원 명령 (14개)" CLAUDE.md
# 기대: 1

# 2. flow.md 에 전원 명령 시그니처 3줄
grep -Ec "instance (start|stop|reboot) <id>" docs/flow.md
# 기대: 3

# 3. code-architecture 에 power.ts + 메서드 반영
grep -c "power.ts" docs/code-architecture.md
# 기대: 1
grep -Ec "start / stop / reboot|start/stop/reboot" docs/code-architecture.md
# 기대: 1 이상

# 4. README 에 전원 제어 예시
grep -Ec "instance (start|stop|reboot)" README.md
# 기대: 4 이상 (stop/start/reboot/reboot --hard)

# 5. SKILL 빠른 참조 표에 전원 제어 3행
grep -Ec "인스턴스 (시작|정지|재부팅)" skills/nhncloud-cli/SKILL.md
# 기대: 3 이상

# 6. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 7. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 8. index.json 완료 마킹
grep -c '"status": "completed"' tasks/008-feat-instance-power/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
node dist/index.js instance stop <instance-id>
node dist/index.js instance get <instance-id>     # status: SHUTOFF 확인
node dist/index.js instance start <instance-id>
node dist/index.js instance get <instance-id>     # status: ACTIVE 확인
node dist/index.js instance reboot <instance-id> --hard
```
