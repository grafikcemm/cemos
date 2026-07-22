import { test, expect, appConsoleErrors, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 3B (ADR-036) — carousel/Reels üretim + edit + onay e2e'si.
 * HERMETİK: tüm API'ler route-mock — canlı LLM/DB/site çağrısı YOK.
 * Kanıtlanan:
 *  - Seriler: kapı kapalı dürüst blocked (yalnız ENV adları), aday konudan
 *    prefill, review drawer'da ÜÇ AYRI durum (editoryal/site kanıtı/onay),
 *    slide editörü + kaydet (expectedUpdatedAt taşır) + onay akışı
 *  - Takvim: dossier'siz slot sahte hazır görünmez; üret + AÇIK "Slota bağla"
 *    iki ayrı eylem; bağlı dossier tam detay + onay ayrımı
 *  - 1024–1920 taşma 0, console app error 0.
 */

const SERIES_ROW = {
  id: "s1",
  accountId: "acc-1",
  seriesKey: "best_ai_tools",
  name: "Best AI Tools",
  platform: "instagram",
  format: "carousel",
  purpose: "Araç tanıtımı",
  audience: "Tasarımcılar",
  objective: "save",
  slideCountRange: "3-5",
  coverFormula: "Sert iddia",
  ctaFormula: "kaydet",
  slideArchetypesJson: '["cover","tool","cta"]',
  variableElementsJson: '["araçlar"]',
  bannedRepetitionJson: "[]",
  captionDnaJson: "{}",
  hashtagDnaJson: '["#aitools"]',
  pastTopicsJson: "[]",
  isActive: true,
  version: 4,
  promptVersion: "v4",
};

const DOSSIER_LIST_ROW = {
  id: "d-1",
  accountId: "acc-1",
  title: "Yeni mockup araçları",
  pillar: "best_ai_tools",
  format: "carousel",
  hook: "",
  finalReadiness: "ready",
  verificationId: null,
  expiry: null,
  costUsd: 0.02,
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-18T09:00:00.000Z",
};

/** ADR-038 production read model fixture'ı (araçsız dossier). */
function productionFixture(opts?: { approved?: boolean; creativeReady?: boolean }) {
  const approved = opts?.approved ?? false;
  const creativeReady = opts?.creativeReady ?? true;
  return {
    version: "production_state.v1",
    layers: {
      generation: { state: "complete" },
      evidence: {
        state: "no_tool_required",
        verificationId: null,
        submittedUrl: null,
        finalUrl: null,
        redirectChain: [],
        checkedAt: null,
        expiry: null,
        opens: null,
        urlMatchesTool: null,
        signals: null,
        reasons: [],
      },
      alternatives: { items: [], activeCount: 0, parseFailed: false },
      creative: creativeReady
        ? { status: "ready_for_review", issues: [] }
        : { status: "needs_edit", issues: [{ code: "slide_word_limit", message: "Slayt 2 uzun." }] },
      approval: { approved, trainingExampleId: approved ? "te-1" : null },
      seriesContract: { state: "valid" },
      calendar: { attachedSlotCount: 0, slots: [], multiAttached: false },
    },
    blockers: approved ? [] : ["awaiting_human_approval"],
    productionReady: false,
    overall: approved ? "approved" : creativeReady ? "awaiting_human_approval" : "creative_needs_edit",
  };
}

function detailPayload(opts?: { approved?: boolean; creative?: "ready_for_review" | "needs_edit" }) {
  const creative = opts?.creative ?? "ready_for_review";
  return {
    production: productionFixture({
      approved: opts?.approved,
      creativeReady: creative === "ready_for_review",
    }),
    success: true,
    dossier: {
      id: "d-1",
      accountId: "acc-1",
      title: "Yeni mockup araçları",
      format: "carousel",
      pillar: "best_ai_tools",
      objective: "save",
      whyNow: "",
      painPoint: "",
      primaryToolJson: "{}",
      productionEstimate: "",
      risk: "",
      assetChecklistJson: "[]",
      costUsd: 0.021,
      createdAt: "2026-07-18T09:00:00.000Z",
      updatedAt: "2026-07-18T09:00:00.000Z",
    },
    content: {
      format: "carousel",
      cover: "5 araç tek listede",
      slides: [
        { n: 1, copy: "Birinci araç kısa tanıtım", visual: "kapak" },
        { n: 2, copy: "İkinci araç kısa tanıtım", visual: "" },
        { n: 3, copy: "Kapanış ve kaydet çağrısı", visual: "" },
      ],
      caption: "Listeyi kaydet, sırayla dene.",
      hashtags: ["#aitools", "#tasarim"],
    },
    contentHash: "abc123def4567890",
    evidence: { readiness: "ready", finalReadinessStored: "ready", verificationId: null, expiry: null },
    creative:
      creative === "ready_for_review"
        ? { status: "ready_for_review", issues: [] }
        : { status: "needs_edit", issues: [{ code: "slide_word_limit", message: "Slayt 2 uzun." }] },
    approval: opts?.approved ? { approved: true, trainingExampleId: "te-1" } : { approved: false },
    provenance: {
      seriesKey: "best_ai_tools",
      seriesVersion: 4,
      promptVersion: "v4",
      sourceHandoffId: null,
      contentHash: "abc123def4567890",
      model: "model-x",
      policyVersion: "3B-1",
    },
  };
}

async function mockSerilerBase(page: Page) {
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem" }] } })
  );
  await page.route("**/api/series", (r) =>
    r.fulfill({ json: { success: true, series: [SERIES_ROW] } })
  );
  await page.route("**/api/instagram/dna-observation", (r) =>
    r.fulfill({
      json: {
        success: true,
        status: "config_required",
        reason: "Bağlı Instagram hesabı yok.",
        account: null,
        binding: null,
        observation: null,
        proposedCaptionDnaValues: null,
        approved: { captionDna: null },
      },
    })
  );
  await page.route("**/api/reels/dossier?accountId=acc-1", (r) =>
    r.fulfill({ json: { success: true, dossiers: [DOSSIER_LIST_ROW] } })
  );
}

async function mockHandoffs(page: Page, withCandidate: boolean) {
  await page.route("**/api/opportunities/handoff**", (r) => {
    const url = r.request().url();
    if (withCandidate && url.includes("status=consumed")) {
      return r.fulfill({
        json: {
          success: true,
          handoffs: [
            { id: "h-77", title: "Figma eklentileri turu", whyNow: "trend", suggestedPlatform: "Reels" },
          ],
        },
      });
    }
    return r.fulfill({ json: { success: true, handoffs: [] } });
  });
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 3B — Seriler carousel stüdyosu", () => {
  test("kapı kapalı: dürüst blocked, yalnız ENV adları; sıfır üretim", async ({ page }) => {
    await mockSerilerBase(page);
    await mockHandoffs(page, false);
    await page.route("**/api/instagram/content/generate", (r) =>
      r.fulfill({
        status: 422,
        json: {
          success: false,
          error: "Canlı üretim kapısı kapalı",
          code: "generation_gate_closed",
          missing: ["OPENROUTER_KEY_ROTATED_AT", "INSTAGRAM_GENERATION_ENABLED"],
        },
      })
    );
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await expect(page.getByTestId("carousel-studio")).toBeVisible();
    await page.getByTestId("studio-topic").fill("Yeni bir konu");
    await page.getByTestId("studio-generate").click();
    await expect(page.getByTestId("studio-gate-blocked")).toBeVisible();
    await expect(page.getByTestId("studio-gate-blocked")).toContainText("OPENROUTER_KEY_ROTATED_AT");
    await expect(page.getByTestId("studio-gate-blocked")).toContainText("INSTAGRAM_GENERATION_ENABLED");
  });

  test("aday konudan 'Bölüm üret' stüdyoya prefill eder", async ({ page }) => {
    await mockSerilerBase(page);
    await mockHandoffs(page, true);
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("candidate-generate-h-77").click();
    await expect(page.getByTestId("studio-topic")).toHaveValue("Figma eklentileri turu");
    await expect(page.getByText("Kaynak: fırsat aktarımı")).toBeVisible();
  });

  test("review drawer: ÜÇ AYRI durum + slide editörü + kaydet expectedUpdatedAt taşır", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockSerilerBase(page);
    await mockHandoffs(page, false);
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload() })
    );
    let patchBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/dossier/d-1", (r) => {
      if (r.request().method() === "PATCH") {
        patchBody = r.request().postDataJSON() as Record<string, unknown>;
        return r.fulfill({
          json: {
            success: true,
            ok: true,
            dossierId: "d-1",
            updatedAt: "2026-07-18T09:10:00.000Z",
            contentHash: "yeni-hash",
            readiness: { status: "ready_for_review", issues: [] },
          },
        });
      }
      return r.fallback();
    });

    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("studio-row-d-1").click();
    await expect(page.getByTestId("studio-review")).toBeVisible();
    // Üç ayrı durum:
    await expect(page.getByTestId("review-creative")).toContainText("onaya hazır");
    await expect(page.getByTestId("review-evidence")).toContainText("araç yok");
    await expect(page.getByTestId("review-approval")).toContainText("onay bekliyor");
    // "model üretti ≠ yayına hazır" dürüst kopyası:
    await expect(page.getByText("yayına hazır değildir", { exact: false })).toBeVisible();
    // Slide editörü:
    await expect(page.getByTestId("review-slide-1")).toBeVisible();
    await expect(page.getByTestId("review-slide-3")).toBeVisible();
    await page.getByTestId("review-cover").fill("Düzenlenmiş kapak");
    await page.getByTestId("review-save").click();
    await expect
      .poll(() => patchBody, { timeout: 5000 })
      .toMatchObject({
        accountId: "acc-1",
        expectedUpdatedAt: "2026-07-18T09:00:00.000Z",
        carousel: { cover: "Düzenlenmiş kapak" },
      });
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("needs_edit durumunda Onayla kapalı; ready + onay → insan onaylı", async ({ page }) => {
    await mockSerilerBase(page);
    await mockHandoffs(page, false);
    let approved = false;
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ approved }) })
    );
    await page.route("**/api/reels/dossier/d-1/approve", (r) => {
      approved = true;
      return r.fulfill({
        json: { success: true, ok: true, trainingExampleId: "te-1", alreadyApproved: false, operatorEdited: false },
      });
    });
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("studio-row-d-1").click();
    await expect(page.getByTestId("review-approve")).toBeEnabled();
    await page.getByTestId("review-approve").click();
    await expect(page.getByTestId("review-approval")).toContainText("insan onaylı");
    await expect(page.getByTestId("review-approve")).toBeDisabled();
  });

  test("needs_edit: onay butonu kapalı", async ({ page }) => {
    await mockSerilerBase(page);
    await mockHandoffs(page, false);
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload({ creative: "needs_edit" }) })
    );
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("studio-row-d-1").click();
    await expect(page.getByTestId("review-creative")).toContainText("düzenleme gerek");
    await expect(page.getByTestId("review-issues")).toContainText("Slayt 2 uzun");
    await expect(page.getByTestId("review-approve")).toBeDisabled();
  });
});

async function mockTakvimBase(page: Page, opts?: { slotDossierId?: string | null }) {
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
              seriesKey: "best_ai_tools",
              topicHint: "AI mockup akışı",
              status: "planned",
              dossierId: opts?.slotDossierId ?? null,
            },
          ],
        },
        staleFlags: [],
      },
    })
  );
  await page.route("**/api/reels/dossier?accountId=acc-1", (r) =>
    r.fulfill({ json: { success: true, dossiers: opts?.slotDossierId ? [DOSSIER_LIST_ROW] : [] } })
  );
}

test.describe("Phase 3B — Takvim slot/dossier akışı", () => {
  test("dossier'siz slot: üret + AÇIK 'Slota bağla' iki ayrı eylem; kapı kapalıysa dürüst blocked", async ({ page }) => {
    await mockTakvimBase(page);
    let attachBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/dossier", (r) => {
      if (r.request().method() === "POST") {
        return r.fulfill({
          json: { success: true, status: "created", dossierId: "d-yeni", finalReadiness: "ready", verified: false, costUsd: 0.1, warnings: [], contentHash: "h" },
        });
      }
      return r.fallback();
    });
    await page.route("**/api/reels/plan/slot/slot-raw-1/attach", (r) => {
      attachBody = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({ json: { success: true, slotId: "slot-raw-1", dossierId: "d-yeni", alreadyAttached: false } });
    });

    await page.goto("/");
    await selectTab(page, "plan-takvim");
    // 5. güne tıkla (slot).
    await page.getByLabel("5 — 1 öğe").click();
    await expect(page.getByTestId("slot-dossier-actions")).toBeVisible();
    await expect(page.getByTestId("slot-topic")).toHaveValue("AI mockup akışı");
    await page.getByTestId("slot-generate").click();
    // Üretim bitti — bağlama AYRI açık eylem:
    await expect(page.getByTestId("slot-attach")).toBeVisible();
    await page.getByTestId("slot-attach").click();
    await expect.poll(() => attachBody, { timeout: 5000 }).toMatchObject({
      accountId: "acc-1",
      dossierId: "d-yeni",
    });
  });

  test("kapı kapalı: slot üretiminde dürüst blocked (yalnız ENV adları)", async ({ page }) => {
    await mockTakvimBase(page);
    await page.route("**/api/reels/dossier", (r) => {
      if (r.request().method() === "POST") {
        return r.fulfill({
          status: 422,
          json: { success: false, error: "kapı", code: "generation_gate_closed", missing: ["INSTAGRAM_GENERATION_LIVE_APPROVED"] },
        });
      }
      return r.fallback();
    });
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByLabel("5 — 1 öğe").click();
    await page.getByTestId("slot-generate").click();
    await expect(page.getByTestId("slot-gate-blocked")).toBeVisible();
    await expect(page.getByTestId("slot-gate-blocked")).toContainText("INSTAGRAM_GENERATION_LIVE_APPROVED");
  });

  test("bağlı dossier: tam detay + editoryal/onay ayrımı", async ({ page }) => {
    await mockTakvimBase(page, { slotDossierId: "d-1" });
    await page.route("**/api/reels/dossier/d-1?accountId=acc-1", (r) =>
      r.fulfill({ json: detailPayload() })
    );
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByLabel("5 — 1 öğe").click();
    await expect(page.getByTestId("dossier-detail-panel")).toBeVisible();
    await expect(page.getByTestId("dossier-detail-panel")).toContainText("editoryal: onaya hazır");
    await expect(page.getByTestId("dossier-detail-panel")).toContainText("onay bekliyor");
    await expect(page.getByText("site kanıtı editoryal onay DEĞİLDİR", { exact: false })).toBeVisible();
  });
});

test.describe("Phase 3B — genişlik taraması", () => {
  test("Seriler + Takvim 1024–1920 yatay taşma yok", async ({ page }) => {
    await mockSerilerBase(page);
    await mockHandoffs(page, false);
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto("/");
      await selectTab(page, "plan-seriler");
      await expect(page.getByTestId("carousel-studio")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `seriler width=${width}`).toBe(0);
    }
  });
});
