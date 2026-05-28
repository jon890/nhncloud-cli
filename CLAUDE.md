# CLAUDE.md — nhncloud-cli

## 프로젝트 개요

NHN Cloud 서비스를 AWS CLI 처럼 호출하는 통합 CLI.
TypeScript + Commander.js 기반. dooray-cli 의 기반·하네스를 재사용.

## API 스펙 확인 절차

NHN Cloud 공식 docs 를 단일 소스로 삼는다 (<https://docs.nhncloud.com>).
신규 endpoint 사용·동작 검증 시 해당 서비스 API 가이드를 먼저 확인.
docs 가 봇 차단으로 `WebFetch` 안 될 때는 `WebSearch` 또는 `cmux-browser` 로 우회.

직관에 반하는 동작은 `docs/adr.md` 에 ADR 로 보존.

## 빌드 & 실행

```bash
pnpm install
pnpm run build        # tsup 단일 번들 (dist/index.js)
pnpm tsc --noEmit     # 타입 체크 전용
node dist/index.js    # 직접 실행
```

## 디렉터리 구조

`docs/code-architecture.md` 단일 소스. 요약:

```
src/
  index.ts          # entrypoint
  config/           # credentials/config 로드 + profile 해석
  api/              # endpoints 맵, envelope unwrap, httpError 매핑
  services/<svc>/   # 서비스별 client + types
  utils/            # errors, exit-codes, spinner, time
  formatters/       # table/json/quiet 출력
  commands/<svc>/   # Commander 커맨드
```

## 스킬 폴더 구분

- `skills/` — 공개 스킬 (사용자·AI 에이전트용 `skills/nhncloud-cli/SKILL.md`)
- `.claude/skills/` — 내부 개발 워크플로우 스킬 (planning, plan-and-build 등)

## 코드 컨벤션

- HTTP: `ky` 전용 (axios 금지)
- 에러: `NhnCloudCliError(message, exitCode)` — exit code 는 `src/utils/exit-codes.ts`
- 출력: 데이터 = stdout / 스피너·에러 = stderr
- 자격증명: `~/.nhncloud/credentials.json` (mode 0600) + `~/.nhncloud/config.json`
- profile: `--profile` > `NHNCLOUD_PROFILE` env > `config.defaultProfile` > `"default"`
- 패키지 매니저: `pnpm`
- 빌드: `tsup` (CJS 단일 번들)

## 상황별 ADR 필수 참조

| 상황 | 확인 ADR |
|------|----------|
| 새 HTTP 요청 (retry·timeout·error 분기) | ADR-002 (ky) |
| profile/자격증명 파일 구조 | ADR-003, ADR-004 |
| 새 서비스 엔드포인트 추가 | ADR-005 |
| 응답 봉투 처리 (`isSuccessful`/`resultCode`) | ADR-006 |

신규 ADR 추가 시 본 표에 행 추가.

## NHN Cloud 인증 모델 (서비스별 상이 — 핵심)

| 서비스 | appkey 위치 | 인증 헤더 |
|--------|------------|----------|
| Log & Crash 검색 | URL path | `X-LNCS-SECRET: <secret>` |
| Deploy v2.1 | URL path | `X-NHN-AUTHORIZATION: Bearer <token>` |

`resultCode` 타입이 서비스마다 다름 — Log & Crash 숫자, Deploy 문자열. 봉투 helper 는 둘 다 수용.

## 한국어 표현 정책 / 마크다운 가독성

전역 `~/.claude/CLAUDE.md` 정책을 따른다.
외래어 음차 합성 회피, semantic line break, 인라인 나열 금지.

## planning / 구현 워크플로우

새 기능은 `/planning` (8단계, CLI 는 4단계 압축) 으로 설계 후 docs 반영,
`/plan-and-build` 또는 `/build-with-teams` 로 구현.
docs 는 task 생성 전에 commit (docs-first).
