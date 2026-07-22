import { describe, it, expect, vi } from "vitest";
import { drainSavedTweetsToDb, toSavedTweetDto } from "./savedTweetsMigration";
import type { FlowTweet } from "@/store/xagent";

function mkTweet(id: string): FlowTweet {
  return {
    id,
    channel: "grafikcem",
    handle: "someone",
    text: "viral text",
    likeCount: 10,
    retweetCount: 2,
    viewCount: 100,
    viralScore: 80,
    url: "https://x.com/x",
    source: "flow",
    mode: "single",
  };
}

const okFetch = () =>
  vi.fn(async () => ({ json: async () => ({ success: true }) })) as unknown as typeof fetch;

describe("savedTweetsMigration — drain", () => {
  it("boş liste → empty (fetch/remove çağrılmaz)", async () => {
    const remove = vi.fn();
    const fetchImpl = okFetch();
    const r = await drainSavedTweetsToDb([], remove, fetchImpl);
    expect(r).toBe("empty");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("başarılı POST → drained + her tweet store'dan silinir", async () => {
    const remove = vi.fn();
    const fetchImpl = okFetch();
    const r = await drainSavedTweetsToDb([mkTweet("a"), mkTweet("b")], remove, fetchImpl);
    expect(r).toBe("drained");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("a");
    expect(remove).toHaveBeenCalledWith("b");
  });

  it("success:false → failed, HİÇBİRİ silinmez (localStorage korunur)", async () => {
    const remove = vi.fn();
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ success: false }) })) as unknown as typeof fetch;
    const r = await drainSavedTweetsToDb([mkTweet("a")], remove, fetchImpl);
    expect(r).toBe("failed");
    expect(remove).not.toHaveBeenCalled();
  });

  it("fetch throw → failed, silinmez (sonraki mount tekrar dener)", async () => {
    const remove = vi.fn();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const r = await drainSavedTweetsToDb([mkTweet("a")], remove, fetchImpl);
    expect(r).toBe("failed");
    expect(remove).not.toHaveBeenCalled();
  });

  it("toSavedTweetDto handle→authorHandle eşler, eksik medya null", () => {
    const dto = toSavedTweetDto(mkTweet("z"));
    expect(dto.authorHandle).toBe("someone");
    expect(dto.mediaUrl).toBeNull();
    expect(dto.id).toBe("z");
  });
});
