import { test, expect, type Page } from "@playwright/test";
import { assessReadiness, type ReadinessInput } from "../../src/lib/services/readinessService";

/**
 * Bugün karar kuyruğu — HERMETİK (route-mock, mutasyonsuz, canlı DB bağımsız).
 * Düzeltilmiş yayın sözleşmesi (ADR-020): ready = intent-only "X'te aç" + manuel
 * "Paylaşıldı"; needs_edit = "Düzenle" (intent/publish YOK); blocked = intent/
 * publish YOK. Kozmetik "değiştirmeden yayınlayamazsın" edit-gate'i KALKTI.
 * Kart tonu = readiness (ivory/peach/blocked, data-readiness). Desktop 1280/1440.
 */

const baseRI: ReadinessInput = {
  content: "",
  editedContent: null,
  status: "scheduled",
  draftType: "TWEET",
  accountHandle: "grafikcem",
  maxChars: 1500,
  judged: true,
  turkishNaturalness: 82,
  riskScore: 14,
  sourceFaithfulness: 88,
  leaks: [],
  lintIssues: [],
  hasSource: true,
  threadSegments: null,
};

function fixture(
  id: string,
  riOver: Partial<ReadinessInput>,
  why: { verification: string; isClaimVerified: boolean; reason: string | null; sourceAgeHours: number | null },
) {
  const readinessInput = { ...baseRI, ...riOver };
  return {
    id,
    accountId: "acc-1",
    accountHandle: "grafikcem",
    displayName: "Grafikcem",
    content: readinessInput.content,
    editedContent: readinessInput.editedContent,
    draftType: readinessInput.draftType,
    mode: "tool_spotlight",
    status: "draft",
    createdAt: "2026-07-15T06:00:00Z",
    lintReport: null,
    generatedImageUrl: null,
    scoresParsed: {
      judged: readinessInput.judged,
      turkishNaturalness: readinessInput.turkishNaturalness,
      sourceFaithfulness: readinessInput.sourceFaithfulness,
      riskScore: readinessInput.riskScore ?? 20,
      hookStrengthScore: 78,
      noveltyScore: 71,
      personaMatchScore: 84,
      clarityScore: 80,
      leaks: [],
      leakCount: 0,
    },
    readinessInput,
    readiness: assessReadiness(readinessInput),
    whyToday: why,
    threadSegments: null,
  };
}

const items = [
  fixture(
    "ready-1",
    { content: "Cursor composer modunu client projesinde test ettim; import yollarini elle duzelttim." },
    { verification: "verified", isClaimVerified: true, reason: "C2PA · 3 saat once", sourceAgeHours: 3 },
  ),
  fixture(
    "edit-1",
    { content: "Bu AI araci is akisini tamamen donusturuyor.", judged: false, turkishNaturalness: null },
    { verification: "source_available", isClaimVerified: false, reason: "Kaynaga dayali", sourceAgeHours: 5 },
  ),
  fixture(
    "block-1",
    { content: "Yeni model kodlama hizini %70 artiriyor.", hasSource: false },
    { verification: "unverified", isClaimVerified: false, reason: null, sourceAgeHours: null },
  ),
  // §8E: readiness kontrollerinden geçen AMA kaynağı eski taslak — güncellik
  // uyarısı readiness'ten ayrı görünmeli (çelişki değil, iki ayrı eksen).
  fixture(
    "stale-1",
    { content: "Bu araci client projesinde denedim; ekip icin faydali oldu ve is akisini belirgin hizlandirdi." },
    { verification: "stale", isClaimVerified: false, reason: "Eski dayanak · 3 gün önce", sourceAgeHours: 72 },
  ),
];

async function mockAndOpen(page: Page) {
  await page.route("**/api/growth/daily-queue**", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: { success: true, items } });
  });
  await page.goto("/");
  await page.getByTestId("sidebar-area-bugun").click();
  await expect(page.getByTestId("draft-review-card").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("Bugün karar kuyruğu (düzeltilmiş sözleşme)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAndOpen(page);
  });

  test("ready kart (§8E/§8D): 'Kontrolleri geçti'; intent-only 'X'te aç'; Paylaşıldı intent'ten önce YOK", async ({ page }) => {
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "ready");
    // §8E: readiness = teknik/kalite; "Yayına hazır" değil.
    await expect(card.getByTestId("readiness-badge")).toContainText("Kontrolleri geçti");
    await expect(card.getByTestId("readiness-badge")).not.toContainText("Yayına hazır");
    await expect(card.getByTestId("cta-open-x")).toBeVisible();
    // §8D: Paylaşıldı yalnız intent açıldıktan sonra belirir.
    await expect(card.getByTestId("cta-mark-published")).toHaveCount(0);
    await expect(page.getByText(/değiştirmeden yayınlayamazsın/)).toHaveCount(0);
    await expect(page.getByText(/Onayla ve yayınla/)).toHaveCount(0);
  });

  test("ready kart (§8D): dinlenirken en fazla 3 ana eylem; utility taşma menüsünde", async ({ page }) => {
    const card = page.getByTestId("draft-review-card").first();
    // Görünür: X'te aç (primary) + Düzenle (secondary) + ⋯ (taşma tetikleyici).
    await expect(card.getByTestId("cta-open-x")).toBeVisible();
    await expect(card.getByTestId("cta-edit")).toBeVisible();
    await expect(card.getByTestId("cta-overflow")).toBeVisible();
    // Kaydet yalnız dirty (dinlenirken YOK); utility taşmada (henüz DOM'da değil).
    await expect(card.getByTestId("cta-save")).toHaveCount(0);
    await expect(card.getByTestId("cta-copy")).toHaveCount(0);
    await expect(card.getByTestId("cta-generate-image")).toHaveCount(0);
  });

  test("ready kart (§8D): X'te aç → 'Paylaşıldı olarak işaretle' belirir (publish_prepared)", async ({ page }) => {
    // window.open'ı gerçek popup açmaması için no-op'la (intent penceresi test-dışı).
    await page.evaluate(() => {
      window.open = () => null;
    });
    const card = page.getByTestId("draft-review-card").first();
    await expect(card.getByTestId("cta-mark-published")).toHaveCount(0);
    await card.getByTestId("cta-open-x").click();
    await expect(card.getByTestId("cta-mark-published")).toBeVisible();
    await expect(card.getByTestId("cta-mark-published")).toContainText("Paylaşıldı olarak işaretle");
  });

  test("taşma menüsü (§8D): açılır, klavye erişilebilir, Escape kapatır", async ({ page }) => {
    const card = page.getByTestId("draft-review-card").first();
    const trigger = card.getByTestId("cta-overflow");
    await expect(trigger).toHaveAttribute("aria-label", "Diğer eylemler");
    await trigger.click();
    const menu = page.getByTestId("card-overflow-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("cta-copy")).toBeVisible();
    await expect(menu.getByTestId("cta-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("needs_edit kart: 'Düzenle' primary; intent/publish YOK; nedenler görünür", async ({ page }) => {
    await page.getByTestId("queue-row-edit-1").click();
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "needs_edit");
    await expect(card.getByTestId("cta-edit")).toBeVisible();
    await expect(card.getByTestId("cta-open-x")).toHaveCount(0);
    await expect(card.getByTestId("cta-mark-published")).toHaveCount(0);
    await expect(card.getByTestId("readiness-reasons")).toBeVisible();
  });

  test("blocked kart: intent/publish YOK; engelleyen neden görünür", async ({ page }) => {
    await page.getByTestId("queue-row-block-1").click();
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "blocked");
    await expect(card.getByTestId("cta-open-x")).toHaveCount(0);
    await expect(card.getByTestId("cta-mark-published")).toHaveCount(0);
    await expect(card.getByTestId("readiness-reasons")).toContainText(/kaynak yok|yayınlanamaz/i);
  });

  test("stale kaynak (§8E): 'Kontrolleri geçti' + AYRI güncellik uyarısı (çelişki değil)", async ({ page }) => {
    await page.getByTestId("queue-row-stale-1").click();
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "ready");
    await expect(card.getByTestId("readiness-badge")).toContainText("Kontrolleri geçti");
    await expect(card.getByTestId("freshness-warning")).toContainText(/Kaynak eski; yayınlamadan önce güncelliği kontrol et/);
    await expect(page.getByText(/Bayat kaynak/)).toHaveCount(0);
  });

  test("Detay drawer (§8D): taşma menüsünden açılır; kart ile aynı doğrulama", async ({ page }) => {
    const card = page.getByTestId("draft-review-card").first();
    await card.getByTestId("cta-overflow").click();
    await page.getByTestId("card-overflow-menu").getByTestId("cta-detail").click();
    await expect(page.getByText("Taslak detayı")).toBeVisible();
    await expect(page.getByText("Neden bugün?")).toBeVisible();
    await expect(page.getByText("Doğrulandı").first()).toBeVisible();
  });

  test("desktop 1024–1920 yatay taşma yok", async ({ page }) => {
    for (const w of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${w}px yatay taşma`).toBeLessThanOrEqual(1);
    }
  });
});
