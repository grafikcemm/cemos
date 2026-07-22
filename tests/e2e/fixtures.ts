import { test as base, expect, type Page } from "@playwright/test";

/**
 * Hermetik E2E fixture — Neon egress closure (KIRMIZI ÇİZGİ).
 *
 * Her testin `page`'ine (a) shell'in mount'ta çağırdığı DB-bağlı uçların
 * DETERMİNİSTİK yanıtlarını ve (b) diğer TÜM `/api` çağrıları için benign bir
 * catch-all kurar → hiçbir istek dummy/ephemeral DB'ye düşmez, shell çökmeden
 * render eder. Spec'ler kendi route'larını SONRA kaydeder; Playwright son kaydı
 * kazandırır → fixture baseline'ı kolayca ezer (ör. spec kendi api/learn route'unu).
 *
 * Eskiden shell'i render eden spec'ler mock'suzdu ve global-setup gerçek Neon'u
 * warmup'lıyordu; bu fixture o gerçek-DB bağımlılığını ortadan kaldırır.
 */

/** Shell topbar/Bugün/Sistem'in tükettiği sağlık sözleşmesi (üç sözleşme + topbar). */
export function healthPayload() {
  return {
    worker: { mode: "cron", inferredStatus: "recent_tick" },
    database: { ok: true },
    contracts: {
      infrastructure: { status: "ok", items: [] },
      pipelineFreshness: { status: "ok", items: [], news: null },
      todayReadiness: {
        status: "ok",
        phase: "ready_available",
        message: "Hazır.",
        counts: {
          ready: 0,
          needsEdit: 0,
          blocked: 0,
          awaitingDecision: 0,
          preparedIntents: 0,
          publishedToday: 0,
          targetToday: 0,
          totalActiveToday: 0,
        },
      },
      topbar: { level: "ok", label: "Hazır", detail: "" },
      operatorAction: { level: "ok", canGenerate: true, todayNeedsGeneration: false, blockers: [], warnings: [] },
      instagramPlanning: null,
    },
  };
}

async function installHermeticShell(page: Page): Promise<void> {
  // (1) Catch-all EN ÖNCE (en düşük öncelik): unmock'lu her /api çağrısı benign boş
  //     zarf alır → dummy DB'ye HİÇ düşmez. Spec'ler kendi route'uyla (sonra kayıt) ezer.
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, items: [], data: null }),
    }),
  );
  // (2) Shell bootstrap uçları — doğru şekilli deterministik yanıt (mockShell parity).
  await page.route("**/api/health**", (r) => r.fulfill({ json: healthPayload() }));
  // Her İKİ kanal da (DEFAULT_CHANNELS) — Sidebar /api/settings accounts'ını
  // `isActive !== false` süzer; ikisi de isActive:true olmalı yoksa switcher'da
  // görünmez (isActive = "hesap kullanılabilir", aktif SEÇİM ayrı türetilir).
  await page.route("**/api/settings**", (r) =>
    r.fulfill({
      json: {
        success: true,
        accounts: [
          { id: "acc-1", handle: "grafikcem", isActive: true },
          { id: "acc-2", handle: "maskulenkod", isActive: true },
        ],
      },
    }),
  );
  await page.route("**/api/costs**", (r) => r.fulfill({ json: { success: true, today: { totalUsd: 0 } } }));
  await page.route("**/api/queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/opportunities/handoff**", (r) => r.fulfill({ json: { success: true, handoffs: [] } }));
  await page.route("**/api/growth/daily-queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
}

/**
 * "console app error 0" sözleşmesi YALNIZ uygulama hatalarını sayar. Aşağıdakiler
 * `next dev --webpack` E2E dev sunucusuna özgü FRAMEWORK transient'leridir (APP hatası
 * DEĞİL; production build'de OLUŞMAZ) — sayımdan düşülür:
 *  - `favicon`: dev'de favicon 404.
 *  - `Manifest file is empty`: webpack build-manifest yeniden yazılırken gelen istek
 *    (hermetik hız bunu daha sık tetikler; app kodu değil).
 *  - `Router action dispatched before initialization`: Next App Router hydration-init
 *    yarışı (app kodunda client router aksiyonu YOK — çerçeve içi, geçici).
 */
const FRAMEWORK_CONSOLE_NOISE = [
  "favicon",
  "Manifest file is empty",
  "Router action dispatched before initialization",
];
export function appConsoleErrors(errors: readonly string[]): string[] {
  return errors.filter((e) => !FRAMEWORK_CONSOLE_NOISE.some((n) => e.includes(n)));
}

/** Hermetik shell baseline'ı otomatik kuran genişletilmiş `test`. Spec'ler bunu
 *  `@playwright/test` yerine import eder; `expect`/`Page` buradan re-export edilir. */
export const test = base.extend({
  // 2. parametre Playwright'ın fixture "provide" fonksiyonu (React `use` hook'u DEĞİL);
  // eslint react-hooks/rules-of-hooks yanlış-pozitifinden kaçınmak için `run` adlandırıldı.
  page: async ({ page }, run) => {
    await installHermeticShell(page);
    await run(page);
  },
});

export { expect };
export type { Page } from "@playwright/test";
