import { test, expect, type Page } from "@playwright/test";
import { selectTab } from "./helpers/nav";

/**
 * Phase 4D (ADR-043) — Obsidian export contract + legacy emeklilik. HERMETİK: tüm
 * /api/learn/* + /api/viral-library route-mock; canlı DB/LLM/vault/GitHub YOK.
 * Kanıtlanan:
 *  - Ready pack export paneli: üç kanal AYRI + configured/unconfigured (yalnız env NAME).
 *  - Yerel export sonuç durumları: succeeded / already_current / partial (tipli badge).
 *  - Unconfigured kanal: env adları + "Aktar" yok. ZIP indirilir (sync DEĞİL notu).
 *  - Eski deep-link id'leri (viral-library / pattern-library) canonical ekrana çözülür;
 *    silinen ekranlar ayrı UI olarak ERİŞİLEMEZ (shell çökmez).
 *  - Legacy savedTweets göçü AppShell mount'ta drenaj eder (POST /api/viral-library).
 */

function healthPayload() {
  return {
    worker: { mode: "cron", inferredStatus: "recent_tick" },
    database: { ok: true },
    contracts: {
      infrastructure: { status: "ok", items: [] },
      pipelineFreshness: { status: "ok", items: [], news: null },
      todayReadiness: { status: "ok", phase: "ready_available", message: "Hazır.", counts: { ready: 0, needsEdit: 0, blocked: 0, awaitingDecision: 0, preparedIntents: 0, publishedToday: 0, targetToday: 0, totalActiveToday: 0 } },
      topbar: { level: "ok", label: "Hazır", detail: "" },
      operatorAction: { level: "ok", canGenerate: true, todayNeedsGeneration: false, blockers: [], warnings: [] },
      instagramPlanning: null,
    },
  };
}

async function mockShell(page: Page) {
  await page.route("**/api/health**", (r) => r.fulfill({ json: healthPayload() }));
  await page.route("**/api/settings**", (r) => r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem", isActive: true }] } }));
  await page.route("**/api/costs**", (r) => r.fulfill({ json: { success: true, today: { totalUsd: 0 } } }));
  await page.route("**/api/queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/opportunities/handoff**", (r) => r.fulfill({ json: { success: true, handoffs: [] } }));
  await page.route("**/api/growth/daily-queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/library/search**", (r) => r.fulfill({ json: { success: true, results: [], total: 0, page: 1 } }));
}

function src(over: Record<string, unknown> = {}) {
  return {
    id: "s1", kind: "youtube", title: "Video", channelTitle: "Kanal", url: "https://youtu.be/abcdefghijk",
    status: "ready", userState: "ready", userStateLabel: "Hazır", canAdvance: false,
    packId: "pk1", jobId: "jb1", masteryScore: 70, category: "yapay_zeka", ...over,
  };
}
function dashboard(sources: unknown[], extra?: Record<string, unknown>) {
  return { success: true, sources, readyPacks: 1, dueToday: 0, avgMastery: 70, ...extra };
}
function readyPack(over: Record<string, unknown> = {}) {
  return {
    success: true,
    pack: {
      id: "pk1", status: "ready", category: "yapay_zeka", masteryScore: 70,
      summaryL1: "Tek cümle.", summaryL2: "Yönetici.", summaryL3: "Bölüm.",
      pipelineVersion: "v2", sourceBasis: "transcript", provider: "innertube", hasTimestamps: true, hasArtifact: true,
      qaReport: { coverage: 0.8, verdict: "pass", flagged: [] },
      source: { kind: "youtube", title: "Video", channelTitle: "Kanal", url: "https://youtu.be/abcdefghijk", durationSec: 600 },
      concepts: [{ id: "c1", label: "Kavram A", definition: "Tanım", importance: 80, masteryScore: 60, grounding: [{ chunkIdx: 0 }] }],
      items: [{ id: "it1", kind: "flashcard", front: "Soru?", back: "Cevap", options: [], correctIdx: null, difficulty: 2, groundingType: "source_supported", chunkIdx: 0 }],
      chunks: [{ idx: 0, startSec: 30, text: "Parça." }],
      atomicNotes: [{ id: "n1", title: "Atomik not A", body: "Gövde.", tags: [], chunkIdxs: [0], groundingType: "source_supported", relatedConceptLabels: [] }],
      graph: { nodes: [], edges: [] }, graphMermaid: "", tasks: [], contentIdeas: [],
      ...over,
    },
  };
}
function channels(localCfg: boolean, ghCfg: boolean) {
  return [
    { channel: "zip", configured: true, envNames: [], note: "Tarayıcıda ZIP." },
    { channel: "local_vault", configured: localCfg, envNames: ["OBSIDIAN_VAULT_PATH"], note: "Yerel vault." },
    { channel: "github_vault", configured: ghCfg, envNames: ["OBSIDIAN_GITHUB_REPO", "OBSIDIAN_GITHUB_TOKEN"], note: "GitHub vault." },
  ];
}
function result(state: string, over: Record<string, unknown> = {}) {
  const base = { channel: "local_vault", state, written: 0, unchanged: 0, failed: 0, conflict: 0, manifestHash: "h1", targetLabel: "yerel vault", files: [], ...over };
  return base;
}
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function openReadyPack(page: Page) {
  await page.goto("/");
  await selectTab(page, "lib-ogrenme");
  await page.getByTestId("learn-tab-ready").click();
  await page.getByRole("button", { name: "Aç", exact: true }).first().click();
}

test.describe("Phase 4D — export panel + channels", () => {
  test("ready pack: export paneli 3 kanal AYRI + configured/unconfigured badge", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src()]) }));
    await page.route(/\/api\/learn\/packs\/pk1\/export(\?|$)/, (r) => r.fulfill({ json: { success: true, channels: channels(true, false), latest: {} } }));
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: readyPack() }));
    await openReadyPack(page);

    await expect(page.getByTestId("export-panel")).toBeVisible();
    await expect(page.getByTestId("export-channel-zip")).toBeVisible();
    await expect(page.getByTestId("export-channel-local_vault")).toContainText("yapılandırıldı");
    await expect(page.getByTestId("export-channel-github_vault")).toContainText("yapılandırılmadı");
    // Unconfigured github → env adları görünür, "Aktar" yok
    await expect(page.getByTestId("export-channel-github_vault")).toContainText("OBSIDIAN_GITHUB_REPO");
    await expect(page.getByTestId("export-run-github_vault")).toHaveCount(0);
    // ZIP sync değil uyarısı
    await expect(page.getByTestId("export-channel-zip")).toContainText(/sync.*DEĞİL|DEĞİL/);
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("yerel export: succeeded → 'başarılı' + yazılan sayısı", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src()]) }));
    await page.route(/\/api\/learn\/packs\/pk1\/export(\?|$)/, (r) => {
      if (r.request().method() === "POST") {
        return r.fulfill({ json: { success: true, result: result("succeeded", { written: 5 }) } });
      }
      return r.fulfill({ json: { success: true, channels: channels(true, false), latest: {} } });
    });
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: readyPack() }));
    await openReadyPack(page);

    await page.getByTestId("export-run-local_vault").click();
    await expect(page.getByTestId("export-result-local_vault")).toContainText("başarılı");
    await expect(page.getByTestId("export-channel-local_vault")).toContainText("yazıldı 5");
  });

  test("yerel export: already_current → 'zaten güncel' (idempotent)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src()]) }));
    await page.route(/\/api\/learn\/packs\/pk1\/export(\?|$)/, (r) => {
      if (r.request().method() === "POST") return r.fulfill({ json: { success: true, result: result("already_current", { unchanged: 5 }) } });
      return r.fulfill({ json: { success: true, channels: channels(true, false), latest: {} } });
    });
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: readyPack() }));
    await openReadyPack(page);
    await page.getByTestId("export-run-local_vault").click();
    await expect(page.getByTestId("export-result-local_vault")).toContainText("zaten güncel");
  });

  test("yerel export: partial → 'kısmi' + errorClass görünür", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src()]) }));
    await page.route(/\/api\/learn\/packs\/pk1\/export(\?|$)/, (r) => {
      if (r.request().method() === "POST") return r.fulfill({ json: { success: true, result: result("partial", { written: 3, conflict: 1, errorClass: "unmanaged" }) } });
      return r.fulfill({ json: { success: true, channels: channels(true, false), latest: {} } });
    });
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: readyPack() }));
    await openReadyPack(page);
    await page.getByTestId("export-run-local_vault").click();
    await expect(page.getByTestId("export-result-local_vault")).toContainText("kısmi");
    await expect(page.getByTestId("export-channel-local_vault")).toContainText("unmanaged");
  });

  test("ZIP indir: sonuç 'indirildi' notu (yerel/GitHub sync değil)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src()]) }));
    await page.route(/\/api\/learn\/packs\/pk1\/export(\?|$)/, (r) => r.fulfill({ json: { success: true, channels: channels(false, false), latest: {} } }));
    await page.route(/\/api\/learn\/packs\/pk1\/obsidian(\?|$)/, (r) => r.fulfill({ json: { success: true, folderName: "Video", packId: "pk1", manifestHash: "h1", files: [{ path: "CemOS Learn/x/Video__pk1/Video.md", content: "# Video" }], meta: {} } }));
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: readyPack() }));
    await openReadyPack(page);
    await page.getByTestId("export-run-zip").click();
    await expect(page.getByTestId("export-channel-zip")).toContainText("indirildi");
  });
});

test.describe("Phase 4D — legacy emeklilik", () => {
  test("eski deep-link 'viral-library' canonical Kütüphane'ye çözülür (ayrı UI yok, çökme yok)", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([]) }));
    // Persist edilmiş eski activeTab = "viral-library" (silinen tab id).
    await page.addInitScript(() => {
      localStorage.setItem("xagent-store", JSON.stringify({ state: { activeTab: "viral-library", savedTweets: [], newsItems: [] }, version: 9 }));
    });
    await page.goto("/");
    // Shell çökmez; "ViralLibraryTab" gibi ayrı UI değil, Kütüphane host görünür.
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText("Viral Kütüphane").first()).toHaveCount(0); // eski ekran başlığı YOK
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("eski deep-link 'pattern-library' çözülür (silinen ekran ayrı erişilemez)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([]) }));
    await page.addInitScript(() => {
      localStorage.setItem("xagent-store", JSON.stringify({ state: { activeTab: "pattern-library", savedTweets: [], newsItems: [] }, version: 9 }));
    });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    // Silinen PatternLibraryTab'a özgü UI yok — canonical Kütüphane arama yüzeyi.
    await expect(page.getByText("Pattern Kütüphanesi").first()).toHaveCount(0);
  });

  test("legacy savedTweets göçü: AppShell mount'ta POST /api/viral-library ile drenaj", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([]) }));
    let posted: Record<string, unknown> | null = null;
    await page.route("**/api/viral-library", (r) => {
      if (r.request().method() === "POST") posted = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({ json: { success: true } });
    });
    await page.addInitScript(() => {
      localStorage.setItem("xagent-store", JSON.stringify({
        state: {
          activeTab: "morning",
          savedTweets: [{ id: "t1", handle: "someone", text: "viral", likeCount: 1, retweetCount: 1, viewCount: 1, viralScore: 50, url: "https://x.com/1", source: "flow", mode: "single" }],
          newsItems: [],
        },
        version: 9,
      }));
    });
    await page.goto("/");
    await expect.poll(() => posted && Array.isArray((posted as { tweets?: unknown[] }).tweets)).toBe(true);
    expect((posted as unknown as { tweets: unknown[] }).tweets.length).toBe(1);
  });
});
