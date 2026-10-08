// 릴리스 스크립트가 함께 쓰는 보조 함수.
//
// run: 자식 프로세스를 셸 없이 실행하고 종료 코드와 출력을 돌려준다.
// repoRoot: 현재 디렉터리가 속한 git 저장소 루트를 돌려준다. 저장소 밖이면 null.

import { spawnSync } from "node:child_process";

export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error,
  };
}

export function repoRoot() {
  const r = run("git", ["rev-parse", "--show-toplevel"]);
  return r.status === 0 ? r.stdout.trim() : null;
}
