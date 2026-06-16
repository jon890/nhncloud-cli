---
id: file-input-no-stat-guard
category: code-review
title: 파일 옵션을 readFileSync 로 바로 읽음 (크기 가드·errno·파일유형 누락)
triggers: [파일 입력, stat guard]
tool_catchable: false
source: [PR###]
related: []
---

`--user-data <path>` 같은 파일 입력 옵션을 `readFileSync(path)` 로 곧장 읽으면 세 가지 함정이 동시에 생긴다.

- **메모리 폭발**: 크기 한도가 있어도 (예: base64 후 65535) 임의 크기 파일을 통째로 읽은 뒤에야 실패 → fail-fast 위반.
- **errno 삼킴**: `catch {}` 로 에러를 버리면 ENOENT (없음) · EACCES (권한) · EISDIR (디렉터리) 가 동일 메시지로 합쳐져 디버깅 불가.
- **디렉터리 통과**: `statSync(dir).size` 는 성공하므로 size 가드만으로는 디렉터리를 못 거른다 → 뒤이은 `readFileSync` 에서 EISDIR generic leak (EXIT 코드도 어긋남).

**Good**: 읽기 전에 `statSync` 한 번으로 세 검증을 끝내고, 통과한 정상 파일에만 `readFileSync` 호출.

```ts
let stat: ReturnType<typeof statSync>;
try {
  stat = statSync(path);
} catch (e) {
  const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
  throw new NhnCloudCliError(`... 읽을 수 없습니다: ${path} (${reason})`, EXIT_PARAM_ERROR);
}
if (!stat.isFile()) throw new NhnCloudCliError("... 일반 파일이 아닙니다", EXIT_PARAM_ERROR);
if (stat.size > RAW_LIMIT) throw new NhnCloudCliError("... 너무 큽니다", EXIT_PARAM_ERROR);
const raw = readFileSync(path);
```

- raw 한도는 인코딩 후 한도에서 역산한다 (base64 는 floor 경계 — 65535 → 49149).

**검출**:

```bash
# 파일 옵션을 읽는 곳에서 직전에 statSync 가드가 있는지
grep -n "readFileSync\|readFile(" src/commands/
```

**Self-check**: 파일 경로 옵션을 읽는 command 에서 `readFileSync` 직전에 `statSync` + `isFile()` + size 가드 + errno 노출이 모두 있는가?

**Why**: PR #8 (plan006) code-reviewer 🟡 2건 — `--user-data` 를 stat 없이 readFileSync. 파일 입력 옵션 (--*-file / config import 등) 추가마다 재발 가능.

---

## 회고 절차 (build-with-teams 9단계)

PR 생성 후 team-lead 자문:
- code-reviewer 가 이번 plan 에서 FIX_NEEDED 또는 코멘트로 지적한 항목이 있는가?
- 있으면, 그 패턴이 **다른 plan 에서도 발생할 가능성** 이 있는가? (1회성 typo 제외)
- 가능성 있으면, 본 docs 의 해당 카테고리에 항목 추가 (또는 새 카테고리 신설). 1줄 단서 + 검출 명령 + Self-check 까지 채워야 추가.

회고에서 발견된 패턴은 **다음 plan 의 phase 작성 시 critic 평가 전에 소진** 됨 (planning SKILL 8단계 self-check + build-with-teams critic 평가 7번 게이트가 본 docs 도 참조).
