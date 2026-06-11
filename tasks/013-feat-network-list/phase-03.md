# Phase 03 — 공개 docs(README/SKILL) + 완료 마킹 (결정 docs 는 team-lead docs-first)

## 목표

network endpoint 확장은 010 이 세운 **IaaS 멀티 서비스 endpoint 해석(ADR-013)의 연장**이다.

## ⚠️ 소유권 분리 (common-pitfalls 1-24 / 갱신 시점 분리)

아래 작업 1~4 (`docs/adr.md` ADR-013 보강 · `CLAUDE.md` · `docs/flow.md` · `docs/code-architecture.md`) 는 **결정 docs 라 executor 가 phase 안에서 편집하지 않는다.**
이 task 는 ADR-013 보강 내용이 phase-01 의 **실측 확정 host/경로**에 의존하므로, **team-lead 가 phase-02 완료 후** (실측값이 코드에 반영된 뒤) 아래 작업 1~4 의 스펙을 따라 **docs-first 성격의 별도 commit** 으로 작성한다. 아래 1~4 의 상세 작업은 그 team-lead 작성의 스펙으로 남겨둔다.

**executor 의 phase-03 범위는 작업 5(README) · 6(SKILL) · 7(완료 마킹) 뿐이다.** 결정 docs(adr/CLAUDE/flow/code-architecture)는 절대 건드리지 않는다.

## 변경 파일

**(team-lead, phase-02 후 docs-first commit — executor 범위 밖)**
1. `docs/adr.md` — ADR-013 본문에 network host 보강 (새 ADR 신설 금지)
2. `CLAUDE.md` — 지원 명령 카운트·목록 + ADR 참조 표 갱신 (network 새 명령군)
3. `docs/flow.md` — 새 network 흐름 섹션 추가
4. `docs/code-architecture.md` — `services/network` + `commands/network` + api network 확장 + ADR-013 역참조

**(executor phase-03)**
5. `README.md` — 네트워크 사용 예 섹션
6. `skills/nhncloud-cli/SKILL.md` — network 명령 표·예시 + 프론트매터 description
7. `tasks/013-feat-network-list/index.json` — status `completed`, phase status 갱신

## 회피 항목

- **4-2 (동기화)**: CLAUDE.md 의 "지원 명령 (N개)" 카운트와 실제 나열 항목 수가 어긋나지 않게 한다 — network list·subnet list 두 명령 추가 시 숫자와 목록을 함께 갱신.
- **별도 ADR 신설 금지**: network 는 ADR-013(010 이 세운 IaaS 멀티 endpoint 해석)의 연장이다. ADR-014 를 새로 만들지 않고 ADR-013 본문에 network 줄을 보탠다. ADR Index 의 ADR-013 제목도 image→image·network 로 갱신.
- **ADR 역참조 양방향**: ADR-013 보강 시 CLAUDE.md "상황별 ADR 필수 참조" 표에도 network endpoint 행을 더한다(ADR 표만 고치고 본문 누락, 반대도 금지).
- **개인 식별 정보 placeholder**: README/SKILL 의 network/subnet uuid 는 `<network-uuid>`·`<subnet-id>` placeholder — 실제 UUID·CIDR 노출 금지(CLAUDE.md 개인 식별 정보 정책).

## 작업 상세

### 1. `docs/adr.md` — ADR-013 보강 (새 ADR 아님)

> 010 이 ADR-013 을 image 로 세운 상태를 전제한다. 그 본문에 network 를 **한 단계 더 일반화**해 덧붙인다.

(a) ADR Index 의 ADR-013 줄 제목 갱신:

```markdown
- [ADR-013](#adr-013): IaaS 멀티 서비스 endpoint 해석 — image·network catalog host 맵 추가 (정적 맵 유지)
```

(b) ADR-013 본문(010 이 작성)에 network 보강. **결정·맥락·트레이드오프** 각 절에 network 를 image 와 나란히 추가:

- **결정** — image 옆에 network 한 줄:
  - `endpoints.ts` 에 `NETWORK_HOST` 맵 + `networkHost(region)` 추가.
  - `getIaasToken` 이 `computeEndpoint`·`imageEndpoint`·`networkEndpoint` 를 함께 반환하고, 한 토큰 캐시에 같이 보관한다.
  - network(NHN VPC)는 compute·image 와 다른 host(`<region>-api-network-infrastructure...`, 실측 확정)지만 **같은 Keystone 토큰**(`X-Auth-Token`)을 재사용한다.
  - network 경로는 compute 의 `/v2/{tenantId}/...` 와 달리 tenant segment 가 없다(`/v2.0/vpcs`·`/v2.0/vpcsubnets`, 실측 확정). NHN VPC 는 raw Neutron `/v2.0/networks` 가 아니라 NHN 고유 경로다.
- **맥락** — "image 가 첫 사례, network 가 두 번째 사례로 같은 패턴이 재사용됨을 확인" 한 줄. 정적 맵 노선이 두 서비스에서 잘 맞아떨어진다는 근거.
- **트레이드오프** — region 코드가 `INSTANCE_HOST`·`IMAGE_HOST`·`NETWORK_HOST` **세 맵**에 중복된다(image 때 둘 → 셋). 세 맵 key 집합 일치를 빌드 검증(grep)으로 가드한다. "서비스 type 이 더 늘어 맵 관리가 부담이 되는 시점에 동적 catalog 파싱 재검토" 라는 기존 문구의 임계 사례가 하나 더 쌓였음을 한 줄 보탠다.

> 본문의 host 패턴·tenant 유무 문구는 phase-01 실측으로 확정한 값에 맞춘다.

### 2. `CLAUDE.md`

(a) `## 지원 명령 (N개)` — 카운트를 **2 늘리고**(network list + network subnet list) 목록에 행 추가. network 는 instance 와 다른 새 명령군이므로 instance 블록 뒤에 별도로 둔다:

```markdown
- `network list` — VPC 목록 조회 (`instance create --network <uuid>` 에 넣을 network UUID 소스).
- `network subnet list` — 서브넷 목록 조회 (서브넷 id·cidr·소속 VPC 확인).
```

> 010 이 `instance images` 를 더해 카운트를 이미 올렸다면 그 값을 기준으로 +2 한다(010·013 적용 순서에 따라 기준 카운트가 다름 — 실제 파일의 현재 카운트를 읽고 +2).

(b) "상황별 ADR 필수 참조" 표에 network 행 추가(010 이 더한 image 행 인접):

```markdown
| Network(VPC) endpoint 해석 (compute·image 외 type 확장) | ADR-013, ADR-005, ADR-010 |
```

(c) "NHN Cloud 인증 모델" 표 — network 는 Instance 와 **같은 Keystone 토큰**을 쓰므로 새 인증 모델 행을 추가하지 않는다. 필요하면 기존 Instance(OpenStack) 행에 "(compute·image·network 공통 토큰)" 정도만 덧붙인다. 새 인증 모델이 아니므로 표를 부풀리지 않는다.

(d) 개인 식별 정보 표 — `<network-uuid>` 는 이미 있다. `<subnet-id>` 가 없으면 한 행 추가(실제 서브넷 id 노출 금지).

### 3. `docs/flow.md`

`## instance 흐름` **뒤** 에 새 `## network 흐름` 섹션 추가. instance 흐름의 구조(인증 흐름 / 명령 시그니처 / 출력 / 에러 경로)를 따른다.

```markdown
## network 흐름

NHN VPC 명령군. instance 와 같은 Keystone 토큰을 발급해 region 별 network endpoint 로 호출한다 ([[adr-013]], [[adr-010]]).
VPC·서브넷 목록은 `instance create --network <uuid>` 에 넣을 UUID 를 고르는 단계다.

### 인증 흐름

instance 와 동일하다 — `iaas` 블록 + Keystone `X-Auth-Token` 재사용(새 토큰 발급 없음).
endpoint 만 network host(`<region>-api-network-infrastructure...`, tenant segment 없음)로 다르다.

### 명령 시그니처

​```
nhncloud network list [options]              # VPC 목록 (create --network 소스)
nhncloud network subnet list [options]       # 서브넷 목록
​```

| 옵션 | 적용 | 설명 |
|------|------|------|
| `--region <r>` | 전체 | `iaas.region` override (kr1/kr2/kr3/jp1) |
| `--profile <name>` | 전체 | profile 선택 |

전역 옵션: `--json` / `--quiet` / `--no-color`.

### 출력

- `network list` 테이블: `id` / `name` / `cidrv4` / `state` / `external`(router:external). 전체 필드는 `--json`.
- `network subnet list` 테이블: `id` / `cidr` / `vpc_id` / `gateway` / `available_ip`. 전체 필드는 `--json`.
- `--quiet` 는 id 만 — `instance create --network <uuid>` 로 바로 파이프.

### network 에러 경로

| 상황 | exit code |
|------|-----------|
| `iaas` 자격증명 누락 / Keystone 발급 실패 | `EXIT_CONFIG_ERROR` 또는 `EXIT_AUTH_ERROR` |
| 잘못된 region | `EXIT_PARAM_ERROR` |
| VPC API 4xx · 5xx | `EXIT_API_ERROR` |
```

> 위 블록의 코드펜스(​```)는 실제 작성 시 일반 백틱 3개로 쓴다(여기 표기는 중첩 회피용).

### 4. `docs/code-architecture.md`

(a) 디렉터리 구조 트리에 network 추가:

```
  services/
    network/
      client.ts             # NetworkClient — listVpcs / listSubnets
      types.ts              # Vpc / VpcSubnet (router:external 콜론 키)
  commands/
    network/
      list.ts               # nhncloud network list (VPC)
      subnet.ts             # nhncloud network subnet list
      helpers.ts            # resolveNetworkClient (Keystone 토큰 공유, [[adr-013]])
```

(b) `keystone.ts` 설명에 network endpoint 보강 — "compute·image·network endpoint 동시 반환([[adr-013]])".

(c) `endpoints.ts` 설명에 "instance·image·network host 맵([[adr-005]], [[adr-013]])".

(d) "인증·엔드포인트 추상화" 절의 service client 목록에 network 추가:

```markdown
  - network: `X-Auth-Token: <tokenId>` + region 별 network endpoint (instance 와 토큰 공유, [[adr-013]])
```

### 5. `README.md`

`### 인스턴스 (Instance)` **뒤** 에 `### 네트워크 (Network)` 섹션 추가:

```bash
# VPC 목록 (create --network <uuid> 에 넣을 network id 확인)
nhncloud network list

# 전체 필드 JSON
nhncloud network list --json

# 서브넷 목록 (소속 VPC·CIDR·가용 IP)
nhncloud network subnet list

# 다른 region
nhncloud network list --region kr2

# create 흐름 — 확인한 network id 를 --network 에 사용
nhncloud instance create --name web --flavor <flavor-id> --image <image-id> --network <network-uuid>
```

> **`--network` 가 받는 id 종류 (phase-02 미확인 항목에서 확정)**: VPC id 인지 subnet id 인지 확정된 결과를 위 예시 주석·설명에 명시한다. **확정 전에는 "VPC id 를 그대로" 같은 단정을 쓰지 않고** "`network list`/`network subnet list` 로 id 를 확인해 `--network` 에 사용" 수준으로 보수적으로 적는다 (critic MAJOR — 틀린 사용법 ship 방지).
> README 예시의 network/subnet id 는 placeholder(`<network-uuid>`·`<subnet-id>`) — 실제 UUID·CIDR 노출 금지(CLAUDE.md 개인 식별 정보 정책).

### 6. `skills/nhncloud-cli/SKILL.md`

`## instance` 섹션 **뒤** 에 network 안내를 더한다. instance 표 형식을 따라 명령 표 + 짧은 설명 단락:

```markdown
| VPC 목록 조회 | `nhncloud network list` (create --network 소스, 전체 필드는 `--json`) |
| 서브넷 목록 조회 | `nhncloud network subnet list` |
| 다른 region VPC | `nhncloud network list --region kr2` |
```

network 는 instance 와 같은 `iaas` 자격증명·Keystone 토큰을 쓰므로 별도 설정이 필요 없다는 한 줄 안내.

### 7. `tasks/013-feat-network-list/index.json`

- 모든 phase `status` → `completed`
- 최상위 `status` → `completed`, `current_phase` → 3
- `updated_at` → 완료 시각

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. ADR-013 이 network 까지 보강됨 (새 ADR 신설 안 함 — base 의 ADR-014(plan012)는 무관, 신규 ADR-015 없음)
grep -c "network" docs/adr.md
# 기대: 1 이상
grep -c "ADR-015" docs/adr.md
# 기대: 0 (별도 ADR 신설 금지 — network 는 ADR-013 보강. ADR-014 는 plan012(logncrash send)가 추가한 것이라 무관)

# 2. ADR-013 역참조가 CLAUDE.md 표에 network 로 존재 (양방향)
grep -nE "ADR-013.*Network|Network.*ADR-013" CLAUDE.md | wc -l
# 기대: 1 이상

# 3. CLAUDE.md 명령 카운트와 나열 일치 (4-2) — network 두 명령이 목록에 있음
grep -Ec "network list|network subnet list" CLAUDE.md
# 기대: 2 이상

# 4. flow/README/SKILL/code-architecture 모두 network 반영
for f in docs/flow.md README.md skills/nhncloud-cli/SKILL.md docs/code-architecture.md; do
  echo "$f: $(grep -c 'network' "$f")"
done
# 기대: 각 파일 1 이상

# 5. flow.md 에 network 흐름 섹션
grep -c "## network 흐름" docs/flow.md
# 기대: 1

# 6. 개인 식별 정보 grep (CLAUDE.md release 사전 점검 1) — 화이트리스트 밖 도메인 0건
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 7. 실제 비밀 형태 0건 (개인 식별 정보 grep 2)
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 8. 최종 빌드·타입 회귀 없음
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l && pnpm build >/dev/null 2>&1 && echo "build ok"
# 기대: 0 / build ok

# 9. index.json 완료 마킹
node -e "const j=require('./tasks/013-feat-network-list/index.json'); console.log(j.status, j.phases.every(p=>p.status==='completed'))"
# 기대: completed true
```

## 수동 확인

- README/SKILL 의 network/subnet 예시가 실제 옵션 이름과 일치하는지 `node dist/index.js network --help` / `network subnet --help` 와 대조.
- docs 가 phase-01 실측으로 확정한 host 패턴·tenant 유무와 모순되지 않는지 ADR-013 보강 본문 재확인.
- ADR Index 의 ADR-013 제목이 image·network 둘 다 반영하는지 확인.
