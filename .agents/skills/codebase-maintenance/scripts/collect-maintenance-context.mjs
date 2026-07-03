#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(cmd, args) {
  try {
    return {
      ok: true,
      command: [cmd, ...args].join(" "),
      stdout: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (error) {
    return {
      ok: false,
      command: [cmd, ...args].join(" "),
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? error.message,
      status: error.status ?? 1,
    };
  }
}

function lines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

const mode = argValue("--mode", "weekly");
const since = argValue("--since", mode === "daily" ? "1 day ago" : "7 days ago");
const out = argValue("--out", "");
const includePrs = !hasFlag("--no-prs");

const gitRootResult = run("git", ["rev-parse", "--show-toplevel"]);
const root = gitRootResult.ok ? gitRootResult.stdout.trim() : process.cwd();

const recentLog = run("git", ["log", `--since=${since}`, "--date=short", "--pretty=format:%h%x09%ad%x09%s", "--name-only"]);
const status = run("git", ["status", "--short", "--branch"]);
const branch = run("git", ["branch", "--show-current"]);
const trackedFiles = run("git", ["ls-files"]);

const fileCounts = new Map();
let currentCommit = null;
for (const line of lines(recentLog.stdout)) {
  if (/^[0-9a-f]{7,}\t/.test(line)) {
    currentCommit = line;
    continue;
  }
  if (!currentCommit || line.includes("\t")) continue;
  fileCounts.set(line, (fileCounts.get(line) ?? 0) + 1);
}

const hotFiles = [...fileCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 20)
  .map(([file, count]) => ({ file, count }));

const files = lines(trackedFiles.stdout);
const srcCommands = files.filter((file) => file.startsWith("src/commands/"));
const srcServices = files.filter((file) => file.startsWith("src/services/"));
const docs = files.filter((file) => file.startsWith("docs/") || file === "AGENTS.md" || file === "README.md");

let prs = null;
if (includePrs) {
  const gh = run("gh", [
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "20",
    "--json",
    "number,title,mergedAt,headRefName,additions,deletions,changedFiles",
  ]);
  try {
    prs = gh.ok ? JSON.parse(gh.stdout) : { unavailable: true, command: gh.command, stderr: gh.stderr };
  } catch (error) {
    prs = {
      unavailable: true,
      command: gh.command,
      parseError: error instanceof Error ? error.message : String(error),
      raw: gh.stdout.slice(0, 200),
    };
  }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  mode,
  since,
  root,
  branch: branch.stdout.trim(),
  status: status.stdout,
  recentLog: recentLog.stdout,
  hotFiles,
  counts: {
    trackedFiles: files.length,
    srcCommands: srcCommands.length,
    srcServices: srcServices.length,
    docs: docs.length,
  },
  srcCommands,
  srcServices,
  docs,
  mergedPrs: prs,
};

const serialized = JSON.stringify(evidence, null, 2);
if (out) {
  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialized + "\n", "utf8");
  process.stdout.write(`${outPath}\n`);
} else {
  process.stdout.write(serialized + "\n");
}
