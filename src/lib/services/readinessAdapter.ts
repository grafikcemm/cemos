/**
 * QueueItem → ReadinessInput adaptörü (Faz 1C-d). SAF, yan-etkisiz. Prisma
 * tipine bağlanmadan (yapısal `*Like` girdi) — daily-queue route + publishService
 * AYNI adaptörü kullanır → kart/drawer/yayın-anı readiness tutarlı olur.
 *
 * `maxChars` = platform sabit sınırı (account.maxChars); publishService'in
 * char_limit kapısıyla tutarlı (tier hedef bandı değil, gerçek yayın sınırı).
 * `scores`/`lintReport` güvenli parse; şekil değişkenliğine dayanıklı.
 */

import {
  assessReadiness,
  type ReadinessInput,
  type ReadinessLeak,
  type ReadinessLintIssue,
  type ReadinessResult,
} from "./readinessService";
import { parseThreadSegments } from "@/lib/growth-engine/threadSegments";

/** QueueItem'in readiness için gereken alanları (yapısal alt-küme). */
export type ReadinessQueueItemLike = {
  content: string;
  editedContent: string | null;
  status: string;
  draftType: string;
  scores: string | null;
  lintReport: string | null;
  threadSegments: string | null;
  sourcePostId: string | null;
  newsItemId: string | null;
};

export type ReadinessAccountLike = {
  handle: string;
  maxChars: number;
};

function parseScores(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const p: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toLeaks(scores: Record<string, unknown>): ReadinessLeak[] {
  const raw = Array.isArray(scores.leaks) ? (scores.leaks as unknown[]) : [];
  return raw.map((l): ReadinessLeak => {
    const o = (l ?? {}) as Record<string, unknown>;
    const sev = o.severity;
    return {
      kind: String(o.kind ?? o.type ?? "leak"),
      severity: sev === "high" || sev === "med" || sev === "low" ? sev : "low",
      note: String(o.note ?? o.message ?? o.reason ?? ""),
    };
  });
}

function toLintIssues(raw: string | null): ReadinessLintIssue[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const issues: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { issues?: unknown[] })?.issues)
        ? ((parsed as { issues: unknown[] }).issues)
        : [];
    return issues.map((i): ReadinessLintIssue => {
      const o = (i ?? {}) as Record<string, unknown>;
      return {
        code: String(o.code ?? o.type ?? "lint"),
        severity: o.severity != null ? String(o.severity) : undefined,
        message: String(o.message ?? o.note ?? o.reason ?? ""),
      };
    });
  } catch {
    return [];
  }
}

/** QueueItem + Account → ReadinessInput. */
export function readinessInputFromQueueItem(
  item: ReadinessQueueItemLike,
  account: ReadinessAccountLike
): ReadinessInput {
  const scores = parseScores(item.scores);
  const telemetry = scores.telemetry as { judged?: unknown } | undefined;
  // Savunmacı default'lar = Prisma şema default'ları (content/status/draftType).
  // Bozuk/eksik tek satır assessReadiness'i (draftType.toUpperCase vb.) çökertip
  // tüm kuyruğu 500'lememeli.
  return {
    content: item.content ?? "",
    editedContent: item.editedContent ?? null,
    status: item.status ?? "new",
    draftType: item.draftType ?? "TWEET",
    accountHandle: account.handle === "maskulenkod" ? "maskulenkod" : "grafikcem",
    maxChars: account.maxChars || 280,
    judged: telemetry?.judged === true,
    turkishNaturalness: num(scores.turkishNaturalness),
    riskScore: num(scores.riskScore ?? scores.risk),
    sourceFaithfulness: num(scores.sourceFaithfulness),
    leaks: toLeaks(scores),
    lintIssues: toLintIssues(item.lintReport),
    hasSource: Boolean(item.sourcePostId || item.newsItemId),
    threadSegments: parseThreadSegments(item.threadSegments),
  };
}

/** Adaptör + assessReadiness tek çağrıda (route + publishService ortak yol). */
export function assessQueueItemReadiness(
  item: ReadinessQueueItemLike,
  account: ReadinessAccountLike
): ReadinessResult {
  return assessReadiness(readinessInputFromQueueItem(item, account));
}
