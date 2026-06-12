# Phase 01 — adr.md → docs/adr/ 디렉터리 분리 + INDEX

## 목표 (검증 가능)

`docs/adr.md`(ADR-001~018)를 `docs/adr/NNN-slug.md` 18개 + `docs/adr/INDEX.md` 라우터로 분리하고, 각 파일이 기존 절과 1:1 무손실이다.

- 검증: `ls docs/adr/*.md` → 18개 ADR 파일 + INDEX.md, `docs/adr.md` 삭제됨.
- 검증: 각 `docs/adr/NNN-*.md` 가 기존 `## ADR-NNN` 절의 결정·맥락·대안·트레이드오프를 그대로 담는다(내용 유실 0).
- 검증: `pnpm run build` 정상(docs 무관이나 회귀 없음 확인).

## 선행 — 단일 소스 ADR-018

본 분리의 근거는 ADR-018(누적 docs 디렉터리 구조)이다. 작성 전 `docs/adr.md` 의 ADR-018 절을 읽는다. ADR 은 외부 참조(`ADR-NNN`)가 많아 **번호를 파일명에 유지**(`NNN-slug.md`)한다 — pitfalls(slug only)와 다른 점.

## 구현 항목

### 1. `docs/adr/` 디렉터리 + 18개 파일 분리

- `docs/adr.md` 의 각 `## ADR-NNN: 제목` 절을 `docs/adr/NNN-slug.md` 로 이전한다.
- **slug 규칙**: 제목에서 핵심을 kebab-case 로. 번호 prefix 유지. 예:
  - ADR-001 (TypeScript + Commander.js + tsup) → `001-typescript-commander-tsup.md`
  - ADR-002 (ky) → `002-ky-http-client.md`
  - ADR-016 (NCR Management API) → `016-ncr-management-api.md`
  - ADR-017 (NCR 이미지/태그 Harbor REST) → `017-ncr-images-harbor-rest.md`
  - ADR-018 (하네스 누적 docs 디렉터리) → `018-harness-docs-directory.md`
  - (나머지 003~015 도 제목 기반 slug — 실제 제목은 adr.md 에서 읽어 결정)
- **split 키 = `## ADR-NNN:` 헤더 (`---` 구분자 금지 — critic MAJOR)**: adr.md 의 `---` 구분자는 **불규칙**하다(15개뿐 — ADR-011→012, 016→017→018 사이엔 구분자 없음). `---`/`csplit`/`<a id>~---` awk 로 split 하면 ADR 이 **합쳐진다**(011 이 012 흡수, 016 이 017+018 흡수). 반드시 `/^## ADR-[0-9]+:/` 헤더 라인을 경계로 split 한다.
- **파일당 1 ADR 단언 (무손실 보증)**: 분리 후 각 `docs/adr/NNN-*.md` 가 `# ADR-` 라인을 **정확히 1개** 포함하는지 확인(`for f in docs/adr/[0-9]*.md; do c=$(grep -cE "^# ADR-" "$f"); [ "$c" = 1 ] || echo "FAIL $f=$c"; done` → FAIL 0). 개수 parity(18개)만으로는 "한 파일에 2 ADR" merge 를 못 잡는다.
- **각 파일 내용**: 그 ADR 절 본문을 그대로. 절 헤더 `## ADR-NNN: 제목` 은 파일 최상단 `# ADR-NNN: 제목` 으로 승격(파일 1개 = ADR 1개).
- **본문 `<a id="adr-NNN">` 앵커 제거**: adr.md 본문의 per-ADR `<a id="adr-nnn"></a>` 태그는 파일 1개=ADR 1개 구조에서 불요(내부 앵커 대상 없음) + docs-check 스크립트가 이 태그를 키로 쓰므로 phase-02 재작성과 정합. 분리 시 각 파일에서 제거한다.
- **본문의 `[[adr-NNN]]` cross-link 유지** — wikilink 라 파일 경로 무관(slug 몰라도 번호로 해석). 변형하지 않는다.
- **마크다운 앵커 링크(이전 전 grep)**: 기존 adr.md 안에서 `[...](#adr-nnn)` 마크다운 앵커로 ADR 간 링크한 곳을 `grep -nE "\(#adr-[0-9]" docs/adr.md` 로 확인 — 있으면 `[[adr-NNN]]` wikilink 로 통일하거나 INDEX 경유로(분리 후 깨짐).

### 2. `docs/adr/INDEX.md` 라우터

- 기존 `docs/adr.md` 상단 `## ADR Index` 목록을 `docs/adr/INDEX.md` 로 옮긴다.
- 각 항목이 `NNN-slug.md` 파일을 가리키게: `- [ADR-001](001-typescript-commander-tsup.md): TypeScript + Commander.js + tsup`.
- **헤더에 번호-glob lookup 안내 (docu-parser INDEX 거울 — 필수)**: "ADR-NNN 내용은 `docs/adr/NNN-*.md` 로 찾는다(번호 glob — slug 몰라도 매칭). 아래 목록 링크 또는 번호로 직접. 전체 통독 대신 필요한 ADR 만 읽는다(ADR-018)." 이 안내가 있어야 `[[adr-NNN]]`·CLI grep-by-number 가 slug 없이 동작한다.

### 3. `docs/adr.md` 제거

- 분리·INDEX 완료 후 `git rm docs/adr.md`(또는 `rm` 후 stage). 단일 파일 잔존 금지(이중 소스 회피).

## 회피 항목 (executor self-check)

- **split 키**: `/^## ADR-[0-9]+:/` 헤더로 split(`---`/csplit 금지 — 구분자 불규칙으로 ADR 합쳐짐).
- **파일당 1 ADR**: 각 파일에 `^# ADR-` 정확히 1개(merge 검출 — 개수 parity 로는 못 잡음).
- **본문 무손실**: 분리 후 각 파일에 결정/맥락/대안 섹션 살아있는지 + 18개 일치.
- **번호 유지**: 파일명이 `NNN-` 로 시작(외부 `ADR-NNN` 참조 보존). slug only 아님.
- **`<a id>` 앵커 제거**: 본문 per-ADR `<a id="adr-nnn">` 제거(파일 1개=ADR 1개·docs-check 정합).
- **마크다운 앵커**: `(#adr-NNN)` 가 분리로 깨지지 않게 `[[adr-NNN]]`/INDEX 로.
- **INDEX 번호-glob 헤더**: docu-parser 거울 — slug 없이 번호로 찾는 안내 포함.
- **이중 소스 금지**: adr.md 제거(docs/adr/ 와 동시 존재 금지).

## 완료 조건

1. `docs/adr/` 에 `NNN-slug.md` 18개 + `INDEX.md`.
2. `docs/adr.md` 삭제됨.
3. 분리 전후 ADR 개수 18 일치 + 각 파일이 기존 절 1:1(무손실).
4. `pnpm run build` 정상.
5. index.json `current_phase: 1`(phase-02 대기).

## 커밋

```
refactor(adr): adr.md 를 docs/adr/ 파일 per ADR + INDEX 로 분리 (ADR-018)
```
