# Phase 03 — 공개 docs (README + SKILL) + ADR-015 확정 + 완료 마킹

## 목표

phase-01·02 의 실제 명령 인자/출력에 맞춰 공개 docs 를 반영하고, 두 신규 인프라(ky multipart 전송 + 봉투 우회 파일 스트림 출력)를 **ADR-015** 한 건으로 확정한다.
README/SKILL 은 코드 산출물(실제 옵션/출력)에 의존하므로 마지막 phase 에서 갱신한다 (planning 갱신 시점 분리 원칙).

핵심 메시지: "011 의 `binary-groups`/`binaries` 로 key 를 확인 → `upload --binary-group <key>` 로 올리고 / `download --binary-group <key> --binary-key <key> -o <file>` 로 받는다" 는 연쇄 사용법.

## ⚠️ 소유권 분리 (1-24)

`docs/adr.md`(ADR-015)는 **결정 docs 라 team-lead docs-first** (CLAUDE/flow/code-architecture 와 함께 phase-02 후 일괄 작성). 아래 작업 1(ADR-015 본문)은 team-lead 작성 스펙. **executor 의 phase-03 범위는 작업 2(README)·3(SKILL)·4(완료 마킹) 뿐.**

> ADR-015 번호 확인: base(feat/015) 최대 ADR = **014**. 따라서 신규 = **ADR-015** 확정 (013·014 이미 머지됨).

## 변경 파일

**(team-lead docs-first — executor 범위 밖)**
1. `docs/adr.md` — ADR-015 본문 + Index 행 추가 (multipart 전송 + 봉투 우회 파일 스트림).

**(executor phase-03)**
2. `README.md` — deploy 사용 예에 upload / download 추가 + intro "지원 명령" 문구.
3. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + 사용 안내 + 프론트매터 description.
4. `tasks/016-feat-deploy-binary-transfer/index.json` — 완료 마킹.

## 작업 상세

### 1. `docs/adr.md` — ADR-015 (multipart 전송 + 봉투 우회 파일 스트림)

(a) ADR Index 마지막에 행 추가:

```
- [ADR-015](#adr-015): deploy 바이너리 전송 — ky multipart 업로드 + 봉투 우회 파일 스트림 다운로드
```

(b) 파일 끝 ADR-014(혹은 현재 최대 ADR) 뒤에 앵커 + 본문 추가.

> **번호 확인**: 본 task 작성 시점 docs/adr.md 의 최대 ADR 은 ADR-012 이나, ROADMAP 상 010=ADR-013·012=ADR-014 가 예약돼 이 task 는 **ADR-015** 후보다. phase 작업 시점에 `grep -nE "^## ADR-0" docs/adr.md` 로 실제 최대 번호를 확인하고, 013·014 가 이미 들어왔으면 015 로, 아니면 다음 가용 번호로 조정한다 (번호 충돌 금지).

```
<a id="adr-015"></a>

## ADR-015: deploy 바이너리 전송 — ky multipart 업로드 + 봉투 우회 파일 스트림 다운로드

- **결정**: `deploy upload`/`deploy download` 는 기존 JSON-only client 패턴에서 벗어나는 두 전송 경로를 도입한다.
  - **업로드**: ky `json:`(JSON body) 대신 `body: FormData` 로 `multipart/form-data` 전송. `Content-Type` 은 수동 지정하지 않는다 — ky 가 boundary 를 자동 설정한다. 파일 파트는 command 에서 statSync 가드 후 읽은 Buffer 를 Blob 으로 감싼다.
  - **다운로드**: 응답이 공통 봉투 JSON 이 아니라 파일 바이너리 스트림이라 `unwrap`(ADR-006)을 거치지 않는다. `.json()` 대신 `.arrayBuffer()` 로 받아 Buffer 를 반환하고, command 가 `writeFileSync` 로 파일에 쓴다. 성공/실패는 HTTP status(ky `throwHttpErrors`)로만 판정한다.
- **맥락**: 두 명령 모두 NHN Cloud Deploy v2.1 public-api 의 바이너리 전송 endpoint 다.
  - upload(`POST .../binary-group/{key}`)는 docs 가 `multipart/form-data` + `binaryFile`/`applicationType`/`description` 파트를 명시. 응답은 봉투 JSON(`body.{downloadUrl, binaryKey}`).
  - download(`GET .../binaries/{binaryKey}`)는 응답이 파일 그 자체라 봉투가 없다 — `resultCode`/`isSuccessful` 가 없다.
- **대안 기각**:
  - download 도 `.json<NhnEnvelope>()`+unwrap 으로 "통일" — 바이너리를 JSON 으로 파싱하다 깨진다. 봉투 우회는 endpoint 특성상 불가피.
  - 진짜 스트리밍(응답 ReadableStream → 디스크로 직접 pipe) — MVP 는 `.arrayBuffer()`(메모리 적재)로 충분하다. 매우 큰 파일에서 메모리 압박이 확인되면 stream pipe 로 후속 전환한다(현 한도: upload `MAX_UPLOAD_BYTES` 512 MiB · download 는 응답 크기 의존).
  - axios 등 multipart 친화 라이브러리 도입 — ky 단일 의존(ADR-002)을 깨므로 기각. ky 도 `body: FormData` 로 multipart 를 지원한다.
- **트레이드오프**: 두 경로 모두 파일을 메모리에 통째로 적재한다(arrayBuffer/Buffer). 단순·테스트 용이성을 얻는 대신 초대형 파일에서 메모리 사용이 파일 크기에 비례. CLI 가 다루는 배포 산출물 크기에선 수용 가능하며, 한도 가드(upload)와 후속 stream 전환 여지를 남긴다.
```

### 2. `README.md`

deploy 사용 예 코드블록의 마지막 예시(011 의 `binaries` 또는 `histories`) **다음** 에 추가:

````
# 바이너리 업로드 — 011 binary-groups 로 확인한 그룹 key 에 파일 올리기
nhncloud deploy upload <target> --file ./build/app.jar --binary-group <key> --description "release build"

# 업로드 응답의 binaryKey 만 필요하면 --quiet
nhncloud deploy upload <target> --file ./build/app.jar --binary-group <key> --quiet

# 바이너리 다운로드 — 파일로 저장 (기본 덮어쓰기 거부, --force 로 강제)
nhncloud deploy download <target> --binary-group <key> --binary-key <binary-key> -o ./app.jar
````

> 실제 appKey·artifactId·key 등 식별자는 박지 말 것 — `<target>`/`<key>`/`<binary-key>` placeholder 만 (CLAUDE.md 개인 식별 정보 정책).

### 3. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표에서 011 의 마지막 deploy 행(`바이너리 목록`) **다음** 에 추가:

```
| 바이너리 업로드 | `nhncloud deploy upload <target> --file <path> --binary-group <key>` |
| 바이너리 다운로드 | `nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o <file>` |
```

(b) deploy 섹션에 사용 안내 문단 추가:

```
### deploy 바이너리 전송

- `nhncloud deploy upload <target> --file <path> --binary-group <key>` — 로컬 파일을 바이너리 그룹에 업로드 (multipart). `--application-type`(기본 server) · `--description` 선택. 출력의 binaryKey 를 download 입력으로 쓴다. `--quiet` 면 binaryKey 만.
- `nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o <file>` — 바이너리를 파일로 저장. 대상이 이미 있으면 기본 거부, `--force` 로 덮어쓴다.
- 그룹 key 와 바이너리 key 는 `deploy binary-groups` / `deploy binaries` 로 확인한다.
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. ADR-015 본문 + Index
grep -c "ADR-015" docs/adr.md
# 기대: 2 이상 (Index 행 + 본문 헤더)
grep -c "multipart" docs/adr.md
# 기대: 1 이상

# 2. README 에 두 명령 예시
grep -c "deploy upload" README.md
# 기대: 1 이상
grep -c "deploy download" README.md
# 기대: 1 이상

# 3. README 연쇄 (--binary-group / --binary-key / -o)
grep -cE -- "--binary-group <key>|--binary-key <binary-key>" README.md
# 기대: 1 이상

# 4. SKILL 빠른 참조 표에 두 행
grep -Ec "deploy upload|deploy download" skills/nhncloud-cli/SKILL.md
# 기대: 2 이상

# 5. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 6. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ src/ 2>/dev/null
# 기대: 0건

# 7. index.json 완료 마킹 (task 1 + phase 3)
grep -c '"status": "completed"' tasks/016-feat-deploy-binary-transfer/index.json
# 기대: 4
```

## index.json 완료 마킹

phase-01·02·03 완료 후:

- 최상위 `"status": "pending"` → `"completed"`.
- `"current_phase": 1` → `3`.
- `phases[0..2].status` 각각 `"pending"` → `"completed"`.
- `"updated_at"` 을 완료 시각으로 갱신.

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# profile + deploy target 설정 후 전체 흐름 (011 조회 → upload → download 라운드트립)
node dist/index.js deploy binary-groups <target>                       # 그룹 key 확인
echo "hello" > /tmp/upload-test.txt
node dist/index.js deploy upload <target> --file /tmp/upload-test.txt --binary-group <key> --quiet   # binaryKey
node dist/index.js deploy download <target> --binary-group <key> --binary-key <binaryKey> -o /tmp/dl.txt --force
diff /tmp/upload-test.txt /tmp/dl.txt && echo "round-trip OK"
```
