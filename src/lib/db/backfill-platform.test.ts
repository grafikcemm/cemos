import { describe, it, expect, vi } from "vitest";
import { backfillPlatform, type BackfillClient } from "../../../prisma/backfill-platform";

function makeClient(counts: { teYt?: number; teIg?: number; vpYt?: number; vpIg?: number } = {}) {
  const teUpdate = vi
    .fn()
    .mockResolvedValueOnce({ count: counts.teYt ?? 0 }) // youtube call
    .mockResolvedValueOnce({ count: counts.teIg ?? 0 }); // instagram call
  const vpUpdate = vi
    .fn()
    .mockResolvedValueOnce({ count: counts.vpYt ?? 0 })
    .mockResolvedValueOnce({ count: counts.vpIg ?? 0 });
  const client: BackfillClient = {
    trainingExample: { updateMany: teUpdate },
    viralPattern: { updateMany: vpUpdate },
  };
  return { client, teUpdate, vpUpdate };
}

describe("backfillPlatform", () => {
  it("returns the per-table relabel counts", async () => {
    const { client } = makeClient({ teYt: 3, teIg: 5, vpYt: 1, vpIg: 2 });
    const res = await backfillPlatform(client);
    expect(res).toEqual({
      trainingYoutube: 3,
      trainingInstagram: 5,
      viralYoutube: 1,
      viralInstagram: 2,
    });
  });

  it("guards every update with platform:'x' so a second run is a no-op", async () => {
    const { client, teUpdate, vpUpdate } = makeClient();
    await backfillPlatform(client);
    const allCalls = [...teUpdate.mock.calls, ...vpUpdate.mock.calls];
    expect(allCalls).toHaveLength(4);
    for (const call of allCalls) {
      expect((call[0].where as { platform: string }).platform).toBe("x");
    }
  });

  it("maps TrainingExample inputType prefixes to youtube/instagram", async () => {
    const { client, teUpdate } = makeClient();
    await backfillPlatform(client);
    expect(teUpdate).toHaveBeenNthCalledWith(1, {
      where: { platform: "x", inputType: { startsWith: "yt_" } },
      data: { platform: "youtube" },
    });
    expect(teUpdate).toHaveBeenNthCalledWith(2, {
      where: { platform: "x", inputType: { startsWith: "ig_" } },
      data: { platform: "instagram" },
    });
  });

  it("matches both prefix and exact sourceType for ViralPattern", async () => {
    const { client, vpUpdate } = makeClient();
    await backfillPlatform(client);
    const ytCall = vpUpdate.mock.calls[0][0];
    expect(ytCall.data).toEqual({ platform: "youtube" });
    expect(ytCall.where.OR).toEqual([{ sourceType: { startsWith: "yt" } }, { sourceType: "youtube" }]);
    const igCall = vpUpdate.mock.calls[1][0];
    expect(igCall.data).toEqual({ platform: "instagram" });
    expect(igCall.where.OR).toEqual([{ sourceType: { startsWith: "ig" } }, { sourceType: "instagram" }]);
  });
});
