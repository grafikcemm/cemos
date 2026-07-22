import { test, expect, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Faz 2A (ADR-028) — Fırsat → hedef yüzey KALICI aktarım e2e'si. HERMETİK:
 * tüm motor + handoff API'leri route-mock; canlı DB'ye mutasyon yok, ücretli
 * çağrı yok. Kanıtlanan sözleşme:
 *  - Üç eylem server-persisted handoff yaratır; hedef yüzeyde "Fırsattan geldi".
 *  - Reload sonrası pending handoff geri yüklenir (server kaynağı).
 *  - Plan: onaydan ÖNCE hiçbir slot yazılmaz; onay TEK kayıt üretir.
 *  - Generate blocked-external: fırsat kaybolmaz, sahte taslak yok, Türkçe not.
 *  - Seri: kullanıcı hedef seri seçmeden ilişki kurulmaz.
 */

type MockHandoff = {
  id: string;
  accountId: string;
  action: "generate" | "plan" | "series";
  status: "pending" | "consumed" | "cancelled";
  sourceKind: "news" | "youtube" | "radar" | "discovery";
  sourceId: string;
  sourcePlatform: string;
  title: string;
  topicSeed: string;
  whyNow: string;
  whyNowDetail: string;
  rawTab: string;
  suggestedPlatform: string;
  score: number;
  curationMethod: string;
  blockedReason: string | null;
  resultQueueItemId: string | null;
  resultRef: string | null;
  createdAt: string;
};

type MockState = {
  handoffs: MockHandoff[];
  consumePlanCalls: number;
  consumeSeriesCalls: number;
  generateCalls: number;
  nextId: number;
};

// useOpportunities mapper alan adlarıyla birebir (RawNews/RawRadar).
const NEWS_ITEM = {
  id: "news-e2e-1",
  trTitle: "AI görsel tespiti yaygınlaşıyor",
  trSummary: "Tespit araçları yaygınlaşıyor.",
  tweetAngle: "Tasarımcılar için pratik açı",
  buzzScore: 82,
  sourceVerification: "multi_source_confirmed",
  fetchedAt: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  newsSource: { name: "TechCrunch" },
};

const RADAR_ITEM = {
  contentItemId: "radar-e2e-1",
  author: "rakip_hesap",
  caption: "Rakip reel outlier konsepti",
  multiplier: 3.2,
  insufficient: false,
};

async function mockEngines(page: Page, state: MockState) {
  // Yalnız TAM /api/settings — alt yollar (operator-readiness vb.) gerçek kalır.
  await page.route((url) => url.pathname === "/api/settings", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({
      json: { success: true, accounts: [{ id: "acc-e2e", handle: "grafikcem" }], schedule: null },
    });
  });
  await page.route("**/api/news-pool**", (route) =>
    route.fulfill({ json: { success: true, items: [NEWS_ITEM] } })
  );
  await page.route("**/api/youtube/videos**", (route) =>
    route.fulfill({ json: { success: true, configured: false, videos: [] } })
  );
  await page.route("**/api/instagram/outliers**", (route) =>
    route.fulfill({ json: { success: true, items: [RADAR_ITEM] } })
  );
  await page.route("**/api/growth/flow-radar**", (route) =>
    route.fulfill({ json: { success: true, candidates: [] } })
  );

  // Handoff API — stateful hermetik mock (server-persist simülasyonu).
  await page.route("**/api/opportunities/handoff**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const parts = url.pathname.split("/").filter(Boolean); // api opportunities handoff [id] [op]

    if (parts.length === 3 && method === "GET") {
      const action = url.searchParams.get("action");
      const status = url.searchParams.get("status") ?? "pending";
      const resultRef = url.searchParams.get("resultRef");
      const rows = state.handoffs.filter(
        (h) =>
          (!action || h.action === action) &&
          h.status === status &&
          (!resultRef || h.resultRef === resultRef)
      );
      return route.fulfill({ json: { success: true, handoffs: rows } });
    }

    if (parts.length === 3 && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, string | number>;
      const existing = state.handoffs.find(
        (h) => h.action === body.action && h.sourceId === body.sourceId && h.status !== "cancelled"
      );
      if (existing) return route.fulfill({ json: { success: true, handoff: existing, reused: true } });
      const h: MockHandoff = {
        id: `h-${state.nextId++}`,
        accountId: String(body.accountId),
        action: body.action as MockHandoff["action"],
        status: "pending",
        sourceKind: body.sourceKind as MockHandoff["sourceKind"],
        sourceId: String(body.sourceId),
        sourcePlatform: String(body.sourcePlatform ?? ""),
        title: String(body.title),
        topicSeed: String(body.topicSeed ?? ""),
        whyNow: String(body.whyNow ?? ""),
        whyNowDetail: String(body.whyNowDetail ?? ""),
        rawTab: String(body.rawTab ?? ""),
        suggestedPlatform: String(body.suggestedPlatform ?? "X"),
        score: Number(body.score ?? 0),
        curationMethod: "deterministic",
        blockedReason: null,
        resultQueueItemId: null,
        resultRef: null,
        createdAt: new Date().toISOString(),
      };
      state.handoffs.push(h);
      return route.fulfill({ status: 201, json: { success: true, handoff: h, reused: false } });
    }

    const id = parts[3];
    const h = state.handoffs.find((x) => x.id === id);
    if (!h) return route.fulfill({ status: 404, json: { success: false, error: "Fırsat aktarımı bulunamadı." } });

    if (parts.length === 4 && method === "PATCH") {
      if (h.status === "pending") h.status = "cancelled";
      return route.fulfill({ json: { success: true, handoff: h } });
    }
    if (parts[4] === "generate" && method === "POST") {
      state.generateCalls++;
      if (h.status === "consumed") {
        return route.fulfill({ json: { success: true, alreadyConsumed: true, queueItemId: h.resultQueueItemId } });
      }
      // Bu spec'te üretim BLOCKED-EXTERNAL senaryosu: sahte taslak yok.
      h.blockedReason = "budget:provider_key_limit";
      return route.fulfill({
        json: {
          success: true,
          blocked: true,
          reason: "budget:provider_key_limit",
          message: "Üretim şu an engelli (OpenRouter kredi/bütçe onayı yok). Fırsat kaybolmadı.",
        },
      });
    }
    if (parts[4] === "consume-plan" && method === "POST") {
      state.consumePlanCalls++;
      if (h.status === "consumed") {
        return route.fulfill({ json: { success: true, alreadyConsumed: true, slotId: h.resultRef } });
      }
      h.status = "consumed";
      h.resultRef = "slot-e2e-1";
      return route.fulfill({ status: 201, json: { success: true, slotId: "slot-e2e-1", alreadyConsumed: false } });
    }
    if (parts[4] === "consume-series" && method === "POST") {
      state.consumeSeriesCalls++;
      const body = route.request().postDataJSON() as { seriesKey: string };
      if (h.status === "consumed") {
        return route.fulfill({ json: { success: true, alreadyConsumed: true, seriesKey: h.resultRef } });
      }
      h.status = "consumed";
      h.resultRef = body.seriesKey;
      return route.fulfill({ status: 201, json: { success: true, seriesKey: body.seriesKey, alreadyConsumed: false } });
    }
    return route.fulfill({ status: 405, json: { success: false, error: "yöntem yok" } });
  });

  // Hedef yüzey yardımcı uçları (Takvim/Seriler/Bugün gövdeleri).
  await page.route("**/api/reels/plan**", (route) =>
    route.fulfill({ json: { success: true, plan: { slots: [] }, staleFlags: [] } })
  );
  await page.route("**/api/queue?**", (route) => route.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/reels/dossier**", (route) => route.fulfill({ json: { success: true, dossiers: [] } }));
  await page.route("**/api/series", (route) =>
    route.fulfill({
      json: {
        success: true,
        series: [
          {
            id: "series-1",
            accountId: "acc-e2e",
            seriesKey: "best_ai_tools",
            name: "Best AI Tools",
            platform: "instagram",
            format: "carousel",
            purpose: "araç tanıtımı",
            audience: "tasarımcılar",
            objective: "save",
            slideCountRange: "6-8",
            coverFormula: "",
            ctaFormula: "",
            slideArchetypesJson: "[]",
            variableElementsJson: "[]",
            bannedRepetitionJson: "[]",
            captionDnaJson: "{}",
            hashtagDnaJson: "[]",
            pastTopicsJson: "[]",
            isActive: true,
            version: 1,
            promptVersion: "v1",
          },
        ],
      },
    })
  );
  await page.route("**/api/growth/daily-queue**", (route) =>
    route.fulfill({ json: { success: true, items: [] } })
  );
}

function freshState(): MockState {
  return { handoffs: [], consumePlanCalls: 0, consumeSeriesCalls: 0, generateCalls: 0, nextId: 1 };
}

test.describe("Fırsat aktarımı (Faz 2A, hermetik)", () => {
  test("İçerik üret → Bugün'de gerçek handoff bandı; blocked-external'da fırsat KAYBOLMAZ", async ({ page }) => {
    const state = freshState();
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByTestId("opp-generate-news-news-e2e-1")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("opp-generate-news-news-e2e-1").click();
    // Handoff persist edildi + Bugün açıldı + band görünür.
    await expect(page.getByTestId("handoff-band-h-1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("handoff-band-h-1")).toContainText("Fırsattan geldi");
    await expect(page.getByTestId("handoff-band-h-1")).toContainText("AI görsel tespiti");

    // Üretim dene → blocked-external: sahte taslak yok, band + Türkçe engel notu kalır.
    await page.getByTestId("handoff-generate-h-1").click();
    await expect(page.getByTestId("handoff-blocked-note")).toBeVisible();
    await expect(page.getByTestId("handoff-blocked-note")).toContainText("fırsat kaybolmadı");
    expect(state.handoffs[0].status).toBe("pending"); // tüketilmedi
    expect(state.generateCalls).toBe(1);
  });

  test("reload persistence: pending handoff sayfa yenilenince geri gelir", async ({ page }) => {
    const state = freshState();
    state.handoffs.push({
      id: "h-77",
      accountId: "acc-e2e",
      action: "generate",
      status: "pending",
      sourceKind: "news",
      sourceId: "news-e2e-1",
      sourcePlatform: "",
      title: "AI görsel tespiti yaygınlaşıyor",
      topicSeed: "AI görsel tespiti",
      whyNow: "teyitli",
      whyNowDetail: "",
      rawTab: "news-pool",
      suggestedPlatform: "X",
      score: 82,
      curationMethod: "deterministic",
      blockedReason: null,
      resultQueueItemId: null,
      resultRef: null,
      createdAt: new Date().toISOString(),
    });
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "morning");
    await expect(page.getByTestId("handoff-band-h-77")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByTestId("handoff-band-h-77")).toBeVisible({ timeout: 20_000 });
  });

  test("Plana ekle → prefilled Takvim paneli; onay ÖNCESİ kayıt yok, onay SONRASI tek kayıt", async ({ page }) => {
    const state = freshState();
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByTestId("opp-plan-news-news-e2e-1")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("opp-plan-news-news-e2e-1").click();

    // Takvim açıldı; band görünür; drawer prefilled.
    await expect(page.getByTestId("handoff-band-h-1")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("handoff-place-h-1").click();
    await expect(page.getByTestId("handoff-plan-drawer")).toBeVisible();
    await expect(page.getByTestId("handoff-plan-drawer")).toContainText("AI görsel tespiti");
    expect(state.consumePlanCalls).toBe(0); // onaydan önce HİÇBİR kayıt yok

    // İptal → tüketilmiş sayılmaz.
    await page.keyboard.press("Escape");
    expect(state.handoffs[0].status).toBe("pending");

    // Onay → tek kayıt.
    await page.getByTestId("handoff-place-h-1").click();
    await page.getByTestId("handoff-plan-confirm").click();
    await expect(page.getByTestId("handoff-band-h-1")).toHaveCount(0, { timeout: 10_000 });
    expect(state.consumePlanCalls).toBe(1);
    expect(state.handoffs[0].status).toBe("consumed");
    expect(state.handoffs[0].resultRef).toBe("slot-e2e-1");
  });

  test("Seriye ekle → seri seçimi; onaysız ilişki yok; aday konu listesi dolar", async ({ page }) => {
    const state = freshState();
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    // Radar fırsatında "Seriye ekle".
    await expect(page.getByTestId("opp-series-radar-radar-e2e-1")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("opp-series-radar-radar-e2e-1").click();

    await expect(page.getByTestId("handoff-band-h-1")).toBeVisible({ timeout: 20_000 });
    expect(state.consumeSeriesCalls).toBe(0); // seçim/onay öncesi ilişki YOK

    await page.getByTestId("handoff-series-confirm-h-1").click();
    await expect(page.getByTestId("handoff-band-h-1")).toHaveCount(0, { timeout: 10_000 });
    expect(state.consumeSeriesCalls).toBe(1);
    expect(state.handoffs[0].resultRef).toBe("best_ai_tools");

    // Kalıcı ilişki DNA kartının altında aday konu olarak görünür.
    await expect(page.getByTestId("series-candidate-topics")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("series-candidate-topics")).toContainText("Rakip Reel outlier");
  });

  test("back/forward + tekrar tık: duplicate handoff oluşmaz (idempotent create)", async ({ page }) => {
    const state = freshState();
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByTestId("opp-generate-news-news-e2e-1")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("opp-generate-news-news-e2e-1").click();
    await expect(page.getByTestId("handoff-band-h-1")).toBeVisible({ timeout: 20_000 });

    // Geri/ileri (SPA — sekme state'i store'da; history tek girişse about:blank'a
    // düşebilir → ileri alıp uygulamada kal) → Fırsatlar'a dön → tekrar tıkla.
    await page.goBack().catch(() => undefined);
    if (page.url() === "about:blank") await page.goForward().catch(() => undefined);
    await page.getByTestId("sidebar-area-plan").waitFor({ state: "visible", timeout: 20_000 });
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByTestId("opp-generate-news-news-e2e-1")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("opp-generate-news-news-e2e-1").click();
    await expect(page.getByTestId("handoff-band-h-1")).toBeVisible({ timeout: 20_000 });

    // Idempotent: hâlâ TEK handoff.
    expect(state.handoffs.filter((h) => h.action === "generate")).toHaveLength(1);
  });

  test("desktop 1024–1920: handoff bandıyla yatay taşma yok", async ({ page }) => {
    const state = freshState();
    state.handoffs.push({
      id: "h-90",
      accountId: "acc-e2e",
      action: "generate",
      status: "pending",
      sourceKind: "news",
      sourceId: "news-e2e-1",
      sourcePlatform: "",
      title: "Uzun başlıklı bir fırsat örneği — taşma denetimi için yeterince uzun bir metin",
      topicSeed: "seed",
      whyNow: "teyitli + taze + dış popülerlik sinyali güçlü",
      whyNowDetail: "HN + Reddit eşzamanlı yükseliş",
      rawTab: "news-pool",
      suggestedPlatform: "X",
      score: 82,
      curationMethod: "deterministic",
      blockedReason: "budget:provider_key_limit",
      resultQueueItemId: null,
      resultRef: null,
      createdAt: new Date().toISOString(),
    });
    await mockEngines(page, state);
    await page.goto("/");
    await selectTab(page, "morning");
    await expect(page.getByTestId("handoff-band-h-90")).toBeVisible({ timeout: 20_000 });
    for (const w of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${w}px yatay taşma`).toBeLessThanOrEqual(1);
    }
  });
});
