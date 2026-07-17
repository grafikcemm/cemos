import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Apply endpoint sözleşmesi (Phase 3A §E): guard, body cap, Zod, sunucu-taraflı
 * değer türetme (istemci değeri asla), 409/422 haritalama, hesap eşleşmesi.
 */

const authorized = vi.fn();
vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: (r: unknown) => authorized(r),
}));

const getObservation = vi.fn();
vi.mock("@/lib/instagram/dnaObservationService", () => ({
  getInstagramDnaObservation: () => getObservation(),
}));

const applyCaption = vi.fn();
const applySeries = vi.fn();
vi.mock("@/lib/instagram/dnaApplyService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/instagram/dnaApplyService")>();
  return {
    CAPTION_DNA_APPLY_FIELDS: orig.CAPTION_DNA_APPLY_FIELDS,
    applyObservationToCaptionDna: (a: unknown) => applyCaption(a),
    applyObservationToSeriesHashtags: (a: unknown) => applySeries(a),
  };
});

import { POST } from "./route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/instagram/dna-observation/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const OK_OBSERVATION = {
  status: "ok",
  reason: "hazır",
  account: { id: "acc-1", handle: "grafikcem" },
  observation: { sampleSufficiency: "sufficient" },
};

beforeEach(() => {
  vi.clearAllMocks();
  authorized.mockReturnValue(true);
  getObservation.mockResolvedValue(OK_OBSERVATION);
  applyCaption.mockResolvedValue({
    ok: true,
    target: "caption_dna",
    appliedFields: ["emojiPolicy"],
    version: 2,
    alreadyApplied: false,
  });
});

describe("POST /api/instagram/dna-observation/apply", () => {
  it("guard: yetkisiz → 403, gözlem hesaplanmaz", async () => {
    authorized.mockReturnValue(false);
    const res = await POST(req({ target: "caption_dna" }));
    expect(res.status).toBe(403);
    expect(getObservation).not.toHaveBeenCalled();
  });

  it("256KB üstü body → 413", async () => {
    const res = await POST(req("x".repeat(256 * 1024 + 1)));
    expect(res.status).toBe(413);
  });

  it("bozuk JSON → 400 fail-closed", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
  });

  it("şema dışı alanlar → 400 (bilinmeyen selectedFields reddedilir)", async () => {
    const res = await POST(
      req({
        target: "caption_dna",
        accountId: "acc-1",
        selectedFields: ["signaturePhrases"], // apply allowlist'inde YOK
        expectedVersion: 1,
      })
    );
    expect(res.status).toBe(400);
    expect(applyCaption).not.toHaveBeenCalled();
  });

  it("hesap uyuşmazlığı → 422 (cross-account apply fail-closed)", async () => {
    const res = await POST(
      req({
        target: "caption_dna",
        accountId: "baska-hesap",
        selectedFields: ["emojiPolicy"],
        expectedVersion: 1,
      })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("account_mismatch");
    expect(applyCaption).not.toHaveBeenCalled();
  });

  it("gözlem hazır değilse 422 observation_unavailable", async () => {
    getObservation.mockResolvedValue({ status: "config_required", reason: "binding yok" });
    const res = await POST(
      req({
        target: "caption_dna",
        accountId: "acc-1",
        selectedFields: ["emojiPolicy"],
        expectedVersion: 1,
      })
    );
    expect(res.status).toBe(422);
  });

  it("başarılı apply: sunucu gözlemi kendi hesaplar, istemci değeri geçmez", async () => {
    const res = await POST(
      req({
        target: "caption_dna",
        accountId: "acc-1",
        selectedFields: ["emojiPolicy"],
        expectedVersion: 1,
        // İstemcinin değer enjekte etme girişimi Zod'da düşer (strict union);
        // buradaki payload yalnız seçim taşır.
      })
    );
    expect(res.status).toBe(200);
    const call = applyCaption.mock.calls[0][0] as { observation: unknown; accountHandle: string };
    expect(call.observation).toBe(OK_OBSERVATION.observation); // sunucu gözlemi
    expect(call.accountHandle).toBe("grafikcem");
  });

  it("version_conflict → 409, insufficient_evidence → 422", async () => {
    applyCaption.mockResolvedValue({ ok: false, code: "version_conflict", message: "stale" });
    const r1 = await POST(
      req({
        target: "caption_dna",
        accountId: "acc-1",
        selectedFields: ["emojiPolicy"],
        expectedVersion: 1,
      })
    );
    expect(r1.status).toBe(409);

    applyCaption.mockResolvedValue({ ok: false, code: "insufficient_evidence", message: "az" });
    const r2 = await POST(
      req({
        target: "caption_dna",
        accountId: "acc-1",
        selectedFields: ["emojiPolicy"],
        expectedVersion: 1,
      })
    );
    expect(r2.status).toBe(422);
  });

  it("series_hashtag hedefi apply servisine yönlenir", async () => {
    applySeries.mockResolvedValue({
      ok: true,
      target: "series_hashtag",
      appliedFields: ["hashtagDnaJson"],
      version: 3,
      alreadyApplied: false,
    });
    const res = await POST(req({ target: "series_hashtag", seriesId: "s1", expectedVersion: 2 }));
    expect(res.status).toBe(200);
    expect(applySeries).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: "s1", expectedVersion: 2 })
    );
  });
});
