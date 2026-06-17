import { prisma } from "@/lib/db/client";
import { generateJson } from "@/lib/ai/openrouter";

/**
 * AI Sıralama otomatik güncelleme. Kullanıcının verdiği üç public leaderboard'u
 * çekip ucuz LLM ile mevcut snapshot shape'ine ({rank,model,provider,score,
 * bestFor}) normalize eder ve günün AiModelSnapshot satırına yazar.
 *
 * Tasarım — best-effort + graceful fallback:
 *   - Kaynaklar JS-SPA olabilir; sunucu fetch() boş/eksik dönerse ya da LLM
 *     yeterli (>=5) model çıkaramazsa MEVCUT snapshot'a DOKUNULMAZ (kötü veriyle
 *     üzerine yazılmaz). Böylece /api/ai-rankings her zaman son iyi veriyi verir
 *     (en kötü ihtimalle statik seed kalır).
 *   - LLM parse, leaderboard HTML değişimlerine kırılgan CSS-selector'lardan daha
 *     dayanıklı.
 */

const SOURCES: Array<{ name: string; url: string }> = [
  { name: "LMArena Leaderboard", url: "https://arena.ai/leaderboard/" },
  { name: "BenchLM", url: "https://benchlm.ai" },
  { name: "Artificial Analysis", url: "https://artificialanalysis.ai/models" },
];

const FETCH_TIMEOUT_MS = 15_000;
const MIN_USABLE_TEXT = 200;
const MIN_RANKINGS = 5;
const MAX_RANKINGS = 20;

export type RankingRow = {
  rank: number;
  model: string;
  provider: string;
  score: number;
  bestFor: string;
};

export type RefreshResult = {
  ok: boolean;
  source: string;
  count: number;
  reason?: string;
  snapshotDate?: string;
};

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchReadableText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CemOS-RankingsBot/1.0; +https://github.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function sanitize(rows: unknown): RankingRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      rank: Number(r.rank) || i + 1,
      model: String(r.model ?? "").trim(),
      provider: String(r.provider ?? "").trim() || "—",
      score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
      bestFor: String(r.bestFor ?? "").trim() || "—",
    }))
    .filter((r) => r.model.length > 0)
    .slice(0, MAX_RANKINGS)
    .sort((a, b) => a.rank - b.rank);
}

export async function refreshRankings(): Promise<RefreshResult> {
  const fetched = await Promise.all(
    SOURCES.map(async (s) => ({ name: s.name, text: await fetchReadableText(s.url) }))
  );
  const usable = fetched.filter((f) => f.text.length >= MIN_USABLE_TEXT);
  if (usable.length === 0) {
    return { ok: false, source: "none", count: 0, reason: "sources_unreadable" };
  }

  const system =
    "Sen bir AI model sıralama derleyicisisin. Sana birden çok LLM leaderboard " +
    "metni verilecek. Bunlardan GÜNCEL en iyi ~15 büyük dil modelini çıkar. " +
    'SADECE şu JSON formatında dön: {"rankings":[{"rank":1,"model":"...",' +
    '"provider":"...","score":0-100 arası sayı,"bestFor":"kısa Türkçe kullanım ' +
    'cümlesi"}]}. score 0-100 normalize edilmeli (en iyi ~96-100). provider = ' +
    "modeli yapan şirket. Aynı modeli tekrarlama.";
  const user = usable
    .map((u) => `### ${u.name}\n${u.text}`)
    .join("\n\n")
    .slice(0, 24_000);

  let rankings: RankingRow[] = [];
  try {
    const result = await generateJson<{ rankings: unknown }>({
      role: "cheapWriter",
      system,
      user,
      temperature: 0.1,
    });
    rankings = sanitize(result.data?.rankings);
  } catch (err) {
    return {
      ok: false,
      source: "llm_error",
      count: 0,
      reason: err instanceof Error ? err.message : "llm_failed",
    };
  }

  if (rankings.length < MIN_RANKINGS) {
    // Don't overwrite a good snapshot with a thin/garbled parse.
    return { ok: false, source: "auto-3sites", count: rankings.length, reason: "insufficient_rankings" };
  }

  const snapshotDate = todayInIstanbul();
  await prisma.aiModelSnapshot.upsert({
    where: { snapshotDate },
    create: { snapshotDate, rankingsJson: JSON.stringify(rankings), source: "auto-3sites" },
    update: { rankingsJson: JSON.stringify(rankings), source: "auto-3sites" },
  });

  return { ok: true, source: "auto-3sites", count: rankings.length, snapshotDate };
}
