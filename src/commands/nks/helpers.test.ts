import { describe, expect, it, vi } from "vitest";
import { isUuid, parseNonNegativeInteger, parsePositiveInteger, resolveClusterUuid } from "./helpers.js";
import type { NksClient } from "../../services/nks/client.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

describe("nks command helpers", () => {
  it("parsePositiveInteger() rejects zero", () => {
    expect(parsePositiveInteger("1", "--node-count")).toBe(1);
    expect(() => parsePositiveInteger("0", "--node-count")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("parseNonNegativeInteger() accepts zero", () => {
    expect(parseNonNegativeInteger("0", "--num-buffer-nodes")).toBe(0);
    expect(parseNonNegativeInteger("2", "--num-buffer-nodes")).toBe(2);
    expect(() => parseNonNegativeInteger("-1", "--num-buffer-nodes")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("resolveClusterUuid (이슈 #79)", () => {
  function fakeClient(getCluster: NksClient["getCluster"]): NksClient {
    return { getCluster } as NksClient;
  }

  it("UUID 를 주면 추가 호출 없이 그대로 반환한다", async () => {
    const getCluster = vi.fn();
    const uuid = "11111111-2222-3333-4444-555555555555";

    expect(await resolveClusterUuid(fakeClient(getCluster as never), uuid)).toBe(uuid);
    expect(getCluster).not.toHaveBeenCalled();
  });

  it("이름을 주면 클러스터를 조회해 UUID 로 바꾼다", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const getCluster = vi.fn(async () => ({ uuid, name: "cluster-a" }));

    expect(await resolveClusterUuid(fakeClient(getCluster as never), "cluster-a")).toBe(uuid);
    expect(getCluster).toHaveBeenCalledWith("cluster-a");
  });

  it("조회 결과에 uuid 가 없으면 EXIT_API_ERROR 로 실패한다", async () => {
    const getCluster = vi.fn(async () => ({ name: "cluster-a" }));

    await expect(resolveClusterUuid(fakeClient(getCluster as never), "cluster-a")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("isUuid() 는 정수 id 를 UUID 로 보지 않는다", () => {
    expect(isUuid("11111111-2222-3333-4444-555555555555")).toBe(true);
    expect(isUuid("1234")).toBe(false);
    expect(isUuid("cluster-a")).toBe(false);
  });
});
