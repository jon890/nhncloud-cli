# Phase 01 — 실측 게이트 → Docker Registry v2 이미지/태그 조회

## 목표 (검증 가능)

`nhncloud ncr images <registry>` / `nhncloud ncr tags <registry> <repository>` 가 레지스트리 host 의 Docker Registry HTTP API v2 를 Basic Auth 로 호출해 repository·tag 목록을 반환한다. **단, 이 기능이 NCR 에서 실제 가능한지가 미확정이라 실측이 선행 게이트다.**

## ⚠️ STEP 0 — 실측 게이트 (코드 작성 전 필수)

다른 어떤 코드도 쓰기 전에 `/v2/_catalog` 가 NCR 에서 동작하는지 실측한다. **자격증명(공통 UAK)과 task 021 의 `ncr get` 으로 얻은 레지스트리 host 가 필요**하다.

```bash
# 1) task 021 로 레지스트리 host(uri/private_uri) 확보
node dist/index.js ncr get <registry> --json   # uri / private_uri 필드 확인

# 2) Docker Registry v2 카탈로그 실측 (Basic Auth = UAK id:secret)
curl -s -u "<uak-id>:<uak-secret>" "https://<registry-uri>/v2/_catalog" -i
# 3) 태그 목록 실측
curl -s -u "<uak-id>:<uak-secret>" "https://<registry-uri>/v2/<repository>/tags/list" -i
```

판정:

- **200 + `{"repositories":[...]}` / `{"tags":[...]}`** → 게이트 통과. 아래 구현 진행. 확정된 host(uri vs private_uri)·인증·응답 형태를 ADR-017 에 기록.
- **401 / 403** → Basic Auth(UAK) 가 데이터플레인에 안 통함. Bearer 토큰 챌린지(`Www-Authenticate` 헤더의 `realm`/`service`/`scope` 로 토큰 교환) 방식일 수 있음 — 헤더를 기록하고 **task 를 blocked** 로 표시(`index.json` blocked_reason 에 실측 결과 + Www-Authenticate 원문). Bearer 교환 재설계는 별도 결정.
- **404 / 차단** → NCR 이 `_catalog` 를 노출하지 않음. blocked 표시 + 발견 기록. 대안(콘솔 전용이라 CLI 불가) 을 사용자에게 보고.

> 추측으로 구현하지 않는다(CLAUDE.md). 게이트 미통과 시 코드를 쓰지 말고 blocked 로 남긴다 — 잘못된 가정의 client 를 머지하는 것보다 정직한 보류가 낫다.

## STEP 1+ — 게이트 통과 시 구현

### 1. `src/services/ncr/client.ts` 확장 — Docker v2 메서드

Management API(021)와 **다른 인증·다른 봉투**다. 별도 메서드로 분리한다.

```ts
// Basic Auth 헤더 (Management 의 X-TC-* 와 다름)
private basicAuthHeader(): Record<string, string> {
  const token = Buffer.from(`${this.uakId}:${this.uakSecret}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

// Docker Registry v2 — 평면 JSON, envelope unwrap 미적용
async listRepositories(registryUri: string): Promise<string[]> {
  // GET https://{registryUri}/v2/_catalog → { repositories: string[] }
}
async listTags(registryUri: string, repository: string): Promise<string[]> {
  // GET https://{registryUri}/v2/{repository}/tags/list → { name, tags: string[] }
}
```

- **봉투 우회**(ADR-015 다운로드 선례): `.json<{ repositories: string[] }>()` 직접 파싱, `unwrap` 호출하지 않는다(Docker v2 는 NHN 봉투 아님). 가드로 `repositories`/`tags` 배열 존재 확인 후 반환.
- repository path 는 `/` 포함 가능(`project/image`) — `encodeURIComponent` 하면 `%2F` 로 깨질 수 있으니 Docker v2 규약(slash 보존, 각 세그먼트만 인코딩) 확인. 실측으로 확정.
- host 는 021 `ncr get` 의 `uri` 또는 `private_uri` — STEP 0 에서 확정한 쪽을 쓴다.

### 2. registry host 해석

`images`/`tags` 명령은 `<registry>` 이름을 받아 먼저 `getRegistry` 로 host(uri)를 얻고, 그 host 에 Docker v2 호출. 2단계 흐름이므로 **spinner 2단계 전환(1-2 회피)**: 첫 spinner("레지스트리 조회 중") stop 후 둘째 spinner("이미지 목록 조회 중") 시작.

### 3. `src/commands/ncr/images.ts` / `tags.ts`

- `ncr images <registry>` — repository 목록. headers `["repository"]`.
- `ncr tags <registry> <repository>` — 태그 목록. headers `["tag"]`.
- 옵션 `--region`/`--app-key`/`--profile` 은 021 helper 재사용.
- `index.ts` 의 ncrCommand 에 두 명령 추가.

### 4. ADR-017 신설 (게이트 통과 후 — adr.md)

ADR-016 과 별도. 구조:

- 결정: 이미지/태그는 Management API 부재로 Docker Registry HTTP API v2 데이터플레인을 Basic Auth(UAK id:secret)로 직접 호출. 봉투 우회(평면 JSON). host 는 ncr get 의 uri.
- 맥락: NCR public Management API 에 image/tag 조회 endpoint 없음 — Harbor native(`/api/v2.0`)도 미노출.
- 실측 확정 결과: STEP 0 의 200 응답 형태(host=uri/private_uri, repository path 인코딩 규약).
- 대안 기각: Management API 확장 대기(콘솔 전용이라 불가) / Harbor native 경로(미노출 404).
- adr.md ADR Index 에 한 줄 + CLAUDE.md ADR 참조 표·인증 모델 표(Docker v2 Basic Auth 행) 추가.

> ADR-017 은 게이트 통과로 사실이 확정된 뒤에만 작성한다(planning 단계에서 미확정이라 task 로 미뤘음). 게이트 실패면 ADR 작성하지 않는다.

### 5. 단위테스트 (020 패턴)

- `listRepositories` — `vi.mock("ky")` 로 `{ repositories: ["a","b"] }` 주입 → `["a","b"]` 반환. 봉투가 **아닌** 평면 JSON 임을 테스트로 고정(unwrap 호출 안 함 검증).
- `listTags` — `{ name: "repo", tags: ["v1","v2"] }` → `["v1","v2"]`.
- 빈/누락 배열 가드: `{}` → 빈 배열 또는 명확한 에러(택1, 코드 동작과 일치).
- Basic Auth 헤더가 `Basic base64(id:secret)` 인지 ky.get 호출 인자 단언.

## 회피 항목 (executor self-check)

- **봉투 혼동**: Docker v2 응답에 `unwrap`(NHN 봉투)을 적용하지 않았는가? Management(021)와 데이터플레인(022)의 파싱을 섞지 않았는가?
- **1-2 spinner 2단계**: registry 조회 → 이미지 조회 2단계에서 첫 spinner 를 stop 후 둘째 시작했는가?
- **5-3 / 가드**: 평면 JSON 의 `repositories`/`tags` 를 `as string[]` 캐스트 없이 배열 가드 후 반환했는가?
- **9-1 exit code 리터럴**: `EXIT_*` 상수 사용.
- **추측 금지**: 게이트 미통과인데 "아마 되겠지" 로 코드를 머지하지 않았는가?

## 완료 조건

- **게이트 통과**: tsc 0 에러 + build 정상 + `pnpm test` PASS + 실측 200 + ADR-017 작성. index.json `current_phase: 1`.
- **게이트 실패**: 코드 미작성. index.json `status: blocked`, `blocked_reason` 에 실측 결과(status·Www-Authenticate·응답 본문 요약) 기록. phase-02 로 진행하지 않고 사용자에게 대안 보고.
