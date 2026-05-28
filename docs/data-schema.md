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
        "appkey": "<appkey>",
        "token": "<user-access-key-token>"
      }
    }
  }
}
```

- `logncrash` — 검색은 appkey(path) + secret(`X-LNCS-SECRET` 헤더)
- `deploy` — appkey(path) + token(`X-NHN-AUTHORIZATION: Bearer` 헤더). v1 미구현, 스키마만 예약

## config.json

```json
{
  "version": 1,
  "defaultProfile": "default"
}
```

- `defaultProfile` — `--profile` 미지정 시 사용할 profile
- 출력 기본값 등 일반 설정은 필요 시 후속 추가

## profile 해석 순서

1. `--profile <name>` 옵션
2. 환경변수 `NHNCLOUD_PROFILE`
3. `config.json` 의 `defaultProfile`
4. 위 모두 없으면 `"default"`

자격증명 누락 시 `NhnCloudCliError(EXIT_CONFIG_ERROR)` 로 설정 안내 후 종료.

## 캐시

v1 (logncrash search) 은 캐시 불필요 — 매 호출이 실시간 검색.
후속 서비스에서 목록성 데이터가 생기면 `~/.nhncloud/cache/` 도입 검토.
