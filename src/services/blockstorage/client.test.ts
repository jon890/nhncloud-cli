import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { BlockStorageClient } from "./client.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

const volumeResponse = {
  volume: {
    id: "vol-1",
    name: "data",
    size: 10,
    status: "creating",
    volume_type: "General SSD",
    availability_zone: "kr-pub-a",
    attachments: [],
    created_at: "2026-07-03T00:00:00Z",
  },
};

describe("BlockStorageClient.create", () => {
  beforeEach(() => vi.resetAllMocks());

  it("availability_zone 지정 시 create payload 에 포함한다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => volumeResponse,
    } as never);

    const client = new BlockStorageClient("token", "https://example.com/v2/tenant");
    await client.create({
      size: 10,
      name: "data",
      volume_type: "General SSD",
      availability_zone: "kr-pub-a",
    });

    expect(ky.post).toHaveBeenCalledWith(
      "https://example.com/v2/tenant/volumes",
      expect.objectContaining({
        headers: { "X-Auth-Token": "token" },
        json: {
          volume: {
            size: 10,
            name: "data",
            volume_type: "General SSD",
            availability_zone: "kr-pub-a",
          },
        },
      }),
    );
  });

  it("availability_zone 미지정 시 create payload 에 포함하지 않는다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => volumeResponse,
    } as never);

    const client = new BlockStorageClient("token", "https://example.com/v2/tenant");
    await client.create({ size: 10 });

    expect(ky.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        json: { volume: { size: 10 } },
      }),
    );
  });

  it("응답 형식 오류는 EXIT_API_ERROR 로 throw 한다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => ({ unexpected: true }),
    } as never);

    const client = new BlockStorageClient("token", "https://example.com/v2/tenant");
    await expect(client.create({ size: 10 })).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});
