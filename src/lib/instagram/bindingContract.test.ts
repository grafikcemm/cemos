import { beforeEach, describe, expect, it, vi } from "vitest";

/** Single-IG binding sözleşmesi (Phase 3A §B) — fail-closed davranış testleri. */

const bindingFindMany = vi.fn();
const accountFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    accountPlatformBinding: { findMany: (a: unknown) => bindingFindMany(a) },
    account: { findUnique: (a: unknown) => accountFindUnique(a) },
  },
}));

import { resolveSingleInstagramBinding } from "./bindingContract";

const NOW = new Date("2026-07-17T10:00:00Z");

function binding(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc-1",
    provider: "composio",
    externalHandle: "grafikcem",
    connectionStatus: "connected",
    lastVerifiedAt: NOW,
    lastSuccessfulSyncAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true });
});

describe("resolveSingleInstagramBinding", () => {
  it("sıfır binding → config_required (tahmin yok)", async () => {
    bindingFindMany.mockResolvedValue([]);
    const r = await resolveSingleInstagramBinding();
    expect(r.status).toBe("config_required");
    expect(r.account).toBeUndefined();
    expect(r.reason).toContain("COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID");
  });

  it("tam bir hesap → ok + hesap/binding bilgisi", async () => {
    bindingFindMany.mockResolvedValue([binding()]);
    const r = await resolveSingleInstagramBinding();
    expect(r.status).toBe("ok");
    expect(r.account).toEqual({ id: "acc-1", handle: "grafikcem" });
    expect(r.binding?.provider).toBe("composio");
  });

  it("birden fazla FARKLI hesap → multi_binding_blocked (fail-closed)", async () => {
    bindingFindMany.mockResolvedValue([
      binding(),
      binding({ accountId: "acc-2", externalHandle: "maskulenkod" }),
    ]);
    const r = await resolveSingleInstagramBinding();
    expect(r.status).toBe("multi_binding_blocked");
    expect(r.distinctAccountCount).toBe(2);
    expect(accountFindUnique).not.toHaveBeenCalled();
  });

  it("aynı hesabın composio+meta satırları TEK hesap sayılır, composio tercih edilir", async () => {
    bindingFindMany.mockResolvedValue([
      binding({ provider: "meta", lastVerifiedAt: new Date("2026-07-17T11:00:00Z") }),
      binding({ provider: "composio", lastVerifiedAt: new Date("2026-07-16T10:00:00Z") }),
    ]);
    const r = await resolveSingleInstagramBinding();
    expect(r.status).toBe("ok");
    expect(r.binding?.provider).toBe("composio");
  });

  it("hesap bulunamaz veya pasifse account_unresolved (fail-closed)", async () => {
    bindingFindMany.mockResolvedValue([binding()]);
    accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: false });
    const r = await resolveSingleInstagramBinding();
    expect(r.status).toBe("account_unresolved");

    accountFindUnique.mockResolvedValue(null);
    const r2 = await resolveSingleInstagramBinding();
    expect(r2.status).toBe("account_unresolved");
  });
});
