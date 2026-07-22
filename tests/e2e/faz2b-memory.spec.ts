import { test, expect, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Faz 2B (ADR-029/030) — kaynaklı hafıza yüzeyi e2e'si. HERMETİK: memory API
 * route-mock; canlı DB mutasyonu ve ücretli çağrı YOK. Kanıtlanan sözleşme:
 *  - 1/3-2/3 kanıtlı öğrenilmiş öneri ONAYLANAMAZ (buton disabled); Sahiplen var.
 *  - 3/3 öneri onaylanabilir; onay reload sonrası aktif listede (server persist).
 *  - Kanıt drawer'ı kaynak türü/tarih/excerpt gösterir; legacy dürüst.
 *  - Düzenleme yeni sürüm akışıyla çalışır; rollback zincirli kuralda görünür.
 *  - Bölüm hatası tüm ekranı düşürmez; hesap filtresi çalışır; taşma yok.
 */

type MockFact = {
  id: string;
  statement: string;
  type: string;
  status: string;
  sourceProvenance: string;
  createdBy: string;
  confidence: number;
  evidenceCount: number;
  sourcedEvidenceCount: number;
  legacyUnattributed: boolean;
  reviewReady: boolean;
  influencesDrafts: boolean;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    signalType: string;
    direction: string;
    excerpt: string;
    observedAt: string;
    sourceAvailable: boolean;
    metadataInvalid: boolean;
  }>;
};

type MockState = {
  factsByHandle: Record<string, { active: MockFact[]; proposals: MockFact[] }>;
  sectionErrors: string[];
  postCalls: Array<{ action: string; factId?: string }>;
  // ADR-045
  candidatePatterns: Array<{ id: string; patternName: string; hookType: string | null; emotion: string; platform: string; successScore: number; usageCount: number }>;
  trainingCorpus: { total: number; good: number; bad: number; edited: number };
  signalNeutralized: Record<string, boolean>;
};

function evd(id: string, over: Partial<MockFact["evidence"][number]> = {}) {
  return {
    id,
    sourceType: "feedback_event",
    sourceId: `fe-${id}`,
    signalType: "not_my_tone",
    direction: "negative",
    excerpt: "Ton çok kurumsal, samimi olmalı",
    observedAt: new Date().toISOString(),
    sourceAvailable: true,
    metadataInvalid: false,
    ...over,
  };
}

function mkFact(id: string, over: Partial<MockFact> = {}): MockFact {
  return {
    id,
    statement: "Emoji kullanma, kısa vurucu cümleler",
    type: "preference",
    status: "active",
    sourceProvenance: "operator",
    createdBy: "operator",
    confidence: 0.9,
    evidenceCount: 1,
    sourcedEvidenceCount: 1,
    legacyUnattributed: false,
    reviewReady: true,
    influencesDrafts: true,
    supersedesId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidence: [evd(`${id}-e1`)],
    ...over,
  };
}

function freshState(): MockState {
  return {
    factsByHandle: {
      grafikcem: {
        active: [
          mkFact("act-1"),
          mkFact("act-chain", { statement: "Thread sonunda sert kapanış yaz", supersedesId: "old-1" }),
          mkFact("act-legacy", {
            statement: "Fiyat kıyası işe yarıyor",
            evidenceCount: 2,
            sourcedEvidenceCount: 0,
            legacyUnattributed: true,
            evidence: [],
          }),
        ],
        proposals: [
          mkFact("prop-1of3", {
            status: "proposed",
            createdBy: "feedback_pipeline",
            statement: "Açılış cümlesini güçlü ve somut kur",
            sourcedEvidenceCount: 1,
            evidenceCount: 1,
            reviewReady: false,
            influencesDrafts: false,
          }),
          mkFact("prop-3of3", {
            status: "proposed",
            createdBy: "feedback_pipeline",
            statement: "Yapay/AI kokan kalıplardan kaçın",
            sourcedEvidenceCount: 3,
            evidenceCount: 3,
            reviewReady: true,
            influencesDrafts: false,
            evidence: [evd("p3-e1"), evd("p3-e2", { sourceId: "fe-2", signalType: "too_ai" }), evd("p3-e3", { sourceId: "fe-3", sourceAvailable: false })],
          }),
        ],
      },
      maskulenkod: { active: [mkFact("mk-1", { statement: "Maskülen ton koru" })], proposals: [] },
    },
    sectionErrors: [],
    postCalls: [],
    candidatePatterns: [
      { id: "cp-1", patternName: "Liste hook'u", hookType: "liste", emotion: "merak", platform: "x", successScore: 72, usageCount: 4 },
    ],
    trainingCorpus: { total: 6, good: 3, bad: 1, edited: 2 },
    signalNeutralized: {},
  };
}

async function mockMemoryApi(page: Page, state: MockState) {
  await page.route((url) => url.pathname === "/api/settings", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({
      json: {
        success: true,
        accounts: [
          { id: "acc-1", handle: "grafikcem" },
          { id: "acc-2", handle: "maskulenkod" },
        ],
      },
    });
  });

  await page.route((url) => url.pathname === "/api/memory/knowledge", (route) => {
    const url = new URL(route.request().url());
    const handle = url.searchParams.get("accountHandle") ?? "grafikcem";
    const bucket = state.factsByHandle[handle] ?? { active: [], proposals: [] };
    return route.fulfill({
      json: {
        success: true,
        knowledge: {
          accountHandle: handle,
          summary: `@${handle} için ${bucket.active.length} aktif yazım kuralı ve 1 doğrulanmış performans dersi kullanıyorum.`,
          activeFacts: bucket.active,
          proposals: bucket.proposals,
          performanceLessons: [
            { id: "vp-1", patternName: "Somut sayı hook'u", hookType: "sayı", emotion: "merak", platform: "x", validatedAt: new Date().toISOString(), validatedSupport: 5 },
          ],
          // ADR-045: aday pattern'ler (doğrulanmamış) + eğitim külliyatı + zenginleştirilmiş sinyaller.
          candidatePatterns: state.candidatePatterns,
          trainingCorpus: state.trainingCorpus,
          recentSignals: {
            counts: { not_my_tone: 1 },
            neutralizedCount: state.signalNeutralized["fe-2"] ? 1 : 0,
            latest: [
              { id: "fe-1", feedbackType: "not_my_tone", createdAt: new Date().toISOString(), mechanical: false, reasonExcerpt: "Ton çok kurumsal, samimi olmalı", editDistance: 0.4, hasEdit: true, neutralized: false },
              { id: "fe-2", feedbackType: "approved", createdAt: new Date().toISOString(), mechanical: true, reasonExcerpt: null, editDistance: null, hasEdit: false, neutralized: !!state.signalNeutralized["fe-2"] },
            ],
          },
          policy: { promotionMinEvidence: 3, note: "insan onayı" },
          sectionErrors: state.sectionErrors,
        },
      },
    });
  });

  // ADR-045: öğrenme etkinliği kartı (LearningStatusCard) — hermetik boş.
  await page.route((url) => url.pathname === "/api/growth/learning-status", (route) =>
    route.fulfill({
      json: { success: true, lastDaily: null, lastLearn: null, patternsMinedLast7d: 0, engagementEventsLast7d: 0, topPatterns: [] },
    }),
  );

  // ADR-045: sinyal etkisizleştir/geri al.
  await page.route((url) => url.pathname === "/api/memory/signals", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { success: true } });
    const body = route.request().postDataJSON() as { id: string; action: string };
    state.signalNeutralized[body.id] = body.action === "neutralize";
    return route.fulfill({ json: { success: true, id: body.id, neutralized: body.action === "neutralize" } });
  });

  await page.route((url) => url.pathname === "/api/memory/proposals", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { success: true, proposals: [], active: [] } });
    const body = route.request().postDataJSON() as { action: string; factId?: string; statement?: string };
    state.postCalls.push({ action: body.action, factId: body.factId });
    const g = state.factsByHandle.grafikcem;
    if (body.action === "approve" || body.action === "adopt") {
      const idx = g.proposals.findIndex((p) => p.id === body.factId);
      if (idx >= 0) {
        const [p] = g.proposals.splice(idx, 1);
        g.active.unshift({ ...p, status: "active", influencesDrafts: true, reviewReady: true });
      }
      return route.fulfill({ json: { success: true, action: body.action, factId: body.factId } });
    }
    if (body.action === "revise") {
      const target = g.active.find((f) => f.id === body.factId);
      if (target) {
        g.active.unshift(mkFact(`rev-${body.factId}`, { statement: body.statement ?? "", supersedesId: body.factId }));
        g.active.splice(g.active.indexOf(target), 1);
      }
      return route.fulfill({ json: { success: true, action: "revise", newFactId: `rev-${body.factId}` } });
    }
    if (body.action === "reject") {
      const idx = g.proposals.findIndex((p) => p.id === body.factId);
      if (idx >= 0) g.proposals.splice(idx, 1);
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { success: true } });
  });
}

test.describe("Kaynaklı hafıza (Faz 2B, hermetik)", () => {
  test("özet + 1/3 disabled onay + Sahiplen + 3/3 enabled onay; onay reload sonrası aktifte", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");

    await expect(page.getByTestId("memory-summary")).toContainText("3 aktif yazım kuralı", { timeout: 20_000 });

    // 1/3: Onayla disabled, Sahiplen görünür.
    await expect(page.getByTestId("approve-prop-1of3")).toBeDisabled();
    await expect(page.getByTestId("adopt-prop-1of3")).toBeVisible();
    await expect(page.getByTestId("evidence-chip-prop-1of3")).toContainText("1/3");

    // 3/3: Onayla aktif → tıkla → server persist + reload sonrası aktif listede.
    await expect(page.getByTestId("approve-prop-3of3")).toBeEnabled();
    await page.getByTestId("approve-prop-3of3").click();
    await expect(page.getByTestId("fact-prop-3of3")).toBeVisible({ timeout: 10_000 });
    expect(state.postCalls).toContainEqual({ action: "approve", factId: "prop-3of3" });

    await page.reload();
    await expect(page.getByTestId("fact-prop-3of3")).toBeVisible({ timeout: 20_000 }); // server kaynaklı persist
    await expect(page.getByTestId("memory-summary")).toContainText("4 aktif yazım kuralı");
  });

  test("kanıt drawer'ı: kaynak türü + excerpt + silinmiş-kaynak notu; legacy dürüst", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("proposal-prop-3of3")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("evidence-open-prop-3of3").click();
    const drawer = page.getByTestId("memory-evidence-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("geri bildirim");
    await expect(drawer).toContainText("Ton çok kurumsal");
    await expect(drawer).toContainText("kaynak kayıt artık mevcut değil"); // p3-e3
    await page.keyboard.press("Escape");

    // Legacy kayıt: kaynak ayrıntısı yok rozeti.
    await expect(page.getByTestId("legacy-act-legacy")).toContainText("eski kayıt");
  });

  test("düzenleme = yeni sürüm (in-place değil); rollback zincirli kuralda görünür", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("fact-act-1")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("rollback-act-chain")).toBeVisible(); // zincirli
    await expect(page.getByTestId("fact-act-1").getByTestId("rollback-act-1")).toHaveCount(0); // zincirsiz

    await page.getByTestId("revise-open-act-1").click();
    await expect(page.getByTestId("memory-revise-drawer")).toBeVisible();
    await page.getByTestId("memory-revise-input").fill("Emoji yalnız istisna durumlarda");
    await page.getByTestId("memory-revise-confirm").click();
    await expect(page.getByTestId("fact-rev-act-1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("rollback-rev-act-1")).toBeVisible(); // yeni sürüm zincirli → geri alınabilir
    expect(state.postCalls).toContainEqual({ action: "revise", factId: "act-1" });
  });

  test("hesap filtresi: seçim değişince o hesabın bilgisi gelir", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("memory-summary")).toContainText("@grafikcem", { timeout: 20_000 });

    await page.getByTestId("memory-account-select").selectOption("maskulenkod");
    await expect(page.getByTestId("memory-summary")).toContainText("@maskulenkod", { timeout: 10_000 });
    await expect(page.getByTestId("fact-mk-1")).toBeVisible();
  });

  test("bölüm hatası tüm ekranı düşürmez (fail-soft not)", async ({ page }) => {
    const state = freshState();
    state.sectionErrors = ["performance: okunamadı"];
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("memory-summary")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Bazı bölümler alınamadı/)).toBeVisible();
    await expect(page.getByTestId("fact-act-1")).toBeVisible(); // identity yaşıyor
  });

  test("performans dersleri identity'den ayrı bölümde gerçek destek/tarihle", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    const lessons = page.getByTestId("perf-lessons");
    await expect(lessons).toBeVisible({ timeout: 20_000 });
    await expect(lessons).toContainText("Somut sayı hook'u");
    await expect(lessons).toContainText("destek 5");
  });

  test("ADR-045: aday pattern'ler + eğitim külliyatı + öğrenme etkinliği kartı görünür", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("memory-summary")).toBeVisible({ timeout: 20_000 });
    const cand = page.getByTestId("candidate-patterns");
    await expect(cand).toContainText("Liste hook'u");
    await expect(cand).toContainText("aday · doğrulanmadı"); // validated derslerden AYRI
    await expect(page.getByTestId("training-corpus")).toContainText("Eğitim örneği: 6");
    await expect(page.getByTestId("memory-learning-activity")).toBeVisible(); // Eğitim Merkezi'nden birleşti
  });

  test("ADR-045: yanlış sinyali 'Yok say' → etkisiz; 'Geri al' geri döner (ham kayıt silinmez)", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("signal-fe-2")).toBeVisible({ timeout: 20_000 });
    // Zenginleştirilmiş sinyal: operatör reason'ı + düzenleme rozeti fe-1'de görünür.
    await expect(page.getByTestId("signal-fe-1")).toContainText("Ton çok kurumsal");
    // fe-2 yok say → POST + reload → "Geri al"a döner.
    await page.getByTestId("signal-neutralize-fe-2").click();
    await expect(page.getByTestId("signal-restore-fe-2")).toBeVisible({ timeout: 10_000 });
    expect(state.signalNeutralized["fe-2"]).toBe(true);
    // Geri al → tekrar "Yok say".
    await page.getByTestId("signal-restore-fe-2").click();
    await expect(page.getByTestId("signal-neutralize-fe-2")).toBeVisible({ timeout: 10_000 });
    expect(state.signalNeutralized["fe-2"]).toBe(false);
  });

  test("desktop 1024–1920: kaynaklı hafıza ekranında yatay taşma yok", async ({ page }) => {
    const state = freshState();
    await mockMemoryApi(page, state);
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("memory-summary")).toBeVisible({ timeout: 20_000 });
    for (const w of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${w}px yatay taşma`).toBeLessThanOrEqual(1);
    }
  });
});
