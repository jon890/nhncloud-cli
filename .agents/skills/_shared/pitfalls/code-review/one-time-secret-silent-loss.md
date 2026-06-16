---
id: one-time-secret-silent-loss
category: code-review
title: 1회성 비밀(서버 생성 키·발급 토큰)을 조용히 잃는 경로
triggers: [1회성 secret, silent loss]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: API 가 비밀(private_key·1회성 토큰)을 **응답 1회에만** 반환하는데(이후 재조회 불가), 그 비밀을 받은 뒤 안전하게 보존한다는 보장이 없다. 두 갈래:
- 파일 저장(`--output`)이 실패하면(쓰기 불가 경로 등) 비밀이 영구 유실 — 이미 서버에는 생성됐고 재조회 불가라 사용자는 삭제 후 재생성해야 함.
- `--quiet` + 저장 경로 미지정 조합이면 stdout 출력이 억제되고 파일도 없어 **무성 유실**.

**Good**:
- 저장 실패 시 temp 파일을 **지우지 않고**(마지막 사본 파괴 방지) stderr 경고 + stdout 으로 비밀을 출력하는 fallback.
- `생성 경로 + --quiet + 저장 경로 미지정` 조합은 호출(API) **전** `EXIT_PARAM_ERROR` 로 사전 거부(footgun 차단).
- 비밀은 메타 출력(table/json `raw`)에서 rest 분리(`const { secret, ...meta }`)로 제외.

**검출**:
```bash
# 1회성 비밀 저장 호출이 try/catch 로 감싸지고 catch 에 stdout fallback 이 있는가
grep -nE "savePrivateKey|saveSecret|1회만|1회성" src/commands/   # 1회성 비밀 처리 지점
# 저장 호출 직후 catch + stdout.write(비밀) 가 동반되는지 육안 확인
```

**Self-check**: 1회성 비밀을 반환하는 명령에서, 비밀이 조용히 사라지는 분기(저장 실패 / quiet+미저장)가 하나라도 있는가? 모든 분기에서 비밀이 stdout 또는 파일 중 한 곳에는 반드시 남는가?

**Why**: plan009 (PR #11) critic REVISE — keypair create 의 NHN 생성 private_key 가 ① savePrivateKey 실패 시 fallback 없어 영구 유실, ② `--quiet`+미저장 시 무성 유실. (b) 저장 실패 stdout fallback + (c) quiet+미저장 사전 차단으로 해소. 비밀을 1회성으로 발급하는 API(토큰 발급 등)마다 재발 가능.

# 9. 상수·주석 위생 (AI slop)
