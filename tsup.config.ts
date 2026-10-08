import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg: unknown = JSON.parse(readFileSync("package.json", "utf8"));
const version = (pkg as { version?: unknown }).version;
if (typeof version !== "string") {
  throw new Error("package.json 의 version 이 문자열이 아니다.");
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  define: { __NHNCLOUD_CLI_VERSION__: JSON.stringify(version) },
});
