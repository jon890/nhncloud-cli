# Data Schema — nhncloud-cli

## 파일 위치

```
~/.nhncloud/
  credentials.json   # 서비스별 appkey/secret (비밀) — mode 0600
  config.json        # 기본 profile·출력 설정 (비밀 아님)
```

자격증명과 설정을 분리한다 (AWS 방식).
비밀 파일은 owner-only 권한으로 생성한다.

## credentials.json

profile 아래에 **서비스별 자격증명 블록**을 둔다.
NHN Cloud 는 서비스마다 appkey·secret·인증 헤더가 다르므로 단일 키로 묶을 수 없다 ([[adr-004]]).

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "logncrash": {
        "appkey": "<appkey>",
        "secret": "<secretkey>"
      },
      "deploy": {
        "uakId": "<user-access-key-id>",
        "uakSecret": "<user-access-key-secret>"
      }
    }
  }
}
```

- `logncrash` — 검색은 appkey(path) + secret(`X-LNCS-SECRET` 헤더)
- `deploy` — UAK(id+secret) 만 비밀로 저장
  - OAuth 로 교환한 `access_token` 을 `X-NHN-AUTHORIZATION: Bearer` 로 사용 ([[adr-007]])
  - appKey·배포 좌표는 비밀이 아니므로 `config.json` target 에 둔다 ([[adr-008]])

## config.json

```json
{
  "version": 1,
  "defaultProfile": "default",
  "deploy": {
    "targets": {
      "<target-name>": {
        "appKey": "<appkey>",
        "artifactId": "<artifactId>",
        "serverGroupId": "<serverGroupId>",
        "scenarioIds": "<id1,id2>"
      }
    }
  }
}
```

- `defaultProfile` — `--profile` 미지정 시 사용할 profile
- `deploy.targets.<name>` — 배포 좌표 묶음. `nhncloud deploy run <name>` 으로 참조, flag override ([[adr-008]])
- 비밀이 아닌 값만 (UAK 비밀은 credentials.json)

## 토큰 캐시 (deploy)

```
~/.nhncloud/cache/deploy-token-<profile>.json   # { accessToken, expiresAt } — mode 0600
```

- OAuth 로 받은 `access_token` 을 만료시각과 함께 저장 ([[adr-007]])
- 만료 전 재사용, 만료 시 재발급. logncrash 는 토큰 캐시 불필요

## profile 해석 순서

1. `--profile <name>` 옵션
2. 환경변수 `NHNCLOUD_PROFILE`
3. `config.json` 의 `defaultProfile`
4. 위 모두 없으면 `"default"`

자격증명 누락 시 `NhnCloudCliError(EXIT_CONFIG_ERROR)` 로 설정 안내 후 종료.

## 캐시 범위

- logncrash search — 캐시 없음 (매 호출 실시간 검색)
- deploy — OAuth access_token 만 캐시 (위 "토큰 캐시")
- 목록성 데이터 캐시는 필요 시 후속 도입
