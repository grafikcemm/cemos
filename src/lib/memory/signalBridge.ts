import { prisma } from "@/lib/db/client";
import {
  proposeFact,
  type MemoryEvidenceDirection,
  type MemoryFactType,
} from "./memoryFactService";

/**
 * Deterministik memory sinyal köprüsü (ADR-029, Faz 2B). LLM'SİZ katman:
 * FeedbackEvent → typed MemorySignal → idempotent kanıt + proposal.
 *
 * Bağlayıcı kurallar:
 *  - TEK event kural DEĞİLDİR: köprü yalnız proposal+kanıt üretir; aktifleşme
 *    ≥3 distinct kanıt + insan onayı ister (memoryFactService).
 *  - Tanımlı feedback tag'leri (not_my_tone/hook_weak/too_ai/make_stronger/
 *    make_clearer) SABİT canonical kural adaylarına gider — serbest metinden
 *    deterministik anlam UYDURULMAZ.
 *  - Mekanik/generic reason ("Daily Queue editor feedback", "Manuel
 *    paylaşıldı…", "Editor action: …", boş) identity kuralına DÖNÜŞMEZ.
 *  - Gerçek kullanıcı reason'ı operatörün KENDİ sözleridir → statement olarak
 *    verbatim kullanılır (icat edilmiş yorum yok); tekrar ederse kanıt birikir.
 *  - editDistance sinyal GÜCÜ ölçer; tek başına üslup tercihi çıkaramaz →
 *    kural üretmez. approved/rejected reason'sız → yalnız metrik, kural yok.
 *  - engagement_high/low performans alanıdır → identity'ye ASLA yazılmaz.
 *  - Hafıza tarafındaki hata esas feedback kaydını KAYBETTİRMEZ (best-effort
 *    + haftalık reconciliation tamamlar; unique sayesinde tekrar güvenli).
 */

export const MEMORY_SIGNAL_SCHEMA_VERSION = "1";

/** Sabit, testli canonical kural adayları (tag → tek Türkçe yazım kuralı). */
export const CANONICAL_FEEDBACK_RULES: Record<
  string,
  { statement: string; direction: MemoryEvidenceDirection; type: MemoryFactType }
> = {
  not_my_tone: {
    statement: "Hesap sesine sadık kal — operatörün 'ton dışı' işaretlediği üsluptan uzak dur.",
    direction: "negative",
    type: "preference",
  },
  hook_weak: {
    statement: "Açılış cümlesini güçlü ve somut kur — zayıf hook operatör tarafından işaretlendi.",
    direction: "negative",
    type: "preference",
  },
  too_ai: {
    statement: "Yapay/AI kokan kalıplardan kaçın; doğal, birinci elden dil kullan.",
    direction: "negative",
    type: "preference",
  },
  make_stronger: {
    statement: "İddiayı somutlaştır ve güçlendir — yumuşak/geçiştiren ifade bırakma.",
    direction: "edit",
    type: "preference",
  },
  make_clearer: {
    statement: "Cümleleri sadeleştir ve netleştir — dolambaçlı anlatımdan kaçın.",
    direction: "edit",
    type: "preference",
  },
};

/** Identity kuralına dönüşmesi YASAK mekanik/otomatik neden kalıpları. */
const MECHANICAL_REASON_PATTERNS: RegExp[] = [
  /^daily queue editor feedback$/i,
  /^manuel paylaşıldı/i,
  /^editor action:/i,
  /^engagement (high|low)/i,
];

const EXPLICIT_REASON_MIN = 12;
const EXPLICIT_REASON_MAX = 300;

export function isMechanicalReason(reason: string): boolean {
  const r = reason.trim();
  if (!r) return true;
  return MECHANICAL_REASON_PATTERNS.some((p) => p.test(r));
}

/** reason kolonu düz string YA DA {text, editDistance} JSON'u olabilir (feedback-service sözleşmesi). */
export function extractReasonText(rawReason: string): string {
  const r = (rawReason ?? "").trim();
  if (!r) return "";
  if (r.startsWith("{")) {
    try {
      const parsed = JSON.parse(r) as { text?: unknown };
      return typeof parsed.text === "string" ? parsed.text.trim() : "";
    } catch {
      return r;
    }
  }
  return r;
}

export type FeedbackEventLike = {
  id: string;
  feedbackType: string;
  reason: string;
  editedContent: string;
  originalContent: string | null;
  editDistance: number | null;
  createdAt: Date;
};

export type MemorySignal = {
  kind: "canonical_rule" | "explicit_reason";
  signalType: string;
  direction: MemoryEvidenceDirection;
  proposal: { type: MemoryFactType; statement: string };
  excerpt: string;
};

/**
 * Saf türetim: hangi event identity proposal'ı üretebilir?
 * null = bilinçli olarak kural üretmeyen sinyal (metrik/performans/mekanik).
 */
export function deriveMemorySignal(event: FeedbackEventLike): MemorySignal | null {
  const reasonText = extractReasonText(event.reason);

  // 1) Tanımlı tag → sabit canonical kural adayı.
  const canonical = CANONICAL_FEEDBACK_RULES[event.feedbackType];
  if (canonical) {
    return {
      kind: "canonical_rule",
      signalType: event.feedbackType,
      direction: canonical.direction,
      proposal: { type: canonical.type, statement: canonical.statement },
      excerpt: !isMechanicalReason(reasonText) ? reasonText : (event.originalContent ?? "").slice(0, 120),
    };
  }

  // 2) approved/rejected/edited + GERÇEK kullanıcı reason'ı → operatörün kendi
  //    sözleri statement olur (uydurma yorum yok). Mekanik/kısa reason üretmez.
  if (["approved", "rejected", "edited"].includes(event.feedbackType)) {
    if (
      !isMechanicalReason(reasonText) &&
      reasonText.length >= EXPLICIT_REASON_MIN &&
      reasonText.length <= EXPLICIT_REASON_MAX
    ) {
      const direction: MemoryEvidenceDirection =
        event.feedbackType === "approved" ? "positive" : event.feedbackType === "rejected" ? "negative" : "edit";
      return {
        kind: "explicit_reason",
        signalType: "explicit_reason",
        direction,
        proposal: { type: "preference", statement: reasonText },
        excerpt: reasonText,
      };
    }
    return null; // yalnız metrik — editDistance/karar tek başına kural üretemez
  }

  // 3) engagement_* = performans alanı; diğer her şey → sinyal yok.
  return null;
}

export type IngestResult =
  | { ingested: true; factId: string; outcome: "created" | "corroborated"; reviewReady: boolean }
  | { ingested: false; reason: "no_signal" | "no_handle" | "skipped_empty" };

/** Tek FeedbackEvent'i deftere/proposal'a idempotent işler. */
export async function ingestFeedbackSignal(
  event: FeedbackEventLike,
  accountHandle: string
): Promise<IngestResult> {
  const signal = deriveMemorySignal(event);
  if (!signal) return { ingested: false, reason: "no_signal" };
  if (!accountHandle) return { ingested: false, reason: "no_handle" };

  const r = await proposeFact({
    accountHandle,
    type: signal.proposal.type,
    statement: signal.proposal.statement,
    // Kaynak = operatörün açık eylemi (tık/yazı); ifade makine-derlemesi
    // olduğundan createdBy=feedback_pipeline → otomatik aktifleşme imkânsız.
    provenance: "operator",
    createdBy: "feedback_pipeline",
    evidence: {
      sourceType: "feedback_event",
      sourceId: event.id,
      signalType: signal.signalType,
      direction: signal.direction,
      excerpt: signal.excerpt,
      metadata: {
        feedbackType: event.feedbackType,
        ...(typeof event.editDistance === "number" ? { editDistance: event.editDistance } : {}),
        signalSchemaVersion: MEMORY_SIGNAL_SCHEMA_VERSION,
      },
      observedAt: event.createdAt,
    },
  });
  if (r.outcome === "skipped_empty") return { ingested: false, reason: "skipped_empty" };
  return {
    ingested: true,
    factId: r.factId,
    outcome: r.outcome,
    reviewReady: r.outcome === "created" ? r.reviewReady : r.reviewReady,
  };
}

export type ReconcileSummary = {
  scanned: number;
  ingested: number;
  alreadyLinked: number;
  noSignal: number;
  errors: number;
};

const RECONCILE_LOOKBACK_DAYS = 14;
const RECONCILE_MAX_EVENTS = 200;

/**
 * LLM'siz reconciliation (haftalık learn zincirinde koşar): son dönem
 * FeedbackEvent'lerinden deftere bağlanmamış olanları tamamlar. Unique
 * constraint sayesinde tekrar koşmak güvenlidir (idempotent).
 */
export async function reconcileFeedbackSignals(opts?: {
  lookbackDays?: number;
  limit?: number;
}): Promise<ReconcileSummary> {
  const lookbackDays = opts?.lookbackDays ?? RECONCILE_LOOKBACK_DAYS;
  const limit = Math.min(Math.max(opts?.limit ?? RECONCILE_MAX_EVENTS, 1), 500);
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const relevantTypes = [...Object.keys(CANONICAL_FEEDBACK_RULES), "approved", "rejected", "edited"];
  const events = await prisma.feedbackEvent.findMany({
    where: { createdAt: { gte: cutoff }, feedbackType: { in: relevantTypes } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { account: { select: { handle: true } } },
  });

  const summary: ReconcileSummary = { scanned: events.length, ingested: 0, alreadyLinked: 0, noSignal: 0, errors: 0 };
  if (events.length === 0) return summary;

  // Tek sorguda mevcut bağlantılar (event başına N+1 yok).
  const linked = await prisma.memoryEvidence.findMany({
    where: { sourceType: "feedback_event", sourceId: { in: events.map((e) => e.id) } },
    select: { sourceId: true },
  });
  const linkedIds = new Set(linked.map((l) => l.sourceId));

  for (const ev of events) {
    if (linkedIds.has(ev.id)) {
      summary.alreadyLinked++;
      continue;
    }
    try {
      const r = await ingestFeedbackSignal(
        {
          id: ev.id,
          feedbackType: ev.feedbackType,
          reason: ev.reason,
          editedContent: ev.editedContent,
          originalContent: ev.originalContent,
          editDistance: ev.editDistance,
          createdAt: ev.createdAt,
        },
        ev.account?.handle ?? ""
      );
      if (r.ingested) summary.ingested++;
      else summary.noSignal++;
    } catch {
      summary.errors++; // tek event hatası taramayı durdurmaz
    }
  }
  return summary;
}
