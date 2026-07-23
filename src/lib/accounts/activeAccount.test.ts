import { describe, it, expect } from "vitest";
import { resolveActiveAccount } from "./activeAccount";

const ACCOUNTS = [
  { id: "acc-g", handle: "grafikcem" },
  { id: "acc-m", handle: "maskulenkod" },
];

describe("resolveActiveAccount (WP-04 fail-closed çözümleme)", () => {
  it("channel'ı DB id'sine çözer", () => {
    expect(resolveActiveAccount(ACCOUNTS, "maskulenkod")).toEqual({
      accountId: "acc-m",
      account: ACCOUNTS[1],
      channelUnknown: false,
    });
  });

  it("liste boşken (DB down / henüz yüklenmedi) accountId null — accounts[0] fallback YOK", () => {
    const r = resolveActiveAccount([], "grafikcem");
    expect(r.accountId).toBeNull();
    expect(r.account).toBeNull();
    expect(r.channelUnknown).toBe(false); // liste yok → "uyumsuz" iddiası da yok
  });

  it("channel listede yoksa null + channelUnknown (sessizce başka hesaba DÜŞMEZ)", () => {
    const r = resolveActiveAccount(ACCOUNTS, "pixelspor");
    expect(r.accountId).toBeNull();
    expect(r.channelUnknown).toBe(true);
  });
});
