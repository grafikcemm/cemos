import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Alternatif işlemleri (ADR-038 §E): advisory-lock'lu, account-scoped,
 * concurrency-safe; max sınır, duplicate reddi, non-destructive archive.
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelDossier: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  },
}));

import { addAlternative, archiveAlternative } from "./alternativesService";
import { serializeAlternatives, parseAlternatives, MAX_ALTERNATIVES, type DossierAlternative } from "./alternatives";

const NOW = Date.parse("2026-07-18T12:00:00Z");
const UPDATED_AT = new Date("2026-07-18T09:00:00.000Z");

function alt(id: string, url: string, status: "active" | "archived" = "active"): DossierAlternative {
  return {
    id,
    name: `Araç ${id}`,
    submittedUrl: url,
    finalUrl: null,
    verificationId: null,
    opens: null,
    checkedAt: null,
    expiry: null,
    status,
    archivedAt: status === "archived" ? new Date(NOW).toISOString() : null,
    createdAt: new Date(NOW).toISOString(),
  };
}

function dossierRow(alternatives: DossierAlternative[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: "rd-1",
    accountId: "acc-1",
    alternativesJson: serializeAlternatives(alternatives),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const BASE = {
  dossierId: "rd-1",
  accountId: "acc-1",
  expectedUpdatedAt: UPDATED_AT.toISOString(),
  nowMs: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  txMock.reelDossier.update.mockImplementation(((args: { data: { alternativesJson: string } }) =>
    Promise.resolve({ ...dossierRow(), alternativesJson: args.data.alternativesJson, updatedAt: new Date(NOW) })) as never);
});

describe("addAlternative", () => {
  it("cross-account fail-closed", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([], { accountId: "OTHER" }) as never);
    const r = await addAlternative({ ...BASE, name: "X", submittedUrl: "https://x.example/" });
    expect(r).toMatchObject({ ok: false, code: "account_mismatch" });
    expect(txMock.reelDossier.update).not.toHaveBeenCalled();
  });

  it("stale expectedUpdatedAt → stale", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([], { updatedAt: new Date(NOW) }) as never);
    const r = await addAlternative({ ...BASE, name: "X", submittedUrl: "https://x.example/" });
    expect(r).toMatchObject({ ok: false, code: "stale" });
  });

  it("ekleme: doğrulanmamış başlar (verificationId null — manuel verified yok)", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([]) as never);
    const r = await addAlternative({ ...BASE, name: "Yedek", submittedUrl: "https://y.example/" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.alternatives).toHaveLength(1);
      expect(r.alternatives[0].verificationId).toBeNull();
      expect(r.alternatives[0].status).toBe("active");
    }
    const written = parseAlternatives(
      String((txMock.reelDossier.update.mock.calls[0][0] as { data: { alternativesJson: string } }).data.alternativesJson)
    );
    expect(written.parseFailed).toBe(false);
  });

  it("aktif MAX_ALTERNATIVES doluysa reddedilir (arşivliler sayılmaz)", async () => {
    const full = Array.from({ length: MAX_ALTERNATIVES }, (_, i) => alt(`a${i}`, `https://a${i}.example/`));
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow(full) as never);
    const r = await addAlternative({ ...BASE, name: "Fazla", submittedUrl: "https://z.example/" });
    expect(r).toMatchObject({ ok: false, code: "max_alternatives" });

    const withArchived = [...full.slice(0, MAX_ALTERNATIVES - 1), alt("arch", "https://arch.example/", "archived")];
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow(withArchived) as never);
    const r2 = await addAlternative({ ...BASE, name: "Sığar", submittedUrl: "https://z.example/" });
    expect(r2.ok).toBe(true);
  });

  it("aynı URL aktifken duplicate reddedilir", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([alt("a1", "https://dup.example/")]) as never);
    const r = await addAlternative({ ...BASE, name: "Kopya", submittedUrl: "https://dup.example/" });
    expect(r).toMatchObject({ ok: false, code: "duplicate_url" });
  });
});

describe("archiveAlternative — non-destructive", () => {
  it("arşivler: listeden SİLİNMEZ, status+archivedAt yazılır", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([alt("a1", "https://a.example/")]) as never);
    const r = await archiveAlternative({ ...BASE, alternativeId: "a1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.alternatives).toHaveLength(1);
      expect(r.alternatives[0].status).toBe("archived");
      expect(r.alternatives[0].archivedAt).not.toBeNull();
      expect(r.alreadyArchived).toBe(false);
    }
  });

  it("zaten arşivliyse idempotent no-op", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(
      dossierRow([alt("a1", "https://a.example/", "archived")]) as never
    );
    const r = await archiveAlternative({ ...BASE, alternativeId: "a1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyArchived).toBe(true);
  });

  it("bilinmeyen alternatif → alternative_not_found", async () => {
    txMock.reelDossier.findUnique.mockResolvedValue(dossierRow([]) as never);
    const r = await archiveAlternative({ ...BASE, alternativeId: "yok" });
    expect(r).toMatchObject({ ok: false, code: "alternative_not_found" });
  });
});
