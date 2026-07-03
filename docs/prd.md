# PRD — nhncloud-cli

## 한 줄 정의

NHN Cloud 서비스를 AWS CLI 처럼 터미널·AI 에이전트가 쉽게 호출하는 통합 CLI.

## 문제

NHN Cloud 는 서비스별 REST API 와 일부 SDK 만 제공한다.
AWS CLI 같은 통합 명령줄 도구가 없어 매번 토큰·엔드포인트·헤더를 직접 다뤄야 한다.

## 타겟

- NHN Cloud 를 일상적으로 쓰는 개발자 (Deploy, Log & Crash 등)
- 자동화 스크립트·AI 에이전트 (구조화된 `--json` 출력 소비)

## 핵심 가치

- 서비스마다 다른 인증·엔드포인트를 하나의 profile 추상화 뒤로 숨긴다.
- 데이터는 stdout, 진행·에러는 stderr 로 분리해 파이프라인에 친화적이다.
- AI 에이전트가 자연어를 명령으로 변환하도록 `skills/nhncloud-cli/SKILL.md` 를 제공한다.

## MVP 범위 (v1)

### 포함

- `nhncloud configure` — 대화형/flag 자격증명 설정 마법사 (UAK + 서비스별 키, 연결 테스트)
- `nhncloud logncrash search` — Log & Crash 로그 검색
- `nhncloud deploy` — 배포 실행 + 조회 (자주 쓰는 핵심 명령군)
  - `run <target>` — 배포 실행 (OAuth 토큰 교환, 동기/`--async`)
  - `artifacts` / `server-groups <target>` / `histories <target>` — 조회
- `nhncloud instance` — Compute 인스턴스 제어 (OpenStack Nova v2 호환, ephemeral CI runner 자동화)
  - `create` — 발급 (비동기 기본, `--wait` 로 ACTIVE+IP 대기)
  - `list` / `get <id>` / `delete <id>` — 조회·삭제 (`--yes` 로 즉시 삭제)
  - `flavors` — 인스턴스 타입(flavor) 목록·상세 조회 (`--detail`, `--min-disk`/`--min-ram` 필터)
  - GPU 인스턴스도 같은 명령으로 — GPU flavor id 를 `--flavor` 에 넘기면 된다 (NHN docs 가 API 호환성을 명시하진 않지만 동일 Nova v2 카탈로그를 공유)
- `nhncloud ncr` — NHN Container Registry 조회.
  레지스트리 목록·단일은 Management API·UAK 정적 헤더를 쓴다([[adr-016]]).
  이미지/태그는 Harbor REST 데이터플레인·UAK Basic Auth 를 쓴다([[adr-017]]).
- `nhncloud nks` — NHN Kubernetes Service 관리 (Keystone 토큰 + container-infra API·ADR-019)
  - 클러스터, 노드 그룹, 애드온, 지원 Kubernetes 버전과 작업 종류를 조회한다.
  - 생성·삭제·resize·upgrade·autoscale 등 쓰기 작업을 지원하며, 복잡한 payload 는 JSON 파일 입력을 기본으로 한다.
- profile 기반 자격증명 (`~/.nhncloud/credentials.json` + `~/.nhncloud/config.json`)
- 출력 3모드 — 테이블 / `--json` / `--quiet`
- `--profile` 로 profile 전환

### 제외 (v1)

- Deploy 바이너리 업/다운로드 — 후속 (조회 2종 `binary-groups`/`binaries` 는 task 011 에서 구현, 업로드·다운로드만 후속)
- 공공기관용(gov) 엔드포인트
- IaaS(OpenStack) 서비스군

## 성공 지표

- `nhncloud logncrash search --query ... --from ... --to ... --json` 이 실제 로그를 반환한다.
- profile 미설정 시 친절한 설정 안내로 종료한다 (exit code 명확).
