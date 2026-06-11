# Phase 02 — 공개 docs 반영 + 완료 마킹

## 목표

phase-01 의 실제 명령 인자/출력에 맞춰 docs 를 갱신한다.
docs 는 코드 산출물(실제 옵션/출력 경로)에 의존하므로 **마지막 phase 에서** 갱신한다(planning SKILL 갱신 시점 분리 원칙).

핵심: "export 는 scroll 로 전체를 파일로 내보내며, scrollKey 는 1분 만료라 만료 시 안내 에러로 막힌다" 를 흐름 문서에 명시한다.

## ⚠️ 소유권 분리 (common-pitfalls 1-24)

결정 docs(`CLAUDE.md`·`docs/flow.md`·`docs/code-architecture.md`)는 **team-lead 가 docs-first 로** phase-01 코드 후 일괄 작성한다 — executor 의 phase-02 범위가 아니다. executor 의 phase-02 범위는 **공개 사용자 docs(README·SKILL) + 완료 마킹(index.json) 뿐**.

> **새 ADR 없음**: export 는 search 의 host(`api-lncs-search`)·인증(`X-LNCS-SECRET`)·봉투 helper 를 재사용 — 신규 endpoint·인증·좌표 없음. "상황별 ADR 필수 참조" 표에 행 추가 안 함.
> **카운트**: base 39 → logncrash export 1개 = **40개**. (이 task 는 feat/018 위에 stack — base 가 39다. 옛 "11→12" 표기는 무효.)

## 변경 파일 (6개)

**(team-lead docs-first — executor 범위 밖)**
1. `CLAUDE.md` — 지원 명령 카운트(39→40) + logncrash export 행 추가
4. `docs/flow.md` — logncrash export 흐름 추가(scrollKey 1분 만료 루프 명시)
5. `docs/code-architecture.md` — `LogncrashClient` 메서드 목록에 scrollStart/scrollNext + export.ts 추가

**(executor phase-02)**
2. `README.md` — logncrash 사용 예에 export 추가
3. `skills/nhncloud-cli/SKILL.md` — 빠른 참조 표 + export 시나리오 반영
6. `tasks/019-feat-logncrash-export/index.json` — status `completed` + current_phase 갱신

## 작업 상세

### 1. `CLAUDE.md`

(a) `## 지원 명령 (39개)` → `## 지원 명령 (40개)` 로 카운트 갱신 (base 가 feat/018 = 39).

(b) `logncrash search` 행 **다음** 에 추가:

```
- `logncrash export` — Log & Crash 로그 scroll 대량 추출 (검색 결과 전체를 파일로, scrollKey 1분 만료 루프, `--output` JSON Lines/`--format json`).
```

### 2. `README.md`

logncrash 사용 예 블록에서 `logncrash search` 예시 **다음** 에 export 예시를 추가:

````
# 검색 결과 전체를 파일로 추출 (JSON Lines, scroll 순회)
nhncloud logncrash export \
  --query 'logType:"ERROR"' \
  --from 1h --to now \
  --output errors.jsonl

# JSON 배열 형식으로 추출
nhncloud logncrash export --query 'logType:"ERROR"' --from 1h --to now \
  --output errors.json --format json
````

> README 는 공개 OSS — 실제 appkey·secret·도메인 박지 말 것. placeholder(`<appkey>` 등)만 사용(CLAUDE.md 개인 식별 정보 정책).

### 3. `skills/nhncloud-cli/SKILL.md`

(a) 빠른 참조 표에서 logncrash search 행 **다음** 에 추가:

```
| 로그 대량 추출 (파일로) | `nhncloud logncrash export --query '<lucene>' --from 1h --to now --output logs.jsonl` |
```

(b) logncrash 섹션에 export 시나리오 문단을 한 곳 추가(에이전트가 자연어→명령 변환 시 참고):

```
### logncrash export (대량 추출)

- `nhncloud logncrash export` — 검색 결과 전체를 파일로 내보낸다. 단발 검색(search)이 한 페이지만 보여주는 것과 달리, scroll 로 전체(최대 10만 건)를 순회한다.
- `--output <file>` 필수. 기본은 JSON Lines(한 줄당 한 로그), `--format json` 이면 JSON 배열.
- 진행 상황은 stderr, 데이터는 파일에만 쓴다(stdout 비움).
- scrollKey 는 1분 만료 — 데이터가 많아 1분을 넘기면 만료 에러가 난다. 이때는 검색 범위를 좁히거나 `--size` 를 키워 다시 시도한다.
- 시간 범위 제한은 search 와 동일(90일 이내·31일 이하).
```

> SKILL.md 는 공개 OSS — placeholder(`<lucene>` 등)만 사용.

### 4. `docs/flow.md`

`## logncrash search 흐름` 섹션 **다음** 에 export 흐름 섹션을 추가:

```
## logncrash export 흐름

검색 결과 전체를 scroll API 로 순회해 파일로 추출한다(search 단발 조회와 별도 명령).

\`\`\`bash
nhncloud logncrash export \
  --query 'logType:"ERROR"' \
  --from 1h --to now \
  --output errors.jsonl
\`\`\`

### scroll 순회

1. `POST /api/v2/search/scroll/{appkey}` 로 시작(body 는 search 와 동일: query/from/to/pageSize). 응답에 `scrollKey`·`totalItems`·`data` 가 온다.
2. `data` 가 비지 않고 `scrollKey` 가 있으면 `POST /api/v2/search/scroll/{appkey}/{scrollKey}`(body 없음)로 다음 페이지를 이어 받는다.
3. `data` 가 빌 때까지(또는 최대 10만 건까지) 반복한다.

### scrollKey 만료

scrollKey 유효기간은 1분이다. 한 페이지 처리 후 1분 안에 다음 호출을 못 하면 키가 무효화되어 만료 에러(`EXIT_API_ERROR`)가 난다.
이때는 검색 범위를 좁히거나 `--size` 를 키워 페이지 수를 줄인 뒤 다시 시도한다.

### 출력

- `--output <file>` 필수. 기본 JSON Lines(한 줄당 한 로그), `--format json` 이면 JSON 배열.
- 진행 상황(수집/전체 건수)은 stderr, 데이터는 파일에만. 파일은 temp 파일에 쓴 뒤 원자적으로 교체한다(중단 시 부분 파일 방지).
- 시간 범위 제한은 search 와 동일(90일 이내·31일 이하).
```

> heredoc/escape 주의: 위 코드블록 안의 백슬래시(`\`)는 실제 README/flow.md 에서는 줄 끝 line-continuation 으로 그대로 쓴다. 문서에 escape 문자(`\``)가 남지 않게 작성 직후 점검한다.

### 5. `docs/code-architecture.md`

(a) services 트리의 실제 라인 `client.ts # LogncrashClient — search() / send() (send 는 collector host + appkey-only, adr-014)` 를 갱신 — 기존 `send` 설명을 보존하면서 scroll 메서드만 추가:

```
      client.ts             # LogncrashClient — search / send / scrollStart / scrollNext (send 는 collector host + appkey-only, adr-014)
```

(b) commands 트리의 `search.ts # nhncloud logncrash search` **다음** 줄에 추가:

```
      export.ts             # nhncloud logncrash export (scroll 대량 추출 → 파일)
```

### 6. `index.json`

phase-01·02 완료 후:

```json
"status": "completed",
"current_phase": 2,
```

그리고 phases[0].status, phases[1].status 를 각각 `"completed"` 로, `updated_at` 갱신.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root> (또는 plan019 worktree)

# 1. CLAUDE.md 명령 카운트 갱신 (base 39 → 40)
grep -c "## 지원 명령 (40개)" CLAUDE.md
# 기대: 1

# 2. CLAUDE.md 에 export 행
grep -c "logncrash export" CLAUDE.md
# 기대: 1 이상

# 3. README 에 export 예시
grep -c "logncrash export" README.md
# 기대: 1 이상

# 4. SKILL 에 export 반영
grep -c "logncrash export" skills/nhncloud-cli/SKILL.md
# 기대: 1 이상

# 5. flow.md 에 export 흐름 + scrollKey 만료 명시
grep -c "logncrash export 흐름" docs/flow.md
# 기대: 1
grep -c "scrollKey" docs/flow.md
# 기대: 1 이상

# 6. code-architecture.md 에 client 메서드 + export.ts 반영
grep -c "scrollStart / scrollNext" docs/code-architecture.md
# 기대: 1
grep -c "logncrash export" docs/code-architecture.md
# 기대: 1 이상

# 7. 개인 식별 정보 노출 점검 (CLAUDE.md 정책 — 공개 도메인 화이트리스트 밖 도메인)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|claude\.com|anthropic\.com"
# 기대: 0건

# 8. 실제 비밀 형태 점검
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ 2>/dev/null
# 기대: 0건

# 9. flow.md heredoc escape 잔존 점검 (백틱 escape 가 본문에 새지 않았는지)
grep -c '\\`' docs/flow.md
# 기대: 0

# 10. index.json 완료 마킹
grep -c '"status": "completed"' tasks/019-feat-logncrash-export/index.json
# 기대: 3  (task 1 + phase 2)
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# 실제 추출 (profile 설정 후)
node dist/index.js logncrash export --query 'logType:"NORMAL"' --from 1h --to now --output /tmp/logs.jsonl
wc -l /tmp/logs.jsonl                 # 수집 건수 확인
node dist/index.js logncrash export --query 'logType:"NORMAL"' --from 1h --to now --output /tmp/logs.json --format json
head /tmp/logs.json                   # JSON 배열 형식 확인

# 진행 상황이 stderr 로 나오고 stdout 은 비는지 (데이터는 파일)
node dist/index.js logncrash export --query 'logType:"NORMAL"' --from 1h --to now --output /tmp/logs.jsonl 2>/dev/null
# stdout 에 아무것도 안 나와야 함 (진행/완료는 stderr)
```
