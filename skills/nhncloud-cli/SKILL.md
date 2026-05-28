---
name: nhncloud-cli
description: NHN Cloud 서비스 CLI. Log & Crash 로그 검색 등 NHN Cloud PaaS API 를 터미널·AI 에이전트에서 호출한다.
---

# nhncloud-cli

NHN Cloud PaaS 서비스를 AWS CLI 방식으로 호출하는 TypeScript CLI.
현재 `logncrash search` (Log & Crash 로그 검색) 를 지원한다.

## 설치

```bash
npm install -g @bifos/nhncloud-cli
```

## 초기 설정

`~/.nhncloud/credentials.json` 파일을 직접 작성한다 (mode 0600 권장).

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "logncrash": {
        "appkey": "<appkey>",
        "secret": "<secretkey>"
      }
    }
  }
}
```

appkey 와 secret 은 NHN Cloud 콘솔 → Log & Crash Search → 프로젝트 설정에서 확인한다.

선택적으로 `~/.nhncloud/config.json` 으로 기본 profile 을 지정할 수 있다.

```json
{
  "version": 1,
  "defaultProfile": "default"
}
```

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 사람이 읽기 좋은 테이블 | 기본 |
| `--json` | JSON 출력 (stdout) | 파싱, 체이닝 |
| `--quiet` | 핵심 식별자만 출력 | 스크립팅 |

**AI 에이전트는 `--json` 을 사용하여 구조화된 데이터를 파싱하라.**

---

## 의도 → 커맨드 매핑

| 의도 | 커맨드 |
|------|--------|
| 최근 1시간 로그 검색 | `nhncloud logncrash search --query '*' --from 1h --to now` |
| 특정 logType 필터 검색 | `nhncloud logncrash search --query 'logType:"ERROR"' --from 1h --to now` |
| 시간 범위 지정 검색 | `nhncloud logncrash search --query '*' --from 2024-01-01T00:00:00+09:00 --to 2024-01-01T12:00:00+09:00` |
| 페이지네이션 | `nhncloud logncrash search --query '*' --from 1h --to now --page 1 --size 50` |
| 다른 profile 사용 | `nhncloud logncrash search --query '*' --from 1h --to now --profile staging` |

## logncrash search 옵션

| 옵션 | 필수 | 설명 |
|------|:---:|------|
| `--query <lucene>` | 예 | Lucene 질의 문자열. API 에 그대로 전달 |
| `--from <time>` | 예 | 검색 시작. ISO8601 또는 상대시간 |
| `--to <time>` | 예 | 검색 끝. 형식 동일 |
| `--page <n>` | 아니오 | pageNumber (기본 0) |
| `--size <n>` | 아니오 | pageSize (기본 10, 최대 100) |
| `--profile <name>` | 아니오 | 사용할 profile 이름 |

전역 옵션: `--json` / `--quiet` / `--no-color`

## 시간 입력 형식

- 상대시간: `1h` (1시간 전), `30m` (30분 전), `2d` (2일 전), `now` (현재)
- ISO8601 직접 입력: `2024-01-01T00:00:00+09:00`

API 제약:

- 검색 시작(`--from`)은 최근 90일 이내여야 한다.
- 검색 범위(`--to` - `--from`)는 31일 이하여야 한다.

## 체이닝 예시

```bash
# 오류 로그 추출 후 jq 로 본문만 보기
nhncloud logncrash search \
  --query 'logType:"ERROR"' \
  --from 1h --to now \
  --json | jq '.data[].logBody'

# 전체 건수만 확인
nhncloud logncrash search \
  --query '*' \
  --from 1h --to now \
  --json | jq '.totalItems'
```

## 에러 코드

| 상황 | exit code |
|------|-----------|
| 자격증명 파일 없음·형식 오류 | 4 (CONFIG_ERROR) |
| 인증 실패 (401/403) | 2 (AUTH_ERROR) |
| API 오류 / 봉투 isSuccessful:false | 1 (API_ERROR) |
| 시간 범위 초과·필수 옵션 누락 | 3 (PARAM_ERROR) |
