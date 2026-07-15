/**
 * Sistem sağlığı — TEK türetim kaynağı (Faz 1C.2 §8C). SAF, yan-etkisiz.
 *
 * Önceki durum: AutomationManager (tam-genişlik band), TopStrip chip ve
 * MorningHeroStats tiki AYRI fetch + AYRI türetim yapıyordu → ekran görüntüsünde
 * aynı anda "Worker çalışmıyor" + "Sağlıklı" + "durum alınamadı" çelişebiliyordu.
 * Artık tek `deriveSystemHealth` + tek `SystemHealthProvider` (tek fetch/state)
 * topbar chip, Bugün özeti tiki ve detay drawer'ını besler.
 *
 * BAĞLAYICI KURALLAR (§8C):
 *  - Worker durmuşsa (worker modu, non-cron) ASLA `healthy` gösterilemez.
 *  - Health isteği başarısızsa kesin sorun sayısı verilemez → `unavailable`.
 *  - `checking` (henüz veri yok) final durum gibi görünemez; `healthy`'den ayrıdır.
 */

export type WorkerStatus = "unknown" | "recent_tick" | "stale";
export type WorkerMode = "worker" | "cron" | "unknown";

type HealthCheck = { configured?: boolean; ok?: boolean; message?: string };

export type HealthPayload = {
  openrouter?: HealthCheck;
  socialdata?: HealthCheck;
  buffer?: HealthCheck;
  database?: { ok?: boolean; message?: string };
  worker?: {
    mode?: WorkerMode;
    inferredStatus?: WorkerStatus;
    lastTickAt?: string;
    recommendation?: string;
  };
};

export type HealthProblem = { label: string; detail?: string; severity: "error" | "warn" };

/** 4 türetilmiş durum (§8C). "error" ayrı durum değil; error-severity sorun
 *  `warning` durumu içinde taşınır (chip kırmızıya döner, state yine warning). */
export type SystemHealthState = "checking" | "healthy" | "warning" | "unavailable";

export type SystemHealthInput = {
  /** En az bir başarılı fetch tamamlandı mı. */
  loaded: boolean;
  /** Son fetch başarısız mı (ağ/500). */
  fetchError: boolean;
  /** Ham /api/health cevabı (başarılıysa). */
  health: HealthPayload | null;
};

export type SystemHealthResult = {
  state: SystemHealthState;
  problems: HealthProblem[];
  /** İnsan-okur kısa Türkçe etiket (topbar + Bugün tiki AYNI etiketi gösterir). */
  label: string;
  /** Herhangi bir sorun error-severity mi (chip kırmızı vs amber). */
  hasError: boolean;
};

const CHECK_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  socialdata: "SocialData",
  buffer: "Buffer",
};

/** /api/health cevabından operatöre gösterilecek sorun listesini türetir. */
export function deriveProblems(health: HealthPayload | null): HealthProblem[] {
  if (!health) return [];
  const out: HealthProblem[] = [];
  const worker = health.worker;
  if (worker?.inferredStatus && worker.inferredStatus !== "recent_tick") {
    const isCron = worker.mode === "cron";
    out.push({
      label: isCron ? "Cron gecikmiş" : "Worker çalışmıyor",
      detail: worker.recommendation ?? worker.lastTickAt,
      severity: isCron ? "warn" : "error",
    });
  }
  for (const key of ["openrouter", "socialdata", "buffer"] as const) {
    const check = health[key];
    if (check?.configured && check.ok === false) {
      out.push({ label: `${CHECK_LABELS[key]} hatalı`, detail: check.message, severity: "error" });
    }
  }
  if (health.database && health.database.ok === false) {
    out.push({ label: "Veritabanı hatalı", detail: health.database.message, severity: "error" });
  }
  return out;
}

/**
 * TEK türetim. Öncelik: fetchError → unavailable; henüz veri yok → checking;
 * sorun var → warning (worker offline dahil, ASLA healthy); aksi → healthy.
 */
export function deriveSystemHealth(input: SystemHealthInput): SystemHealthResult {
  const { loaded, fetchError, health } = input;

  // Health isteği başarısız → kesin sorun sayısı verilemez (§8C).
  if (fetchError) {
    return { state: "unavailable", problems: [], label: "durum alınamadı", hasError: false };
  }
  // Henüz başarılı veri yok → checking (final gibi görünemez).
  if (!loaded || !health) {
    return { state: "checking", problems: [], label: "kontrol ediliyor", hasError: false };
  }

  const problems = deriveProblems(health);
  if (problems.length > 0) {
    // Worker offline/provider/db sorunu → warning; healthy ASLA.
    return {
      state: "warning",
      problems,
      label: problems.length === 1 ? problems[0].label : `${problems.length} sorun`,
      hasError: problems.some((p) => p.severity === "error"),
    };
  }
  return { state: "healthy", problems: [], label: "sağlıklı", hasError: false };
}

/** Durum → semantik nokta rengi (topbar chip + Bugün tiki aynı eşleme). */
export function healthDotColor(result: SystemHealthResult): string {
  switch (result.state) {
    case "healthy":
      return "var(--status-ok)";
    case "warning":
      return result.hasError ? "var(--status-error)" : "var(--status-warn)";
    case "unavailable":
    case "checking":
    default:
      return "var(--text-muted)";
  }
}
