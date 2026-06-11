# Phase 03 — 내부/공개 docs 반영 + 완료 마킹

## 목표

phase-02 의 실제 명령 인자/동작에 맞춰 내부 docs 와 공개 docs 에 `instance resize` 를 반영한다.
docs 는 코드 산출물(실제 옵션·동작)에 의존하므로 **마지막 phase 에서** 갱신한다 (planning 의 SKILL 갱신 시점 분리 원칙).

## ⚠️ 소유권 분리 (common-pitfalls 1-24 / 갱신 시점 분리)

아래 작업 1~3 (`CLAUDE.md` · `docs/flow.md` · `docs/code-architecture.md`) 는 **결정 docs 라 executor 가 phase 안에서 편집하지 않는다.** team-lead 가 phase-02 완료 후 (실제 등록된 명령에 맞춰) docs-first 성격의 별도 commit 으로 작성한다. 아래 1~3 상세는 그 team-lead 작성 스펙으로 남겨둔다.

**executor 의 phase-03 범위는 작업 4(README) · 5(SKILL) · 6(완료 마킹) 뿐이다.**

> **명령 개수 확정 (phase-01)**: (B) 수동 confirm — `resize` + `resize-confirm` + `resize-revert` **3개** (24→27). resize 는 fire-and-return(폴링 없음) — (A) 자동 confirm 케이스면 confirm/revert 가 불필요할 뿐, 명령은 3개 등록.

## 변경 파일

**(team-lead, phase-02 후 docs-first commit — executor 범위 밖)**
1. `CLAUDE.md` — "지원 명령 (N개)" 카운트 +3 (24→27), instance 명령 목록에 resize/resize-confirm/resize-revert 행 추가 (ADR 표는 무변경 — 신규 ADR 없음)
2. `docs/flow.md` — instance 명령 시그니처 블록에 resize/confirm/revert 줄 + resize 흐름(VERIFY_RESIZE 2단계) 설명
3. `docs/code-architecture.md` — InstanceClient 메서드 목록에 resize/confirmResize/revertResize 추가, resize.ts 행 추가

**(executor phase-03)**
4. `README.md` — instance 사용 예 블록에 resize 예시 추가 + intro "지원 명령" 문구
5. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + resize 안내 문단 (flavors 연계) + 프론트매터 description
6. `tasks/014-feat-instance-resize/index.json` — status `completed` + current_phase + phases status 갱신

## 작업 상세

### 1. `CLAUDE.md`

(a) `## 지원 명령 (N개)` 의 N 을 갱신한다.

> **카운트는 하드코딩하지 말고 현재 값을 읽어 더한다** — 008(instance power, +3) 등 선행 task 의 머지 순서에 따라 기준값이 달라진다.
> `grep -n "지원 명령" CLAUDE.md` 로 현재 N 을 확인한 뒤, (A) 면 N+1, (B) 면 N+3 으로 고친다.

(b) instance 명령 목록 (`instance delete` 행) **다음** 에 추가:

```
- `instance resize` — 인스턴스 타입(flavor) 변경 (`--flavor` 필수, 사전 상태 ACTIVE/SHUTOFF).
```

(B) 수동 confirm 인 경우에만 이어서:

```
- `instance resize-confirm` — resize 확정 (VERIFY_RESIZE→ACTIVE, 새 flavor 고정).
- `instance resize-revert` — resize 롤백 (VERIFY_RESIZE→ACTIVE, 이전 flavor 복귀).
```

> ADR 표 (상황별 ADR 필수 참조) 에는 행을 추가하지 않는다 — 이 기능은 기존 `resolveInstanceClient`(ADR-010) + 008 의 `serverAction` 재사용이라 신규 ADR 이 없다.

### 2. `docs/flow.md`

(a) instance 명령 시그니처 블록 (`nhncloud instance delete <id>` 다음) 에 추가:

```
nhncloud instance resize <id> --flavor <id>     # 인스턴스 타입(flavor) 변경
```

(B) 인 경우 이어서:

```
nhncloud instance resize-confirm <id>           # resize 확정 (VERIFY_RESIZE→ACTIVE)
nhncloud instance resize-revert <id>            # resize 롤백 (이전 flavor 복귀)
```

(b) instance flavors 설명 문단 근처에 resize 흐름을 1문단 추가 (실측 결과에 맞춰 (A)/(B) 중 하나만):

```
- 타입 변경(`resize`)은 `POST /servers/{id}/action` body { "resize": { "flavorRef": "<id>" } } 한 경로다 (응답 202 무본문).
  client 의 공용 serverAction(id, payload) 를 008 전원 제어와 함께 재사용한다.
  변경할 flavor id 는 `instance flavors --detail` 로 후보를 조회해 고른다 (007 연계).
```

(A) 자동 confirm 이면 위에 이어서:

```
  NHN 은 resize 후 자동으로 confirm 한다 (실측 확인) — 별도 확정 호출이 불필요하고 잠시 후 ACTIVE 로 돌아온다.
```

(B) 수동 confirm 이면 위에 이어서:

```
  resize 후 인스턴스는 VERIFY_RESIZE 에서 멈춘다 (실측 확인). `resize-confirm` 으로 새 flavor 를 고정하거나
  `resize-revert` 로 이전 flavor 로 롤백해야 ACTIVE 가 된다. 상태 전이 확인은 `instance get <id>` 로 한다.
```

### 3. `docs/code-architecture.md`

(a) InstanceClient 메서드 목록(36번 줄 부근) 갱신 — (A):

```
      client.ts             # InstanceClient — list / get / create / delete / listFlavors / resize + waitForActive (전원·resize 는 공용 serverAction 경유, 008/014)
```

(B) 면 `resize / confirmResize / revertResize` 로:

```
      client.ts             # InstanceClient — list / get / create / delete / listFlavors / resize / confirmResize / revertResize + waitForActive (전원·resize 는 공용 serverAction 경유, 008/014)
```

> 008(power) 이 먼저 머지됐다면 이 줄에 이미 `start / stop / reboot` 가 있을 수 있다 — 현재 줄 내용을 읽어 resize 항목만 더한다 (기존 항목을 지우지 않는다).

(b) `delete.ts` 행 **다음** 에 resize.ts 행 추가 — (A):

```
      resize.ts             # nhncloud instance resize <id> --flavor <id> (serverAction 재사용)
```

(B) 면:

```
      resize.ts             # nhncloud instance resize / resize-confirm / resize-revert <id> (serverAction 재사용)
```

### 4. `README.md`

instance 사용 예 코드블록에서 `instance delete` 예시 **다음** 에 추가 — (A):

````
# 인스턴스 타입(flavor) 변경 — 후보 id 는 instance flavors 로 조회
nhncloud instance flavors --detail
nhncloud instance resize <instance-id> --flavor <flavor-id>
````

(B) 면 이어서:

````
# resize 후 VERIFY_RESIZE 상태 — 확정 또는 롤백
nhncloud instance resize-confirm <instance-id>
nhncloud instance resize-revert <instance-id>
````

### 5. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표 (`인스턴스 삭제` 행) **다음** 에 추가 — (A):

```
| 인스턴스 타입 변경 | `nhncloud instance resize <id> --flavor <flavor-id>` |
```

(B) 면 이어서:

```
| resize 확정 | `nhncloud instance resize-confirm <id>` |
| resize 롤백 | `nhncloud instance resize-revert <id>` |
```

(b) instance 안내 섹션 인접에 resize 안내 섹션 추가 (에이전트 자연어→명령 변환용, 007 flavors 연계 명시):

```
### instance 타입 변경 (resize)

- `nhncloud instance resize <id> --flavor <flavor-id>` — 인스턴스 타입(flavor)을 바꾼다. 사전 상태는 ACTIVE 또는 SHUTOFF.
- 변경할 `<flavor-id>` 는 `nhncloud instance flavors --detail` 로 후보를 조회해 고른다 (vcpus·ram·disk 비교).
```

(A) 자동 confirm 이면 이어서:

```
- NHN 은 resize 후 자동으로 확정한다 — 별도 호출 없이 잠시 후 ACTIVE 로 돌아오고 새 flavor 가 적용된다.
```

(B) 수동 confirm 이면 이어서:

```
- resize 후 인스턴스는 VERIFY_RESIZE 에서 멈춘다. `resize-confirm <id>` 로 새 flavor 를 고정하거나 `resize-revert <id>` 로 롤백한다.
- 상태 전이는 비동기다 — `nhncloud instance get <id>` 로 status 를 확인한다.
```

> SKILL.md 는 공개 OSS — 실제 인스턴스 id·flavor id 를 박지 말 것. placeholder(`<id>` / `<instance-id>` / `<flavor-id>`)만 사용 (CLAUDE.md 개인 식별 정보 정책).

### 6. `index.json`

phase-01·02·03 완료 후:

```json
"status": "completed",
"current_phase": 3,
```

그리고 phases[0..2].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

### 자동 검증

```bash
# cwd: <repo root 또는 worktree>

# 1. CLAUDE.md 명령 카운트가 instance 명령 목록 개수와 일치 (하드코딩 대신 정합성)
#    instance 명령 목록 줄 수를 세어 "지원 명령 (N개)" 의 N 과 대조
grep -cE "^- \`instance " CLAUDE.md   # instance 명령 행 개수 (resize 반영 후 늘어야 함)
grep -oE "지원 명령 \([0-9]+개\)" CLAUDE.md   # N 확인 — 위 증가분이 반영됐는지 수동 대조

# 2. CLAUDE.md 에 resize 행
grep -c "instance resize" CLAUDE.md
# 기대: 1 이상  (B 면 resize/resize-confirm/resize-revert 로 더 많음)

# 3. flow.md 에 resize 시그니처
grep -c "instance resize <id>" docs/flow.md
# 기대: 1

# 4. code-architecture 에 resize.ts + 메서드 반영
grep -c "resize.ts" docs/code-architecture.md
# 기대: 1
grep -c "resize" docs/code-architecture.md
# 기대: 2 이상 (client.ts 메서드 줄 + resize.ts 행)

# 5. README 에 resize 예시 + flavors 연계
grep -c "instance resize" README.md
# 기대: 1 이상
grep -c "instance flavors --detail" README.md
# 기대: 1 이상 (resize 후보 조회 연계)

# 6. SKILL 빠른 참조 표에 resize 행
grep -c "인스턴스 타입 변경" skills/nhncloud-cli/SKILL.md
# 기대: 1 이상

# 7. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 8. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 9. index.json 완료 마킹 (task 1 + phase 3)
grep -c '"status": "completed"' tasks/014-feat-instance-resize/index.json
# 기대: 4
```

### 수동 확인 (자격증명 필요 — 사용자/QA)

```bash
# 실제 resize (profile 설정 후)
node dist/index.js instance flavors --detail
node dist/index.js instance resize <instance-id> --flavor <new-flavor-id>
node dist/index.js instance get <instance-id>   # 상태 전이 + flavor 확인
```
