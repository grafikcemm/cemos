import { prisma } from "@/lib/db/client";
import { isKnownAccountHandle } from "@/lib/growth-engine/account-adapter";
import {
  MemoryEvidenceMetadataSchema,
  MemoryScopeError,
  PROMOTION_MIN_EVIDENCE,
} from "./memoryFactService";
import { extractReasonText, isMechanicalReason } from "./signalBridge";

/**
 * Kaynaklı "CemOS benim hakkımda ne biliyor?" read modeli (ADR-030, Faz 2B).
 *
 * Typed, server-side, LLM'SİZ: özet cümlesi gerçek DB sayılarından türetilir.
 * Truth katmanları AYRI tutulur ve tek "AI hafızası"na ezilmez:
 *  - identity/yazım kuralları → MemoryFact (insan onaylı) + MemoryEvidence
 *  - performans dersleri → validated ViralPattern (lessonGate'i geçmiş)
 *  - ham sinyaller → FeedbackEvent özeti
 * Bölüm bazlı fail-soft: tek bölüm düşerse diğerleri yaşar (sectionErrors).
 * Secret/credential/sınırsız dış içerik DÖNDÜRÜLMEZ; excerpt zaten ≤280.
 */

export type KnowledgeEvidence = {
  id: string;
  sourceType: string;
  sourceId: string;
  signalType: string;
  direction: string;
  excerpt: string;
  observedAt: string;
  /** Kaynak kayıt (ör. FeedbackEvent) hâlâ DB'de mi? */
  sourceAvailable: boolean;
  /** metadataJson şemadan geçmediyse fail-closed işaret (içerik gösterilmez). */
  metadataInvalid: boolean;
};

export type KnowledgeFact = {
  id: string;
  statement: string;
  type: string;
  status: string;
  sourceProvenance: string;
  createdBy: string;
  confidence: number;
  /** Toplam kanıt sayacı (defter + defter-öncesi eski sayım). */
  evidenceCount: number;
  /** Defterdeki distinct KAYNAKLI kanıt sayısı. */
  sourcedEvidenceCount: number;
  /** Defteri olmayan eski kayıt — UI "eski kayıt · kaynak ayrıntısı yok" gösterir. */
  legacyUnattributed: boolean;
  /** ADR-029: öneri onaylanabilir mi (operator ya da ≥3 kaynaklı kanıt)? */
  reviewReady: boolean;
  /** Yalnız AKTİF kural taslakları etkiler. */
  influencesDrafts: boolean;
  supersedesId: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: KnowledgeEvidence[];
};

export type PerformanceLesson = {
  id: string;
  patternName: string;
  hookType: string | null;
  emotion: string;
  platform: string;
  validatedAt: string;
  validatedSupport: number;
};

export type RecentSignal = {
  id: string;
  feedbackType: string;
  createdAt: string;
  mechanical: boolean;
};

export type KnowledgeReadModel = {
  accountHandle: string;
  summary: string;
  activeFacts: KnowledgeFact[];
  proposals: KnowledgeFact[];
  performanceLessons: PerformanceLesson[];
  recentSignals: { counts: Record<string, number>; latest: RecentSignal[] };
  policy: {
    promotionMinEvidence: number;
    note: string;
  };
  sectionErrors: string[];
};

const RECENT_SIGNAL_DAYS = 14;
const EVIDENCE_PER_FACT = 10;

type FactRow = {
  id: string;
  accountHandle: string | null;
  type: string;
  statement: string;
  confidence: number;
  evidenceCount: number;
  sourceProvenance: string;
  status: string;
  supersedesId: string | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  evidence: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    signalType: string;
    direction: string;
    excerpt: string;
    metadataJson: string;
    observedAt: Date;
  }>;
};

function toKnowledgeFact(row: FactRow, feedbackSourceIds: Set<string>): KnowledgeFact {
  const sourced = row.evidence.length;
  const evidence: KnowledgeEvidence[] = row.evidence.map((e) => {
    let metadataInvalid = false;
    try {
      const parsed = MemoryEvidenceMetadataSchema.safeParse(JSON.parse(e.metadataJson));
      metadataInvalid = !parsed.success;
    } catch {
      metadataInvalid = true; // fail-closed: bozuk metadata içeriği gösterilmez
    }
    return {
      id: e.id,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      signalType: e.signalType,
      direction: e.direction,
      excerpt: e.excerpt,
      observedAt: e.observedAt.toISOString(),
      sourceAvailable: e.sourceType === "feedback_event" ? feedbackSourceIds.has(e.sourceId) : true,
      metadataInvalid,
    };
  });
  return {
    id: row.id,
    statement: row.statement,
    type: row.type,
    status: row.status,
    sourceProvenance: row.sourceProvenance,
    createdBy: row.createdBy,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    sourcedEvidenceCount: sourced,
    legacyUnattributed: sourced === 0,
    reviewReady: row.createdBy === "operator" || sourced >= PROMOTION_MIN_EVIDENCE,
    influencesDrafts: row.status === "active",
    supersedesId: row.supersedesId,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    evidence,
  };
}

export async function buildKnowledgeReadModel(accountHandle: string): Promise<KnowledgeReadModel> {
  if (!isKnownAccountHandle(accountHandle)) throw new MemoryScopeError(accountHandle);
  const sectionErrors: string[] = [];

  // ── Identity katmanı (aktif + bekleyen; global kurallar dahil) ──
  let activeFacts: KnowledgeFact[] = [];
  let proposals: KnowledgeFact[] = [];
  try {
    const rows = (await prisma.memoryFact.findMany({
      where: {
        status: { in: ["active", "proposed"] },
        OR: [{ accountHandle }, { accountHandle: null }],
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { evidence: { orderBy: { createdAt: "desc" }, take: EVIDENCE_PER_FACT } },
    })) as unknown as FactRow[];

    // Kaynak-hâlâ-mevcut kontrolü tek sorguda (N+1 yok).
    const feedbackIds = rows
      .flatMap((r) => r.evidence)
      .filter((e) => e.sourceType === "feedback_event")
      .map((e) => e.sourceId);
    const existing =
      feedbackIds.length > 0
        ? await prisma.feedbackEvent.findMany({ where: { id: { in: feedbackIds } }, select: { id: true } })
        : [];
    const feedbackSourceIds = new Set(existing.map((e) => e.id));

    const mapped = rows.map((r) => toKnowledgeFact(r, feedbackSourceIds));
    activeFacts = mapped.filter((f) => f.status === "active");
    proposals = mapped.filter((f) => f.status === "proposed");
  } catch (err) {
    sectionErrors.push(`identity: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  // ── Performans dersleri (identity'den AYRI truth store — ADR-030) ──
  let performanceLessons: PerformanceLesson[] = [];
  try {
    const account = await prisma.account.findUnique({ where: { handle: accountHandle }, select: { id: true } });
    if (account) {
      const patterns = await prisma.viralPattern.findMany({
        where: { accountId: account.id, validatedAt: { not: null }, isActive: true },
        orderBy: { validatedAt: "desc" },
        take: 20,
      });
      performanceLessons = patterns.map((p) => ({
        id: p.id,
        patternName: p.patternName,
        hookType: p.hookType,
        emotion: p.emotion,
        platform: p.platform,
        validatedAt: (p.validatedAt as Date).toISOString(),
        validatedSupport: p.validatedSupport,
      }));
    }
  } catch (err) {
    sectionErrors.push(`performance: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  // ── Son ham sinyaller (FeedbackEvent özeti) ──
  let recentSignals: KnowledgeReadModel["recentSignals"] = { counts: {}, latest: [] };
  try {
    const account = await prisma.account.findUnique({ where: { handle: accountHandle }, select: { id: true } });
    if (account) {
      const cutoff = new Date(Date.now() - RECENT_SIGNAL_DAYS * 24 * 60 * 60 * 1000);
      const events = await prisma.feedbackEvent.findMany({
        where: { accountId: account.id, createdAt: { gte: cutoff } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, feedbackType: true, reason: true, createdAt: true },
      });
      const counts: Record<string, number> = {};
      for (const e of events) counts[e.feedbackType] = (counts[e.feedbackType] ?? 0) + 1;
      recentSignals = {
        counts,
        latest: events.slice(0, 8).map((e) => ({
          id: e.id,
          feedbackType: e.feedbackType,
          createdAt: e.createdAt.toISOString(),
          mechanical: isMechanicalReason(extractReasonText(e.reason)),
        })),
      };
    }
  } catch (err) {
    sectionErrors.push(`signals: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  // Deterministik özet — LLM değil, gerçek sayılar.
  const summary = `@${accountHandle} için ${activeFacts.length} aktif yazım kuralı ve ${performanceLessons.length} doğrulanmış performans dersi kullanıyorum.`;

  return {
    accountHandle,
    summary,
    activeFacts,
    proposals,
    performanceLessons,
    recentSignals,
    policy: {
      promotionMinEvidence: PROMOTION_MIN_EVIDENCE,
      note: "Öğrenilmiş öneri en az 3 kaynaklı kanıtla yalnız incelemeye hazır olur; aktifleşme insan onayı ister. Öneriler taslakları ETKİLEMEZ.",
    },
    sectionErrors,
  };
}
