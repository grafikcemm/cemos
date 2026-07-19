import { test, expect, type Page } from "@playwright/test";
import { selectTab } from "./helpers/nav";

/**
 * Phase 4C (ADR-042) — Learn intake → grounded Pack → atomik not / zihin haritası /
 * görev / içerik fikri / review. HERMETİK: tüm /api/learn/* route-mock; canlı DB/LLM YOK.
 * Kanıtlanan:
 *  - Üç AÇIK kaynak seçeneği (YouTube / manuel / NotebookLM) + NotebookLM "doğrulanmış transkript değil" uyarısı.
 *  - Processing: resume GET + gerçek notes/graph/tasks/content_ideas aşamaları görünür.
 *  - transcript_required → manuel yapıştırma ile devam.
 *  - Ready Pack: atomik notlar, zihin haritası (ilişkiler), uygula (görev+fikir), kaynak provenance.
 *  - NotebookLM paket: summary-basis uyarısı + "özet" grounding (zaman damgası yok).
 *  - Review: attempt idempotencyKey gönderilir.
 *  - Kanonik durumlar (budget_blocked / needs_review) ayrı; 1024–1920 taşma 0; console error 0.
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
}

function src(over: Record<string, unknown>) {
  return {
    id: "s1", kind: "youtube", title: "Video", channelTitle: "Kanal", url: "https://youtu.be/abcdefghijk",
    status: "ready", userState: "ready", userStateLabel: "Hazır", canAdvance: false,
    packId: "pk1", jobId: "jb1", masteryScore: 70, category: "yapay_zeka", ...over,
  };
}

function dashboard(sources: unknown[], extra?: Record<string, unknown>) {
  return { success: true, sources, readyPacks: 1, dueToday: 0, avgMastery: 70, ...extra };
}

function transcriptPack(over: Record<string, unknown> = {}) {
  return {
    success: true,
    pack: {
      id: "pk1", status: "ready", category: "yapay_zeka", masteryScore: 70,
      summaryL1: "Tek cümle özet.", summaryL2: "Yönetici özeti.", summaryL3: "Bölüm bölüm.",
      pipelineVersion: "v2", sourceBasis: "transcript", provider: "innertube", hasTimestamps: true, hasArtifact: true,
      qaReport: { coverage: 0.8, verdict: "pass", flagged: [] },
      source: { kind: "youtube", title: "Video", channelTitle: "Kanal", url: "https://youtu.be/abcdefghijk", durationSec: 600 },
      concepts: [{ id: "c1", label: "Kavram A", definition: "Tanım", importance: 80, masteryScore: 60, grounding: [{ chunkIdx: 0 }] }],
      items: [{ id: "it1", kind: "flashcard", front: "Soru?", back: "Cevap", options: [], correctIdx: null, difficulty: 2, groundingType: "source_supported", chunkIdx: 0 }],
      chunks: [{ idx: 0, startSec: 30, text: "Transkript parçası." }],
      atomicNotes: [{ id: "n1", title: "Atomik not A", body: "Tek fikir gövdesi.", tags: ["ai"], chunkIdxs: [0], groundingType: "source_supported", relatedConceptLabels: ["Kavram A"] }],
      graph: { nodes: [{ id: "c1", label: "Kavram A", kind: "concept" }, { id: "n1", label: "Atomik not A", kind: "note" }], edges: [{ source: "c1", target: "n1", relation: "örnek", groundingType: "inference" }] },
      graphMermaid: "graph TD\n  n_c1[\"Kavram A\"]\n  n_n1[\"Atomik not A\"]\n  n_c1 -->|örnek| n_n1",
      tasks: [{ id: "t1", title: "Uygulama görevi", why: "Neden", steps: ["Adım 1", "Adım 2"], chunkIdxs: [0], groundingType: "inference", status: "open" }],
      contentIdeas: [{ id: "i1", title: "İçerik fikri", angle: "Açı", hook: "Kanca cümlesi", format: "reel", sourceConceptLabels: ["Kavram A"], groundingType: "inference" }],
      ...over,
    },
  };
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 4C — Learn intake + source modes", () => {
  test("üç açık kaynak seçeneği + NotebookLM 'doğrulanmış transkript değil' uyarısı", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({})]) }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");

    await expect(page.getByTestId("add-mode-youtube")).toBeVisible();
    await expect(page.getByTestId("add-mode-manual_transcript")).toBeVisible();
    await expect(page.getByTestId("add-mode-notebooklm_summary")).toBeVisible();

    await page.getByTestId("add-mode-notebooklm_summary").click();
    await expect(page.getByText(/doğrulanmış transkripti sayılmaz/)).toBeVisible();
    await expect(page.getByTestId("notebooklm-text")).toBeVisible();

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("kanonik durumlar ayrı: budget_blocked + needs_review + ready rozetleri", async ({ page }) => {
    await mockShell(page);
    const sources = [
      src({ id: "s1", userState: "ready", userStateLabel: "Hazır" }),
      src({ id: "s2", userState: "budget_blocked", userStateLabel: "Bütçe doldu", status: "processing", packId: null, jobId: "jb2" }),
      src({ id: "s3", userState: "needs_review", userStateLabel: "İnceleme gerekli", status: "processing", packId: "pk3", jobId: "jb3" }),
    ];
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard(sources) }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    // "Öğreniliyor" sekmesinde budget_blocked + needs_review
    await page.getByTestId("learn-tab-learning").click();
    await expect(page.getByText("Bütçe doldu")).toBeVisible();
    await expect(page.getByText("İnceleme gerekli")).toBeVisible();
  });
});

test.describe("Phase 4C — Ready Pack", () => {
  test("transcript paket: atomik notlar + zihin haritası + uygula + kaynak (timestamp)", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({})]) }));
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: transcriptPack() }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    // Hazır bilgi sekmesi → Aç
    await page.getByTestId("learn-tab-ready").click();
    await page.getByRole("button", { name: "Aç", exact: true }).first().click();

    // Atomik notlar
    await page.getByTestId("subnav-tab-notlar").click();
    await expect(page.getByTestId("atomic-note").first()).toContainText("Atomik not A");

    // Zihin haritası — ilişkisel görünüm
    await page.getByTestId("subnav-tab-harita").click();
    await expect(page.getByText(/örnek/).first()).toBeVisible();

    // Uygula — görev + içerik fikri
    await page.getByTestId("subnav-tab-uygula").click();
    await expect(page.getByTestId("apply-task").first()).toContainText("Uygulama görevi");
    await expect(page.getByTestId("content-idea").first()).toContainText("İçerik fikri");

    // Kaynak — gerçek zaman damgası (0:30)
    await page.getByTestId("subnav-tab-kaynak").click();
    await expect(page.getByText("0:30")).toBeVisible();

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("NotebookLM paket: summary-basis uyarısı + 'özet' grounding (zaman damgası yok)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({ kind: "notebooklm_summary", packId: "pk1" })]) }));
    const nbPack = transcriptPack({
      sourceBasis: "summary", provider: "notebooklm", hasTimestamps: false,
      source: { kind: "notebooklm_summary", title: "NotebookLM özeti", channelTitle: "", url: "", durationSec: 0 },
      atomicNotes: [{ id: "n1", title: "Özet notu", body: "Gövde", tags: [], chunkIdxs: [0], groundingType: "summary_supported", relatedConceptLabels: [] }],
    });
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: nbPack }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await page.getByTestId("learn-tab-ready").click();
    await page.getByRole("button", { name: "Aç", exact: true }).first().click();

    await expect(page.getByText(/NotebookLM özetine/)).toBeVisible();
    await page.getByTestId("subnav-tab-notlar").click();
    await expect(page.getByTestId("atomic-note").first()).toContainText("özet");
    // Kaynak sekmesinde zaman damgası YOK (özet girdisi notu)
    await page.getByTestId("subnav-tab-kaynak").click();
    await expect(page.getByText(/zaman damgası yok/)).toBeVisible();
  });

  test("not-ready (qa_pending) paket: Obsidian aktarımı gizli + inceleme uyarısı", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({ userState: "needs_review", packId: "pk1", status: "processing" })]) }));
    await page.route(/\/api\/learn\/packs\/pk1(\?|$)/, (r) => r.fulfill({ json: transcriptPack({ status: "qa_pending", qaReport: { coverage: 0.4, verdict: "review", flagged: [] } }) }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await page.getByTestId("learn-tab-learning").click();
    await page.getByRole("button", { name: "Aç", exact: true }).first().click();
    await expect(page.getByText(/hazır bilgi değil/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Obsidian/ })).toHaveCount(0);
  });
});

test.describe("Phase 4C — Processing + transcript resume", () => {
  test("processing: resume GET + gerçek notes/graph/tasks/content_ideas aşamaları görünür", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({ userState: "processing", status: "processing", packId: null, jobId: "jb1" })]) }));
    await page.route(/\/api\/learn\/jobs\/jb1(\?|$)/, (r) => r.fulfill({ json: { success: true, job: { id: "jb1", currentStage: "notes", status: "running", error: null, packId: null, userState: "processing", userStateLabel: "İşleniyor", canAdvance: true, needsManualTranscript: false } } }));
    // advance hep pending (stepper görünür kalsın)
    await page.route(/\/api\/learn\/jobs\/jb1\/advance/, (r) => r.fulfill({ json: { success: true, jobId: "jb1", currentStage: "notes", status: "pending", packId: null, error: null } }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await page.getByTestId("learn-tab-learning").click();
    await page.getByRole("button", { name: "Devam", exact: true }).first().click();

    // Gerçek aşama etiketleri görünür (v2 — passthrough değil)
    await expect(page.getByText("Notlar oluşturuluyor")).toBeVisible();
    await expect(page.getByText("Kavram ilişkileri kuruluyor")).toBeVisible();
    await expect(page.getByText("Uygulama görevleri çıkarılıyor")).toBeVisible();
    await expect(page.getByText("İçerik fikirleri üretiliyor")).toBeVisible();
  });

  test("transcript_required → manuel yapıştırma ile devam", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({ userState: "transcript_required", status: "failed", packId: null, jobId: "jb1" })]) }));
    await page.route(/\/api\/learn\/jobs\/jb1(\?|$)/, (r) => r.fulfill({ json: { success: true, job: { id: "jb1", currentStage: "validate", status: "failed", error: "transcript_unavailable", packId: null, userState: "transcript_required", userStateLabel: "Transkript gerekli", canAdvance: true, needsManualTranscript: true } } }));
    let transcriptPosted = false;
    await page.route(/\/api\/learn\/sources\/s1\/transcript/, (r) => { transcriptPosted = true; return r.fulfill({ json: { success: true } }); });
    await page.route(/\/api\/learn\/jobs\/jb1\/advance/, (r) => r.fulfill({ json: { success: true, jobId: "jb1", currentStage: "chunk", status: "pending", packId: null, error: null } }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await page.getByTestId("learn-tab-learning").click();
    await page.getByRole("button", { name: "Devam", exact: true }).first().click();

    const ta = page.getByTestId("processing-manual");
    await expect(ta).toBeVisible();
    await ta.fill("x".repeat(250));
    await page.getByRole("button", { name: /Transkripti ekle ve devam et/ }).click();
    await expect.poll(() => transcriptPosted).toBe(true);
  });
});

test.describe("Phase 4C — Review idempotency", () => {
  test("attempt isteği idempotencyKey taşır (çift-gönderim koruması)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({})], { dueToday: 1 }) }));
    await page.route(/\/api\/learn\/review\?/, (r) => r.fulfill({ json: { success: true, items: [{ itemId: "it1", kind: "flashcard", front: "Soru?", back: "Cevap", options: [], correctIdx: null, difficulty: 2, conceptLabel: "Kavram A" }] } }));
    let attemptBody: Record<string, unknown> | null = null;
    await page.route("**/api/learn/review/attempt", (r) => {
      attemptBody = r.request().postDataJSON() as Record<string, unknown>;
      return r.fulfill({ json: { success: true, nextDueAt: "2026-07-20T00:00:00Z", intervalDays: 3, conceptMastery: 60, packMastery: 65, deduped: false } });
    });
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await page.getByRole("button", { name: "Tekrara başla" }).click();
    await page.getByRole("button", { name: "Cevabı göster" }).click();
    await page.getByRole("button", { name: "İyi" }).click();
    await expect.poll(() => attemptBody && typeof attemptBody.idempotencyKey === "string" && (attemptBody.idempotencyKey as string).length > 0).toBe(true);
  });
});

test.describe("Phase 4C — responsive + console", () => {
  test("Öğrenme dashboard: 1024–1920 taşma 0", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/learn\/sources(\?|$)/, (r) => r.fulfill({ json: dashboard([src({}), src({ id: "s2", userState: "processing", status: "processing", packId: null })]) }));
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await expect(page.getByTestId("add-mode-youtube")).toBeVisible();
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    }
  });
});
