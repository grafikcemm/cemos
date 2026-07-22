import { describe, it, expect } from "vitest";
import {
  deriveHealthContracts,
  deriveInfrastructure,
  derivePipelineFreshness,
  deriveTodayReadiness,
  deriveTopbar,
  deriveOperatorActionReadiness,
  PIPELINE_FRESH_HOURS,
  NEWS_FAILED_BACKLOG_WARN,
  type InfrastructureInput,
  type PipelineInput,
  type TodayCounts,
} from "./healthContracts";

/** Faz 1F (ADR-026) — üç sözleşme + topbar test matrisi (§6.6). SAF türetim. */

const NOW = Date.parse("2026-07-16T12:00:00Z");
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

function infraInput(overrides: Partial<InfrastructureInput> = {}): InfrastructureInput {
  return {
    databaseOk: true,
    worker: { mode: "cron", status: "recent_tick" },
    cronAuth: { ok: true },
    providers: [
      { key: "openrouter", label: "OpenRouter", required: true, configured: true, ok: true, envNames: ["OPENROUTER_API_KEY"] },
      { key: "socialdata", label: "SocialData", required: true, configured: true, ok: true, envNames: ["SOCIALDATA_API_KEY"] },
      { key: "meta", label: "Meta (Instagram)", required: false, configured: false, ok: true, envNames: ["META_ACCESS_TOKEN"] },
    ],
    credentialExpiry: [],
    ...overrides,
  };
}

function pipeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    nowMs: NOW,
    runs: [
      { key: "news", label: "Haber akışı", lastRunAt: iso(2), lastRunOk: true },
      { key: "generation", label: "Sabah üretimi", lastRunAt: iso(5), lastRunOk: true },
    ],
    news: { rawBacklog: 3, failedBacklog: 0, analyzedLast24h: 12, digestToday: true },
    ...overrides,
  };
}

function counts(overrides: Partial<TodayCounts> = {}): TodayCounts {
  return {
    ready: 0,
    needsEdit: 0,
    blocked: 0,
    awaitingDecision: 0,
    preparedIntents: 0,
    publishedToday: 0,
    targetToday: 2,
    totalActiveToday: 0,
    ...overrides,
  };
}

describe("infrastructure sözleşmesi", () => {
  it("DB down → infra error", () => {
    const c = deriveInfrastructure(infraInput({ databaseOk: false }));
    expect(c.status).toBe("error");
    expect(c.items.find((i) => i.key === "database")?.status).toBe("error");
    // Secret DEĞERİ yok — yalnız ENV adı.
    expect(c.items.find((i) => i.key === "database")?.envNames).toEqual(["DATABASE_URL"]);
  });

  it("cron auth eksik → infra error + CRON_SECRET env adı", () => {
    const c = deriveInfrastructure(infraInput({ cronAuth: { ok: false, message: "CRON_SECRET ayarlı değil" } }));
    expect(c.status).toBe("error");
    expect(c.items.find((i) => i.key === "cron_auth")?.envNames).toEqual(["CRON_SECRET"]);
  });

  it("lokal worker offline → error (ASLA healthy); cron gecikmiş → warn", () => {
    const workerDown = deriveInfrastructure(infraInput({ worker: { mode: "worker", status: "stale" } }));
    expect(workerDown.status).toBe("error");
    const cronLate = deriveInfrastructure(infraInput({ worker: { mode: "cron", status: "stale" } }));
    expect(cronLate.status).toBe("warn");
  });

  it("opsiyonel provider eksik → GENEL HATA YOK (sistem kırmızı olmaz)", () => {
    const c = deriveInfrastructure(infraInput()); // meta configured=false
    expect(c.status).toBe("ok");
    const meta = c.items.find((i) => i.key === "meta");
    expect(meta?.optionalUnconfigured).toBe(true);
  });

  it("gerekli provider eksik → infra error", () => {
    const c = deriveInfrastructure(
      infraInput({
        providers: [
          { key: "openrouter", label: "OpenRouter", required: true, configured: false, ok: false, envNames: ["OPENROUTER_API_KEY"] },
          { key: "socialdata", label: "SocialData", required: true, configured: true, ok: true, envNames: ["SOCIALDATA_API_KEY"] },
        ],
      }),
    );
    expect(c.status).toBe("error");
  });

  it("credential expired (critical) → error; yaklaşan süre (warn) → warn", () => {
    const critical = deriveInfrastructure(
      infraInput({ credentialExpiry: [{ label: "Meta token süresi", status: "critical" }] }),
    );
    expect(critical.status).toBe("error");
    const warn = deriveInfrastructure(
      infraInput({ credentialExpiry: [{ label: "Meta token süresi", status: "warn" }] }),
    );
    expect(warn.status).toBe("warn");
  });
});

describe("pipelineFreshness sözleşmesi", () => {
  it("pipeline fresh → ok", () => {
    const c = derivePipelineFreshness(pipeInput());
    expect(c.status).toBe("ok");
    expect(c.items.every((i) => i.state === "fresh")).toBe(true);
  });

  it("pipeline stale → amber uyarı; infra error DEĞİL", () => {
    const c = derivePipelineFreshness(
      pipeInput({
        runs: [{ key: "news", label: "Haber akışı", lastRunAt: iso(PIPELINE_FRESH_HOURS + 5), lastRunOk: true }],
        news: null,
      }),
    );
    expect(c.status).toBe("warn");
    expect(c.items[0].state).toBe("delayed");
  });

  it("pipeline hiç çalışmadı → never_ran (güncel/gecikmiş/hatalıdan AYRI)", () => {
    const c = derivePipelineFreshness(
      pipeInput({ runs: [{ key: "generation", label: "Sabah üretimi", lastRunAt: null, lastRunOk: null }], news: null }),
    );
    expect(c.items[0].state).toBe("never_ran");
    expect(c.status).toBe("warn");
  });

  it("son çalışma hata verdi → failing", () => {
    const c = derivePipelineFreshness(
      pipeInput({ runs: [{ key: "news", label: "Haber akışı", lastRunAt: iso(1), lastRunOk: false }], news: null }),
    );
    expect(c.items[0].state).toBe("failing");
  });

  it("failed backlog / çıktısız 'ok' çalışma → haber akışı failing (yanlış-yeşil önlenir)", () => {
    const c = derivePipelineFreshness(
      pipeInput({ news: { rawBacklog: 40, failedBacklog: 0, analyzedLast24h: 0, digestToday: false } }),
    );
    expect(c.items.find((i) => i.key === "news")?.state).toBe("failing");
  });

  // Regresyon: `failedBacklog` artık SON 24s hatası (healthService recency-scoped).
  // Eşiği AŞMAYAN güncel hata (normal ölü-URL/paywall) akımı "gecikmiş" YAPMAMALI —
  // aksi hâlde biriken eski kalıcı-hata cruft'u sağlıklı pipeline'ı sonsuza dek
  // yanlış-kırmızı gösterir (canlı prod'da 332 eski failed → sürekli "gecikmiş" bug'ı).
  it("eşik-altı güncel hata → haber akışı fresh kalır (eski cruft gecikmiş yapmaz)", () => {
    const c = derivePipelineFreshness(
      pipeInput({ news: { rawBacklog: 0, failedBacklog: NEWS_FAILED_BACKLOG_WARN, analyzedLast24h: 50, digestToday: true } }),
    );
    expect(c.items.find((i) => i.key === "news")?.state).toBe("fresh");
  });

  it("eşik-üstü GÜNCEL hata patlaması → haber akışı delayed (gerçek sorun hâlâ yakalanır)", () => {
    const c = derivePipelineFreshness(
      pipeInput({ news: { rawBacklog: 0, failedBacklog: NEWS_FAILED_BACKLOG_WARN + 5, analyzedLast24h: 50, digestToday: true } }),
    );
    const news = c.items.find((i) => i.key === "news");
    expect(news?.state).toBe("delayed");
    expect(news?.detail).toContain("işlenemedi");
  });
});

describe("todayReadiness sözleşmesi", () => {
  it("üretim hiç çalışmadı ↔ iş tamamlandı AYNI state OLAMAZ", () => {
    const notRun = deriveTodayReadiness({ productionRanToday: false, counts: counts() });
    const completed = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 1, targetToday: null }),
    });
    expect(notRun.phase).toBe("production_not_run");
    expect(notRun.status).toBe("warn");
    expect(completed.phase).toBe("queue_completed");
    expect(completed.status).toBe("ok");
    expect(notRun.phase).not.toBe(completed.phase);
  });

  it("üretim çalıştı fakat taslak oluşmadı → no_drafts_produced (warn)", () => {
    const c = deriveTodayReadiness({ productionRanToday: true, counts: counts() });
    expect(c.phase).toBe("no_drafts_produced");
    expect(c.status).toBe("warn");
  });

  it("taslaklar karar bekliyor → awaiting_decision", () => {
    const c = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ totalActiveToday: 3, awaitingDecision: 3, needsEdit: 2, blocked: 1 }),
    });
    expect(c.phase).toBe("awaiting_decision");
  });

  it("hazır taslak var → ready_available (ok)", () => {
    const c = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ totalActiveToday: 2, awaitingDecision: 2, ready: 2, preparedIntents: 1 }),
    });
    expect(c.phase).toBe("ready_available");
    expect(c.status).toBe("ok");
    expect(c.message).toContain("2 taslak yayına hazır");
  });

  it("günlük hedef tamamlandı → target_met (healthy)", () => {
    const c = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 2, targetToday: 2 }),
    });
    expect(c.phase).toBe("target_met");
    expect(c.status).toBe("ok");
  });

  it("veri yok → unknown (uydurma sayı yok)", () => {
    const c = deriveTodayReadiness({ productionRanToday: null, counts: null });
    expect(c.phase).toBe("unknown");
    expect(c.status).toBe("unknown");
  });
});

describe("topbar — yalnız actionable durum", () => {
  const okInfra = deriveInfrastructure(infraInput());
  const okPipe = derivePipelineFreshness(pipeInput());

  it("her şey sağlıklı + iş sürüyor → level none", () => {
    const today = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 2, targetToday: 2 }),
    });
    expect(deriveTopbar(okInfra, okPipe, today).level).toBe("none");
  });

  it("bütün günlük işler tamamlandı → UYARI YOK (queue completed ≠ sorun)", () => {
    const today = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 1, targetToday: null }),
    });
    const sig = deriveTopbar(okInfra, okPipe, today);
    expect(sig.level).toBe("none");
    expect(sig.label).toBe("gün tamam");
  });

  it("DB erişilemiyor → error sinyali", () => {
    const infra = deriveInfrastructure(infraInput({ databaseOk: false }));
    const today = deriveTodayReadiness({ productionRanToday: true, counts: counts() });
    expect(deriveTopbar(infra, okPipe, today).level).toBe("error");
  });

  it("credential süresi yaklaşıyor → warn sinyali", () => {
    const infra = deriveInfrastructure(
      infraInput({ credentialExpiry: [{ label: "Meta token süresi", status: "warn" }] }),
    );
    const today = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 2, targetToday: 2 }),
    });
    expect(deriveTopbar(infra, okPipe, today).level).toBe("warn");
  });

  it("pipeline ciddi stale → warn; needs_edit karar bekliyor → action", () => {
    const stalePipe = derivePipelineFreshness(
      pipeInput({
        runs: [{ key: "news", label: "Haber akışı", lastRunAt: iso(PIPELINE_FRESH_HOURS + 10), lastRunOk: true }],
        news: null,
      }),
    );
    const waiting = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ totalActiveToday: 2, awaitingDecision: 2, needsEdit: 2 }),
    });
    expect(deriveTopbar(okInfra, stalePipe, waiting).level).toBe("warn"); // pipeline önce
    expect(deriveTopbar(okInfra, okPipe, waiting).level).toBe("action");
  });

  it("kullanılmayan opsiyonel provider eksik → genel hata YOK (none)", () => {
    const infra = deriveInfrastructure(infraInput()); // meta unconfigured
    const today = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ publishedToday: 2, targetToday: 2 }),
    });
    expect(deriveTopbar(infra, okPipe, today).level).toBe("none");
  });

  it("ilgisiz sorunlar tek sayaca ezilmez — EN yüksek öncelik tek sinyal döner", () => {
    const infra = deriveInfrastructure(infraInput({ databaseOk: false, cronAuth: { ok: false } }));
    const stalePipe = derivePipelineFreshness(
      pipeInput({
        runs: [{ key: "news", label: "Haber akışı", lastRunAt: iso(60), lastRunOk: true }],
        news: null,
      }),
    );
    const waiting = deriveTodayReadiness({
      productionRanToday: true,
      counts: counts({ totalActiveToday: 1, awaitingDecision: 1, needsEdit: 1 }),
    });
    const sig = deriveTopbar(infra, stalePipe, waiting);
    expect(sig.level).toBe("error");
    expect(typeof sig.label).toBe("string"); // tek, insan-okur sinyal — "N sorun" sayacı değil
    expect(sig.label).not.toMatch(/\d+ sorun/);
  });
});

describe("bölüm-bazlı fail-soft", () => {
  it("tek bölümün girdisi toplanamadı → o bölüm unknown, diğerleri yaşar", () => {
    const c = deriveHealthContracts({
      infrastructure: infraInput(),
      pipeline: null, // bu bölümün API'si düştü
      today: { productionRanToday: true, counts: counts({ publishedToday: 2, targetToday: 2 }) },
    });
    expect(c.pipelineFreshness.status).toBe("unknown");
    expect(c.infrastructure.status).toBe("ok");
    expect(c.todayReadiness.phase).toBe("target_met");
  });

  it("bütün bölümler düştü → hepsi unknown; topbar sağlıklı İDDİA ETMEZ", () => {
    const c = deriveHealthContracts({ infrastructure: null, pipeline: null, today: null });
    expect(c.infrastructure.status).toBe("unknown");
    expect(c.pipelineFreshness.status).toBe("unknown");
    expect(c.todayReadiness.status).toBe("unknown");
    expect(c.topbar.level).toBe("none");
    expect(c.topbar.label).toBe("durum belirsiz"); // "sağlıklı" İDDİA edilmez
  });
});

/**
 * Faz 2E (ADR-034 §F) — OperatorActionReadiness canonical girdilerden türetilir;
 * gate ile Sistem sekmesi aynı gerçekliği okur (çelişkili status imkânsız).
 */
describe("deriveOperatorActionReadiness (ADR-034 §F)", () => {
  it("her şey yolunda + bugün taslak var → ok, canGenerate, eylem önerilmez", () => {
    const c = deriveHealthContracts({
      infrastructure: infraInput(),
      pipeline: { runs: [], news: null, nowMs: NOW },
      today: { productionRanToday: true, counts: counts({ ready: 3, totalActiveToday: 3 }) },
    });
    expect(c.operatorAction.level).toBe("ok");
    expect(c.operatorAction.canGenerate).toBe(true);
    expect(c.operatorAction.todayNeedsGeneration).toBe(false);
    // Çelişki yasağı: todayReadiness eylem fazındayken operatorAction "blocked" OLAMAZ.
    expect(c.todayReadiness.phase).toBe("ready_available");
  });

  it("altyapı hatası → blocked + canGenerate=false; blocker metni item'dan gelir", () => {
    const c = deriveHealthContracts({
      infrastructure: infraInput({ databaseOk: false }),
      pipeline: { runs: [], news: null, nowMs: NOW },
      today: { productionRanToday: true, counts: counts({ ready: 1, totalActiveToday: 1 }) },
    });
    expect(c.operatorAction.level).toBe("blocked");
    expect(c.operatorAction.canGenerate).toBe(false);
    expect(c.operatorAction.blockers.length).toBeGreaterThan(0);
    // Topbar da error — iki yüzey aynı canonical durumdan türediği için çelişemez.
    expect(c.topbar.level).toBe("error");
  });

  it("bugün üretim koşmadı → todayNeedsGeneration=true ama BLOCKED değil (eylem önerisi)", () => {
    const c = deriveHealthContracts({
      infrastructure: infraInput(),
      pipeline: { runs: [], news: null, nowMs: NOW },
      today: { productionRanToday: false, counts: counts() },
    });
    expect(c.operatorAction.todayNeedsGeneration).toBe(true);
    expect(c.operatorAction.level).not.toBe("blocked");
    expect(c.operatorAction.canGenerate).toBe(true);
  });

  it("queue tamamlandı → gate SESSİZ kalabilir (ok + eylem yok): 'gün tamam' hata değildir", () => {
    const c = deriveHealthContracts({
      infrastructure: infraInput(),
      pipeline: { runs: [], news: null, nowMs: NOW },
      today: { productionRanToday: true, counts: counts({ publishedToday: 1 }) },
    });
    expect(c.todayReadiness.phase).toBe("queue_completed");
    expect(c.operatorAction.level).toBe("ok");
    expect(c.operatorAction.todayNeedsGeneration).toBe(false);
  });

  it("opsiyonel+yapılandırılmamış sağlayıcı uyarısı operatörü kilitlemez", () => {
    const action = deriveOperatorActionReadiness(
      {
        status: "warn",
        items: [
          { key: "meta", label: "Meta", status: "warn", optionalUnconfigured: true },
          { key: "db", label: "DB", status: "ok" },
        ],
      },
      { status: "ok", items: [], news: null },
      { status: "ok", phase: "ready_available", counts: null, message: "" }
    );
    expect(action.level).toBe("ok"); // optionalUnconfigured uyarısı sayılmaz
    expect(action.canGenerate).toBe(true);
  });
});
