---
id: sensitive-file-mode-missing
category: code-review
title: `~/.nhncloud/` 민감 파일의 mode 미지정
triggers: [파일 권한, 0600, credentials]
tool_catchable: false
source: [PR36]
related: []
---

**증상**: `writeFile(path, data)` 만 호출하면 OS umask (보통 644) 로 파일 생성 → 공유 머신에서 다른 사용자가 캐시된 토큰이나 자격 지문, 내려받은 kubeconfig·개인키를 읽을 수 있음.
**Good**: 사용자 데이터를 담는 `~/.nhncloud/` 하위 파일과 명령이 내려쓰는 비밀 파일은 `writeFile(..., { mode: 0o600 })` 으로 owner-only. 이미 적용된 곳은 `src/cache/token-store.ts`(:104, :176), `src/config/credentials.ts`(:231), `src/commands/instance/keypair.ts`(:54), `src/commands/nks/cluster.ts`(:132 — `chmod` 로 한 번 더 보정).
**검출**: `grep -rl "writeFile(" src/ --exclude='*.test.ts' | while read f; do grep -q "mode: 0o600" "$f" || echo "$f"; done`

- 호출이 여러 줄에 걸쳐도 파일 단위로 잡는다. 한 줄 정규식으로 옵션 인자를 찾으면 이 저장소의 여러 줄 호출을 놓쳐 항상 0건이 된다.
- 출력은 위반이 아니라 **후보**다. 민감 파일이 아닌 것(스킬 manifest 등)도 나오므로 파일을 열어 각 호출을 분류한다.
- 한 파일에 `mode: 0o600` 이 있는 호출과 없는 호출이 섞이면 파일 단위 검사가 조용히 통과한다. 후보 파일은 호출 단위로 본다.
**Why**: PR #36 review — 파일 내용을 걸러내도 남는 식별자가 있어 파일 자체가 정보 노출 표면이 됐다. `AGENTS.md` 와 ADR-003 은 `credentials.json` 0600 만 규정하므로, 캐시 파일과 명령이 내려쓰는 비밀 파일은 이 패턴이 계속 소유한다. 새 파일을 `~/.nhncloud/` 아래에 만들거나 개인키·kubeconfig 를 내려쓸 때마다 재발 가능.
