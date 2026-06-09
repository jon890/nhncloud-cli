# Phase 04 — ADR-013 보강(blockstorage host) + 공개 docs + 완료 마킹

## 목표

이 기능은 멀티서비스 endpoint 해석에 **세 번째 host(volumev2)** 를 더하는 사례다.
별도 ADR 을 신설하지 않고 **기존 ADR-013(010 이 도입한 멀티서비스 endpoint 해석)을 보강**한다.
그 뒤 공개 docs(README/SKILL/flow/code-architecture/CLAUDE.md)에 `volume *` + `instance volume*` 명령을 반영하고 task 를 완료 마킹한다.

## 선행 의존

- **phase-01~03 완료**(phase-03 은 실측 결과 blocked 일 수 있음 — 그 경우 attach/detach/volumes 관련 docs 는 반영하지 않고 list/get/create 만 반영).
- ADR-013 이 `docs/adr.md` 에 이미 존재해야 한다(010 phase-03 에서 도입). 없으면 010 이 먼저 머지돼야 한다 — 본 phase 는 ADR 을 **신설하지 않고 보강**만 한다.

## 핵심 결정 — ADR 신설 금지, ADR-013 보강

- ADR-013 은 "IaaS 멀티 서비스 endpoint 해석 — 정적 host 맵 유지" 결정이다(image 가 첫 사례).
- block storage(volumev2)는 같은 결정의 **연장**이므로 새 ADR 이 아니라 ADR-013 본문에 한 항목을 더한다.
- 보강 내용: host 맵에 `BLOCKSTORAGE_HOST` 추가 / 경로가 image(tenant 없음)와 달리 **compute 와 같은 tenant 포함**이라는 점 / 캐시에 `blockStorageEndpoint` 추가.

## 변경 파일

1. `docs/adr.md` — ADR-013 본문에 blockstorage host 항목 보강(신설 아님)
2. `CLAUDE.md` — 지원 명령 카운트·목록 + ADR 참조 표 갱신
3. `docs/flow.md` — volume 흐름 + instance volume 흐름 추가
4. `docs/code-architecture.md` — services/blockstorage 디렉터리 + endpoints/keystone 의 blockstorage 확장 + ADR-013 역참조
5. `README.md` — Block Storage 섹션 + instance volume 사용 예
6. `skills/nhncloud-cli/SKILL.md` — volume 명령 표·예시
7. `tasks/017-feat-block-storage-volume/index.json` — status `completed`, phase status 갱신

## 회피 항목 (code-review-pitfalls 사전 확인)

- **4-2 (동기화)**: CLAUDE.md 의 "지원 명령 (N개)" 카운트와 실제 나열 항목 수가 어긋나지 않게 한다 — volume 3개(+ instance volume attach/detach/volumes 3개, phase-03 미blocked 시) 추가 시 숫자와 목록을 함께 갱신.
- **ADR 역참조 양방향**: ADR-013 을 보강했으면 CLAUDE.md "상황별 ADR 필수 참조" 표의 ADR-013 행도 blockstorage 를 포함하도록 갱신(본문만 고치고 표 누락, 반대도 금지).
- **7-1 (docs ↔ 코드 표현 일치)**: README/SKILL 의 옵션 이름·기본값(예: `--size` 필수, `--volume`)이 실제 command 정의와 일치하는지 `--help` 와 대조.

## 작업 상세

### 1. `docs/adr.md` — ADR-013 보강

ADR-013 본문(010 이 작성)의 "결정" 목록에 항목을 더하고, "트레이드오프" 에 region 맵이 늘었음을 반영한다. **새 `<a id="adr-014">` 를 만들지 않는다.**

```markdown
- (보강) block storage(Cinder volumev2) endpoint 도 같은 정적 host 맵으로 해석한다.
  - `endpoints.ts` 에 `BLOCKSTORAGE_HOST` 맵 + `blockStorageHost(region)` 추가.
  - `getIaasToken` 이 `blockStorageEndpoint` 를 함께 반환하고 한 토큰 캐시에 보관한다(compute·image·network 와 동일).
  - host 는 `<region>-api-block-storage-infrastructure.nhncloudservice.com`.
  - 경로는 image(Glance, tenant 없음)와 달리 **compute 와 같은 `/v2/{tenantId}/volumes`**(tenant 포함) — 같은 멀티서비스 패턴 안에서도 type 별로 tenant 유무가 다름을 명시.
```

트레이드오프 항목 갱신(또는 추가):

```markdown
- region 코드가 이제 INSTANCE/IMAGE/NETWORK/BLOCKSTORAGE 4 host 맵에 중복된다 — region 추가 시 동기화 누락 위험. 모든 맵의 key 집합 일치를 빌드 검증(grep)으로 가드한다.
```

### 2. `CLAUDE.md`

(a) `## 지원 명령 (N개)` — phase-03 미blocked 기준 6개 추가(카운트도 +6). blocked 면 volume 3개만(+3):

```markdown
- `volume list` — Block Storage 볼륨 목록 조회 (region 별, `--sort`/`--limit`/`--offset`/`--marker`, 전체 필드는 `--json`).
- `volume get` — 단일 볼륨 조회.
- `volume create` — 볼륨 발급 (`--size <gb>` 필수, `--name`/`--description`/`--volume-type`/`--snapshot-id`).
- `instance volume attach` — 인스턴스에 볼륨 연결 (`--volume <volumeId>`).
- `instance volume detach` — 볼륨 연결 해제.
- `instance volumes` — 인스턴스에 연결된 볼륨 목록.
```

(b) "상황별 ADR 필수 참조" 표의 ADR-013 행을 blockstorage 포함으로 갱신:

```markdown
| Instance/volume endpoint 해석 (compute 외 type — image/network/blockstorage 확장) | ADR-013, ADR-005, ADR-010 |
```

(c) 인증 모델 표: volume·attach 모두 Instance 와 **같은 Keystone 토큰**(`X-Auth-Token`)을 쓰므로 새 행 추가 안 함 — 새 인증 모델 아님(표를 부풀리지 않는다).

### 3. `docs/flow.md`

`## volume 흐름`(신규 섹션) — list/get/create 명령 + 옵션 표.
`## instance 흐름` 에 `instance volume attach/detach`·`instance volumes`(phase-03 미blocked 시) 추가.

```
nhncloud volume list [--sort --limit --offset --marker]   # Block Storage 볼륨 목록
nhncloud volume get <id>                                  # 단일 볼륨
nhncloud volume create --size <gb> [--name ...]           # 볼륨 발급
nhncloud instance volume attach <id> --volume <volumeId>  # 연결
nhncloud instance volume detach <id> <volumeId>           # 해제
nhncloud instance volumes <id>                            # 연결 목록
```

### 4. `docs/code-architecture.md`

- 디렉터리 트리에 `services/blockstorage/`(client + types) + `commands/volume/` 추가.
- `endpoints.ts` 설명에 "block storage host 맵 추가([[adr-013]])".
- `keystone.ts` 설명에 "compute·image·network·blockstorage endpoint 동시 반환([[adr-013]])".

### 5. `README.md`

`### Block Storage (Volume)`(신규 섹션) + 인스턴스 섹션의 volume 연결 예:

```bash
# 볼륨 목록 (attach 할 volume id 확인)
nhncloud volume list

# 10GB 볼륨 발급
nhncloud volume create --size 10 --name my-data

# 단일 볼륨 상태
nhncloud volume get <volume-id>

# 인스턴스에 볼륨 연결 / 연결 목록 / 해제
nhncloud instance volume attach <instance-id> --volume <volume-id>
nhncloud instance volumes <instance-id>
nhncloud instance volume detach <instance-id> <volume-id>
```

> README 예시의 id 는 placeholder(`<volume-id>`/`<instance-id>`) — 실제 UUID 노출 금지(CLAUDE.md 개인 식별 정보 정책).

### 6. `skills/nhncloud-cli/SKILL.md`

volume 명령 표 + 안내 단락(phase-03 미blocked 시 attach/detach/volumes 포함):

```markdown
| 볼륨 목록 조회 | `nhncloud volume list` (전체 필드는 `--json`) |
| 볼륨 발급 | `nhncloud volume create --size 10 --name my-data` |
| 인스턴스에 볼륨 연결 | `nhncloud instance volume attach <instance-id> --volume <volume-id>` |
| 연결된 볼륨 목록 | `nhncloud instance volumes <instance-id>` |
```

### 7. `tasks/017-feat-block-storage-volume/index.json`

- phase-01~04 `status` → `completed`(phase-03 가 실측 blocked 면 그 phase 만 `blocked` 유지 + 최상위 `status` 도 `blocked`, `blocked_reason` 기재 — 무리하게 completed 마킹 금지).
- 미blocked 시: 최상위 `status` → `completed`, `current_phase` → 4, `updated_at` → 완료 시각.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. ADR-013 이 blockstorage 를 포함 (보강 — 신설 아님)
grep -c "block" docs/adr.md | head -1   # ADR-013 본문에 block storage 항목
grep -c "ADR-014" docs/adr.md
# 기대: block storage 언급 1 이상 / ADR-014 신설 0

# 2. ADR-013 역참조가 CLAUDE.md 표에 blockstorage 포함
grep -nE "ADR-013" CLAUDE.md | grep -ic "block"
# 기대: 1 이상 (ADR-013 행이 blockstorage 포함)

# 3. CLAUDE.md 에 volume 명령 반영 (4-2 카운트 ↔ 나열)
grep -cE "volume (list|get|create)" CLAUDE.md
# 기대: 3 이상

# 4. flow/README/SKILL/code-architecture 모두 volume 반영
for f in docs/flow.md README.md skills/nhncloud-cli/SKILL.md docs/code-architecture.md; do
  echo "$f: $(grep -ci 'volume' "$f")"
done
# 기대: 각 파일 1 이상

# 5. 개인 식별 정보 grep (release 사전 점검 1) — 화이트리스트 밖 도메인 0건
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 6. 실제 비밀 형태 0건 (release 사전 점검 2)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 7. 최종 빌드·타입 회귀 없음
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l && pnpm build >/dev/null 2>&1 && echo "build ok"
# 기대: 0 / build ok

# 8. index.json 완료 마킹 (phase-03 미blocked 시)
node -e "const j=require('./tasks/017-feat-block-storage-volume/index.json'); console.log(j.status, j.phases.every(p=>p.status==='completed'||p.status==='blocked'))"
# 기대: completed true (또는 phase-03 blocked 면 blocked + 해당 phase blocked)
```

## 수동 확인

- README/SKILL 의 volume 예시가 실제 옵션 이름과 일치하는지 `node dist/index.js volume create --help` / `instance volume attach --help` 와 대조(7-1).
- ADR-013 본문이 phase-01 의 확정 host 패턴·tenant 포함 경로와 모순되지 않는지 재확인.
- phase-03 가 blocked 면 attach/detach/volumes 관련 docs 를 넣지 않았는지(미구현 명령이 docs 에만 존재하는 mismatch 회피 — ROADMAP 설계 원칙) 확인.
