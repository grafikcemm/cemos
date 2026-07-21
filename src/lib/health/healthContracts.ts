/**
 * Faz 1F (ADR-026) — üç sözleşmeli sistem sağlığı. SAF, yan-etkisiz türetim:
 *  1. infrastructure   — DB, worker/cron canlılığı, cron auth, gerekli provider
 *                        anahtarları, credential süresi. Opsiyonel + kullanılmayan
 *                        entegrasyon eksiği sistemi ASLA kırmızı yapmaz.
 *  2. pipelineFreshness— son başarılı haber/üretim çalışması, failed backlog,
 *                        stale akışlar. Stale = amber; otomatik infra error DEĞİL.
 *                        Her akış için hiç-çalışmadı / güncel / gecikmiş / hatalı ayrımı.
 *  3. todayReadiness   — bugünün akış fazı. "Queue boş" her zaman hata değildir;
 *                        "kuyruk tamamlandı" healthy/neutral bir durumdur ve
 *                        "üretim hiç çalışmadı" ile AYNI state olamaz.
 * Topbar yalnız EN YÜKSEK öncelikli actionable durumu gösterir — ilgisiz
 * sorunlar tek kırmızı sayaca ezilmez; her şey yolundaysa uyarı yoktur.
 * Secret DEĞERLERİ hiçbir sözleşmede yer almaz — yalnız ENV adları.
 */

import type { InstagramPlanHealthContract } from "@/lib/health/planHealthContract";

export type SectionStatus = "ok" | "warn" | "error" | "unknown";

// ── İsimlendirilmiş eşikler (magic number dağıtma) ────────────────────────────
export const NEWS_RAW_BACKLOG_WARN = 30;
/** Günlük cron ölçeği: son başarılı çalışma bundan eskiyse akış "gecikmiş". */
export const PIPELINE_FRESH_HOURS = 26;

// ── 1. Infrastructure ─────────────────────────────────────────────────────────

export type InfraProviderInput = {
  key: string;
  label: string;
  /** Günlük çekirdek akış için zorunlu mu (OpenRouter/SocialData) — değilse opsiyonel. */
  required: boolean;
  configured: boolean;
  ok: boolean;
  /** Yalnız ENV adları — asla değer. */
  envNames: string[];
  detail?: string;
};

export type InfrastructureInput = {
  databaseOk: boolean | null;
  worker: {
    mode: "worker" | "cron" | "unknown";
    status: "recent_tick" | "stale" | "unknown";
    detail?: string;
  };
  cronAuth: { ok: boolean; message?: string } | null;
  providers: InfraProviderInput[];
  /** Süresi dolabilen credential'lar (ör. Meta token). */
  credentialExpiry: { label: string; status: "ok" | "warn" | "critical" | "unknown"; detail?: string }[];
};

export type InfraItem = {
  key: string;
  label: string;
  status: SectionStatus;
  /** Opsiyonel + yapılandırılmamış — bilgi amaçlı, bölüm durumunu ETKİLEMEZ. */
  optionalUnconfigured?: boolean;
  detail?: string;
  envNames?: string[];
  actionHint?: string;
};

export type InfrastructureContract = { status: SectionStatus; items: InfraItem[] };

function worst(statuses: SectionStatus[]): SectionStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("ok")) return "ok";
  return "unknown";
}

export function deriveInfrastructure(input: InfrastructureInput): InfrastructureContract {
  const items: InfraItem[] = [];

  items.push({
    key: "database",
    label: "Veritabanı",
    status: input.databaseOk === true ? "ok" : input.databaseOk === false ? "error" : "unknown",
    detail: input.databaseOk === false ? "Veritabanına erişilemiyor." : undefined,
    actionHint: input.databaseOk === false ? "Neon durumunu ve DATABASE_URL yapılandırmasını kontrol et." : undefined,
    envNames: input.databaseOk === false ? ["DATABASE_URL"] : undefined,
  });

  // Worker/cron canlılığı: lokal worker durmuşsa error (ASLA healthy görünmez);
  // günlük cron gecikmişse warn.
  const w = input.worker;
  items.push({
    key: "worker",
    label: w.mode === "cron" ? "Günlük cron" : "Worker",
    status:
      w.status === "recent_tick"
        ? "ok"
        : w.status === "stale"
          ? w.mode === "cron"
            ? "warn"
            : "error"
          : "unknown",
    detail: w.detail,
  });

  if (input.cronAuth) {
    items.push({
      key: "cron_auth",
      label: "Cron yetkilendirme",
      status: input.cronAuth.ok ? "ok" : "error",
      detail: input.cronAuth.message,
      envNames: input.cronAuth.ok ? undefined : ["CRON_SECRET"],
    });
  }

  for (const p of input.providers) {
    if (!p.required && !p.configured) {
      // Opsiyonel + kullanılmayan entegrasyon eksiği tüm sistemi KIRMIZI YAPMAZ.
      items.push({
        key: p.key,
        label: p.label,
        status: "ok",
        optionalUnconfigured: true,
        detail: p.detail ?? "Opsiyonel — yapılandırılmadı.",
        envNames: p.envNames,
      });
      continue;
    }
    items.push({
      key: p.key,
      label: p.label,
      status: p.configured && p.ok ? "ok" : p.required ? "error" : "warn",
      detail: p.detail,
      envNames: p.configured && p.ok ? undefined : p.envNames,
      actionHint:
        p.configured && p.ok
          ? undefined
          : `Entegrasyonlar ekranından ${p.envNames.join(", ")} yapılandırmasını kontrol et.`,
    });
  }

  for (const c of input.credentialExpiry) {
    items.push({
      key: `cred_${c.label}`,
      label: c.label,
      status: c.status === "critical" ? "error" : c.status === "warn" ? "warn" : c.status === "ok" ? "ok" : "unknown",
      detail: c.detail,
    });
  }

  return { status: worst(items.filter((i) => !i.optionalUnconfigured).map((i) => i.status)), items };
}

// ── 2. Pipeline freshness ─────────────────────────────────────────────────────

export type PipelineState = "never_ran" | "fresh" | "delayed" | "failing" | "unknown";

export type PipelineRunInput = {
  key: string;
  label: string;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  detail?: string;
};

export type PipelineInput = {
  nowMs: number;
  runs: PipelineRunInput[];
  news: {
    rawBacklog: number | null;
    failedBacklog: number | null;
    analyzedLast24h: number | null;
    digestToday: boolean | null;
  } | null;
};

export type PipelineItem = {
  key: string;
  label: string;
  state: PipelineState;
  lastRunAt: string | null;
  detail?: string;
};

export type PipelineFreshnessContract = {
  status: SectionStatus;
  items: PipelineItem[];
  /** Haber havuzu sayıları (ham/hatalı/analiz-24s) — sessiz özet için. */
  news: { rawBacklog: number | null; failedBacklog: number | null; analyzedLast24h: number | null; digestToday: boolean | null } | null;
};

function pipelineState(run: PipelineRunInput, nowMs: number): { state: PipelineState; detail?: string } {
  if (!run.lastRunAt) return { state: "never_ran", detail: "Bu akış henüz hiç çalışmadı." };
  if (run.lastRunOk === false) return { state: "failing", detail: run.detail ?? "Son çalışma hata verdi." };
  const ageHours = (nowMs - Date.parse(run.lastRunAt)) / 3_600_000;
  if (Number.isNaN(ageHours)) return { state: "unknown" };
  if (ageHours > PIPELINE_FRESH_HOURS) {
    return { state: "delayed", detail: `Son başarılı çalışma ${Math.round(ageHours)} saat önce.` };
  }
  return { state: "fresh" };
}

export function derivePipelineFreshness(input: PipelineInput): PipelineFreshnessContract {
  const items: PipelineItem[] = input.runs.map((run) => {
    const { state, detail } = pipelineState(run, input.nowMs);
    return { key: run.key, label: run.label, state, lastRunAt: run.lastRunAt, detail: detail ?? run.detail };
  });

  // Haber akışının SONUÇ-seviyesi sinyalleri: "cron ok" görünse bile çıktı yoksa
  // failing; ham birikim eşiği aşarsa delayed notu.
  if (input.news) {
    const newsItem = items.find((i) => i.key === "news");
    if (newsItem) {
      const { rawBacklog, analyzedLast24h, failedBacklog } = input.news;
      if (newsItem.state === "fresh" && analyzedLast24h === 0 && (rawBacklog ?? 0) > 0) {
        newsItem.state = "failing";
        newsItem.detail = `Çalışma "ok" görünüyor ama 24 saatte 0 analiz; ${rawBacklog} ham haber bekliyor.`;
      } else if ((rawBacklog ?? 0) > NEWS_RAW_BACKLOG_WARN && newsItem.state === "fresh") {
        newsItem.state = "delayed";
        newsItem.detail = `${rawBacklog} ham haber birikti (eşik ${NEWS_RAW_BACKLOG_WARN}).`;
      } else if ((failedBacklog ?? 0) > 0 && newsItem.state === "fresh") {
        newsItem.state = "delayed";
        newsItem.detail = `${failedBacklog} haber hatalı durumda bekliyor.`;
      }
    }
  }

  // Stale/failing/never_ran → amber (İNFRA ERROR DEĞİL); yalnız hepsi unknown → unknown.
  const status: SectionStatus = items.every((i) => i.state === "unknown")
    ? "unknown"
    : items.some((i) => i.state === "failing" || i.state === "delayed" || i.state === "never_ran")
      ? "warn"
      : "ok";

  return { status, items, news: input.news };
}

// ── 3. Today readiness ────────────────────────────────────────────────────────

export type TodayPhase =
  | "production_not_run" // bugün üretim hiç çalışmadı
  | "no_drafts_produced" // üretim çalıştı fakat taslak oluşmadı
  | "awaiting_decision" // taslaklar karar bekliyor (needs_edit/blocked/yeni)
  | "ready_available" // bazı taslaklar yayına hazır
  | "queue_completed" // günün kuyruğu tamamen işlendi (healthy/NEUTRAL)
  | "target_met" // günlük hedef tamamlandı (healthy)
  | "unknown";

export type TodayCounts = {
  ready: number;
  needsEdit: number;
  blocked: number;
  /** Karar bekleyen aktif taslak (ready+needsEdit+blocked toplamı değil; durumu new/draft olanlar dahil). */
  awaitingDecision: number;
  preparedIntents: number;
  publishedToday: number;
  targetToday: number | null;
  totalActiveToday: number;
};

export type TodayInput = {
  productionRanToday: boolean | null;
  counts: TodayCounts | null;
};

export type TodayReadinessContract = {
  status: SectionStatus;
  phase: TodayPhase;
  counts: TodayCounts | null;
  message: string;
};

export function deriveTodayReadiness(input: TodayInput): TodayReadinessContract {
  const c = input.counts;
  if (!c) {
    return { status: "unknown", phase: "unknown", counts: null, message: "Bugünün hazırlık verisi alınamadı." };
  }

  // Günlük hedef tamamlandı → healthy; topbar uyarı YOK.
  if (c.targetToday != null && c.targetToday > 0 && c.publishedToday >= c.targetToday) {
    return {
      status: "ok",
      phase: "target_met",
      counts: c,
      message: `Günlük hedef tamamlandı (${c.publishedToday}/${c.targetToday} yayın).`,
    };
  }

  if (c.totalActiveToday === 0) {
    // "Queue boş" her zaman hata değil: işlenmişse TAMAMLANDI (neutral),
    // hiç üretilmemişse ayrı ve dürüst bir durum.
    if (c.publishedToday > 0) {
      return {
        status: "ok",
        phase: "queue_completed",
        counts: c,
        message: `Bugünün kuyruğu tamamen işlendi (${c.publishedToday} yayın).`,
      };
    }
    if (input.productionRanToday === false) {
      return {
        status: "warn",
        phase: "production_not_run",
        counts: c,
        message: "Bugün üretim henüz çalışmadı — sabah cron'unu bekle ya da manuel üretim başlat.",
      };
    }
    if (input.productionRanToday === true) {
      return {
        status: "warn",
        phase: "no_drafts_produced",
        counts: c,
        message: "Üretim çalıştı fakat taslak oluşmadı — üretim loglarını kontrol et.",
      };
    }
    return { status: "unknown", phase: "unknown", counts: c, message: "Bugünün üretim durumu belirlenemedi." };
  }

  if (c.ready > 0) {
    return {
      status: "ok",
      phase: "ready_available",
      counts: c,
      message: `${c.ready} taslak yayına hazır${c.preparedIntents > 0 ? `; ${c.preparedIntents} hazırlanmış intent` : ""}.`,
    };
  }

  return {
    status: "ok",
    phase: "awaiting_decision",
    counts: c,
    message: `${c.awaitingDecision} taslak karar bekliyor${c.needsEdit > 0 ? ` (${c.needsEdit} düzenleme ister` : ""}${
      c.blocked > 0 ? `${c.needsEdit > 0 ? ", " : " ("}${c.blocked} engelli` : ""
    }${c.needsEdit > 0 || c.blocked > 0 ? ")" : ""}.`,
  };
}

// ── Topbar: EN YÜKSEK öncelikli actionable sinyal ────────────────────────────

export type TopbarLevel = "none" | "action" | "warn" | "error";
export type TopbarSignal = { level: TopbarLevel; label: string; detail?: string };

export function deriveTopbar(
  infra: InfrastructureContract,
  pipeline: PipelineFreshnessContract,
  today: TodayReadinessContract,
  planHealth?: InstagramPlanHealthContract | null,
): TopbarSignal {
  // 1. Altyapı hatası (DB erişilemiyor, gerekli credential, worker durdu) → error.
  if (infra.status === "error") {
    const first = infra.items.find((i) => i.status === "error");
    return { level: "error", label: first?.label ?? "Altyapı sorunu", detail: first?.detail };
  }
  // 2. Altyapı uyarısı (credential süresi yaklaşıyor, cron gecikmiş) → warn.
  if (infra.status === "warn") {
    const first = infra.items.find((i) => i.status === "warn");
    return { level: "warn", label: first?.label ?? "Altyapı uyarısı", detail: first?.detail };
  }
  // 3. Akış ciddi biçimde stale/failing → warn.
  if (pipeline.status === "warn") {
    const first = pipeline.items.find((i) => i.state !== "fresh" && i.state !== "unknown");
    return {
      level: "warn",
      label: first ? `${first.label} gecikmiş` : "Akış gecikmiş",
      detail: first?.detail,
    };
  }
  // 4. Bugünün akışı kullanıcı eylemi istiyor → action/warn.
  if (today.phase === "production_not_run" || today.phase === "no_drafts_produced") {
    return { level: "warn", label: "Bugün taslak yok", detail: today.message };
  }
  if (today.phase === "awaiting_decision") {
    return { level: "action", label: "Karar bekleyen taslak var", detail: today.message };
  }
  if (today.phase === "ready_available") {
    return { level: "action", label: "Yayına hazır taslak var", detail: today.message };
  }
  // 5/6. Instagram plan sağlığı — YALNIZ yapılandırılmış + AKTİF plan sorunları.
  //      Planlama kullanılmıyorsa (configured=false) veya draft/archived ise
  //      topbar uyarısı ÜRETİLMEZ. Bugün/geride kalan > yaklaşan.
  if (planHealth && planHealth.configured && planHealth.planStatus === "active") {
    if (planHealth.overdueIncomplete > 0 || planHealth.todayUnready > 0) {
      return { level: "warn", label: "Bugünkü plan slotu hazır değil", detail: planHealth.message };
    }
    if (planHealth.next7DaysUnready > 0) {
      return { level: "warn", label: "Yaklaşan plan slotu hazır değil", detail: planHealth.message };
    }
    if (planHealth.blockers.length > 0) {
      return { level: "warn", label: "Plan hard blocker içeriyor", detail: planHealth.message };
    }
  }
  // 7. Her şey yolunda — "kuyruk tamamlandı" bir SORUN DEĞİLDİR.
  if (today.phase === "queue_completed" || today.phase === "target_met") {
    return { level: "none", label: "gün tamam" };
  }
  // Hiçbir bölümden veri yoksa "sağlıklı" İDDİA ETME — dürüst belirsizlik.
  if (infra.status === "unknown" && pipeline.status === "unknown" && today.status === "unknown") {
    return { level: "none", label: "durum belirsiz" };
  }
  return { level: "none", label: "sağlıklı" };
}

/**
 * Faz 2E (ADR-034 §F): manuel üretim/eylem uygunluğu — canonical health
 * girdilerinden TÜRETİLİR. operatorReadinessService'in bağımsız DB
 * sorgularıyla ürettiği ikinci "hazır/değil" gerçekliği kaldırıldı; gate bu
 * sözleşmeden beslenir. Kavramlar tek bir anlamsız `ready:boolean`'a
 * DÜZLEŞTİRİLMEZ: level + canGenerate + todayNeedsGeneration ayrı anlam taşır.
 */
export type OperatorActionReadiness = {
  /** blocked = altyapı kırık; warn = akış/altyapı uyarılı; ok = sessiz. */
  level: "ok" | "warn" | "blocked";
  /** Manuel "Bugünkü Taslakları Üret" eylemi çalıştırılabilir mi (altyapı ayakta). */
  canGenerate: boolean;
  /** Bugün taslak yok (production_not_run / no_drafts_produced) — eylem önerilir. */
  todayNeedsGeneration: boolean;
  blockers: string[];
  warnings: string[];
};

export function deriveOperatorActionReadiness(
  infra: InfrastructureContract,
  pipeline: PipelineFreshnessContract,
  today: TodayReadinessContract,
): OperatorActionReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const item of infra.items) {
    if (item.status === "error") blockers.push(item.detail ? `${item.label}: ${item.detail}` : item.label);
    else if (item.status === "warn" && !item.optionalUnconfigured)
      warnings.push(item.detail ? `${item.label}: ${item.detail}` : item.label);
  }
  if (pipeline.status === "warn") {
    const first = pipeline.items.find((i) => i.state !== "fresh" && i.state !== "unknown");
    if (first) warnings.push(first.detail ? `${first.label}: ${first.detail}` : `${first.label} gecikmiş`);
  }
  const todayNeedsGeneration = today.phase === "production_not_run" || today.phase === "no_drafts_produced";
  return {
    level: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warn" : "ok",
    canGenerate: blockers.length === 0,
    todayNeedsGeneration,
    blockers,
    warnings,
  };
}

export type SystemHealthContracts = {
  infrastructure: InfrastructureContract;
  pipelineFreshness: PipelineFreshnessContract;
  todayReadiness: TodayReadinessContract;
  topbar: TopbarSignal;
  /** Faz 2E: manuel eylem uygunluğu (yalnız canonical girdilerden türetilir). */
  operatorAction: OperatorActionReadiness;
  /** Phase 3E: Instagram içerik planı — AYRI ürün/görev sözleşmesi (infra DEĞİL). */
  instagramPlanning: InstagramPlanHealthContract | null;
};

export function deriveHealthContracts(inputs: {
  infrastructure: InfrastructureInput | null;
  pipeline: PipelineInput | null;
  today: TodayInput | null;
  instagramPlanning?: InstagramPlanHealthContract | null;
}): SystemHealthContracts {
  // Bölüm-bazlı fail-soft: girdi toplanamayan bölüm "unknown" olur; diğerleri yaşar.
  const infrastructure = inputs.infrastructure
    ? deriveInfrastructure(inputs.infrastructure)
    : { status: "unknown" as const, items: [] };
  const pipelineFreshness = inputs.pipeline
    ? derivePipelineFreshness(inputs.pipeline)
    : { status: "unknown" as const, items: [], news: null };
  const todayReadiness = inputs.today
    ? deriveTodayReadiness(inputs.today)
    : { status: "unknown" as const, phase: "unknown" as const, counts: null, message: "Bugünün hazırlık verisi alınamadı." };
  const instagramPlanning = inputs.instagramPlanning ?? null;
  return {
    infrastructure,
    pipelineFreshness,
    todayReadiness,
    topbar: deriveTopbar(infrastructure, pipelineFreshness, todayReadiness, instagramPlanning),
    operatorAction: deriveOperatorActionReadiness(infrastructure, pipelineFreshness, todayReadiness),
    instagramPlanning,
  };
}

// ── Drawer / Bugün-tiki için: canonical altyapı + akış SORUN listesi ──────────
export type HealthProblemItem = { key: string; label: string; detail?: string; severity: "error" | "warn" };

const PIPELINE_STATE_LABEL: Record<string, string> = {
  failing: "hata veriyor",
  delayed: "gecikmiş",
  never_ran: "hiç çalışmadı",
};

/**
 * Operatöre gösterilecek SİSTEM sorunları (altyapı + akış), topbar chip ile
 * TUTARLI. Eski dar `deriveProblems` cronAuth / newsPipeline (24s'te 0 analiz) /
 * metaToken / credential-süresi kategorilerini ATLIYORDU (fake-green) — bu,
 * canonical sözleşmelerden türetir. Opsiyonel + yapılandırılmamış entegrasyonlar
 * DAHİL EDİLMEZ (sistemi kırmızı yapmaz). Bugün-eylemi / plan AYRI eksendir.
 */
export function deriveHealthProblems(contracts: SystemHealthContracts): HealthProblemItem[] {
  const out: HealthProblemItem[] = [];
  for (const item of contracts.infrastructure.items) {
    if (item.optionalUnconfigured) continue;
    if (item.status === "error" || item.status === "warn") {
      out.push({ key: item.key, label: item.label, detail: item.detail, severity: item.status });
    }
  }
  for (const item of contracts.pipelineFreshness.items) {
    if (item.state === "failing" || item.state === "delayed" || item.state === "never_ran") {
      out.push({
        key: `pipeline_${item.key}`,
        label: `${item.label} ${PIPELINE_STATE_LABEL[item.state]}`,
        detail: item.detail,
        severity: "warn",
      });
    }
  }
  return out;
}

/** Sorun listesinden en yüksek önem düzeyi (nokta rengi/etiket için). */
export function healthProblemsLevel(problems: HealthProblemItem[]): "ok" | "warn" | "error" {
  if (problems.some((p) => p.severity === "error")) return "error";
  if (problems.length > 0) return "warn";
  return "ok";
}
