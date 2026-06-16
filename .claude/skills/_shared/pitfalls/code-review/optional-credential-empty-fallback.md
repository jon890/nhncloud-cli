---
id: optional-credential-empty-fallback
category: code-review
title: optional 자격증명 필드 빈문자열 fallback (`?? ""`) → 인증 실패를 설정 오류로 진단 못함
triggers: [자격증명, optional, 빈 값]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: `ServiceCredential.secret?` 처럼 optional 인 자격증명 필드를 client 에 넘길 때 `cred.secret ?? ""` 로 빈문자열 fallback.
secret 미설정 시 빈 인증 헤더 (`X-LNCS-SECRET: `) 로 API 호출 → 401 → 사용자는 "API 호출 실패 (401)" 만 보고 *설정이 빠진 것* 인지 *키가 틀린 것* 인지 모름.

**Good**: client 생성 전에 필수 인증 필드 존재를 검증하고 없으면 `EXIT_CONFIG_ERROR` + 설정 안내 메시지.

```ts
// BAD — 빈문자열 fallback → 401 로만 드러남
const client = new LogncrashClient(cred.appkey, cred.secret ?? "");

// GOOD — 없으면 EXIT_CONFIG_ERROR 로 즉시 진단
if (!cred.secret) {
  throw new NhnCloudCliError(
    `profile "${profileName}" 의 logncrash 자격증명에 secret 이 없습니다.`,
    EXIT_CONFIG_ERROR,
  );
}
const client = new LogncrashClient(cred.appkey, cred.secret);
```

**검출**:
```bash
grep -rnE "\?\?\s*\"\"" src/commands/ src/services/   # 자격증명/필수값 빈문자열 fallback 의심
```

**Self-check**: client 에 넘기는 자격증명 필드가 type 상 optional 인데 `?? ""` 로 채우고 있는가? 그러면 미설정 시 인증 실패(AUTH)로만 드러나고 설정 오류(CONFIG)로 진단 못함 — 호출 전 존재 검증으로 교체.

**Why**: PR #1 (plan001) — `cred.secret ?? ""` 가 secret 미설정 시 빈 헤더로 401 유발. code-reviewer 가 잡음. 서비스별 자격증명 필드가 optional 인 한 (Deploy token 등) 새 service client 마다 재발 가능.
