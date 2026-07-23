"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import {
  deriveDbAvailability,
  deriveSystemHealth,
  type HealthPayload,
  type SystemHealthResult,
  type WorkerMode,
} from "@/lib/services/systemHealth";
import type { SystemHealthContracts } from "@/lib/health/healthContracts";

/**
 * Sistem sağlığı — TEK fetch + TEK türetilmiş state (§8C). Topbar chip, Bugün
 * özeti tiki ve detay drawer'ı hepsi BU context'i tüketir → async race yüzünden
 * çelişkili durum oluşamaz (herkes aynı anlık state'i görür).
 */

type SystemHealthContextValue = {
  result: SystemHealthResult;
  /** WP-02: ham /api/health payload'ı — Settings/Integrations/Discovery gibi
   *  yüzeyler KENDİ /api/health fetch'ini atmaz, bu tek okumayı tüketir
   *  (navigation-burst kaynağı kapatıldı). */
  health: HealthPayload | null;
  /** Faz 1F (ADR-026): üç sözleşme + topbar sinyali — topbar/Sistem AYNI fetch'i tüketir. */
  contracts: SystemHealthContracts | null;
  todayCost: number | null;
  /** true → todayCost bir ÖNCEKİ başarılı okumadan; GÜNCEL değil (maliyet alınamadı).
   *  UI "$X" yerine "$X (eski)"/"—" göstermeli — sahte-güncel YOK. */
  costStale: boolean;
  /** WP-01: DOĞRULANMIŞ DB-erişilemezlik sinyali (health 200 + database.ok:false).
   *  TEK kaynak — global bant + ekranlar bunu tüketir; ekran başına ayrı teşhis yok. */
  dbUnavailable: boolean;
  /** Breaker açıkken sunucunun önerdiği bekleme süresi (istemci backoff ipucu). */
  dbRetryAfterSeconds: number | null;
  /** Son "DB sağlıklı" health cevabının damgası — bant "son başarılı veri" gösterimi. */
  lastGoodAt: string | null;
  workerMode: WorkerMode;
  refresh: () => void;
};

const CHECKING: SystemHealthResult = { state: "checking", problems: [], label: "kontrol ediliyor", hasError: false };

const SystemHealthContext = createContext<SystemHealthContextValue>({
  result: CHECKING,
  health: null,
  contracts: null,
  todayCost: null,
  costStale: false,
  dbUnavailable: false,
  dbRetryAfterSeconds: null,
  lastGoodAt: null,
  workerMode: "unknown",
  refresh: () => {},
});

// WP-02 (FINAL-OPERATIONAL-CLOSURE-PLAN §10) — periyodik DB health polling
// KALDIRILDI; kanıtlanmış kök neden: 5 dakikalık poll ↔ Neon 5 dakikalık
// autosuspend çakışması compute'u sürekli uyanık tutup DATA-TRANSFER kotasını
// yaktı (2026-07-23 probe: "exceeded the data transfer quota").
//
// Yeni model — event-driven revalidation:
//   • mount'ta bir kez;
//   • sekme gizli→görünür olduğunda / pencere focus aldığında (freshness-guard'lı);
//   • manuel "Yenile" (guard'ı BYPASS eder — operatör niyeti);
//   • mutation-sonrası: ekranlar context'teki refresh()'i çağırır.
// Güvenlik ağı: görünür sekmede EN SIK 30 dakikada bir arka plan tazelemesi
// (plan sınırı ≥15-30 dk); gizli sekmede HİÇBİR periyodik istek yok.
//
// DB-down bastırma (WP-01 breaker ile uçtan uca): health degraded döndüğünde
// event-tetikli okumalar sunucunun retryAfterSeconds ipucuna (yoksa 30 sn
// tabana) göre susturulur — focus-flap fırtınası DB'ye istek üretmez.
const SAFETY_NET_MS = 30 * 60 * 1000;
const FOCUS_MIN_INTERVAL_MS = 60 * 1000;
const DB_DOWN_MIN_INTERVAL_MS = 30 * 1000;

export function SystemHealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [contracts, setContracts] = useState<SystemHealthContracts | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [costStale, setCostStale] = useState(false);
  const [lastGoodAt, setLastGoodAt] = useState<string | null>(null);
  const [workerMode, setWorkerMode] = useState<WorkerMode>("unknown");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const lastLoadAt = useRef(0);
  // load() callback'i state'e bağımlı olmadan güncel health'i okuyabilsin diye ref
  // aynası (yoksa her health değişimi load identity'sini değiştirip effect'i yeniden
  // kurar). Yalnız guard hesabında okunur.
  const healthRef = useRef<HealthPayload | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    // Aynı anda İKİNCİ istek YOK (odak+manuel çakışması egress'i katlıyordu).
    if (inFlight.current) return;
    // Freshness/backoff guard (manuel Yenile bypass eder): normalde 60 sn'den taze
    // veriyi focus-flap yeniden çekmez; DB-down'da sunucu breaker ipucu kadar sus.
    if (!opts?.force) {
      const availability = deriveDbAvailability(healthRef.current);
      const minInterval = availability.dbUnavailable
        ? Math.max((availability.retryAfterSeconds ?? 0) * 1000, DB_DOWN_MIN_INTERVAL_MS)
        : FOCUS_MIN_INTERVAL_MS;
      if (Date.now() - lastLoadAt.current < minInterval) return;
    }
    inFlight.current = true;
    lastLoadAt.current = Date.now();
    try {
      const healthRes = await fetchJson<HealthPayload & { contracts?: SystemHealthContracts | null }>(
        "/api/health",
      );
      // Hafif özet (yalnız bugünün toplamı, tek DB aggregate) — polling aylık TÜM
      // UsageLog satırlarını çekmez. Tam döküm CostsTab'ın parametresiz çağrısında.
      const costsRes = await fetchJson<{ today?: { totalUsd?: number } }>("/api/costs?scope=today").catch(() => null);
      if (!mounted.current) return;
      healthRef.current = healthRes ?? null;
      setHealth(healthRes ?? null);
      setContracts(healthRes?.contracts ?? null);
      setWorkerMode(healthRes?.worker?.mode ?? "unknown");
      setLoaded(true);
      setFetchError(false);
      // WP-01 last-known-good: yalnız DB gerçekten sağlıklıyken damga ilerler —
      // degraded cevaplar (200 + database.ok:false) eski damgayı KORUR ki bant
      // "son başarılı veri: HH:MM" dürüst kalsın.
      if (healthRes && healthRes.database?.ok !== false) {
        setLastGoodAt(healthRes.generatedAt ?? new Date().toISOString());
      }
      const today = costsRes?.today;
      if (today?.totalUsd != null) {
        setTodayCost(today.totalUsd);
        setCostStale(false);
      } else {
        // Maliyet alınamadı → eski değeri GÜNCEL gibi gösterme: STALE işaretle
        // (todayCost yoksa UI "—", varsa "$X (eski)" gösterir — sahte $0.00 YOK).
        setCostStale(true);
      }
    } catch {
      // Health isteği başarısız → unavailable (kesin sayı YOK); eski veriyi bırak
      // ama fetchError bayrağı türetimi "durum alınamadı"ya çevirir (§8C).
      if (mounted.current) {
        setFetchError(true);
        setCostStale(true);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Görünürlükten BAĞIMSIZ: her mount'ta BİR kez yükle → sekme "hidden" boyansa bile
    // health "kontrol ediliyor"da TAKILMAZ (ilk okuma her zaman yapılır; force —
    // guard ilk okumayı asla geciktirmesin).
    void load({ force: true });
    let safetyNet: ReturnType<typeof setInterval> | null = null;
    const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const startSafetyNet = () => {
      if (safetyNet) return;
      // 30 dakikalık görünür-sekme güvenlik ağı — periyodik POLLING değil,
      // "uzun süre açık kalan sekme sonsuza dek bayat kalmasın" tazelemesi.
      safetyNet = setInterval(() => {
        if (isVisible()) void load();
      }, SAFETY_NET_MS);
    };
    const stopSafetyNet = () => {
      if (safetyNet) {
        clearInterval(safetyNet);
        safetyNet = null;
      }
    };
    const onVisibility = () => {
      // Gizli→görünür: guard'lı tek okuma. Görünür→gizli: her şey tamamen DURUR.
      if (isVisible()) {
        void load();
        startSafetyNet();
      } else {
        stopSafetyNet();
      }
    };
    // window focus ayrı sinyaldir (aynı-sekme iframe/devtools dönüşleri visibility
    // üretmez) — guard 60 sn tabanıyla flap'i zaten bastırır.
    const onFocus = () => {
      if (isVisible()) void load();
    };
    if (isVisible()) startSafetyNet();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false; // in-flight istek geri dönerse setState yapmaz (unmount guard)
      stopSafetyNet();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Manuel Yenile + mutation-sonrası revalidation: guard'ı bypass eder.
  // Sabit identity (useCallback) — tüketici effect'leri her render'da yeniden kurulmasın.
  const refresh = useCallback(() => {
    void load({ force: true });
  }, [load]);

  const result = deriveSystemHealth({ loaded, fetchError, health });
  const dbAvailability = deriveDbAvailability(health);

  return (
    <SystemHealthContext.Provider
      value={{
        result,
        health,
        contracts,
        todayCost,
        costStale,
        dbUnavailable: dbAvailability.dbUnavailable,
        dbRetryAfterSeconds: dbAvailability.retryAfterSeconds,
        lastGoodAt,
        workerMode,
        refresh,
      }}
    >
      {children}
    </SystemHealthContext.Provider>
  );
}

export function useSystemHealth(): SystemHealthContextValue {
  return useContext(SystemHealthContext);
}
