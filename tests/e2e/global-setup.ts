import { request, type APIRequestContext, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { signSession } from "../../src/lib/auth/session";
import { E2E_SESSION_SECRET, resolveE2eDatabaseUrl, assertEphemeralDbUrl } from "./e2eEnv";

/**
 * E2E global setup (ADR-049: "Sign in with Vercel" OIDC). Gerçek OAuth round-trip
 * CI'da yapılamaz; bunun yerine sunucununkiyle AYNI SESSION_SECRET ile geçerli bir
 * `cemos_session` imzalanır ve storageState'e yazılır → tüm spec'ler kimlikli koşar
 * (proxy session'ı doğrular). access-gate.spec kimliksiz senaryoları test eder.
 *
 * NEON EGRESS CLOSURE: eski GERÇEK-DB warmup'ları KALDIRILDI (library/search,
 * news-pool?limit=100, youtube/videos?limit=50, instagram outliers/watchlist,
 * growth/flow-radar + tam browser hydration). Hepsi HER E2E koşusunda production
 * Neon'a bağlanıp egress yakıyordu. Testler artık hermetik (page.route ile mock) ve
 * DATABASE_URL dummy ephemeral'e zorlu (e2eEnv). Yalnız /giris (DB'siz) warmup
 * route + proxy modül grafiğini derletir; `/` client chunk'ları ilk testin goto'sunda
 * derlenir (retries:1 soğuk-derleme flake'ini yutar).
 */
export const STORAGE_STATE = "tests/e2e/.auth/state.json";
// e2eEnv TEK kaynak (webServer env + imza aynı sırrı paylaşır); geriye dönük re-export.
export { E2E_SESSION_SECRET };

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
  // /giris allow-list'te ve DB'siz; sayfa + proxy derlemesini tetikler (Neon YOK).
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

export default async function globalSetup(config: FullConfig) {
  // FAIL-CLOSED: E2E DATABASE_URL EPHEMERAL (localhost/loopback) değilse HİÇ koşma —
  // production Neon'a kazara test trafiği = egress + veri riski (KIRMIZI ÇİZGİ).
  assertEphemeralDbUrl(resolveE2eDatabaseUrl());

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3211";
  writeAuthedStorageState();

  // Kimlikli ctx (imzalı cookie) → /giris warmup 200 döner (route+proxy derlenir).
  const ctx = await request.newContext({ baseURL, storageState: STORAGE_STATE });
  await warmup(ctx);
  await ctx.dispose();
}
