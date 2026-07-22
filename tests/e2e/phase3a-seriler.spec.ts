import { test, expect, type Page } from "@playwright/test";
import { selectTab } from "./helpers/nav";

/**
 * Phase 3A (ADR-035) — Seriler'de gözlenen-vs-onaylı Instagram DNA e2e'si.
 * HERMETİK: /api/settings, /api/series, /api/opportunities/handoff ve
 * /api/instagram/dna-observation(+/apply) route-mock — canlı DB/LLM yok.
 * Kanıtlanan:
 *  - binding yok / medya yok / yetersiz örneklem / hazır gözlem durumları
 *  - apply drawer: hiçbir alan otomatik seçili değil, önce/sonra önizleme,
 *    başarılı apply sürüm notu, 409 çakışma kurtarma
 *  - istemci apply isteğinde DEĞER yok (yalnız alan seçimi + expectedVersion)
 *  - 1024–1920 yatay taşma 0; console app error 0.
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
  slideCountRange: "6-8",
  coverFormula: "Sert iddia + araç sayısı",
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

const OBSERVATION = {
  policyVersion: "3A-1",
  evidenceCount: 24,
  dateRange: { from: "2026-05-01T00:00:00.000Z", to: "2026-07-15T00:00:00.000Z" },
  mediaTypeDistribution: { CAROUSEL_ALBUM: 16, REELS: 6, IMAGE: 2 },
  hookDistribution: { soru: 10, rakam: 8, iddia: 6 },
  captionLength: { min: 90, max: 860, median: 320 },
  paragraphPattern: "cok_paragraf",
  emoji: { ratio: 0.21, policy: "sparse" },
  ctaEndingDistribution: { soru: 4, yonlendirme: 16, yok: 4 },
  hashtag: {
    countRange: { min: 3, max: 8 },
    placement: "end",
    casing: "lower",
    coreTags: ["#tasarim", "#ai"],
    rotatingTags: ["#figma"],
  },
  sampleSufficiency: "sufficient",
  performanceEvidence: "engagement_partial",
  sources: { igMedia: 24 },
  warnings: [
    "Yalnız like/yorum sayısı var — tek başına virallik kanıtı değildir; reach/save/share için insight sync gerekli.",
  ],
};

function observationPayload(
  status: "ok" | "config_required" | "no_media",
  opts?: { insufficient?: boolean }
) {
  if (status !== "ok") {
    return {
      success: true,
      status,
      reason:
        status === "config_required"
          ? "Bağlı Instagram hesabı yok. Entegrasyonlar'dan Composio bağlantısını tamamla (COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID + COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE) ve bir sync çalıştır."
          : "Bağlı hesap için senkronize edilmiş Instagram medyası yok — önce sync çalıştır.",
      account: status === "no_media" ? { id: "acc-1", handle: "grafikcem" } : null,
      binding:
        status === "no_media"
          ? {
              provider: "composio",
              externalHandle: "grafikcem",
              connectionStatus: "connected",
              lastSuccessfulSyncAt: null,
              staleSync: true,
            }
          : null,
      observation: null,
      proposedCaptionDnaValues: null,
      approved: { captionDna: null },
    };
  }
  const insufficient = opts?.insufficient ?? false;
  const observation = insufficient
    ? {
        ...OBSERVATION,
        evidenceCount: 4,
        sampleSufficiency: "insufficient",
        warnings: ["Örneklem yetersiz (4/10) — bu gözlemden kural çıkarılmamalı."],
      }
    : OBSERVATION;
  return {
    success: true,
    status: "ok",
    reason: "Gözlem hazır.",
    account: { id: "acc-1", handle: "grafikcem" },
    binding: {
      provider: "composio",
      externalHandle: "grafikcem",
      connectionStatus: "connected",
      lastSuccessfulSyncAt: "2026-07-16T09:00:00.000Z",
      staleSync: false,
    },
    observation,
    proposedCaptionDnaValues: insufficient
      ? null
      : {
          openingHookTypes: '["soru","rakam","iddia"]',
          lengthRange: '{"min":90,"max":860,"median":320}',
          emojiPolicy: "sparse",
          lineBreakPattern: "cok_paragraf",
          ctaStyle: "yonlendirme",
        },
    approved: {
      captionDna: {
        openingHookTypes: '["iddia"]',
        lengthRange: '{"min":100,"max":500,"median":250}',
        emojiPolicy: "none",
        lineBreakPattern: "tek_blok",
        ctaStyle: null,
        provenance: "operator",
        version: 2,
        evidenceCount: 12,
      },
    },
  };
}

async function mockSerilerSurface(
  page: Page,
  status: "ok" | "config_required" | "no_media",
  opts?: { insufficient?: boolean }
) {
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem" }] } })
  );
  await page.route("**/api/series", (r) =>
    r.fulfill({ json: { success: true, series: [SERIES_ROW] } })
  );
  await page.route("**/api/opportunities/handoff**", (r) =>
    r.fulfill({ json: { success: true, handoffs: [] } })
  );
  await page.route("**/api/instagram/dna-observation", (r) =>
    r.fulfill({ json: observationPayload(status, opts) })
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

test.describe("Phase 3A — Seriler'de gözlenen Instagram DNA'sı", () => {
  test("binding yok: config_required durumu dürüst gösterilir", async ({ page }) => {
    await mockSerilerSurface(page, "config_required");
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await expect(page.getByTestId("ig-dna-state-config_required")).toBeVisible();
    await expect(page.getByText("Instagram bağlantısı yok")).toBeVisible();
  });

  test("bağlı ama medya yok: no_media durumu", async ({ page }) => {
    await mockSerilerSurface(page, "no_media");
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await expect(page.getByTestId("ig-dna-state-no_media")).toBeVisible();
  });

  test("hazır gözlem: istatistikler + dürüst performans + onaylı ayrımı", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockSerilerSurface(page, "ok");
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await expect(page.getByTestId("ig-dna-section")).toBeVisible();
    await expect(page.getByTestId("ig-dna-sufficiency")).toHaveText("örneklem yeterli");
    // Dürüst performans dili: like/yorum virallik kanıtı değil.
    await expect(page.getByTestId("ig-dna-performance")).toContainText("virallik kanıtı değil");
    // Onaylı DNA ayrı blokta, sürümüyle.
    await expect(page.getByText("Onaylı hesap DNA'sı: v2", { exact: false })).toBeVisible();
    // Gözlem kural değil ibaresi.
    await expect(page.getByText("onaylanmadan üretim kuralı OLMAZ", { exact: false })).toBeVisible();
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("yetersiz örneklem: apply kapalı", async ({ page }) => {
    await mockSerilerSurface(page, "ok", { insufficient: true });
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await expect(page.getByTestId("ig-dna-sufficiency")).toHaveText("örneklem yetersiz");
    await expect(page.getByTestId("ig-dna-apply-open")).toBeDisabled();
  });

  test("apply akışı: seçim boş başlar, önizleme görünür, istek DEĞER taşımaz, sürüm notu döner", async ({
    page,
  }) => {
    await mockSerilerSurface(page, "ok");
    let applyBody: Record<string, unknown> | null = null;
    await page.route("**/api/instagram/dna-observation/apply", async (route) => {
      applyBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          success: true,
          applied: {
            ok: true,
            target: "caption_dna",
            appliedFields: ["emojiPolicy"],
            version: 3,
            alreadyApplied: false,
          },
        },
      });
    });
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("ig-dna-apply-open").click();

    // Hiçbir alan otomatik seçili değil.
    for (const f of ["openingHookTypes", "lengthRange", "emojiPolicy", "lineBreakPattern", "ctaStyle"]) {
      await expect(page.getByTestId(`ig-dna-field-${f}`)).not.toBeChecked();
    }
    await expect(page.getByTestId("ig-dna-apply-save")).toBeDisabled();

    // Önce/sonra önizleme.
    await expect(page.getByText("şu an: none")).toBeVisible();
    await expect(page.getByText("önerilen: sparse")).toBeVisible();

    await page.getByTestId("ig-dna-field-emojiPolicy").check();
    await page.getByTestId("ig-dna-apply-save").click();

    await expect(page.getByTestId("ig-dna-note")).toContainText("v3");
    // Governance: istek yalnız seçim + expectedVersion taşır — değer YOK.
    expect(applyBody).toMatchObject({
      target: "caption_dna",
      accountId: "acc-1",
      selectedFields: ["emojiPolicy"],
      expectedVersion: 2,
    });
    expect(JSON.stringify(applyBody)).not.toContain("sparse");
  });

  test("409 çakışması: dürüst mesaj + gözlem yenilenir", async ({ page }) => {
    await mockSerilerSurface(page, "ok");
    await page.route("**/api/instagram/dna-observation/apply", (route) =>
      route.fulfill({
        status: 409,
        json: { success: false, error: "stale", code: "version_conflict" },
      })
    );
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    await page.getByTestId("ig-dna-apply-open").click();
    await page.getByTestId("ig-dna-field-emojiPolicy").check();
    await page.getByTestId("ig-dna-apply-save").click();
    await expect(page.getByTestId("ig-dna-note")).toContainText("sürüm çakışması");
  });

  test("1024–1920 yatay taşma yok", async ({ page }) => {
    await mockSerilerSurface(page, "ok");
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto("/");
      await selectTab(page, "plan-seriler");
      await expect(page.getByTestId("ig-dna-section")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `width=${width}`).toBe(0);
    }
  });
});
