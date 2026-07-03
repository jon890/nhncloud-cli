# nhncloud-cli 유지보수 점검 기준

이 참고문서는 `nhncloud-cli` 저장소에서만 읽는다.

## 저장소 계약

- HTTP 클라이언트는 `ky`만 사용한다.
- CLI 데이터는 stdout, spinner/error/progress는 stderr로 보낸다.
- 오류는 `NhnCloudCliError(message, EXIT_*)`를 사용한다.
- profile 우선순위는 `--profile` > `NHNCLOUD_PROFILE` > config default > `default`.
- service별 인증 모델을 섞지 않는다.
  - Log & Crash search: appkey + `X-LNCS-SECRET`.
  - Log & Crash collector: appkey-only body.
  - Deploy: UAK OAuth bearer.
  - IaaS/Instance/Network/Volume/NKS: Keystone `X-Auth-Token`.
  - NCR management: UAK static `X-TC-*`.
  - NCR Harbor REST: UAK Basic Auth.

## 우선 점검 대상

- `src/api/endpoints.ts`와 `docs/adr/`의 endpoint 결정 불일치.
- `src/api/keystone.ts`와 `src/cache/token-store.ts`의 cache schema drift.
- `src/commands/*`의 option naming, `--json`/`--quiet`, spinner 순서 불일치.
- `src/services/*/client.ts`의 response guard, envelope 적용/미적용 혼동.
- `docs/code-architecture.md`의 디렉터리 트리와 실제 `src/` 불일치.
- `docs/flow.md`, `README.md`, `skills/nhncloud-cli/SKILL.md`의 명령 표면 drift.
- `.agents/skills/_shared/pitfalls/`에 이미 있는 반복 지적이 새 코드에서 재발했는지.
- skill/pitfall 규칙이 여전히 좋은 규칙인지.
  한 번의 사건인지, LLM 기본 행동으로 충분한지, 코드로 자명한지, 정적 도구로 대체 가능한지, stale 도메인 지식인지 본다.

## 권장 점검 명령

```bash
git log --since="7 days ago" --oneline --name-only
find src/commands src/services src/api -maxdepth 3 -type f | sort
grep -rnE "from ['\"]axios|from ['\"]node-fetch|from ['\"]got" src/ || true
grep -rnE "NhnCloudCliError\\([^,]+,\\s*[0-9]+" src/ || true
grep -rnE "console\\.log|console\\.error" src/ || true
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\\.(com|co\\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
```

## 좋은 리팩토링 후보

- 같은 resolver/client construction 흐름이 3곳 이상 반복된다.
- 같은 API response guard shape가 서비스별로 복붙되고 하나만 drift한다.
- command option validation이 같은 numeric/range rule을 반복한다.
- docs update 규칙이 task phase마다 빠져 반복 review 지적을 만든다.
- skill 규칙이 반복성과 위험도는 높지만 도구로 자동화하기 어렵고 비자명하다.

## 나쁜 리팩토링 후보

- 외부 API body/response가 실측되지 않은 상태에서 type을 일반화한다.
- 인증 모델이 다른 서비스를 하나의 generic client로 합친다.
- command 출력 컬럼을 "보기 좋게" 바꾸지만 snapshot/usage 검증이 없다.
- tests 없이 cache schema migration을 바꾼다.
- 한 번의 실수만 근거로 skill/pitfall을 계속 늘린다.
- grep/tsc/ast-grep으로 잡을 수 있는 규칙을 LLM 판단 문서로만 유지한다.
