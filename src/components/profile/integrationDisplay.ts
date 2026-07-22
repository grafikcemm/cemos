/**
 * Integration status honesty (§13/BUG-05 · closure F). configured != verified !=
 * healthy. Pure, testable badge resolution shared by ProfileIntegrationsTab.
 *
 * The persisted liveness ledger (last REAL provider call, from UsageLog /
 * LearnExportAttempt) is authoritative and OVERRIDES the shallow /api/health
 * entry, because shallow health only truly probes the database — for
 * openrouter/socialdata its "ok" is mere env-presence, and for meta it is
 * token-expiry metadata. So a configured-but-broken provider (e.g. OpenRouter
 * 402) is never shown green, and a never-exercised provider reads
 * "configured, not verified" rather than "connected".
 */

export type Liveness = {
  state: "verified" | "degraded" | "unknown";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorClass: string | null;
};

export type ProviderStatus = "connected" | "missing" | "blocked" | "optional";
export type ProviderGroup = "core" | "social" | "optional";

export type Provider = {
  key: string;
  name: string;
  group: ProviderGroup;
  status: ProviderStatus;
  envNames: string[];
  note?: string;
  liveness?: Liveness;
};

export type HealthEntry = { configured?: boolean; ok?: boolean; message?: string };
export type Health = {
  openrouter?: HealthEntry;
  socialdata?: HealthEntry;
  database?: HealthEntry;
  metaToken?: HealthEntry;
};

export type DisplayResult = {
  variant: "success" | "danger" | "yellow" | "muted";
  label: string;
  live?: string;
};

/** Providers whose shallow /api/health `ok` is a REAL connectivity probe (not
 *  env-presence). Only these may turn an unknown-liveness provider green. */
const REAL_HEALTH_PROBE_KEYS = new Set(["neon"]);

export function healthOf(key: string, h: Health | null): HealthEntry | undefined {
  if (!h) return undefined;
  if (key === "openrouter") return h.openrouter;
  if (key === "socialdata") return h.socialdata;
  if (key === "neon") return h.database;
  if (key === "meta") return h.metaToken;
  return undefined;
}

export function livenessNote(l: Liveness | undefined): string | undefined {
  if (!l) return undefined;
  if (l.state === "degraded") {
    const when = l.lastFailureAt ? new Date(l.lastFailureAt).toLocaleString("tr-TR") : "";
    return `Son çağrı başarısız${l.lastErrorClass ? ` (${l.lastErrorClass})` : ""}${when ? ` · ${when}` : ""}`;
  }
  if (l.state === "verified" && l.lastSuccessAt) {
    return `Son başarılı çağrı: ${new Date(l.lastSuccessAt).toLocaleString("tr-TR")}`;
  }
  return undefined;
}

export function display(p: Provider, h: Health | null): DisplayResult {
  if (p.status === "blocked") return { variant: "yellow", label: "engelli" };
  if (p.status === "missing") return { variant: "danger", label: "eksik" };
  if (p.status !== "connected") return { variant: "muted", label: "opsiyonel" };

  const he = healthOf(p.key, h);
  const lNote = livenessNote(p.liveness);
  const state = p.liveness?.state;

  // 1. Persisted ledger of the last REAL call wins — a failed call is the
  //    strongest signal and is never green; a success is genuinely verified.
  if (state === "degraded") return { variant: "yellow", label: "son çağrı başarısız", live: lNote };
  if (state === "verified") return { variant: "success", label: "bağlı", live: lNote };

  // 2. Liveness unknown (never exercised or no ledger). A real health probe that
  //    FAILED is meaningful for any provider; a passing probe upgrades to green
  //    ONLY where shallow health actually probed (database) — env-presence /
  //    token-expiry must not read as a live, verified connection.
  if (he?.ok === false) return { variant: "yellow", label: "yanıt yok", live: he.message };
  if (he?.ok === true && REAL_HEALTH_PROBE_KEYS.has(p.key)) {
    return { variant: "success", label: "bağlı", live: he.message };
  }
  return { variant: "muted", label: "yapılandırıldı · doğrulanmadı" };
}
