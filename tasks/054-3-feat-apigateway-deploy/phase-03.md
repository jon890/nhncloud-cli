# Phase 03 — 사용자 가이드 갱신과 완료 마킹

**Execution profile**: standard

---

## 목표

새 명령 3개를 사용자 가이드에 반영하고 task 를 완료로 마킹한다.

`docs/` 아래 결정 문서(`prd.md`·`flow.md`·`code-architecture.md`·`adr/`)와 `AGENTS.md` 는
**이미 갱신돼 있다.** 이 phase 에서 다시 손대지 않는다.
어긋난 곳을 찾으면 고치지 말고 특이사항으로 보고한다.

**범위 외**: 실제 API 호출 검증은 사용자가 수동으로 한다. 이 phase 에서 운영 리소스에 배포·롤백을 실행하지 않는다.

---

## 작업 항목 (3)

### 1. `skills/nhncloud-cli/references/apigateway.md`

반영·배포·롤백을 다루는 절을 더한다. 담을 내용은 넷이다.

- 세 명령의 시그니처와 `--yes` 요구
- 변경이 트래픽에 닿기까지 반영 → 배포 두 단계를 거친다는 점
- 배포 결과가 따로 조회되는 구조라 `deploy create` 가 기본으로 기다리고, `--no-wait` 로 끌 수 있다는 점
- 롤백은 되돌리기만 하므로 적용에 `deploy create` 가 또 필요하다는 점

기존 문서의 조회·쓰기 서술과 중복되는 문장을 새로 쓰지 않는다.
자동화 시나리오 절이 있으면 반영·배포를 잇는 예시를 한 번만 넣는다.

### 2. `README.md` 와 `skills/nhncloud-cli/SKILL.md`

두 문서는 라우터 성격이라 명령 상세를 담지 않는다.
`apigateway` 를 소개하는 문장이 조회 범위만 가리키고 있으면 반영·배포까지 포함하도록 고친다.
가리키는 범위가 이미 맞으면 **고치지 않는다.** 무엇을 왜 안 고쳤는지 보고한다.

빠른 참조 표가 있으면 세 명령 행을 표 끝에 추가한다. 기존 행의 순서를 바꾸지 않는다.

### 3. `tasks/054-3-feat-apigateway-deploy/index.json` — 완료 마킹

`status` 를 `completed`, `current_phase` 를 `3`, 세 phase 의 `status` 를 모두 `completed`,
`updated_at` 을 갱신한다.

---

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
git diff --check
```

문서 정합.

```bash
# cwd: <repo root>
# 카탈로그 수가 AGENTS.md 의 값과 같다
node dist/index.js commands --json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['commands']))"   # 170
grep -c "명령 카탈로그는 170개다" AGENTS.md   # 1

# 가이드에 세 명령이 모두 등장한다
grep -c "import-resources" skills/nhncloud-cli/references/apigateway.md      # 1 이상
grep -c "deploy create" skills/nhncloud-cli/references/apigateway.md         # 1 이상
grep -c "deploy rollback" skills/nhncloud-cli/references/apigateway.md       # 1 이상

# AGENTS.md 를 이 phase 에서 편집하지 않았다
git diff --name-only HEAD | grep -c "AGENTS.md"   # 0

# 완료 마킹
python3 -c "
import json; j=json.load(open('tasks/054-3-feat-apigateway-deploy/index.json'))
assert j['status']=='completed', j['status']
assert all(p['status']=='completed' for p in j['phases'])
print('완료 마킹 OK')"
```

공개 정보 보호 검사 두 개가 모두 0건이어야 한다 (`AGENTS.md` 의 명령 그대로 실행).

---

## 사용자 수동 검증 (이 phase 밖)

머지 전에 사용자가 실제 API 로 확인할 항목이다. 실행자가 하지 않는다.

- 반영 응답의 실제 필드 구성 — 문서 예시와 같은지
- 롤백 응답이 `customEndpointUrl` 인지 `customBackendEndpointUrl` 인지
- 변경 사항이 없을 때 반영과 배포가 각각 어떤 응답·오류를 주는지
- 배포 직후 `deploys/latest` 가 `DEPLOYING` 을 주는지, 결과까지 실제로 얼마나 걸리는지

수동 검증이 문서 기반 설계와 어긋나면 PR 을 열어 둔 채 정정한다.
코드와 ADR-031 의 근거 문장을 함께 고치고, 무엇이 문서와 달랐는지 PR 본문에 남긴다.
문서가 틀렸다는 사실 자체가 다음 작업에 필요한 정보다.

---

## 특이사항 보고

phase 종료 시 pre-existing 문제, 신규 deprecation, 추측한 지점, 범위 외 발견을 team-lead 에 보고한다.
