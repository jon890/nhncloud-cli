import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  MANIFEST_FILE_NAME,
  calculateSkillContentDigest,
  createSkillManifest,
  isNhnCloudSkillManifest,
  readSkillManifest,
} from "./manifest.js";

let root: string;

function writeSkill(
  skillRoot: string,
  files: Array<readonly [relativePath: string, content: string]>,
): void {
  mkdirSync(path.join(skillRoot, "references"), { recursive: true });
  for (const [relativePath, content] of files) {
    const filePath = path.join(skillRoot, ...relativePath.split("/"));
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "nhncloud-skill-manifest-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("NhnCloudSkillManifest", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const installedAt = "2026-08-03T09:30:00.000Z";

  it("생성한 매니페스트를 읽고 검증한다", () => {
    const manifest = createSkillManifest("1.2.3", digest, installedAt);
    writeFileSync(path.join(root, MANIFEST_FILE_NAME), JSON.stringify(manifest));

    expect(isNhnCloudSkillManifest(manifest)).toBe(true);
    expect(readSkillManifest(root)).toEqual(manifest);
  });

  it.each([
    ["sha256:ABCDEF", installedAt, "잘못된 digest"],
    [`sha256:${"a".repeat(63)}`, installedAt, "짧은 digest"],
    [digest, "2026-08-03T18:30:00.000+09:00", "UTC가 아닌 시각"],
    [digest, "2026-02-30T09:30:00.000Z", "왕복되지 않는 시각"],
  ])("외부 매니페스트의 값을 엄격히 검사한다: %s", (contentDigest, timestamp) => {
    const candidate = {
      schemaVersion: 1,
      skillName: "nhncloud-cli",
      packageName: "@bifos/nhncloud-cli",
      packageVersion: "1.2.3",
      contentDigest,
      installedAt: timestamp,
      managedBy: "@bifos/nhncloud-cli",
    };

    expect(isNhnCloudSkillManifest(candidate)).toBe(false);
  });

  it("검증되지 않은 JSON을 타입 단언 없이 거부한다", () => {
    writeFileSync(path.join(root, MANIFEST_FILE_NAME), JSON.stringify({ schemaVersion: 1 }));

    expect(() => readSkillManifest(root)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("calculateSkillContentDigest", () => {
  it("파일 생성 순서와 중첩 디렉터리에 독립적으로 같은 해시를 만든다", () => {
    const otherRoot = mkdtempSync(path.join(tmpdir(), "nhncloud-skill-manifest-order-"));
    try {
      writeSkill(root, [
        ["references/하위/나.md", "두 번째\n"],
        ["SKILL.md", "# 공개 스킬\n"],
        ["references/가.md", "첫 번째\n"],
      ]);
      writeSkill(otherRoot, [
        ["references/가.md", "첫 번째\n"],
        ["SKILL.md", "# 공개 스킬\n"],
        ["references/하위/나.md", "두 번째\n"],
      ]);

      expect(calculateSkillContentDigest(root)).toBe(calculateSkillContentDigest(otherRoot));
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("한글 경로와 내용의 UTF-8 바이트 길이 및 슬래시 경계를 고정한다", () => {
    writeSkill(root, [
      ["SKILL.md", "기술\n"],
      ["references/하위/안내.md", "한글 내용\n"],
    ]);

    expect(calculateSkillContentDigest(root)).toBe(
      "sha256:6f26e49b05738adbcf3664110b9f8fb8b54b01f9d94748f9961cdb29b1d6dc4b",
    );
  });

  it("파일 내용이 바뀌면 해시가 바뀐다", () => {
    writeSkill(root, [
      ["SKILL.md", "before"],
      ["references/guide.md", "same"],
    ]);
    const before = calculateSkillContentDigest(root);
    writeFileSync(path.join(root, "SKILL.md"), "after");

    expect(calculateSkillContentDigest(root)).not.toBe(before);
  });

  it("references 하위 실제 디렉터리는 순회한다", () => {
    writeSkill(root, [
      ["SKILL.md", "root"],
      ["references/nested/guide.md", "nested"],
    ]);

    expect(calculateSkillContentDigest(root)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("references 루트 심볼릭 링크를 거부한다", () => {
    const externalReferences = path.join(root, "external-references");
    mkdirSync(externalReferences);
    writeFileSync(path.join(root, "SKILL.md"), "root");
    symlinkSync(externalReferences, path.join(root, "references"));

    expect(() => calculateSkillContentDigest(root)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("references 내부 심볼릭 링크를 거부한다", () => {
    writeSkill(root, [
      ["SKILL.md", "root"],
      ["references/real.md", "real"],
    ]);
    symlinkSync(path.join(root, "references", "real.md"), path.join(root, "references", "link.md"));

    expect(() => calculateSkillContentDigest(root)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("SKILL.md 심볼릭 링크를 거부한다", () => {
    const actualSkill = path.join(root, "actual-skill.md");
    writeFileSync(actualSkill, "root");
    mkdirSync(path.join(root, "references"));
    symlinkSync(actualSkill, path.join(root, "SKILL.md"));

    expect(() => calculateSkillContentDigest(root)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("references 내부의 파일과 디렉터리 외 항목을 거부한다", async () => {
    writeSkill(root, [["SKILL.md", "root"]]);
    const socketPath = path.join(root, "references", "entry.socket");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    try {
      expect(() => calculateSkillContentDigest(root)).toThrowError(
        expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("references 루트의 정규 파일 대체를 거부한다", () => {
    writeFileSync(path.join(root, "SKILL.md"), "root");
    writeFileSync(path.join(root, "references"), "not a directory");

    expect(() => calculateSkillContentDigest(root)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});
