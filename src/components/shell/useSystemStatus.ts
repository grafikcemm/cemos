"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

export type WorkerStatus = "unknown" | "recent_tick" | "stale";
export type WorkerMode = "worker" | "cron" | "unknown";

type SystemStatus = {
  todayCost: number | null;
  workerStatus: WorkerStatus;
  workerMode: WorkerMode;
};

/**
 * Polls /api/health + /api/costs every 60s. Extracted from the old Topbar so
 * the sidebar SystemStatus and standalone routes can share one source.
 */
export function useSystemStatus(): SystemStatus {
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("unknown");
  const [workerMode, setWorkerMode] = useState<WorkerMode>("unknown");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [healthRes, costsRes] = await Promise.all([
          fetchJson<{ worker?: { inferredStatus?: WorkerStatus; mode?: WorkerMode } }>("/api/health"),
          fetchJson<{ today?: { totalUsd?: number } }>("/api/costs").catch(() => null),
        ]);
        if (!mounted) return;
        setWorkerStatus(healthRes?.worker?.inferredStatus ?? "unknown");
        setWorkerMode(healthRes?.worker?.mode ?? "unknown");
        const today = (costsRes as { today?: { totalUsd?: number } } | null)?.today;
        if (today?.totalUsd != null) setTodayCost(today.totalUsd);
      } catch {
        /* health/costs are best-effort; ignore transient failures */
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { todayCost, workerStatus, workerMode };
}
