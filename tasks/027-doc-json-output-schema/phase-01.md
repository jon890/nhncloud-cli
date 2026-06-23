# Phase 01 — `--json` 출력 스키마 문서화

## 컨텍스트

Issue #33은 `instance get --json`과 `instance list --json`이 OpenStack 원본 응답 래퍼를 언랩한다는 사실을 문서화해 달라는 요청이다.
현재 구현은 issue 설명과 일치한다.

- `src/services/instance/client.ts`의 `get()`은 `raw.server`를 반환한다.
- `src/services/instance/client.ts`의 `list()`는 `raw.servers`를 반환한다.
- `src/commands/instance/get.ts`는 `raw: server`를 출력한다.
- `src/commands/instance/list.ts`는 `raw: servers`를 출력한다.

먼저 아래 문서를 읽어라.

- `AGENTS.md`
- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `docs/flow.md`

기존 코드 참조:

- `src/formatters/table.ts`
- `src/commands/instance/get.ts`
- `src/commands/instance/list.ts`
- `src/commands/network/list.ts`
- `src/commands/volume/list.ts`
- `src/commands/floatingip/list.ts`

## 목표

코드 동작을 바꾸지 않고 사용자-facing 문서에 `--json` 출력 계약을 추가한다.
자동화 사용자가 OpenStack 원본 래퍼를 추측하지 않고 파싱할 수 있어야 한다.

## 작업 목록

### 1. README 출력 모드 섹션 보강

- [ ] `README.md`의 `### 출력 모드` 근처에 `--json` 출력 계약 표를 추가한다.
- [ ] 최소한 아래 행을 포함한다.
  - `instance get --json`: `server` 래퍼를 언랩한 단일 server 객체.
  - `instance list --json`: `servers` 래퍼를 언랩한 server 배열.
  - `network list --json`: VPC 배열.
  - `network subnet list --json`: subnet 배열.
  - `volume list --json`: volume 배열.
  - `volume get --json`: 단일 volume 객체.
  - `floatingip list --json`: floating IP 배열.
- [ ] `jq` 예시를 하나 추가한다.
  - `nhncloud instance get <instance-id> --json | jq -r '.status'`

### 2. public skill 보강

- [ ] `skills/nhncloud-cli/SKILL.md`에도 같은 계약을 짧게 반영한다.
- [ ] AI 에이전트가 `.server.status`가 아니라 `.status`를 읽어야 한다는 예시를 포함한다.

### 3. 내부 흐름 문서 확인

- [ ] `docs/flow.md`에 이미 충분한 설명이 있으면 변경하지 않는다.
- [ ] `docs/flow.md`에 모순되는 설명이 있으면 README와 같은 계약으로 정정한다.

## 성공 기준

- `README.md`에 `instance get/list --json`의 언랩 구조가 명시되어 있다.
- `skills/nhncloud-cli/SKILL.md`에 AI 에이전트용 파싱 주의가 명시되어 있다.
- `rg -n "\\.server\\.status|server 래퍼|servers 래퍼|--json 출력" README.md skills/nhncloud-cli/SKILL.md docs/flow.md`로 새 설명을 확인할 수 있다.
- `git diff --check`가 통과한다.

## 주의사항

- 코드 동작을 변경하지 않는다.
- OpenStack 원본 응답 형태를 CLI 출력으로 되돌리지 않는다.
- 실제 인스턴스 ID나 사용자 리소스 UUID를 문서에 넣지 않는다.
- 문서 예시는 `<instance-id>` 같은 placeholder를 사용한다.

## Blocked 조건

- 없음.
