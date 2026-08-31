# Phase 01: 조회 완료 뒤 결과 상태 분리와 복구 파일 보존

**Execution profile**: deep

---

## 목표

`logncrash export`가 모든 원격 데이터를 받은 뒤 JSON 배열 마무리나 최종 파일 교체에 실패하더라도 결과를 삭제하지 않는다.
조회 중 실패와 조회 완료 뒤 로컬 실패를 분리해 사용자가 API를 다시 호출해야 하는지 정확히 알 수 있게 한다.

현재 `src/commands/logncrash/export.ts`에는 두 결함이 있다.

- `appendFile(tmp, "]\n")` 실패가 조회 중 실패를 처리하는 바깥 catch에 들어가 전체 데이터를 `.partial`로 오인하고 이어받기를 안내한다.
- `rename(tmp, opts.output)` 실패가 임시 파일을 삭제하며, 성공 spinner는 교체 전에 표시된다.

**범위 외**: JSON 자동 복구, API 자동 재실행, 새 CLI 옵션, ADR-032의 `.partial` 이어받기 규칙과 이슈 #98부터 #100까지는 다루지 않는다.
`AGENTS.md`, `docs/prd.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/adr/`는 planning의 docs-first 커밋 `76fec48`에서 갱신됐다.
이 phase에서 다시 편집하지 않는다.
사용자 가이드는 phase-02가 맡는다.

---

## 작업 항목 (4)

### 1. 실행별 파일 경로와 완료 상태를 정의한다

`src/commands/logncrash/export.ts`에서 `randomBytes` 대신 Node.js 내장 `randomUUID`를 사용한다.
한 실행에서 한 번 만든 `<id>`를 아래 세 경로에 함께 쓴다.

- 임시 파일: `<output>.<id>.tmp`
- 형식까지 완성한 전체 결과: `<output>.<id>.complete`
- 모든 데이터를 받았지만 JSON 배열을 닫지 못한 결과: `<output>.<id>.unfinalized`

`<id>`가 복구 파일명을 실행별로 분리하므로 기존 `.complete`와 `.unfinalized`를 덮어쓰지 않는다.
`--output`의 `--force` 정책을 복구 파일에 확대하지 않는다.

### 2. 조회 catch와 로컬 마무리 경계를 분리한다

현재 조회 루프를 감싼 try/catch는 scroll 요청, 스트리밍 write와 `endAndClose(stream)`까지만 처리하게 좁힌다.
이 catch에서 `count > 0`이면 `<output>.partial`로 보존하는 기존 동작과 이어받기 안내를 그대로 유지한다.

`endAndClose(stream)`가 성공한 뒤 JSON 배열 닫기와 최종 교체를 별도 경계에서 처리한다.
테스트가 파일 실패를 정확히 주입할 수 있도록 다음 내부 계약을 `export.ts`에 둔다.

```typescript
type ExportFinalizeState = "complete" | "unfinalized";

interface ExportFileOps {
  appendFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

type ExportFinalizeResult =
  | { ok: true }
  | {
      ok: false;
      state: ExportFinalizeState;
      cause: unknown;
      recoveryPath: string;
      preserved: boolean;
    };
```

`finalizeExportFile(tmp, output, id, format, ops?)`는 stderr, spinner와 throw 결정을 맡지 않고 파일 작업 결과만 반환한다.
기본 `ops`는 현재 `node:fs/promises`의 `appendFile`과 `rename`을 재사용하고, 테스트만 실패 함수를 주입한다.

- `format === "json"`의 배열 닫기가 실패하면 `state: "unfinalized"`로 정하고 temp를 고유 `.unfinalized` 경로로 옮긴다.
- 배열 닫기까지 끝난 뒤 `rename(tmp, output)`이 실패하면 `state: "complete"`로 정하고 temp를 고유 `.complete` 경로로 옮긴다.
- 복구 경로 이동이 실패하면 `preserved: false`를 반환하고 temp를 삭제하지 않는다.
- 복구 이동 실패가 `cause`를 바꾸지 않게 한다. 사용자가 먼저 알아야 하는 원인은 배열 닫기나 최종 교체 실패다.

함수 이름이나 반환 필드를 바꾸려면 같은 의미와 테스트 주입 지점을 유지하고 phase 보고에 근거를 남긴다.

### 3. 종료 코드와 stderr 안내를 상태에 맞춘다

`finalizeExportFile`이 실패 결과를 반환하면 호출부가 `stopSpinner(false)`를 먼저 호출한다.
그 뒤 기존 `EXIT_PARAM_ERROR`를 쓰는 `NhnCloudCliError`로 원래 로컬 파일 오류를 감싸 던진다.

- `complete`: API 재조회가 필요 없고 그대로 쓸 수 있는 전체 결과라는 사실과 정확한 복구 경로를 알린다.
- `unfinalized`: API 재조회는 필요 없지만 JSON 배열의 마지막 `]`을 확인해야 한다는 사실과 정확한 복구 경로를 알린다.
- `preserved: false`: 복구 경로로 옮기지 못했음을 경고하고 삭제하지 않은 temp 경로를 알린다.

데이터와 경로를 stdout에 쓰지 않는다.
최종 `rename(tmp, output)`이 성공한 뒤에만 `stopSpinner(true, ...)`와 저장 완료 안내를 출력한다.
성공 뒤에는 기존 `<output>.partial`만 지우고 `.complete`와 `.unfinalized`는 검색하거나 삭제하지 않는다.

### 4. 실패 상태와 기존 계약을 테스트로 고정한다

`src/commands/logncrash/export.test.ts`에 `finalizeExportFile` 단위 테스트와 명령 통합 테스트를 추가한다.
파일 실패는 `ExportFileOps`를 주입해 재현하고, 실제 디스크 용량이나 권한에 의존하지 않는다.

다음 경로를 각각 고정한다.

- JSON 배열 닫기 실패는 모든 객체 바이트를 가진 고유 `.unfinalized`를 남기고 `.partial`과 이어받기 안내를 만들지 않는다.
- 최종 교체 실패는 파싱 가능한 고유 `.complete`를 남기고 temp를 삭제한다.
- `.complete`와 `.unfinalized`가 이미 다른 실행 ID로 존재해도 새 복구 파일과 함께 남는다.
- 복구 파일 이동도 실패하면 temp가 남고 원래 오류 메시지와 temp 경로가 stderr에 나온다.
- 두 로컬 실패는 `EXIT_PARAM_ERROR`로 끝나고 성공 spinner를 호출하지 않는다.
- 정상 성공은 앞선 `.complete`와 `.unfinalized`를 삭제하지 않지만 기존 `.partial`은 계속 정리한다.
- 조회 중 실패의 기존 `.partial` 파일은 파싱 가능하고 이어받기 안내를 유지한다.

테스트가 helper 반환값만 확인하고 끝나지 않게 한다.
적어도 최종 교체 실패 한 경로는 `programWithExport().parseAsync(...)`를 통해 stderr, spinner와 종료 코드를 함께 검증한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/logncrash/export.ts` | 수정: 조회 완료 뒤 파일 상태 분리, 복구 파일 보존과 오류 안내 |
| `src/commands/logncrash/export.test.ts` | 수정: 파일 실패 주입과 상태별 회귀 테스트 |

## 검증

```bash
# cwd: <레포 루트>
pnpm exec vitest run src/commands/logncrash/export.test.ts
pnpm tsc --noEmit
```

두 명령은 종료 코드 0이어야 한다.
대상 테스트는 `.partial`, `.complete`, `.unfinalized`, temp 보존, spinner와 종료 코드 경로를 모두 포함해야 한다.

```bash
# cwd: <레포 루트>
# 조회 완료 뒤 상태 토큰이 모두 구현돼 있어야 한다.
grep -n 'complete\|unfinalized\|finalizeExportFile' src/commands/logncrash/export.ts

# 기존 부분 결과 계약이 남아 있어야 한다.
grep -n '\.partial' src/commands/logncrash/export.ts
```

두 grep은 각각 출력이 있어야 한다.

## 의도 메모

- 기존 바깥 catch는 조회 실패 결과를 보존하려고 만든 자리다.
  조회 완료 뒤 실패까지 그대로 맡기면 `.partial` 의미와 이어받기 안내가 반대로 작동한다.
- `.complete`와 `.unfinalized`를 나누는 이유는 모든 데이터를 받았다는 사실과 파일을 바로 파싱할 수 있다는 사실이 다르기 때문이다.
- 고유 ID를 넣는 이유는 다음 실패가 앞선 복구 결과를 덮어쓰지 않게 하기 위해서다.
- helper는 파일 작업 결과만 반환한다.
  stderr, spinner와 throw를 한 함수에 묶지 않아 각 실패를 독립적으로 테스트한다.

## Blocked 조건

- `docs/adr/034-logncrash-export-completed-result-preservation.md`가 없거나 ADR-034의 세 상태가 위 계약과 다르면 `PHASE_BLOCKED: ADR-034 계약 불일치`를 출력하고 종료한다.
- 현재 브랜치에 phase 시작 전 사용자 코드 변경이 겹쳐 `export.ts`의 실패 경계를 안전하게 분리할 수 없으면 `PHASE_BLOCKED: export 동시 변경 충돌`을 출력하고 종료한다.
