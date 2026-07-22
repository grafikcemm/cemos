import { test, expect, type Page } from "./fixtures";
import { assessReadiness, type ReadinessInput } from "../../src/lib/services/readinessService";

/**
 * Phase 2D (ADR-033) — thread yayın akışı, HERMETİK (route-mock, mutasyonsuz,
 * canlı DB'ye sahte QueueItem YAZILMAZ). Dürüst sözleşme: X intent tek çağrıda
 * zincir OLUŞTURMAZ → intent yalnız İLK segmenti açar; "Paylaşıldı olarak
 * işaretle" BÜTÜN zincir için manuel kullanıcı beyanıdır; segment edit'i
 * prepared hazırlığı stale yapar. Desktop-only.
 */

const SEGS = [
  { text: "Hook: bu araci kimse konusmuyor, dokum geliyor." },
  { text: "Adim 1: kurulum tek komut, preset hazir." },
  { text: "Adim 2: stil referansini kilitle, sahneyi degistir." },
  { text: "Payoff: kaydet — yarin client isinde lazim olacak." },
];
const JOINED = SEGS.map((s) => s.text).join("\n\n");

const threadRI: ReadinessInput = {
  content: JOINED,
  editedContent: null,
  status: "new",
  draftType: "THREAD",
  mode: "thread",
  accountHandle: "grafikcem",
  maxChars: 1500, // segment limiti yine 280 olmalı (effectiveThreadSegmentLimit)
  judged: true,
  turkishNaturalness: 84,
  riskScore: 12,
  sourceFaithfulness: 88,
  leaks: [],
  lintIssues: [],
  hasSource: true,
  threadSegments: SEGS,
};

function threadFixture(over: Record<string, unknown> = {}) {
  return {
    id: "thr-1",
    accountId: "acc-1",
    accountHandle: "grafikcem",
    displayName: "Grafikcem",
    content: JOINED,
    editedContent: null,
    draftType: "THREAD",
    mode: "thread",
    status: "new",
    createdAt: "2026-07-16T06:00:00Z",
    lintReport: null,
    generatedImageUrl: null,
    scoresParsed: {
      judged: true, turkishNaturalness: 84, sourceFaithfulness: 88, riskScore: 12,
      hookStrengthScore: 80, noveltyScore: 70, personaMatchScore: 86, clarityScore: 82,
      leaks: [], leakCount: 0,
    },
    readinessInput: threadRI,
    readiness: assessReadiness(threadRI),
    whyToday: { verification: "verified", isClaimVerified: true, reason: "Kaynak · 2 saat önce", sourceAgeHours: 2 },
    threadSegments: JSON.stringify(SEGS),
    publishAttempt: null,
    ...over,
  };
}

async function mockAndOpen(page: Page, items: unknown[]) {
  await page.route("**/api/growth/daily-queue**", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: { success: true, items } });
  });
  await page.goto("/");
  await page.getByTestId("sidebar-area-bugun").click();
  await expect(page.getByTestId("draft-review-card").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("Phase 2D — thread kartı ve dürüst intent akışı", () => {
  test("thread kartı: segment editörü + segment sayısı + 280 char sayaç (maxChars 1500 olsa bile)", async ({ page }) => {
    await mockAndOpen(page, [threadFixture()]);
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "ready");
    await expect(card.getByTestId("thread-segment-editor")).toBeVisible();
    await expect(card.getByTestId("thread-segment-editor")).toContainText("Thread segmentleri · 4");
    // UI limiti server ile AYNI primitive'den: /280 (1500 DEĞİL).
    await expect(card.getByTestId("segment-0")).toContainText("/280");
    await expect(card.getByText("/1500")).toHaveCount(0);
  });

  test("281 karakterlik segment: satır-içi hata + canlı readiness needs_edit (ready kartı düşer)", async ({ page }) => {
    const over = [{ text: "x".repeat(281) }, ...SEGS.slice(1)];
    const ri = { ...threadRI, threadSegments: over, content: over.map((s) => s.text).join("\n\n") };
    await mockAndOpen(page, [
      threadFixture({ readinessInput: ri, readiness: assessReadiness(ri), threadSegments: JSON.stringify(over) }),
    ]);
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "needs_edit");
    await expect(card.getByTestId("segment-0-over-limit")).toContainText("karakter sınırını aşıyor");
    await expect(card.getByTestId("readiness-reasons")).toContainText(/280 karakter/);
    await expect(card.getByTestId("cta-open-x")).toHaveCount(0);
  });

  test("ready thread CTA açıkça ilk-segment modu: 'İlk gönderiyi X'te aç'", async ({ page }) => {
    await mockAndOpen(page, [threadFixture()]);
    const card = page.getByTestId("draft-review-card").first();
    await expect(card.getByTestId("cta-open-x")).toContainText("İlk gönderiyi X'te aç");
  });

  test("prepare → dürüst açıklama: 'X yalnız ilk segmenti açtı' + kalan segment kopyalama + manuel zincir onayı", async ({ page }) => {
    await mockAndOpen(page, [threadFixture()]);
    await page.route("**/api/queue/*/prepare-intent", (route) =>
      route.fulfill({
        json: {
          success: true,
          attempt: { id: "att-t", state: "prepared", contentHash: "thread-hash" },
          intentUrl: `https://x.com/intent/post?text=${encodeURIComponent(SEGS[0].text)}`,
          reused: false,
          intentMode: "thread_first_segment",
          segmentCount: 4,
        },
      }),
    );
    await page.evaluate(() => {
      window.open = () => null;
    });
    const card = page.getByTestId("draft-review-card").first();
    await expect(card.getByTestId("thread-intent-note")).toHaveCount(0);
    await card.getByTestId("cta-open-x").click();
    await expect(card.getByTestId("thread-intent-note")).toContainText("X yalnız ilk segmenti açtı");
    await expect(card.getByTestId("thread-intent-note")).toContainText("paylaşıldı olarak işaretle");
    // Kalan 3 segment için erişilebilir kopyalama eylemleri (2..4).
    await expect(card.getByTestId("copy-segment-2")).toBeVisible();
    await expect(card.getByTestId("copy-segment-4")).toBeVisible();
    await expect(card.getByTestId("copy-segment-5")).toHaveCount(0);
    // Manuel bütün-zincir beyanı görünür; otomatik yayın iddiası YOK.
    await expect(card.getByTestId("cta-mark-published")).toBeVisible();
    await expect(page.getByText(/otomatik.*yayınlandı/i)).toHaveCount(0);
  });

  test("prepared thread'de segment edit + kaydet → hazırlık STALE ('Paylaşıldı' kaybolur, yeniden X'te aç)", async ({ page }) => {
    await mockAndOpen(page, [
      threadFixture({
        publishAttempt: { id: "att-t", state: "prepared", contentHash: "h", staleForCurrentContent: false },
      }),
    ]);
    const card = page.getByTestId("draft-review-card").first();
    await expect(card.getByTestId("cta-mark-published")).toBeVisible();

    // Segment 2'yi düzenle → kaydet (PATCH mock'lu; sunucu sözleşmesi ayrı unit'te).
    const seg1 = card.getByTestId("segment-1").locator("textarea");
    await seg1.fill("Adim 1 guncellendi: kurulum yine tek komut.");
    await card.getByTestId("segments-save").click();
    await expect(card.getByTestId("cta-mark-published")).toHaveCount(0);
    await expect(card.getByTestId("cta-open-x")).toBeVisible(); // yeniden hazırlanmalı
  });

  test("non-thread ready kart regresyonu: CTA 'X'te aç' (ilk-segment dili YOK), segment editörü YOK", async ({ page }) => {
    const ri: ReadinessInput = {
      ...threadRI,
      draftType: "TWEET",
      mode: "tool_spotlight",
      content: "Cursor composer modunu client projesinde test ettim; sonuc net.",
      threadSegments: null,
    };
    await mockAndOpen(page, [
      threadFixture({
        id: "tw-1",
        draftType: "TWEET",
        mode: "tool_spotlight",
        content: ri.content,
        readinessInput: ri,
        readiness: assessReadiness(ri),
        threadSegments: null,
      }),
    ]);
    const card = page.getByTestId("draft-review-card").first();
    await expect(card).toHaveAttribute("data-readiness", "ready");
    await expect(card.getByTestId("cta-open-x")).toHaveText(/^\s*X'te aç\s*$/);
    await expect(card.getByTestId("thread-segment-editor")).toHaveCount(0);
  });

  test("thread kartı 1024–1920 yatay taşma yok", async ({ page }) => {
    await mockAndOpen(page, [threadFixture()]);
    for (const w of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${w}px yatay taşma`).toBeLessThanOrEqual(1);
    }
  });
});
