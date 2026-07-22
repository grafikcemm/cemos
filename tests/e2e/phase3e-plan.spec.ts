import { test, expect, appConsoleErrors, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 3E (ADR-039) — aylık plan preview→apply→activate + plan sağlığı + slot
 * operasyonları e2e'si. HERMETİK: tüm API route-mock; canlı DB/LLM/site YOK.
 * Kanıtlanan:
 *  - PlanBuilder: önizle → uygula (fingerprint+expectedUpdatedAt) → AYRI aktive
 *  - Hard blocker apply'ı bloklar
 *  - Plan sağlık şeridi canonical health'ten render (Sistem ile aynı kaynak)
 *  - Slot atla/taşı operasyonları
 *  - 1024–1920 taşma 0, console app error 0.
 */

const UPDATED = "2026-08-01T09:00:00.000Z";

function planHealthContract(configured = true) {
  return {
    version: "instagram_plan_health.v1",
    status: configured ? "warn" : "ok",
    configured,
    planStatus: configured ? "active" : null,
    month: "2026-08",
    accountId: "acc-1",
    counts: {
      totalActiveSlots: 4,
      protectedSlots: 1,
      skippedSlots: 0,
      withoutDossier: 3,
      attachedNotReady: 0,
      productionReady: 1,
      evidenceMissing: 0,
      evidenceStale: 1,
      evidenceFailed: 0,
      creativeNeedsEdit: 0,
      awaitingApproval: 0,
      seriesChanged: 0,
    },
    collisions: 0,
    repetitionWarnings: 0,
    mixDeviation: false,
    overdueIncomplete: 0,
    todayUnready: 0,
    next7DaysUnready: 1,
    nextActionable: { slotId: "s1", dayOfMonth: 12, reason: "dossier bekliyor" },
    blockers: [],
    warnings: [],
    meetsBar: { ok: false, attached: 1, ready: 1, reason: "Bar geçilmedi: 3 dossiersiz, 1 kanıt sorunu." },
    message: "Önümüzdeki 7 günde 1 slot hazır değil.",
  };
}

function previewPayload(opts?: { hardBlockers?: string[] }) {
  return {
    success: true,
    preview: {
      accountId: "acc-1",
      month: "2026-08",
      daysInMonth: 31,
      config: { pillars: ["a", "b", "c"], postDays: [2, 5, 8] },
      planExists: true,
      planStatus: "draft",
      expectedUpdatedAt: UPDATED,
      fingerprint: "fp-abc",
      mix: { evergreen: 6, seasonal: 2, reactive: 2 },
      seriesDistribution: [],
      slotsAdded: [{ slotId: null, dayOfMonth: 8, pillar: "a", mixBucket: "evergreen", seriesKey: null, topicHint: "", status: "planned" }],
      slotsUpdated: [],
      slotsUnchanged: [],
      slotsProtected: [{ slotId: "p1", dayOfMonth: 5, pillar: "a", mixBucket: "evergreen", seriesKey: null, topicHint: "korunan", status: "drafted" }],
      slotsSkipped: [{ slotId: "sk1", dayOfMonth: 20, pillar: "a", mixBucket: "evergreen", seriesKey: null, topicHint: "", status: "planned" }],
      collisions: [],
      histogram: { findings: [] },
      warnings: opts?.hardBlockers ? [] : ["Mix sapması: reactive %20"],
      hardBlockers: opts?.hardBlockers ?? [],
      idempotentNoop: false,
    },
  };
}

async function mockPlanBase(page: Page, opts?: { slotDossierId?: string | null; planHealth?: boolean }) {
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem" }] } })
  );
  await page.route("**/api/queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/opportunities/handoff**", (r) => r.fulfill({ json: { success: true, handoffs: [] } }));
  await page.route("**/api/costs**", (r) => r.fulfill({ json: { success: true, today: { totalUsd: 0 } } }));
  await page.route("**/api/health**", (r) =>
    r.fulfill({
      json: {
        worker: { mode: "cron", inferredStatus: "recent_tick" },
        database: { ok: true },
        contracts: { instagramPlanning: planHealthContract(opts?.planHealth !== false) },
      },
    })
  );
  await page.route("**/api/series**", (r) =>
    r.fulfill({
      json: {
        success: true,
        series: [
          { id: "sp1", seriesKey: "best_ai_tools", name: "En İyi AI Araçları", format: "carousel", isActive: true },
        ],
      },
    })
  );
  await page.route("**/api/reels/plan?**", (r) =>
    r.fulfill({
      json: {
        success: true,
        plan: {
          status: "draft",
          updatedAt: UPDATED,
          slots: [
            {
              id: "slot-raw-1",
              dayOfMonth: 5,
              pillar: "arac_demo",
              seriesKey: null,
              topicHint: "AI mockup akışı",
              status: opts?.slotDossierId ? "drafted" : "planned",
              dossierId: opts?.slotDossierId ?? null,
              updatedAt: UPDATED,
            },
          ],
        },
        staleFlags: [],
        planStatus: "draft",
        notes: { warnings: [], revision: 1, legacy: false },
      },
    })
  );
  await page.route("**/api/reels/dossier?accountId=acc-1", (r) => r.fulfill({ json: { success: true, dossiers: [] } }));
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 3E — plan builder + sağlık + slot ops", () => {
  test("plan sağlık şeridi canonical health'ten render olur", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockPlanBase(page);
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    const strip = page.getByTestId("plan-health-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Plan sağlığı");
    await expect(strip).toContainText("yayına hazır");
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("builder: önizle → uygula (fingerprint+expectedUpdatedAt) → AYRI aktive", async ({ page }) => {
    await mockPlanBase(page);
    let applyBody: Record<string, unknown> | null = null;
    let lifecycleBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/plan/preview", (r) => r.fulfill({ json: previewPayload() }));
    await page.route("**/api/reels/plan/apply", async (r) => {
      applyBody = r.request().postDataJSON();
      await r.fulfill({ json: { success: true, created: 1, updated: 0, skipped: 1, updatedAt: "2026-08-01T10:00:00Z", revision: 2, idempotent: false, warnings: [] } });
    });
    await page.route("**/api/reels/plan/lifecycle", async (r) => {
      lifecycleBody = r.request().postDataJSON();
      await r.fulfill({ json: { success: true, status: "active", updatedAt: "2026-08-01T11:00:00Z" } });
    });

    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByTestId("takvim-plan-open").click();
    await expect(page.getByTestId("plan-builder")).toBeVisible();

    await page.getByTestId("plan-preview-btn").click();
    await expect(page.getByTestId("plan-preview-panel")).toBeVisible();
    await expect(page.getByTestId("plan-preview-panel")).toContainText("eklenecek");
    await expect(page.getByTestId("plan-preview-panel")).toContainText("korunacak");

    await page.getByTestId("plan-apply-btn").click();
    await expect.poll(() => applyBody).not.toBeNull();
    expect(applyBody!.fingerprint).toBe("fp-abc");
    expect(applyBody!.expectedUpdatedAt).toBe(UPDATED);

    // Apply otomatik aktive ETMEZ — ayrı buton.
    await expect(page.getByTestId("plan-activate-btn")).toBeVisible();
    await page.getByTestId("plan-activate-btn").click();
    await expect.poll(() => lifecycleBody).not.toBeNull();
    expect(lifecycleBody!.target).toBe("active");
  });

  test("hard blocker apply'ı bloklar", async ({ page }) => {
    await mockPlanBase(page);
    await page.route("**/api/reels/plan/preview", (r) =>
      r.fulfill({ json: previewPayload({ hardBlockers: ["Yasaklı konu (tam eşleşme): yapay zeka sıralaması"] }) })
    );
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByTestId("takvim-plan-open").click();
    await page.getByTestId("plan-preview-btn").click();
    await expect(page.getByTestId("plan-hard-blockers")).toBeVisible();
    await expect(page.getByTestId("plan-apply-btn")).toBeDisabled();
  });

  test("slot atla operasyonu POST atar", async ({ page }) => {
    await mockPlanBase(page);
    let skipBody: Record<string, unknown> | null = null;
    await page.route("**/api/reels/plan/slot/slot-raw-1/skip", async (r) => {
      skipBody = r.request().postDataJSON();
      await r.fulfill({ json: { success: true, slotId: "slot-raw-1", alreadySkipped: false, updatedAt: "2026-08-01T10:00:00Z" } });
    });
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await page.getByLabel("5 — 1 öğe").click();
    await expect(page.getByTestId("slot-ops")).toBeVisible();
    await page.getByTestId("slot-skip-btn").click();
    await expect.poll(() => skipBody).not.toBeNull();
    expect(skipBody!.expectedUpdatedAt).toBe(UPDATED);
  });

  test("1024–1920 taşma 0 + console app error 0", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockPlanBase(page);
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await expect(page.getByTestId("plan-health-strip")).toBeVisible();
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    }
    expect(appConsoleErrors(errors)).toEqual([]);
  });
});
