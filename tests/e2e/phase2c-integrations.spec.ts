import { test, expect, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 2C (ADR-031/032) — Composio Instagram köprüsü + dinamik hesap listesi
 * e2e'si. HERMETİK: /api/integrations + /api/instagram/sync + /api/settings
 * route-mock; canlı Composio/Meta çağrısı ve DB mutasyonu YOK. Kanıtlanan:
 *  - Entegrasyonlar yüzeyi Composio kartını durumlarıyla gösterir (connected /
 *    yapılandırma-gerekli / fallback), read-only etiketi + doğru hesap eşlemesi.
 *  - Manuel sync bounded read-only akışı: loading → sonuç özeti; degraded dürüst.
 *  - Secret hiçbir durumda DOM'a çıkmaz; gereksiz OAuth CTA yok.
 *  - Hesap switcher DB listesinden beslenir (yeni aktif hesap görünür).
 *  - 1024–1920 yatay taşma yok; console app error 0.
 */

type ComposioMockState = {
  configured: boolean;
  missingEnvNames: string[];
  connectionStatus: string;
  fallbackUsed: boolean;
  lastSuccessfulSyncAt: string | null;
  syncCalls: number;
};

const BASE_PROVIDERS = [
  { key: "openrouter", name: "OpenRouter", group: "core", status: "connected", envNames: ["OPENROUTER_API_KEY"] },
  {
    key: "composio",
    name: "Composio · Instagram (read-only)",
    group: "social",
    status: "connected",
    envNames: ["COMPOSIO_CONSUMER_API_KEY", "COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID", "COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE"],
  },
  { key: "meta", name: "Meta / Instagram (direct)", group: "social", status: "missing", envNames: ["META_ACCESS_TOKEN"] },
];

function composioPayload(state: ComposioMockState) {
  return {
    configured: state.configured,
    missingEnvNames: state.missingEnvNames,
    provider: "auto",
    accountHandle: state.configured ? "grafikcem" : "",
    toolkitVersion: "20260708_00",
    readOnly: true,
    binding: state.configured
      ? {
          connectionStatus: state.connectionStatus,
          externalHandle: "grafikcem",
          lastVerifiedAt: new Date().toISOString(),
          lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
          lastErrorClass: state.connectionStatus === "connected" ? "" : "unauthorized",
          lastSyncSummary: state.lastSuccessfulSyncAt
            ? {
                provider: state.fallbackUsed ? "meta" : "composio",
                fallbackUsed: state.fallbackUsed,
                fallbackReason: state.fallbackUsed ? "composio_unauthorized" : null,
                mediaFetched: 5,
                mediaUpserted: 5,
                commentsUpserted: 12,
                insightCaptured: true,
                contentBridged: 5,
              }
            : null,
        }
      : null,
  };
}

async function mockRoutes(page: Page, state: ComposioMockState) {
  await page.route(
    (url) => url.pathname === "/api/integrations",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, providers: BASE_PROVIDERS, composio: composioPayload(state) }),
      });
    }
  );
  await page.route(
    (url) => url.pathname === "/api/instagram/sync",
    async (route) => {
      state.syncCalls++;
      const firstRun = state.syncCalls === 1;
      state.lastSuccessfulSyncAt = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          result: {
            ok: true,
            provider: "composio",
            mode: "auto",
            fallbackUsed: false,
            connectionState: "connected",
            accountHandle: "grafikcem",
            externalUsername: "grafikcem",
            mediaFetched: 5,
            mediaUpserted: 5,
            commentsFetched: 12,
            commentsUpserted: 12,
            // idempotency kanıtı: 2. koşuda insight bugüne zaten yazılmış
            insightCaptured: firstRun,
            contentBridged: 5,
            toolkitVersion: "20260708_00",
            warnings: [],
          },
        }),
      });
    }
  );
  await page.route(
    (url) => url.pathname === "/api/health",
    async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    }
  );
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("Phase 2C — Composio Instagram köprüsü (Entegrasyonlar)", () => {
  test("connected durum: read-only etiket + hesap eşlemesi + son sync sayıları + secret yok", async ({ page }) => {
    const state: ComposioMockState = {
      configured: true,
      missingEnvNames: [],
      connectionStatus: "connected",
      fallbackUsed: false,
      lastSuccessfulSyncAt: new Date().toISOString(),
      syncCalls: 0,
    };
    await mockRoutes(page, state);
    const errors = collectConsoleErrors(page);

    await page.goto("/");
    await selectTab(page, "profile-integrations");

    await expect(page.getByTestId("composio-card")).toBeVisible();
    await expect(page.getByTestId("composio-status")).toContainText("bağlı");
    await expect(page.getByTestId("composio-readonly")).toContainText("salt-okuma");
    await expect(page.getByTestId("composio-external-handle")).toContainText("@grafikcem");
    await expect(page.getByTestId("composio-bound-account")).toContainText("@grafikcem");
    await expect(page.getByTestId("composio-last-sync")).toContainText("medya 5");
    await expect(page.getByTestId("composio-last-sync")).toContainText("yorum 12");
    // ayrı satır: composio + meta iki entegrasyon satırı
    await expect(page.getByTestId("integration-row-composio")).toBeVisible();
    await expect(page.getByTestId("integration-row-meta")).toBeVisible();
    // gereksiz OAuth CTA yok
    await expect(page.getByText(/yeniden bağlan/i)).toHaveCount(0);
    // secret DOM'a çıkmaz
    const html = await page.content();
    expect(html).not.toMatch(/ak_[A-Za-z0-9]{8,}|x-consumer-api-key\s*[:=]\s*\w/);

    expect(errors).toEqual([]);
  });

  test("manuel sync: loading → sonuç özeti; ikinci koşu duplicate üretmez (insight idempotent)", async ({ page }) => {
    const state: ComposioMockState = {
      configured: true,
      missingEnvNames: [],
      connectionStatus: "connected",
      fallbackUsed: false,
      lastSuccessfulSyncAt: null,
      syncCalls: 0,
    };
    await mockRoutes(page, state);

    await page.goto("/");
    await selectTab(page, "profile-integrations");

    await page.getByTestId("composio-sync").click();
    await expect(page.getByTestId("composio-sync-result")).toContainText("Sync tamam (composio)");
    await expect(page.getByTestId("composio-sync-result")).toContainText("medya 5/5");
    await expect(page.getByTestId("composio-sync-result")).toContainText("insight ✓");

    // ikinci koşu: aynı gün insight zaten alınmış — dürüst mesaj
    await page.getByTestId("composio-sync").click();
    await expect(page.getByTestId("composio-sync-result")).toContainText("bugün zaten alınmış");
    expect(state.syncCalls).toBe(2);
  });

  test("yapılandırma-gerekli durumu: eksik env ADLARI açıklanır (değer yok, OAuth CTA yok)", async ({ page }) => {
    const state: ComposioMockState = {
      configured: false,
      missingEnvNames: ["COMPOSIO_CONSUMER_API_KEY", "COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID"],
      connectionStatus: "unverified",
      fallbackUsed: false,
      lastSuccessfulSyncAt: null,
      syncCalls: 0,
    };
    await mockRoutes(page, state);

    await page.goto("/");
    await selectTab(page, "profile-integrations");

    await expect(page.getByTestId("composio-status")).toContainText("yapılandırma gerekli");
    await expect(page.getByTestId("composio-missing-env")).toContainText("COMPOSIO_CONSUMER_API_KEY");
    await expect(page.getByTestId("composio-missing-env")).toContainText("Yeni OAuth akışı GEREKMEZ");
  });

  test("fallback/degraded dürüst gösterilir", async ({ page }) => {
    const state: ComposioMockState = {
      configured: true,
      missingEnvNames: [],
      connectionStatus: "degraded",
      fallbackUsed: true,
      lastSuccessfulSyncAt: new Date().toISOString(),
      syncCalls: 0,
    };
    await mockRoutes(page, state);

    await page.goto("/");
    await selectTab(page, "profile-integrations");

    await expect(page.getByTestId("composio-status")).toContainText("sorunlu");
    await expect(page.getByTestId("composio-fallback-warning")).toContainText("fallback: Meta");
    await expect(page.getByTestId("composio-fallback-warning")).toContainText("composio_unauthorized");
  });

  test("1024–1920 yatay taşma yok", async ({ page }) => {
    const state: ComposioMockState = {
      configured: true,
      missingEnvNames: [],
      connectionStatus: "connected",
      fallbackUsed: false,
      lastSuccessfulSyncAt: new Date().toISOString(),
      syncCalls: 0,
    };
    await mockRoutes(page, state);
    await page.goto("/");
    await selectTab(page, "profile-integrations");
    await expect(page.getByTestId("composio-card")).toBeVisible();

    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `overflow @${width}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Phase 2C — dinamik hesap listesi (ADR-031)", () => {
  test("DB'den gelen yeni aktif hesap switcher'da görünür; client validation otorite değil", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/settings",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accounts: [
              { id: "a1", handle: "grafikcem", isActive: true },
              { id: "a2", handle: "maskulenkod", isActive: true },
              { id: "a3", handle: "pixelspor", isActive: true },
              { id: "a4", handle: "kapali", isActive: false },
            ],
          }),
        });
      }
    );

    await page.goto("/");
    await page.getByTestId("sidebar-account").click();
    await expect(page.getByTestId("account-option-grafikcem")).toBeVisible();
    await expect(page.getByTestId("account-option-maskulenkod")).toBeVisible();
    // yeni DB hesabı dinamik listede
    await expect(page.getByTestId("account-option-pixelspor")).toBeVisible();
    // inaktif hesap listelenmez
    await expect(page.getByTestId("account-option-kapali")).toHaveCount(0);
  });

  test("/api/settings düşerse switcher bootstrap listesiyle ayakta kalır (fail-soft)", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/settings",
      async (route) => {
        await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
    );
    await page.goto("/");
    await page.getByTestId("sidebar-account").click();
    await expect(page.getByTestId("account-option-grafikcem")).toBeVisible();
    await expect(page.getByTestId("account-option-maskulenkod")).toBeVisible();
  });
});
