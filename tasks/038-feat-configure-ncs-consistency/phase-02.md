# Phase 02 — ncs/helpers 안내 정정 + README configure 섹션

## 목표

configure 가 ncs 를 지원하게 됐으므로 사용자·에이전트 대상 안내를 정정한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- `grep -n "configure" src/commands/ncs/helpers.ts` 안내가 `--ncs-appkey`/configure 지원을 반영.

## 선행

phase-01 에서 configure 에 ncs·`--ncs-appkey` 가 추가된 상태다.
README·skill 은 코드 산출물(실제 flag)에 의존하므로 이 마지막 phase 에서 갱신한다(planning 결정 docs 는 이미 flow.md 에 반영됨 — 재수정 금지).

## 구현 항목

### 1. ncs/helpers 안내 정정 (`src/commands/ncs/helpers.ts`)

- "configure 마법사는 아직 ncs 를 지원하지 않는다 … 수기 편집을 안내한다" 주석을 현행에 맞게 정정한다.
  - appkey 해석 우선순위는 그대로: `--app-key` 옵션 > profile 의 `ncs.appkey`.
  - ncs 블록 부재 시 에러 안내를 "`nhncloud configure` (또는 `--ncs-appkey`) 로 설정하거나 `--app-key` 로 직접 넘기세요" 로 갱신.
- 동작 로직은 바꾸지 않는다(주석·에러 문구만).

### 2. README configure 섹션 (`README.md`)

- 초기 설정 섹션의 비대화형 예시에 `[--ncs-appkey <appkey>]` 추가.
- 대화형 안내에 ncs appkey 입력 단계와 profile=프로젝트(멀티 프로젝트는 profile 분리 + UAK 재사용) 한 줄 추가.

### 3. 공개 skill (`skills/nhncloud-cli/references/ncs.md`)

- `ncs.md:11` "`configure` 마법사는 아직 ncs를 지원하지 않는다." 는 확정 오류 — **필수 정정**. `configure`/`--ncs-appkey` 지원을 반영.
- 그 외 "자격증명은 `configure` 또는 `--app-key`" 안내가 어긋난 곳이 있으면 함께 정정.
- 위 두 곳 외에는 변경 없음(과잉 수정 금지).

### 4. task 상태

- `index.json` Phase 2 `status` `completed`, 모든 phase `completed` 확인.

## 회피 항목

- 신규 명령이 아니라 기존 configure 확장 — README "사용 예" 에 억지 신규 섹션 만들지 않고 기존 초기 설정 섹션만 갱신.
- ncs/helpers 는 주석·문구만 — 동작 코드 diff 0 인지 확인.

## 완료 조건

1. `pnpm tsc --noEmit` 0, `pnpm run build`, `pnpm test` 정상.
2. ncs/helpers 안내가 configure 지원을 반영.
3. README 비대화형 예시에 `--ncs-appkey` 등장.
4. index.json 전 phase `completed`.

## 변경 파일 (정확)

- `src/commands/ncs/helpers.ts`
- `README.md`
- `skills/nhncloud-cli/references/ncs.md` (ncs.md:11 필수 정정)
- `tasks/038-feat-configure-ncs-consistency/index.json`

## 커밋

```bash
git commit -m "docs(configure): reflect ncs configure support in helpers guidance and README"
```
