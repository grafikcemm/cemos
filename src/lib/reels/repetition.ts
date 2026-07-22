/**
 * Aylık plan tekrar histogramı (Phase 3E, ADR-039 §6) — SAF, deterministik,
 * LLM'siz. Mevcut Türkçe normalize/similarity util'leri kullanır (yeniden
 * yazılmaz). Çok boyutlu değerlendirir: pillar / seriesKey / normalized topic /
 * primary tool (canonical URL) / hook shape.
 *
 * Sinyaller yalnız yeni slotlardan DEĞİL, yakın geçmişten de gelir (mevcut ay +
 * önceki ~90 gün + seri pastTopics). Böylece "geçen ay aynı aracı 3 kez
 * gösterdim" gibi tekrarlar da yakalanır. Tekrarlar UYARI'dır (plan üretimini
 * bloklamaz); yapısal ihlaller (banned exact, aynı dossier çift slot) çağıran
 * katmanda hard-block edilir.
 */

import { normalizeTurkish, isNearDuplicate } from "@/lib/utils/textSimilarity";

export type RepetitionDimension = "pillar" | "series" | "topic" | "tool" | "hook";

export type SignalOrigin = "new" | "current_month" | "history";

/** Tekil bir içerik parçasının tekrar-ilgili imzası. */
export type RepetitionSignal = {
  pillar: string;
  seriesKey: string | null;
  /** Ham konu metni (normalize edilmeden verilir; modül normalize eder). */
  topic: string;
  /** Adlandırılmış aracın canonical URL'i (varsa). */
  toolUrl?: string | null;
  /** Hook şekli/şablonu (varsa; genelde geçmiş dossier'lardan). */
  hookShape?: string | null;
  dayOfMonth?: number | null;
  origin: SignalOrigin;
};

export type RepetitionFinding = {
  dimension: RepetitionDimension;
  /** Tekrar eden normalize anahtar (pillar adı, seriesKey, konu temsilcisi...). */
  key: string;
  count: number;
  message: string;
};

export type RepetitionHistogram = {
  byPillar: Record<string, number>;
  bySeries: Record<string, number>;
  byTool: Record<string, number>;
  byHook: Record<string, number>;
  /** Normalize konu kümeleri (near-duplicate gruplandırması). */
  topicClusters: Array<{ representative: string; members: string[]; count: number }>;
  findings: RepetitionFinding[];
};

// ── İsimlendirilmiş eşikler (magic number dağıtma) ────────────────────────────
export const REPEAT_PILLAR_WARN = 4; // toplam (ay + geçmiş) aynı pillar
export const REPEAT_SERIES_WARN = 5; // toplam aynı seri
export const REPEAT_TOOL_WARN = 2; // aynı canonical araç URL'i
export const REPEAT_HOOK_WARN = 2; // aynı hook şekli
export const TOPIC_DUP_THRESHOLD = 0.82; // near-duplicate konu eşiği

function normUrl(raw: string): string {
  // Canonical: protokol/www/sonda slash/query fark etmez.
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

/** İki konu tam eşleşiyor mu (Türkçe normalize sonrası birebir). */
export function isExactTopicMatch(a: string, b: string): boolean {
  const na = normalizeTurkish(a);
  const nb = normalizeTurkish(b);
  return na !== "" && na === nb;
}

/** `topic`, listedeki herhangi bir konuyla near-duplicate mi (exact dahil). */
export function matchesAnyTopic(
  topic: string,
  list: readonly string[],
  threshold = TOPIC_DUP_THRESHOLD
): string | null {
  for (const other of list) {
    if (isExactTopicMatch(topic, other) || isNearDuplicate(topic, other, threshold)) {
      return other;
    }
  }
  return null;
}

/**
 * Çok boyutlu tekrar histogramı. Sinyaller (yeni + geçmiş) üzerinden sayım
 * yapar; eşik aşan boyutlar `findings` içine UYARI olarak yazılır. Deterministik:
 * girdi sırası korunur, near-duplicate kümeleme ilk-görülen temsilci mantığıyla.
 */
export function buildRepetitionHistogram(signals: RepetitionSignal[]): RepetitionHistogram {
  const byPillar: Record<string, number> = {};
  const bySeries: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const byHook: Record<string, number> = {};

  for (const s of signals) {
    if (s.pillar) bump(byPillar, s.pillar);
    if (s.seriesKey) bump(bySeries, s.seriesKey);
    if (s.toolUrl) bump(byTool, normUrl(s.toolUrl));
    if (s.hookShape && s.hookShape.trim() !== "") bump(byHook, normalizeTurkish(s.hookShape));
  }

  // Konu near-duplicate kümeleri (ilk görülen = temsilci).
  const clusters: Array<{ representative: string; normalized: string; members: string[] }> = [];
  for (const s of signals) {
    const topic = (s.topic ?? "").trim();
    if (topic === "" || normalizeTurkish(topic) === "") continue;
    const hit = clusters.find(
      (c) =>
        isExactTopicMatch(c.representative, topic) ||
        isNearDuplicate(c.representative, topic, TOPIC_DUP_THRESHOLD)
    );
    if (hit) hit.members.push(topic);
    else clusters.push({ representative: topic, normalized: normalizeTurkish(topic), members: [topic] });
  }

  const findings: RepetitionFinding[] = [];
  for (const [pillar, count] of Object.entries(byPillar)) {
    if (count >= REPEAT_PILLAR_WARN) {
      findings.push({
        dimension: "pillar",
        key: pillar,
        count,
        message: `Tekrar: "${pillar}" sütunu bu ay + yakın geçmişte ${count} kez (eşik ${REPEAT_PILLAR_WARN}).`,
      });
    }
  }
  for (const [series, count] of Object.entries(bySeries)) {
    if (count >= REPEAT_SERIES_WARN) {
      findings.push({
        dimension: "series",
        key: series,
        count,
        message: `Tekrar: "${series}" serisi ${count} kez (eşik ${REPEAT_SERIES_WARN}) — çeşitlendir.`,
      });
    }
  }
  for (const [tool, count] of Object.entries(byTool)) {
    if (count >= REPEAT_TOOL_WARN) {
      findings.push({
        dimension: "tool",
        key: tool,
        count,
        message: `Tekrar: "${tool}" aracı ${count} kez gösteriliyor (eşik ${REPEAT_TOOL_WARN}).`,
      });
    }
  }
  for (const [hook, count] of Object.entries(byHook)) {
    if (count >= REPEAT_HOOK_WARN) {
      findings.push({
        dimension: "hook",
        key: hook,
        count,
        message: `Tekrar: aynı hook şekli ${count} kez (eşik ${REPEAT_HOOK_WARN}) — hook'u değiştir.`,
      });
    }
  }
  for (const c of clusters) {
    if (c.members.length >= 2) {
      findings.push({
        dimension: "topic",
        key: c.representative,
        count: c.members.length,
        message: `Benzer konu ${c.members.length} kez: "${c.representative}" (yakın-tekrar).`,
      });
    }
  }

  return {
    byPillar,
    bySeries,
    byTool,
    byHook,
    topicClusters: clusters.map((c) => ({
      representative: c.representative,
      members: c.members,
      count: c.members.length,
    })),
    findings,
  };
}
