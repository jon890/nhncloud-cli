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
UAK 는 개인/계정 단위라 OAuth 쓰는 서비스가 공유하고, 서비스별 블록은 프로젝트 appkey 같은 서비스 고유 값만 둔다.

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
        "appkey": "<appkey>"
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

- `userAccessKey` — profile 공통 개인 UAK. deploy·ncs·logncrash 검색 등 OAuth 서비스가 공유 ([[adr-007]], [[adr-024]])
  - OAuth 로 교환한 `access_token` 을 `X-NHN-AUTHORIZATION: Bearer` 로 사용
  - deploy 는 자체 자격증명 블록 없이 이 UAK + `config.json` target 좌표로 동작 ([[adr-008]])
- `logncrash` — appkey(path)만 저장한다. 검색 인증은 `userAccessKey` OAuth 토큰을 재사용한다. 기존 `secret` 필드는 마이그레이션 후 읽지 않는다 ([[adr-024]])
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
~/.nhncloud/cache/user-access-token-<profile>.json   # { accessToken, expiresAt, credentialHash } — mode 0600
~/.nhncloud/cache/iaas-token-<profile>-<region>.json   # { tokenId, expiresAt, credentialHash, computeEndpoint, imageEndpoint, networkEndpoint, blockStorageEndpoint, nksEndpoint } — mode 0600
```

- user-access-token — OAuth `access_token` 을 만료시각과 함께 저장 ([[adr-007]]). deploy·ncs·logncrash 검색이 같은 계정 토큰이라 이 캐시를 공유 ([[adr-020]], [[adr-024]])
- iaas — Keystone token + region 별 정적 host 맵으로 구성한 compute·image·network·blockStorage·nks endpoint 캐시 ([[adr-005]], [[adr-010]], [[adr-013]], [[adr-019]])
- `credentialHash` — 발급 자격의 SHA-256 지문. 현재 자격과 다르면 캐시 무효화·재발급 ([[adr-021]]). user-access-token 은 `sha256(uakId:uakSecret)`, iaas 는 `sha256(tenantId:username:password)`
- 만료 전 재사용, 만료 시 재발급한다. logncrash 검색도 같은 user-access-token 캐시를 쓴다.

## profile 해석 순서

1. `--profile <name>` 옵션
2. 환경변수 `NHNCLOUD_PROFILE`
3. `config.json` 의 `defaultProfile`
4. 위 모두 없으면 `"default"`

자격증명 누락 시 `NhnCloudCliError(EXIT_CONFIG_ERROR)` 로 설정을 안내한 뒤 종료한다.

## 캐시 범위

- logncrash search·deploy·ncs — 공통 OAuth access_token만 캐시 (위 "토큰 캐시"). 검색 결과는 캐시하지 않음
- instance — Keystone token + compute endpoint 캐시 (위 "토큰 캐시")
- 목록성 데이터 캐시는 필요 시 후속 도입
