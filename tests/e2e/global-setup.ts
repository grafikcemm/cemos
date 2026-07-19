import { chromium, request, type APIRequestContext, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * E2E global setup (Faz 1A erişim kapısı). Gerçek kapı E2E'de aktif
 * (webServer.env ACCESS_PASSWORD_HASH). Bir kez login olup storageState yazar;
 * tüm spec'ler `use.storageState` ile kimlikli koşar. access-gate.spec kimliksiz
 * senaryolar için storageState'i temizler.
 *
 * Soğuk Next dev sunucusunda İLK istek route + proxy + modül grafiğini derler ve
 * 30s varsayılan timeout'u aşabilir → warmup GET + uzun timeout'lu retry.
 */
export const STORAGE_STATE = "tests/e2e/.auth/state.json";
export const E2E_PASSWORD = "e2e-test-pass";

const COLD_COMPILE_TIMEOUT = 120_000;
const LOGIN_ATTEMPTS = 5;

async function warmup(ctx: APIRequestContext): Promise<void> {
  // /giris allow-list'te; sayfa + proxy derlemesini login POST'tan önce tetikler.
  for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
    try {
      const res = await ctx.get("/giris", { timeout: COLD_COMPILE_TIMEOUT });
      if (res.ok()) return;
    } catch {
      /* ilk derleme sürüyor — tekrar dene */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Route'u 200 dönene kadar retry eder — best-effort GET'in aksine Neon cold-start'ı
 *  DETERMİNİSTİK absorbe eder (200 = DB sorgusu başarılı = compute uyanık). */
async function warmRoute(ctx: APIRequestContext, url: string, attempts = 5): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await ctx.get(url, { timeout: COLD_COMPILE_TIMEOUT });
      if (res.ok()) return;
    } catch {
      /* soğuk derleme / Neon cold-start — tekrar dene */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function loginWithRetry(ctx: APIRequestContext) {
  let lastErr: unknown;
  for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
    try {
      const res = await ctx.post("/api/auth/login", {
        data: { password: E2E_PASSWORD },
        timeout: COLD_COMPILE_TIMEOUT,
      });
      if (res.ok()) return;
      lastErr = new Error(`E2E login başarısız: ${res.status()} — webServer.env ACCESS_PASSWORD_HASH?`);
    } catch (e) {
      lastErr = e; // soğuk derleme timeout'u — retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3211";
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  const ctx = await request.newContext({ baseURL });
  await warmup(ctx);
  await loginWithRetry(ctx);
  // Kimlikli "/" warmup: proxy oturum cookie'siyle geçer → anasayfa derlenir.
  // (Login formu 303 ile "/"ye döner; ilk tarayıcı isteği soğuk derlemeye
  // takılmasın diye önceden derlenir.)
  // Neon compute'u DETERMİNİSTİK uyandır (Phase 5A / ADR-044): best-effort tek GET
  // yetmedi — patolojik Neon cold-start'ta (10x stress'te 3/10, koşular 1.7-4.0dk)
  // 120s timeout'a düşüp Neon uyanmadan test soğuk sorguya çarpıyordu. library/search
  // 200 dönene kadar retry = DB GERÇEKTEN uyandı (cold → 500) → soğuk-start test
  // kritik yolundan tamamen çıkar. Sonraki route'lar ısınmış Neon'a düşer (tek geçiş).
  await warmRoute(ctx, "/api/library/search?limit=1");
  // Fırsatlar veri-yolu: FirsatlarTab 4 motoru PARALEL çeker; hepsi düşerse allFailed
  // → ErrorState (segment yok). Isınmış Neon'da bu route'lar hızlı derlenir/döner.
  for (const u of [
    "/api/news-pool?limit=100&compact=true&sort=buzz&status=analyzed",
    "/api/youtube/videos?limit=50",
    "/api/instagram/outliers",
    "/api/growth/flow-radar?sort=opportunityScore&status=new",
    "/api/instagram/watchlist",
  ]) {
    await warmRoute(ctx, u);
  }
  await ctx.get("/", { timeout: COLD_COMPILE_TIMEOUT }).catch(() => {});
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();

  // Tarayıcı warm-up (Phase 5A / ADR-044): HTTP ctx yalnız SUNUCU rotasını
  // derletir; `next dev --webpack` `/`'nin İSTEMCİ chunk'larını (eager 17-tab
  // bundle) ancak gerçek bir tarayıcı yüklemesi derler + çalıştırır. Bir kez tam
  // hydrate et (shell-ready sinyali) → her testin `goto("/")`'u ısınmış rotayı
  // bulur; soğuk-derleme gecikmesi test kritik yolundan çıkar → deterministik
  // first-navigation (retry-bump / blind-sleep YOK). 10x soğuk-sunucu stress'te
  // warm-up ÖNCESİ 2/10 nav.ts shell-ready timeout görülmüştü (bkz. ADR-044).
  // Best-effort: warm-up başarısız olsa da testler kendi timeout'larıyla korunur.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ storageState: STORAGE_STATE, baseURL });
    await page.goto("/", { timeout: COLD_COMPILE_TIMEOUT });
    await page
      .locator('[data-shell-ready="true"]')
      .waitFor({ state: "attached", timeout: COLD_COMPILE_TIMEOUT });
  } catch {
    /* soğuk derleme hâlâ sürüyor olabilir — testlerin kendi beklemesi devralır */
  } finally {
    await browser.close();
  }
}
