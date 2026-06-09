# Phase 02 — 공개 docs + 내부 docs 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 docs 를 갱신한다.
공개 docs(README·SKILL)는 코드 산출물(실제 옵션/출력)에 의존하므로 **마지막 phase 에서** 갱신한다.
내부 docs(CLAUDE.md 명령 수·flow.md 시그니처·code-architecture.md client 메서드/command 파일)도 함께 갱신해 코드와 어긋나지 않게 한다.

## 변경 파일 (6개)

1. `README.md` — instance 사용 예 블록에 availability-zones 추가
2. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 행 + 시나리오 안내
3. `CLAUDE.md` — 지원 명령 수(11 → 12) + availability-zones bullet 추가
4. `docs/flow.md` — 명령 시그니처 블록에 availability-zones 행 추가
5. `docs/code-architecture.md` — client 메서드 목록·command 파일 목록에 추가
6. `tasks/015-feat-instance-availability-zones/index.json` — status `completed` + 갱신

## 작업 상세

### 1. `README.md`

instance 사용 예 코드블록에서 `# 단일 인스턴스 상태 조회` **앞**(flavors 예시 블록 다음)에 availability-zones 예시를 추가:

````
# 가용성 영역(availability zone) 목록 — create 의 --availability-zone 후보
nhncloud instance availability-zones

# 전체 응답(zoneState 등)은 --json 으로
nhncloud instance availability-zones --json
````

### 2. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표에서 "인스턴스 타입(flavor) 목록" 행 **다음**에 추가:

```
| 가용성 영역 목록 | `nhncloud instance availability-zones` |
```

(b) instance 섹션(flavors 조회 안내 인접)에 시나리오 안내를 한 곳 추가:

```
### instance availability-zones 조회

- `nhncloud instance availability-zones` — 가용성 영역 목록(zoneName·available). create 의 `--availability-zone` 에 넣을 영역을 고를 때.
- `available` 이 false 인 영역은 신규 발급이 막혀 있으니 true 인 영역을 고른다.
- 전체 응답(zoneState 등)은 `--json` 으로 확인한다.
```

> SKILL.md 는 공개 OSS — 실제 영역명·tenant 등 식별자를 박지 말 것. 영역명은 일반 예(`<zone>`)나 placeholder 만 사용(CLAUDE.md 개인 식별 정보 정책).

### 3. `CLAUDE.md`

(a) `## 지원 명령 (11개)` 헤더의 수를 **12개**로 변경.

(b) `instance flavors` bullet **다음** 줄에 추가:

```
- `instance availability-zones` — 가용성 영역 목록 조회 (create 의 `--availability-zone` 후보, zoneName·available).
```

### 4. `docs/flow.md`

명령 시그니처 코드블록에서 `nhncloud instance flavors ...` 줄 **다음**에 추가 (정렬 맞춰):

```
nhncloud instance availability-zones [options]  # 가용성 영역(AZ) 목록 조회
```

> 이 명령은 `--region`·`--profile` + 전역 옵션만 쓰므로 flow.md 의 옵션 표에는 새 행이 필요 없다 (전역 옵션 행이 이미 커버).

### 5. `docs/code-architecture.md`

(a) `client.ts` 설명 줄의 메서드 목록에 `listAvailabilityZones` 추가:

```
      client.ts             # InstanceClient — list / get / create / delete / listFlavors / listAvailabilityZones + waitForActive
```

(b) `types.ts` 설명 줄에 `AvailabilityZone` 추가:

```
      types.ts              # Server / CreateServerParams / Flavor / FlavorDetail / AvailabilityZone (NHN 확장 필드 포함)
```

(c) `commands/instance/` 목록에서 `flavors.ts` 줄 **다음**에 추가:

```
      availability-zones.ts # nhncloud instance availability-zones
```

### 6. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

그리고 phases[0].status·phases[1].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. README 에 availability-zones 예시 반영
grep -c "instance availability-zones" README.md
# 기대: 2 이상

# 2. SKILL 에 availability-zones 반영 (표 + 시나리오)
grep -c "instance availability-zones" skills/nhncloud-cli/SKILL.md
# 기대: 2 이상

# 3. CLAUDE.md 명령 수 갱신 (12개)
grep -c "지원 명령 (12개)" CLAUDE.md
# 기대: 1

# 4. CLAUDE.md bullet 추가
grep -c "instance availability-zones" CLAUDE.md
# 기대: 1 이상

# 5. flow.md 시그니처 추가
grep -c "instance availability-zones" docs/flow.md
# 기대: 1 이상

# 6. code-architecture.md 메서드·command 반영
grep -c "listAvailabilityZones" docs/code-architecture.md
# 기대: 1 이상
grep -c "availability-zones.ts" docs/code-architecture.md
# 기대: 1 이상

# 7. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 8. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ 2>/dev/null
# 기대: 0건

# 9. index.json 완료 마킹
grep -c '"status": "completed"' tasks/015-feat-instance-availability-zones/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# 실제 가용성 영역 목록 (profile 설정 후)
node dist/index.js instance availability-zones
node dist/index.js instance availability-zones --json | head

# 기대: zoneName·available 2컬럼 표. available 컬럼이 "true"/"false" 로 채워짐
#       (전부 "undefined" 면 → zoneState.available 중첩 접근 누락 회귀 — phase-01 회피 항목)
```
