import { chromium, request, type APIRequestContext, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { signSession } from "../../src/lib/auth/session";

/**
 * E2E global setup (ADR-049: "Sign in with Vercel" OIDC). Gerçek OAuth round-trip
 * CI'da yapılamaz; bunun yerine sunucununkiyle AYNI SESSION_SECRET ile geçerli bir
 * `cemos_session` imzalanır ve storageState'e yazılır → tüm spec'ler kimlikli koşar
 * (proxy session'ı doğrular). access-gate.spec kimliksiz senaryoları test eder.
 *
 * Soğuk Next dev sunucusunda İLK istek route + proxy + modül grafiğini derler →
 * warmup GET + uzun timeout'lu retry (Neon cold-start deterministik absorbe).
 */
export const STORAGE_STATE = "tests/e2e/.auth/state.json";
// Sunucunun webServer.env SESSION_SECRET'i ile AYNI olmalı (playwright.config).
export const E2E_SESSION_SECRET = "e2e-session-secret-not-a-real-key";

const COLD_COMPILE_TIMEOUT = 120_000;
const WARM_ATTEMPTS = 5;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat (test koşusu için yeterli)

/** Sunucuyla aynı sırla imzalı bir session cookie'sini storageState'e yaz. */
function writeAuthedStorageState(): void {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  const expiryMs = Date.now() + SESSION_TTL_MS;
  const token = signSession(expiryMs, E2E_SESSION_SECRET);
  const storage = {
    cookies: [
      {
        name: "cemos_session",
        value: token,
        domain: "localhost",
        path: "/",
        expires: Math.floor(expiryMs / 1000),
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  writeFileSync(STORAGE_STATE, JSON.stringify(storage, null, 2), "utf-8");
}

async function warmup(ctx: APIRequestContext): Promise<void> {
  // /giris allow-list'te; sayfa + proxy derlemesini tetikler.
  for (let i = 0; i < WARM_ATTEMPTS; i++) {
    try {
      const res = await ctx.get("/giris", { timeout: COLD_COMPILE_TIMEOUT });
      if (res.ok()) return;
    } catch {
      /* ilk derleme sürüyor — tekrar dene */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Route'u 200 dönene kadar retry eder → Neon cold-start'ı DETERMİNİSTİK absorbe eder. */
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

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3211";
  writeAuthedStorageState();

  // Kimlikli ctx (imzalı cookie) → gated warmup route'ları 200 döner.
  const ctx = await request.newContext({ baseURL, storageState: STORAGE_STATE });
  await warmup(ctx);
  // Neon compute'u DETERMİNİSTİK uyandır (ADR-049): library/search 200 dönene kadar
  // retry = DB gerçekten uyandı → sonraki route'lar ısınmış Neon'a düşer.
  await warmRoute(ctx, "/api/library/search?limit=1");
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
  await ctx.dispose();

  // Tarayıcı warm-up: HTTP ctx yalnız SUNUCU rotasını derletir; `next dev --webpack`
  // `/`'nin İSTEMCİ chunk'larını ancak gerçek tarayıcı yüklemesi derler → bir kez tam
  // hydrate et (shell-ready) → her testin goto("/")'u ısınmış rotayı bulur.
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
