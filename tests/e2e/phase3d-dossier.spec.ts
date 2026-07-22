import { test, expect, appConsoleErrors, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 3D (ADR-038) — production-grade dossier↔Takvim e2e'si.
 * HERMETİK: tüm API'ler route-mock — canlı site/DB/LLM çağrısı YOK; dış siteye
 * bağımlı test yok.
 * Kanıtlanan:
 *  - Kanıt kartı: taze/bayat/başarısız/eksik durumlar; unknown alanlar dürüst
 *    ("bilinmiyor"; 451 yoksa Türkiye erişimi iddia edilmez)
 *  - "Yeniden doğrula" force-refresh POST'u; başarısız doğrulama eski kanıtı
 *    silmez, dürüst hata verir
 *  - Alternatif zinciri: ekle/doğrula/arşivle + kapı kapalıyken "yeni dossier"
 *    yalnız ENV adlarıyla bloklanır
 *  - Takvim: MEVCUT dossier seçip bağlama; bağlandı ≠ yayına hazır dürüstlüğü;
 *    açık detach; empty/error durumları
 *  - 1024–1920 taşma 0, console app error 0.
 */

const NOW_ISO = "2026-07-18T09:00:00.000Z";
const TOOL_URL = "https://tool.example.com/";

const DOSSIER_ROW = {
  id: "d-1",
  accountId: "acc-1",
  title: "AI mockup araci tanitimi",
  pillar: "arac_demo",
  format: "reel",
  hook: "5 araç tek video",
  finalReadiness: "needs_verify",
  verificationId: "wv-1",
  expiry: "2026-07-10T00:00:00.000Z",
  costUsd: 0.12,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
};

type EvState = "ready" | "stale" | "missing" | "failed" | "no_tool_required";

function production(opts?: {
  evidence?: EvState;
  approved?: boolean;
  attached?: boolean;
  alternatives?: Array<Record<string, unknown>>;
}) {
  const ev = opts?.evidence ?? "stale";
  const approved = opts?.approved ?? false;
  const attached = opts?.attached ?? true;
  const gatesPass = ev === "ready" && approved;
  return {
    version: "production_state.v1",
    layers: {
      generation: { state: "complete" },
      evidence: {
        state: ev,
        verificationId: ev === "missing" || ev === "no_tool_required" ? null : "wv-1",
        submittedUrl: ev === "no_tool_required" ? null : TOOL_URL,
        finalUrl: ev === "missing" || ev === "no_tool_required" ? null : TOOL_URL,
        redirectChain: ev === "ready" ? ["https://tool.example.com/app"] : [],
        checkedAt: ev === "missing" || ev === "no_tool_required" ? null : "2026-07-15T08:00:00.000Z",
        expiry:
          ev === "stale"
            ? "2026-07-10T00:00:00.000Z"
            : ev === "ready"
              ? "2026-08-10T00:00:00.000Z"
              : null,
        opens: ev === "failed" ? false : ev === "ready" || ev === "stale" ? true : null,
        urlMatchesTool: ev === "missing" || ev === "no_tool_required" ? null : true,
        signals:
          ev === "ready" || ev === "stale"
            ? {
                signupRequired: "unknown",
                freeTier: "unknown",
                usageLimits: "unknown",
                regionRestricted: "unknown",
                lastUpdated: "unknown",
              }
            : null,
        reasons: ev === "stale" ? ["evidence_expired"] : ev === "failed" ? ["site_not_opening"] : [],
      },
      alternatives: { items: opts?.alternatives ?? [], activeCount: (opts?.alternatives ?? []).filter((a) => a.status === "active").length, parseFailed: false },
      creative: { status: "ready_for_review", issues: [] },
      approval: { approved, trainingExampleId: approved ? "te-1" : null },
      seriesContract: { state: "none" },
      calendar: attached
        ? { attachedSlotCount: 1, slots: [{ slotId: "slot-raw-1", month: "2026-07", dayOfMonth: 5, status: "drafted" }], multiAttached: false }
        : { attachedSlotCount: 0, slots: [], multiAttached: false },
    },
    blockers: [
      ...(ev === "stale" ? ["evidence_stale"] : []),
      ...(ev === "failed" ? ["evidence_failed"] : []),
      ...(ev === "missing" ? ["evidence_missing"] : []),
      ...(approved ? [] : ["awaiting_human_approval"]),
    ],
    productionReady: gatesPass && attached,
    overall: gatesPass
      ? attached
        ? "production_ready"
        : "approved"
      : attached
        ? "attached_not_ready"
        : "awaiting_human_approval",
  };
}

function detailPayload(opts?: Parameters<typeof production>[0]) {
  return {
    success: true,
    dossier: {
      id: "d-1",
      accountId: "acc-1",
      title: "AI mockup araci tanitimi",
      format: "reel",
      pillar: "arac_demo",
      objective: "saves",
      whyNow: "",
      painPoint: "",
      primaryToolJson: JSON.stringify({ name: "Tool", url: TOOL_URL }),
      productionEstimate: "",
      risk: "",
      assetChecklistJson: "[]",
      costUsd: 0.12,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
    content: {
      format: "reel",
      hook: "5 araç tek video",
      script: "senaryo metni",
      voiceover: "vo",
      caption: "Kaydet, sırayla dene.",
      hashtags: ["#aitools"],
      timeline: [{ t: "0-3sn", action: "hook" }],
      scenePlan: [{ scene: 1, visual: "ekran" }],
      screenRecordingPlan: [{ step: 1, whatToClick: "buton" }],
      cover: "kapak",
      cta: "kaydet",
      onScreenCopy: [],
    },
    contentHash: "hash",
    evidence: { readiness: "needs_verify", finalReadinessStored: "needs_verify", verificationId: "wv-1", expiry: "2026-07-10T00:00:00.000Z" },
    creative: { status: "ready_for_review", issues: [] },
    approval: { approved: false },
    provenance: { seriesKey: null, seriesVersion: null, promptVersion: null, sourceHandoffId: null, contentHash: "hash", model: "m", policyVersion: "3B-1" },
    production: production(opts),
  };
}

async function mockTakvimBase(page: Page, opts?: { slotDossierId?: string | null; dossiers?: Array<Record<string, unknown>> }) {
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem" }] } })
  );
  await page.route("**/api/queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/opportunities/handoff**", (r) =>
    r.fulfill({ json: { success: true, handoffs: [] } })
  );
  await page.route("**/api/reels/plan?**", (r) =>
    r.fulfill({
      json: {
        success: true,
        plan: {
          slots: [
            {
              id: "slot-raw-1",
              dayOfMonth: 5,
              pillar: "arac_demo",
              seriesKey: null,
              topicHint: "AI mockup akışı",
              status: opts?.slotDossierId ? "drafted" : "planned",
              dossierId: opts?.slotDossierId ?? null,
            },
          ],
        },
        staleFlags: [],
      },
    })
  );
  await page.route("**/api/reels/dossier?accountId=acc-1", (r) =>
    r.fulfill({ json: { success: true, dossiers: opts?.dossiers ?? (opts?.slotDossierId ? [DOSSIER_ROW] : []) } })
  );
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function openAttachedSlot(page: Page) {
  await page.goto("/");
  await selectTab(page, "plan-takvim");
  await page.getByLabel("5 — 1 öğe").click();
  await expect(page.getByTestId("dossier-production-panel")).toBeVisible();
}

test.describe("Phase 3D — kanıt kartı + yeniden doğrulama", () => {
  test("bayat kanıt: dürüst kart (URL/redirect/expiry) + unknown alanlar 'bilinmiyor' + TR erişimi iddiası YOK", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale" }) })
    );
    await openAttachedSlot(page);

    await expect(page.getByTestId("production-overall")).toContainText("bağlı ama HAZIR DEĞİL");
    await expect(page.getByTestId("evidence-card")).toBeVisible();
    await expect(page.getByTestId("evidence-card")).toContainText("kanıt bayat");
    await expect(page.getByTestId("evidence-card")).toContainText(TOOL_URL);
    const signals = page.getByTestId("evidence-signals");
    await expect(signals).toContainText("bilinmiyor");
    await expect(signals).toContainText("HTTP 2xx erişim kanıtı DEĞİLDİR");
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("'Yeniden doğrula' force-refresh POST atar; başarıda panel tazelenir", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    let fresh = false;
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: fresh ? "ready" : "stale" }) })
    );
    let verifyBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/dossier/d-1/verify", (r) => {
      verifyBody = r.request().postDataJSON() as Record<string, unknown>;
      fresh = true;
      return r.fulfill({
        json: {
          success: true,
          outcome: { status: "verified", code: null, reused: false, verificationId: "wv-2", opens: true },
          updatedAt: "2026-07-18T10:00:00.000Z",
          production: production({ evidence: "ready" }),
        },
      });
    });
    await openAttachedSlot(page);
    await page.getByTestId("evidence-reverify").click();
    await expect.poll(() => verifyBody, { timeout: 5000 }).toMatchObject({
      accountId: "acc-1",
      expectedUpdatedAt: NOW_ISO,
      forceRefresh: true,
    });
    await expect(page.getByTestId("evidence-card")).toContainText("kanıt taze");
  });

  test("başarısız doğrulama: typed kod gösterilir, eski kanıt korunur", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale" }) })
    );
    await page.route("**/api/reels/dossier/d-1/verify", (r) =>
      r.fulfill({
        json: {
          success: true,
          outcome: { status: "verification_failed", code: "timeout", reused: false, verificationId: null, opens: null },
          updatedAt: NOW_ISO,
          production: production({ evidence: "stale" }),
        },
      })
    );
    await openAttachedSlot(page);
    await page.getByTestId("evidence-reverify").click();
    // Eski (bayat) kanıt hâlâ görünür — silinmedi, "taze" de yapılmadı.
    await expect(page.getByTestId("evidence-card")).toContainText("kanıt bayat");
    await expect(page.getByTestId("evidence-card")).toContainText("2026");
  });

  test("kanıt eksik/başarısız durumları dürüst etiketlenir", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    let mode: EvState = "missing";
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: mode }) })
    );
    await openAttachedSlot(page);
    await expect(page.getByTestId("check-evidence")).toContainText("kalıcı kanıt yok");
    mode = "failed";
    await page.reload();
    await selectTab(page, "plan-takvim");
    await page.getByLabel("5 — 1 öğe").click();
    await expect(page.getByTestId("check-evidence")).toContainText("doğrulama başarısız");
  });
});

test.describe("Phase 3D — alternatif araç zinciri", () => {
  const ALT = {
    id: "alt-1",
    name: "Yedek Araç",
    submittedUrl: "https://yedek.example.com/",
    finalUrl: null,
    verificationId: null,
    evidenceState: "unverified",
    checkedAt: null,
    expiry: null,
    status: "active",
    archivedAt: null,
  };

  test("ekle → doğrula → arşivle; her eylem ayrı endpoint'e gider", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    let withAlt = false;
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale", alternatives: withAlt ? [ALT] : [] }) })
    );
    let altBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/dossier/d-1/alternatives", (r) => {
      altBody = r.request().postDataJSON() as Record<string, unknown>;
      withAlt = true;
      return r.fulfill({ json: { success: true, updatedAt: NOW_ISO, alreadyArchived: false, alternatives: [ALT] } });
    });
    let verifyBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/dossier/d-1/verify", (r) => {
      verifyBody = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({
        json: {
          success: true,
          outcome: { status: "verified", code: null, reused: false, verificationId: "wv-alt", opens: true },
          updatedAt: NOW_ISO,
          production: production({ evidence: "stale", alternatives: [{ ...ALT, evidenceState: "ready", verificationId: "wv-alt" }] }),
        },
      });
    });

    await openAttachedSlot(page);
    // Boş durum dürüst:
    await expect(page.getByTestId("alternatives-section")).toContainText("Alternatif yok");
    await page.getByTestId("alt-add-open").click();
    await page.getByTestId("alt-name").fill("Yedek Araç");
    await page.getByTestId("alt-url").fill("https://yedek.example.com/");
    await page.getByTestId("alt-add-save").click();
    await expect.poll(() => altBody, { timeout: 5000 }).toMatchObject({
      op: "add",
      accountId: "acc-1",
      submittedUrl: "https://yedek.example.com/",
    });
    // Yeni alternatif DOĞRULANMAMIŞ başlar:
    await expect(page.getByTestId("alt-row-alt-1")).toContainText("doğrulanmadı");
    await page.getByTestId("alt-verify-alt-1").click();
    await expect.poll(() => verifyBody, { timeout: 5000 }).toMatchObject({
      target: { kind: "alternative", alternativeId: "alt-1" },
      forceRefresh: true,
    });
    await page.getByTestId("alt-archive-alt-1").click();
    await expect.poll(() => altBody, { timeout: 5000 }).toMatchObject({ op: "archive", alternativeId: "alt-1" });
  });

  test("kapı kapalıyken 'Bu araçla yeni dossier' yalnız ENV adlarıyla bloklanır; mevcut dossier değişmez", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale", alternatives: [ALT] }) })
    );
    await page.route("**/api/reels/dossier", (r) => {
      if (r.request().method() === "POST") {
        return r.fulfill({
          status: 422,
          json: { success: false, error: "kapı", code: "generation_gate_closed", missing: ["OPENROUTER_KEY_ROTATED_AT", "INSTAGRAM_GENERATION_ENABLED"] },
        });
      }
      return r.fallback();
    });
    await openAttachedSlot(page);
    await page.getByTestId("alt-new-dossier-alt-1").click();
    await expect(page.getByTestId("production-gate-blocked")).toBeVisible();
    await expect(page.getByTestId("production-gate-blocked")).toContainText("OPENROUTER_KEY_ROTATED_AT");
    await expect(page.getByTestId("production-gate-blocked")).toContainText("mevcut dossier değiştirilmedi");
  });
});

test.describe("Phase 3D — Takvim mevcut-dossier bağlama + detach", () => {
  test("mevcut dossier listeden seçilip bağlanır; bağlandı ≠ yayına hazır dürüstçe gösterilir", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: null, dossiers: [DOSSIER_ROW] });
    let attachBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/plan/slot/slot-raw-1/attach", (r) => {
      attachBody = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({
        json: {
          success: true,
          slotId: "slot-raw-1",
          dossierId: "d-1",
          alreadyAttached: false,
          productionReady: false,
          overall: "attached_not_ready",
          blockers: ["evidence_stale", "awaiting_human_approval"],
        },
      });
    });
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByLabel("5 — 1 öğe").click();
    await expect(page.getByTestId("slot-attach-existing")).toBeVisible();
    await page.getByTestId("slot-existing-select").selectOption("d-1");
    await page.getByTestId("slot-attach-existing-btn").click();
    await expect.poll(() => attachBody, { timeout: 5000 }).toMatchObject({ accountId: "acc-1", dossierId: "d-1" });
    await expect(page.getByTestId("slot-attach-warning")).toContainText("YAYINA HAZIR DEĞİL");
    await expect(page.getByTestId("slot-attach-warning")).toContainText("evidence_stale");
  });

  test("bağlı slottan açık detach: dossier silinmez, slot planlamaya döner", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale" }) })
    );
    let detachBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/plan/slot/slot-raw-1/detach", (r) => {
      detachBody = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({ json: { success: true, slotId: "slot-raw-1", alreadyDetached: false, detachedDossierId: "d-1" } });
    });
    await openAttachedSlot(page);
    await page.getByTestId("slot-detach").click();
    await expect.poll(() => detachBody, { timeout: 5000 }).toMatchObject({
      accountId: "acc-1",
      expectedDossierId: "d-1",
    });
  });

  test("production_ready: tüm kapılar geçince genel durum YAYINA HAZIR", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "ready", approved: true }) })
    );
    await openAttachedSlot(page);
    await expect(page.getByTestId("production-overall")).toContainText("YAYINA HAZIR");
    await expect(page.getByTestId("check-approval")).toContainText("onaylı");
    await expect(page.getByTestId("check-calendar")).toContainText("2026-07");
  });

  test("Production Pack: onaylı dossier → 'indir' butonu → deterministik ZIP iner", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "ready", approved: true }) })
    );
    let packRequested = false;
    await page.route("**/api/reels/dossier/d-1/pack?accountId=acc-1", (r) => {
      packRequested = true;
      r.fulfill({
        json: {
          success: true,
          baseName: "reel-ai-mockup-araci-d1abcd",
          format: "reel",
          files: [
            { path: "00-brief.md", content: "# AI mockup araci" },
            { path: "04-caption.txt", content: "Kaydet\n\n#aitools" },
            { path: "altyazi.srt", content: "1\n00:00:00,000 --> 00:00:03,000\nhook\n" },
          ],
          manifest: { title: "AI mockup araci", format: "reel", fileCount: 3, readiness: "ready" },
          overall: "production_ready",
        },
      });
    });
    await openAttachedSlot(page);

    const btn = page.getByTestId("download-production-pack");
    await expect(btn).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await btn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("reel-ai-mockup-araci-d1abcd.zip");
    expect(packRequested).toBe(true);
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("Production Pack: onaylı DEĞİLKEN indir butonu GÖRÜNMEZ (yalnız onaylı içerik)", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "ready", approved: false }) })
    );
    await openAttachedSlot(page);
    await expect(page.getByTestId("production-overall")).toContainText("HAZIR DEĞİL");
    await expect(page.getByTestId("download-production-pack")).toHaveCount(0);
  });
});

test.describe("Phase 3D — genişlik taraması", () => {
  test("Takvim + production paneli 1024–1920 yatay taşma yok, console app error 0", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ evidence: "stale" }) })
    );
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto("/");
      await selectTab(page, "plan-takvim");
      await page.getByLabel("5 — 1 öğe").click();
      await expect(page.getByTestId("dossier-production-panel")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `takvim width=${width}`).toBe(0);
    }
    expect(appConsoleErrors(errors)).toEqual([]);
  });
});
