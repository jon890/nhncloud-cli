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

profile 아래에 **profile 공통 UAK + 서비스별 자격증명 블록**을 둔다 ([[adr-004]]).
UAK 는 개인/계정 단위라 OAuth 쓰는 서비스가 공유하고, appkey·secret 은 서비스마다 다르다.

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "userAccessKey": {
        "id": "<user-access-key-id>",
        "secret": "<secret-access-key>"
      },
      "logncrash": {
        "appkey": "<appkey>",
        "secret": "<secretkey>"
      },
      "ncs": {
        "appkey": "<appkey>"
      },
      "iaas": {
        "tenantId": "<tenant-id>",
        "username": "<account-email>",
        "password": "<api-password>",
        "region": "kr1"
      }
    }
  }
}
```

- `userAccessKey` — profile 공통 개인 UAK. deploy 등 OAuth 서비스가 공유 ([[adr-007]])
  - OAuth 로 교환한 `access_token` 을 `X-NHN-AUTHORIZATION: Bearer` 로 사용
  - deploy 는 자체 자격증명 블록 없이 이 UAK + `config.json` target 좌표로 동작 ([[adr-008]])
- `logncrash` — 검색은 appkey(path) + secret(`X-LNCS-SECRET` 헤더)
- `ncs` — appkey(path)만. 인증 토큰은 `userAccessKey` OAuth 를 재사용한다(secret 불요, [[adr-020]])
- `iaas` — OpenStack Keystone 자격증명. instance 등 IaaS 서비스가 공유 ([[adr-010]])
  - `password` 는 NHN 콘솔 IAM 에서 별도 발급하는 API 비밀번호 (로그인 비밀번호가 아님)
  - `region` — `kr1` / `kr2` / `kr3` / `jp1` 중 하나. 명령의 `--region` 으로 override
- 예약 키 `userAccessKey` 외 키는 서비스명 = 서비스별 블록

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

## 토큰 캐시

```
~/.nhncloud/cache/deploy-token-<profile>.json   # { accessToken, expiresAt } — mode 0600
~/.nhncloud/cache/iaas-token-<profile>-<region>.json   # { tokenId, expiresAt, computeEndpoint, imageEndpoint, networkEndpoint, blockStorageEndpoint, nksEndpoint } — mode 0600
```

- deploy — OAuth `access_token` 을 만료시각과 함께 저장 ([[adr-007]]). ncs 가 같은 계정 토큰이라 이 캐시를 공유 ([[adr-020]])
- iaas — Keystone token + region 별 정적 host 맵으로 구성한 compute·image·network·blockStorage·nks endpoint 캐시 ([[adr-005]], [[adr-010]], [[adr-013]], [[adr-019]])
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
- instance — Keystone token + compute endpoint 캐시 (위 "토큰 캐시")
- 목록성 데이터 캐시는 필요 시 후속 도입
