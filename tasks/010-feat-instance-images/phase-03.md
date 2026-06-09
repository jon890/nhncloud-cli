# Phase 03 — ADR-013 + 공개 docs + 완료 마킹

## 목표

이 기능은 endpoint 해석을 compute 외 type(image)으로 확장하는 **첫 사례**라 ADR 을 동반한다.
ADR-013 을 추가하고, 공개 docs(README/SKILL/flow/code-architecture/CLAUDE.md)에 `instance images` 를 반영한 뒤 task 를 완료 마킹한다.

## 변경 파일

1. `docs/adr.md` — ADR-013 추가
2. `CLAUDE.md` — 지원 명령 카운트·목록 + 인증 모델/ADR 참조 표 갱신
3. `docs/flow.md` — instance 흐름에 images 추가
4. `docs/code-architecture.md` — endpoints/keystone/token-store 의 image 확장 + ADR 역참조
5. `README.md` — 인스턴스 섹션에 images 사용 예
6. `skills/nhncloud-cli/SKILL.md` — instance 표·예시에 images
7. `tasks/010-feat-instance-images/index.json` — status `completed`, phase status 갱신

## 회피 항목

- **4-2 (동기화)**: CLAUDE.md 의 "지원 명령 (N개)" 카운트와 실제 나열 항목 수가 어긋나지 않게 한다 — images 추가 시 숫자와 목록을 함께 갱신.
- **ADR 역참조 양방향**: ADR-013 추가 시 CLAUDE.md "상황별 ADR 필수 참조" 표에도 행을 더한다(ADR 표만 고치고 본문 누락, 반대도 금지).

## 작업 상세

### 1. `docs/adr.md` — ADR-013

ADR-012 **뒤**, 파일 끝에 추가. anchor 패턴(`<a id="adr-013"></a>`)은 기존 ADR 형식을 따른다.

```markdown
<a id="adr-013"></a>

## ADR-013: IaaS 멀티 서비스 endpoint 해석 — image catalog host 맵 추가 (정적 맵 유지)

- **결정**: image(Glance v2) endpoint 도 compute 와 동일하게 region 별 **정적 host 맵**으로 해석한다.
  - `endpoints.ts` 에 `IMAGE_HOST` 맵 + `imageHost(region)` 추가.
  - `getIaasToken` 이 `computeEndpoint` 와 `imageEndpoint` 를 함께 반환하고, 한 토큰 캐시에 같이 보관한다.
  - image 는 compute 와 다른 host(`<region>-api-image-infrastructure...`, 실측 확정)지만 **같은 Keystone 토큰**(`X-Auth-Token`)을 재사용한다.
  - Glance 경로는 compute 의 `/v2/{tenantId}/...` 와 달리 tenant segment 가 없다(`/v2/images`, 실측 확정).
- **맥락**: instance images 는 service catalog type 이 compute 가 아니라 image 인 첫 명령이다.
  - 기존 코드는 compute host 만 정적 맵으로 갖고 serviceCatalog 를 파싱하지 않는다([[adr-005]]).
  - region 별 image host 도 compute 와 같은 정적 패턴이라 맵 한 개를 더해 해결된다.
- **대안 기각**:
  - **serviceCatalog 동적 파싱** — 토큰 발급 응답에서 type 별 endpoint 를 추출하면 host 맵이 필요 없어진다.
    하지만 토큰마다 catalog 파싱이 붙고(가드·실패 처리 증가), 캐시 구조도 type 별 endpoint 맵으로 커진다.
    서비스가 image 하나 더 느는 시점에 동적 파싱까지 도입하는 것은 과하다 — [[adr-005]] 의 정적 맵 노선을 연장한다.
    (서비스 type 이 더 늘어 맵 관리가 부담이 되는 시점에 재검토한다.)
  - **profile 에 endpoint 직접 저장** — 설정 부담 + region override 와 충돌.
- **트레이드오프**:
  - region 코드가 `INSTANCE_HOST`·`IMAGE_HOST` 두 맵에 중복된다 — region 추가 시 동기화 누락 위험.
    두 맵 key 집합 일치를 빌드 검증(grep)으로 가드한다.
  - host 패턴·tenant 유무를 docs 만으로 확정하지 못해 실측으로 확정했다(추측 구현 금지).
```

> ADR 본문의 host 패턴·tenant 유무 문구는 phase-01 실측으로 확정한 값에 맞춘다.

### 2. `CLAUDE.md`

(a) `## 지원 명령 (N개)` — 카운트를 1 늘리고 목록에 행 추가(`instance list` 뒤가 자연스러움):

```markdown
- `instance images` — 이미지 목록 조회 (`create --image <id>` 소스, `--visibility`/`--name`/`--owner`/`--status` 필터, marker 페이지네이션, 전체 필드는 `--json`).
```

(b) "상황별 ADR 필수 참조" 표에 행 추가:

```markdown
| Instance image endpoint 해석 (compute 외 type 확장) | ADR-013, ADR-005, ADR-010 |
```

(c) 인증 모델 표는 image 가 Instance 와 **같은 Keystone 토큰**을 쓰므로 새 행을 추가하지 않는다 — 필요하면 기존 Instance 행에 "(compute·image 공통 토큰)" 정도만 덧붙인다. 새 인증 모델이 아니므로 표를 부풀리지 않는다.

### 3. `docs/flow.md`

`## instance 흐름` 의 명령 목록에 images 추가(`instance list` 뒤):

```
nhncloud instance images [options]              # 이미지 목록 (create --image 소스)
```

옵션 표에도 `--visibility`/`--limit`/`--marker`/`--name`/`--owner`/`--status`(images) 행을 더한다(flavors 행 인접).

### 4. `docs/code-architecture.md`

`api/endpoints.ts`·`keystone.ts`·`token-store.ts` 설명에 image 확장을 반영하고 ADR-013 역참조를 단다:

- `endpoints.ts` 설명에 "image host 맵 추가([[adr-013]])" 한 구절.
- `keystone.ts` 설명에 "compute·image endpoint 동시 반환([[adr-013]])".

### 5. `README.md`

`### 인스턴스 (Instance)` 의 flavors 사용 예 인근에 images 예시 블록 추가:

```bash
# 이미지 목록 (create --image <id> 에 넣을 image id 확인)
nhncloud instance images

# public 이미지만, 전체 필드 JSON
nhncloud instance images --visibility public --json

# 페이지네이션 — 다음 페이지
nhncloud instance images --limit 20 --marker <last-image-id>
```

> README 예시의 image id 등은 placeholder(`<last-image-id>`) — 실제 UUID 노출 금지(CLAUDE.md 개인 식별 정보 정책).

### 6. `skills/nhncloud-cli/SKILL.md`

instance 명령 표에 행 추가 + `### instance flavors 조회` 인근에 images 안내 단락:

```markdown
| 이미지 목록 조회 | `nhncloud instance images` (create --image 소스, 전체 필드는 `--json`) |
| 특정 노출 범위 이미지 | `nhncloud instance images --visibility public` |
```

### 7. `tasks/010-feat-instance-images/index.json`

- 모든 phase `status` → `completed`
- 최상위 `status` → `completed`, `current_phase` → 3
- `updated_at` → 완료 시각

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. ADR-013 이 adr.md 에 존재
grep -c "ADR-013" docs/adr.md
# 기대: 1 이상

# 2. ADR-013 역참조가 CLAUDE.md 표에 존재 (양방향)
grep -c "ADR-013" CLAUDE.md
# 기대: 1 이상

# 3. CLAUDE.md 명령 카운트와 나열 일치 (4-2) — images 가 목록에 있음
grep -c "instance images" CLAUDE.md
# 기대: 1 이상

# 4. flow/README/SKILL/code-architecture 모두 "instance images" 신규 행 반영 (변별 토큰)
#    주의: grep 'image' 는 기존 --image <id> 텍스트로도 통과(false-pass) → 신규 명령 토큰으로 검증
for f in docs/flow.md README.md skills/nhncloud-cli/SKILL.md docs/code-architecture.md; do
  echo "$f: $(grep -c 'instance images\|listImages\|images\.ts' "$f")"
done
# 기대: 각 파일 1 이상 (code-architecture 는 listImages/images.ts, 나머지는 instance images)

# 5. 개인 식별 정보 grep (CLAUDE.md 의 release 사전 점검 1) — 화이트리스트 밖 도메인 0건
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 6. 실제 비밀 형태 0건 (개인 식별 정보 grep 2)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 7. 최종 빌드·타입 회귀 없음
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l && pnpm build >/dev/null 2>&1 && echo "build ok"
# 기대: 0 / build ok

# 8. index.json 완료 마킹
node -e "const j=require('./tasks/010-feat-instance-images/index.json'); console.log(j.status, j.phases.every(p=>p.status==='completed'))"
# 기대: completed true
```

## 수동 확인

- README/SKILL 의 images 예시가 실제 옵션 이름과 일치하는지 `node dist/index.js instance images --help` 와 대조.
- docs 가 phase-01 실측으로 확정한 host 패턴·tenant 유무와 모순되지 않는지 ADR-013 본문 재확인.
