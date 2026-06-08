# Phase 02 — 공개 docs (README + SKILL) 사용 예 반영 + index.json 완료 마킹

## 목표

phase-01 의 실제 옵션 시그니처에 맞춰 사용자 가이드 docs 를 갱신한다.
공개 docs 는 코드 산출물에 의존하므로 마지막 phase 에서 작성 (planning 8단계 갱신 시점 분리).

근거: planning 8단계 A항 docs 영향 표 "사용자 흐름 변경(옵션 추가)" 행 —
README.md 사용 예 + skills/nhncloud-cli/SKILL.md 시나리오 갱신.
(adr.md / flow.md / CLAUDE.md / code-architecture.md 는 planning 단계에서 이미 반영·commit 완료 — 손대지 않는다.)

## 회피 항목

- **1-18 (영향 표 필수 docs 스킵 금지)**: README 사용 예 + SKILL 옵션 표·시나리오는 필수. "범위 외" 로 빼지 않는다.
- **1-8 (index.json 완료 마킹)**: 마지막 phase 라 index.json status·current_phase 갱신 포함.

## 변경 파일 (2개 + index.json)

1. `README.md` — instance create 사용 예에 `--user-data` 블록 추가
2. `skills/nhncloud-cli/SKILL.md` — instance create 옵션 표에 `--user-data` 행 + cloud-init CI 시나리오
3. `tasks/006-feat-instance-user-data/index.json` — 완료 마킹

## 작업 상세

### 1. `README.md`

instance create 예시 블록 (`--boot-volume-size` 예시 **다음**, `--quiet --wait` 예시 **앞**) 에 추가:

```bash
# cloud-init user-data 주입 (부팅 시 자동 셋업 — NVIDIA 드라이버·docker 등)
nhncloud instance create \
  --name gpu-runner \
  --flavor <gpu-flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --boot-volume-size 30 \
  --user-data ./cloud-init.yaml \
  --wait
```

### 2. `skills/nhncloud-cli/SKILL.md`

(a) `### instance create 옵션` 표에서 `--protect` 행 **다음**, `--wait` 행 **앞**에 추가:

```
| `--user-data <path>` | 아니오 | cloud-init user-data 파일 경로. base64 인코딩해 `user_data` 주입 (인코딩 후 65535 바이트 한도, 초과 시 입력 오류). 부팅 시 드라이버·패키지 자동 셋업에 사용 |
```

(b) `### 체이닝 예시` 블록에 시나리오 추가 (예: `# 5.` 로):

```bash
# 5. cloud-init 으로 부팅 시 셋업 자동화 (일회성 GPU CI 러너)
nhncloud instance create \
  --name gpu-ci \
  --flavor <gpu-flavor-id> \
  --image <image-id> \
  --network <network-uuid> \
  --boot-volume-size 30 \
  --user-data ./setup-nvidia-docker.yaml \
  --wait --quiet
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: /Users/nhn/personal/nhncloud-cli

# 1. README 에 --user-data 사용 예 등장
grep -c -- "--user-data" README.md
# 기대: >= 1

# 2. SKILL 옵션 표 + 시나리오에 --user-data 등장 (표 1행 + 체이닝 예시 1회 = 2+)
grep -c -- "--user-data" skills/nhncloud-cli/SKILL.md
# 기대: >= 2

# 3. flow.md 옵션 표는 planning 단계에서 이미 반영됨 — 중복 추가 안 했는지 확인 (1회만)
grep -c -- "--user-data" docs/flow.md
# 기대: 1

# 4. index.json 완료 마킹
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/006-feat-instance-user-data/index.json
sed -i '' 's/"current_phase": 0/"current_phase": 2/' tasks/006-feat-instance-user-data/index.json
grep -c '"status": "completed"' tasks/006-feat-instance-user-data/index.json
# 기대: 3  (index 1 + phase 2)
grep -cE '"current_phase": 2' tasks/006-feat-instance-user-data/index.json
# 기대: 1

# 5. 빌드 회귀 없음 (docs 만 바뀌지만 최종 게이트)
pnpm build && pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0
```

## commit (실행 도구별)

- `/plan-and-build`: 이 phase 에서 docs 변경 + index.json 마킹을 단일 commit 으로 묶고 push.
- `/build-with-teams`: commit·push·PR 은 team-lead 책임 — 이 phase 는 파일 변경 + index.json 마킹까지만.
  (common-pitfalls 1-17 — 실행 도구에 따라 마지막 phase commit 책임이 다름.)
