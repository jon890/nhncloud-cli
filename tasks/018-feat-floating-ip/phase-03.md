# Phase 03 — 공개 docs 반영 + 완료 마킹

## 목표

phase-02 에서 추가한 `floatingip` 명령군을 공개 docs 에 반영하고 task 를 완료로 마킹한다.
associate 가 phase-01 실측 미통과로 보류됐으면 그 사실을 docs/blocked 로 남긴다.

이 phase 는 코드를 바꾸지 않는다 — docs 반영 + index.json 마킹만.

## 변경 파일

1. `README.md` — floatingip 명령 사용 예 추가
2. `skills/nhncloud-cli/SKILL.md` — floatingip 명령 추가(AI 에이전트용)
3. `docs/flow.md` — floatingip 흐름 섹션 추가(create 의 외부 네트워크 자동 조회 + associate 의 instance→port_id 매핑)
4. `docs/code-architecture.md` — `commands/floatingip` + `services/network` 의 floatingip 메서드 반영
5. `CLAUDE.md` — "지원 명령" 개수 + floatingip 항목 추가
6. `tasks/018-feat-floating-ip/index.json` — `status: "completed"` + 각 phase completed

## 회피 항목

- **7-1 (docs 표기 ↔ 코드 일치)**: README/SKILL/flow 의 명령 시그니처·옵션명(`--network`/`--yes`/`--detach`)이 phase-02 의 실제 commander 정의와 1:1 인지 확인. 외부 네트워크 자동 조회 조건(`router:external=true`)을 docs 텍스트에 적을 때 콜론 키를 그대로(취소선·`§` 회피).
- **개인 식별 정보 placeholder**: 모든 예시는 `<floatingip-id>`/`<port-id>`/`<instance-id>`/`<network-uuid>` placeholder. 실제 IP·UUID·도메인 노출 금지(CLAUDE.md "개인 식별 정보 노출 금지"). `/release` 의 검증 grep 두 명령을 docs 작성 후 1회 실행해 0건 확인.
- **마크다운 가독성**: semantic line break, 인라인 `+`/`·` 나열 금지, 명령 옵션 3개 이상이면 리스트.

## 작업 상세

### 1. `README.md`

instance 명령 예시 **뒤**(또는 network 예시 뒤)에 floatingip 섹션 추가. placeholder 사용.

```md
### floatingip — 인스턴스 공인 IP(Floating IP)

Floating IP 를 발급해 인스턴스에 연결하고, 외부에서 접근할 공인 IP 를 부여한다.

\`\`\`bash
# Floating IP 목록
nhncloud floatingip list

# Floating IP 발급 (--network 미지정 시 외부 VPC 자동 조회)
nhncloud floatingip create
nhncloud floatingip create --network <network-uuid>

# 인스턴스에 연결 / 해제 (associate 가 실측 통과해 포함된 경우)
nhncloud floatingip associate <floatingip-id> <instance-id>
nhncloud floatingip associate <floatingip-id> <instance-id> --detach

# 삭제
nhncloud floatingip delete <floatingip-id> --yes
\`\`\`
```

> associate 보류 시 associate 예시 두 줄을 제외하고, README 에 "associate 는 instance→port_id 매핑 경로 미확정으로 보류" 한 줄을 남긴다.

### 2. `skills/nhncloud-cli/SKILL.md`

명령 목록·예시에 floatingip 4(또는 3)개 명령 추가. 형식은 기존 instance 항목과 동일.

### 3. `docs/flow.md`

floatingip 흐름 섹션 추가. 두 가지 비자명한 흐름을 명시:

- **create 의 외부 네트워크 자동 조회**: `--network` 미지정 시 `GET /v2.0/vpcs?router:external=true` 로 외부 VPC id 를 찾아 `floating_network_id` 로 쓴다. 외부 VPC 가 없으면 `--network` 직접 지정 요구(EXIT_PARAM_ERROR).
- **associate 의 instance→port_id 매핑**(포함 시): 사용자는 instance id 를 주지만 API 는 port_id 를 요구한다. `GET /v2.0/ports?device_id=<instance-id>` 로 port_id 를 찾아 `PUT /v2.0/floatingips/{id}` 에 넘긴다. `--detach` 는 `port_id: null`.

### 4. `docs/code-architecture.md`

- `commands/` 트리에 `floatingip/`(list·create·delete[·associate]) 추가.
- `services/network/client.ts` 가 vpc/subnet 외에 floatingip 메서드를 갖는다는 점 1줄.
- 013 의 network endpoint 를 재사용(새 service 디렉터리·새 host 없음)한다는 설계 결정 1줄.

### 5. `CLAUDE.md`

- "지원 명령 (N개)" 헤더의 N 을 추가한 명령 수만큼 증가(associate 포함 4개 / 보류 3개).
- floatingip 명령 항목 추가:

```md
- `floatingip list` — Floating IP 목록 조회.
- `floatingip create` — Floating IP 발급 (`--network` 미지정 시 외부 VPC 자동 조회).
- `floatingip delete` — Floating IP 삭제 (기본 confirm, `--yes` 즉시).
- `floatingip associate` — 인스턴스에 연결 (instance→port_id 매핑, `--detach` 로 해제). [associate 포함 시]
```

> 013 의 ADR-013(network endpoint 해석)을 재사용하므로 신규 ADR 없음 — "상황별 ADR 필수 참조" 표에 행을 추가하지 않는다.

### 6. `tasks/018-feat-floating-ip/index.json`

- `status` → `"completed"`, `current_phase` → 3.
- 각 phase `status` → `"completed"`.
- `updated_at` 갱신.
- associate 보류 시 `blocked_reason` 에 "associate: instance→port_id 매핑 경로 미확정으로 보류(list/create/delete 만 구현)" 기록.

## associate 보류 시 docs/blocked 기록

phase-01 실측에서 associate 가 보류됐으면:

- README/SKILL/CLAUDE.md 에 associate 명령을 넣지 않고, "associate 는 instance→port_id 매핑 경로 미확정으로 보류" 한 줄을 README 와 flow.md 에 남긴다.
- index.json `blocked_reason` 에 같은 사유 기록(`status` 는 list/create/delete 가 완료됐으면 `"completed"`, associate 만 미완이면 그대로 completed + blocked_reason 병기).
- 후속 task(별도 번호)로 associate 를 다시 다룰 수 있게 사유를 구체적으로(어떤 경로를 시도했고 왜 확정 못 했는지) 남긴다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. README/SKILL 에 floatingip 명령 반영
grep -c "floatingip" README.md
# 기대: 1 이상
grep -c "floatingip" skills/nhncloud-cli/SKILL.md
# 기대: 1 이상

# 2. CLAUDE.md 지원 명령 개수 + floatingip 항목
grep -nE "## 지원 명령 \([0-9]+개\)" CLAUDE.md
# 기대: 개수가 floatingip 추가분만큼 증가
grep -c "floatingip" CLAUDE.md
# 기대: 1 이상

# 3. flow.md / code-architecture.md 반영
grep -c "floatingip" docs/flow.md docs/code-architecture.md
# 기대: 각 1 이상

# 4. 개인 식별 정보 노출 0건 (CLAUDE.md 검증 grep — release 와 동일)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 5. index.json 완료 마킹
node -e "const j=require('./tasks/018-feat-floating-ip/index.json'); console.log(j.status==='completed' && j.phases.every(p=>p.status==='completed') ? 'DONE' : 'INCOMPLETE')"
# 기대: DONE

# 6. 빌드 회귀 없음 (docs phase 라도 최종 1회)
pnpm build && node dist/index.js floatingip --help >/dev/null 2>&1 && echo "OK"
# 기대: OK
```

## 수동 확인

- README/SKILL 예시 명령을 그대로 복사해 `--help` 가 동작하는지 1회 확인(7-1 docs↔코드 일치).
- associate 보류 시 README/flow/CLAUDE.md 어디에도 associate 사용 예가 남지 않았는지 확인.
