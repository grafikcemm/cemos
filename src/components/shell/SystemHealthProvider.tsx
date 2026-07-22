"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import {
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
  /** Faz 1F (ADR-026): üç sözleşme + topbar sinyali — topbar/Sistem AYNI fetch'i tüketir. */
  contracts: SystemHealthContracts | null;
  todayCost: number | null;
  /** true → todayCost bir ÖNCEKİ başarılı okumadan; GÜNCEL değil (maliyet alınamadı).
   *  UI "$X" yerine "$X (eski)"/"—" göstermeli — sahte-güncel YOK. */
  costStale: boolean;
  workerMode: WorkerMode;
  refresh: () => void;
};

const CHECKING: SystemHealthResult = { state: "checking", problems: [], label: "kontrol ediliyor", hasError: false };

const SystemHealthContext = createContext<SystemHealthContextValue>({
  result: CHECKING,
  contracts: null,
  todayCost: null,
  costStale: false,
  workerMode: "unknown",
  refresh: () => {},
});

// Görünür sekmede yeni bir okuma en fazla bu sıklıkta; GİZLİ sekmede HİÇ. Eski 60sn
// sonsuz polling tarayıcı açık kaldıkça Neon egress'ini boşuna tüketiyordu (her
// tur /api/health + /api/costs). Manuel "Yenile" bundan bağımsız hemen çalışır.
const POLL_MS = 5 * 60 * 1000;

export function SystemHealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [contracts, setContracts] = useState<SystemHealthContracts | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [costStale, setCostStale] = useState(false);
  const [workerMode, setWorkerMode] = useState<WorkerMode>("unknown");
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    // Aynı anda İKİNCİ istek YOK (odak+interval+manuel çakışması egress'i katlıyordu).
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const healthRes = await fetchJson<HealthPayload & { contracts?: SystemHealthContracts | null }>(
        "/api/health",
      );
      // Hafif özet (yalnız bugünün toplamı, tek DB aggregate) — polling aylık TÜM
      // UsageLog satırlarını çekmez. Tam döküm CostsTab'ın parametresiz çağrısında.
      const costsRes = await fetchJson<{ today?: { totalUsd?: number } }>("/api/costs?scope=today").catch(() => null);
      if (!mounted.current) return;
      setHealth(healthRes ?? null);
      setContracts(healthRes?.contracts ?? null);
      setWorkerMode(healthRes?.worker?.mode ?? "unknown");
      setLoaded(true);
      setFetchError(false);
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
    // health "kontrol ediliyor"da TAKILMAZ (ilk okuma her zaman yapılır). Görünürlük
    // yalnız DEVAM EDEN polling'i yönetir (gizli sekme egress yakmasın diye).
    void load();
    let interval: ReturnType<typeof setInterval> | null = null;
    const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (isVisible()) void load();
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      // Gizli→görünür: tek taze okuma + polling sürer. Görünür→gizli: polling tamamen DURUR.
      if (isVisible()) {
        void load();
        startPolling();
      } else {
        stopPolling();
      }
    };
    if (isVisible()) startPolling();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false; // in-flight istek geri dönerse setState yapmaz (unmount guard)
      stopPolling();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const result = deriveSystemHealth({ loaded, fetchError, health });

  return (
    <SystemHealthContext.Provider value={{ result, contracts, todayCost, costStale, workerMode, refresh: load }}>
      {children}
    </SystemHealthContext.Provider>
  );
}

export function useSystemHealth(): SystemHealthContextValue {
  return useContext(SystemHealthContext);
}
