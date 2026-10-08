import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findForeignDomains,
  findSecrets,
  main,
  OK_DOMAIN_SUFFIXES,
  OK_DOMAINS,
  SCAN,
} from "./check-pii.mjs";

const allow = { exact: OK_DOMAINS, suffixes: OK_DOMAIN_SUFFIXES };
// 위반 표본이 이 파일 자신을 검사에 걸리게 하지 않도록 런타임에 이어 붙인다.
const TLD = ".com";
const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "nhncloud-check-pii-"));
  tempRoots.push(root);
  await Promise.all(SCAN.map((entry) => mkdir(join(root, entry), { recursive: true })));
  await rm(join(root, "README.md"), { recursive: true, force: true });
  await writeFile(join(root, "README.md"), "clean\n");
  await rm(join(root, "AGENTS.md"), { recursive: true, force: true });
  await writeFile(join(root, "AGENTS.md"), "clean\n");
  return root;
}

describe("findForeignDomains", () => {
  it("허용 호스트와 하위 호스트는 통과한다", () => {
    const text = [
      "https://docs.nhncloud" + TLD,
      "https://api-keymanager.nhncloudservice" + TLD,
      "https://github" + TLD + "/org/repo",
      "user@example" + TLD,
      "https://api-lncs-search.alpha-nhncloudservice" + TLD + "/spec",
    ].join("\n");
    expect(findForeignDomains(text, allow)).toEqual([]);
  });

  it("대문자로 쓴 허용 도메인은 통과한다", () => {
    expect(findForeignDomains("https://DOCS.NHNCLOUD.COM/x", allow)).toEqual([]);
  });

  it("허용 도메인 뒤에 다른 도메인을 붙인 주소를 잡는다", () => {
    const sample = "https://docs.nhncloud" + TLD + ".evil.io";
    expect(findForeignDomains(sample, allow)).toEqual([sample]);
    const netSample = "https://docs.nhncloud" + TLD + ".evil.net";
    expect(findForeignDomains(netSample, allow)).toEqual([netSample]);
  });

  it("허용 도메인 앞에 글자를 붙인 주소를 잡는다", () => {
    const sample = "https://evilnhncloud" + TLD;
    expect(findForeignDomains(sample, allow)).toEqual([sample]);
  });

  it("사내처럼 보이는 도메인을 잡는다", () => {
    const sample = "https://wiki.internal-corp" + TLD;
    expect(findForeignDomains(sample, allow)).toEqual([sample]);
  });

  it("정확 일치 목록은 하위 호스트를 허용하지 않는다", () => {
    const sample = "https://other.alpha-nhncloudservice" + TLD;
    expect(findForeignDomains(sample, allow)).toEqual([sample]);
  });
});

describe("findSecrets", () => {
  it("16자 이상 영숫자 값을 따옴표로 준 줄을 잡는다", () => {
    // 비밀값 표본도 이 파일 자신이 걸리지 않도록 런타임에 이어 붙인다.
    const value = "abcdefghijklmnop" + "1234";
    expect(findSecrets('secret: "' + value + '"')).toHaveLength(1);
    expect(findSecrets("password = '" + value.toUpperCase() + "'")).toHaveLength(1);
  });

  it("짧은 값과 placeholder 는 통과한다", () => {
    expect(findSecrets('secret: "short"')).toEqual([]);
    expect(findSecrets('secret: "abcdefghijklmno"')).toEqual([]);
    expect(findSecrets('secret: "<secret>"')).toEqual([]);
  });
});

describe("main", () => {
  it("깨끗하면 0, 위반 파일이 있으면 1, 지우면 0", async () => {
    const root = await makeRoot();
    const log = console.log;
    console.log = () => {};
    try {
      expect(await main({ cwd: root })).toBe(0);
      const bad = join(root, "docs", "bad.md");
      await writeFile(bad, "see https://wiki.internal-corp" + TLD + "\n");
      expect(await main({ cwd: root })).toBe(1);
      await rm(bad);
      expect(await main({ cwd: root })).toBe(0);
    } finally {
      console.log = log;
    }
  });

  it("필수 경로가 없으면 2", async () => {
    const root = await makeRoot();
    await rm(join(root, "skills"), { recursive: true });
    const error = console.error;
    console.error = () => {};
    try {
      expect(await main({ cwd: root })).toBe(2);
    } finally {
      console.error = error;
    }
  });
});
