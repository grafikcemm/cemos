"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

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

export type SystemProblem = { label: string; detail?: string; severity: "error" | "warn" };

type SystemStatus = {
  todayCost: number | null;
  workerStatus: WorkerStatus;
  workerMode: WorkerMode;
  /** Ham /api/health cevabı (sorun drawer'ı için). */
  health: HealthPayload | null;
  /** Türetilmiş sorun listesi — boşsa sistem sağlıklı. */
  problems: SystemProblem[];
};

const CHECK_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  socialdata: "SocialData",
  buffer: "Buffer",
};

/** /api/health cevabından operatöre gösterilecek sorun listesini türetir. */
export function deriveProblems(health: HealthPayload | null): SystemProblem[] {
  if (!health) return [];
  const out: SystemProblem[] = [];
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
 * Polls /api/health + /api/costs every 60s. Extracted from the old Topbar so
 * the TopStrip status button and standalone routes can share one source.
 */
export function useSystemStatus(): SystemStatus {
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("unknown");
  const [workerMode, setWorkerMode] = useState<WorkerMode>("unknown");
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [healthRes, costsRes] = await Promise.all([
          fetchJson<HealthPayload>("/api/health"),
          fetchJson<{ today?: { totalUsd?: number } }>("/api/costs").catch(() => null),
        ]);
        if (!mounted) return;
        setHealth(healthRes ?? null);
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

  return { todayCost, workerStatus, workerMode, health, problems: deriveProblems(health) };
}
