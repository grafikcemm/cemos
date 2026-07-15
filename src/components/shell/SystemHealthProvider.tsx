"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import {
  deriveSystemHealth,
  type HealthPayload,
  type SystemHealthResult,
  type WorkerMode,
} from "@/lib/services/systemHealth";

/**
 * Sistem sağlığı — TEK fetch + TEK türetilmiş state (§8C). Topbar chip, Bugün
 * özeti tiki ve detay drawer'ı hepsi BU context'i tüketir → async race yüzünden
 * çelişkili durum oluşamaz (herkes aynı anlık state'i görür).
 */

type SystemHealthContextValue = {
  result: SystemHealthResult;
  todayCost: number | null;
  workerMode: WorkerMode;
  refresh: () => void;
};

const CHECKING: SystemHealthResult = { state: "checking", problems: [], label: "kontrol ediliyor", hasError: false };

const SystemHealthContext = createContext<SystemHealthContextValue>({
  result: CHECKING,
  todayCost: null,
  workerMode: "unknown",
  refresh: () => {},
});

export function SystemHealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [workerMode, setWorkerMode] = useState<WorkerMode>("unknown");
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const healthRes = await fetchJson<HealthPayload>("/api/health");
      const costsRes = await fetchJson<{ today?: { totalUsd?: number } }>("/api/costs").catch(() => null);
      if (!mounted.current) return;
      setHealth(healthRes ?? null);
      setWorkerMode(healthRes?.worker?.mode ?? "unknown");
      setLoaded(true);
      setFetchError(false);
      const today = costsRes?.today;
      if (today?.totalUsd != null) setTodayCost(today.totalUsd);
    } catch {
      // Health isteği başarısız → unavailable (kesin sayı YOK); eski veriyi bırak
      // ama fetchError bayrağı türetimi "durum alınamadı"ya çevirir (§8C).
      if (mounted.current) setFetchError(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [load]);

  const result = deriveSystemHealth({ loaded, fetchError, health });

  return (
    <SystemHealthContext.Provider value={{ result, todayCost, workerMode, refresh: load }}>
      {children}
    </SystemHealthContext.Provider>
  );
}

export function useSystemHealth(): SystemHealthContextValue {
  return useContext(SystemHealthContext);
}
