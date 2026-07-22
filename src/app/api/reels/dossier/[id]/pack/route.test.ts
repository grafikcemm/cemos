import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { reelDossier: { findUnique: (a: unknown) => findUnique(a) } },
}));
const getState = vi.fn();
vi.mock("@/lib/reels/dossierProductionService", () => ({
  getDossierProductionState: (d: unknown) => getState(d),
}));

import { GET } from "./route";

const reelRow = {
  id: "ckdossier000001", accountId: "acc-1", title: "AI mockup akışı", format: "reel",
  pillar: "arac_demo", objective: "saves", caption: "AI ile mockup 👇", hook: "3 tıkla mockup",
  cover: "Yakın çekim", cta: "Kaydet", script: "Sahne 1", voiceover: "vo", whyNow: "", painPoint: "",
  timelineJson: JSON.stringify([{ t: "0-3sn", action: "Hook" }]), scenePlanJson: "[]",
  screenRecordingPlanJson: "[]", onScreenCopyJson: JSON.stringify(["3 tıkla mockup"]),
  hashtagGroupJson: JSON.stringify(["#ai"]), slidesJson: "[]", assetChecklistJson: "[]",
  productionEstimate: "", risk: "", primaryToolJson: "{}", verificationEvidenceJson: "{}",
  finalReadiness: "ready",
};

function req(id: string, accountId?: string, sameOrigin = true) {
  const qs = accountId === undefined ? "" : `?accountId=${accountId}`;
  return new NextRequest(`http://localhost:3000/api/reels/dossier/${id}/pack${qs}`, {
    headers: sameOrigin ? { "Sec-Fetch-Site": "same-origin" } : {},
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/reels/dossier/[id]/pack", () => {
  it("same-origin dışı → 403 (operatör kapısı)", async () => {
    const res = await GET(req("d1", "acc-1", false), ctx("d1"));
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("accountId yoksa → 400", async () => {
    const res = await GET(req("d1"), ctx("d1"));
    expect(res.status).toBe(400);
  });

  it("dossier yoksa → 404", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(req("d1", "acc-1"), ctx("d1"));
    expect(res.status).toBe(404);
  });

  it("hesap uyuşmazsa → 422 (yanlış hesaba sızma yok)", async () => {
    findUnique.mockResolvedValue({ ...reelRow, accountId: "other" });
    const res = await GET(req("ckdossier000001", "acc-1"), ctx("ckdossier000001"));
    expect(res.status).toBe(422);
  });

  it("ONAYLI DEĞİLSE → 409 + blocker'lar (sahte-success yok, indirme yok)", async () => {
    findUnique.mockResolvedValue(reelRow);
    getState.mockResolvedValue({ overall: "awaiting_human_approval", blockers: ["awaiting_human_approval"] });
    const res = await GET(req("ckdossier000001", "acc-1"), ctx("ckdossier000001"));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.success).toBe(false);
    expect(j.code).toBe("not_approved");
    expect(j.overall).toBe("awaiting_human_approval");
    expect(j.blockers).toContain("awaiting_human_approval");
  });

  it("ONAYLIYSA → 200 + deterministik pack dosyaları (read-only, DB yazımı yok)", async () => {
    findUnique.mockResolvedValue(reelRow);
    getState.mockResolvedValue({ overall: "approved", blockers: [] });
    const res = await GET(req("ckdossier000001", "acc-1"), ctx("ckdossier000001"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(j.format).toBe("reel");
    expect(j.baseName).toMatch(/^reel-ai-mockup-akisi-/);
    const paths = (j.files as { path: string }[]).map((f) => f.path);
    expect(paths).toContain("00-brief.md");
    expect(paths).toContain("04-caption.txt");
    expect(paths).toContain("altyazi.srt");
    expect(j.overall).toBe("approved");
  });

  it("production_ready da indirilebilir", async () => {
    findUnique.mockResolvedValue(reelRow);
    getState.mockResolvedValue({ overall: "production_ready", blockers: [] });
    const res = await GET(req("ckdossier000001", "acc-1"), ctx("ckdossier000001"));
    expect(res.status).toBe(200);
  });
});
