import { prisma } from "@/lib/db/client";
// Canlı fake-0 kanıtı (2026-07-23): bölüm fail-soft'u DB-down'ı da yutup
// 200 + sıfırlanmış diziler üretiyordu → UI "0 aktif kural…" basıyordu.
// DB-unavailable bölüm-yumuşatması DEĞİLDİR — fırlatılır, route 503
// db_unavailable döner. Kalan gerçek bölüm-hataları redakte taşınır
// (sectionErrors ok() gövdesiyle istemciye gider; ham Prisma metni yasak).
import { isDbUnavailableError } from "@/lib/db/dbUnavailableError";
import { redactError } from "@/lib/utils/redactSecrets";
import { isKnownAccountHandleDb } from "@/lib/accounts/profileRepository";
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
  /** Operatörün gerçek sözü (mekanik/boş değilse, ≤160). null = gösterilecek metin yok. */
  reasonExcerpt: string | null;
  /** Normalize edit mesafesi (sinyal gücü). null = düzenleme sinyali yok. */
  editDistance: number | null;
  /** Bu geri bildirim bir düzenleme içeriyor mu? */
  hasEdit: boolean;
  /** ADR-045: operatör bu sinyali gürültü işaretledi → gelecek önerileri etkilemez. */
  neutralized: boolean;
};

/** Doğrulanmamış (aday) pattern — güçleniyor ama henüz lessonGate'i geçmedi. */
export type CandidatePattern = {
  id: string;
  patternName: string;
  hookType: string | null;
  emotion: string;
  platform: string;
  successScore: number;
  usageCount: number;
};

/** Üretimi şekillendiren etiketli örnek külliyatının sayımları. */
export type TrainingCorpus = {
  total: number;
  good: number;
  bad: number;
  edited: number;
};

export type KnowledgeReadModel = {
  accountHandle: string;
  summary: string;
  activeFacts: KnowledgeFact[];
  proposals: KnowledgeFact[];
  performanceLessons: PerformanceLesson[];
  /** validatedAt=null aday pattern'ler (güçlenen ama doğrulanmamış). */
  candidatePatterns: CandidatePattern[];
  /** Etiketli eğitim örneği sayımları (üretimi neyin şekillendirdiği). */
  trainingCorpus: TrainingCorpus;
  recentSignals: { counts: Record<string, number>; neutralizedCount: number; latest: RecentSignal[] };
  policy: {
    promotionMinEvidence: number;
    note: string;
  };
  sectionErrors: string[];
};

const RECENT_SIGNAL_DAYS = 14;
const EVIDENCE_PER_FACT = 10;
const REASON_EXCERPT_MAX = 160;
const CANDIDATE_PATTERN_LIMIT = 12;

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
  // ADR-031: scope guard DB-otoriteli fail-closed (bootstrap union değil).
  if (!(await isKnownAccountHandleDb(accountHandle))) throw new MemoryScopeError(accountHandle);
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
    if (isDbUnavailableError(err)) throw err;
    sectionErrors.push(`identity: ${redactError(err)}`);
  }

  // ── Performans dersleri + aday pattern'ler + eğitim külliyatı (AYRI truth store — ADR-030) ──
  let performanceLessons: PerformanceLesson[] = [];
  let candidatePatterns: CandidatePattern[] = [];
  const trainingCorpus: TrainingCorpus = { total: 0, good: 0, bad: 0, edited: 0 };
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

      // Aday pattern'ler: doğrulanmamış (validatedAt=null) ama aktif; skorla sıralı.
      // "Güçlenen ama henüz kanıtlanmamış" — dürüstçe validated derslerden AYRI.
      const candidates = await prisma.viralPattern.findMany({
        where: { accountId: account.id, validatedAt: null, isActive: true },
        orderBy: { successScore: "desc" },
        take: CANDIDATE_PATTERN_LIMIT,
      });
      candidatePatterns = candidates.map((p) => ({
        id: p.id,
        patternName: p.patternName,
        hookType: p.hookType,
        emotion: p.emotion,
        platform: p.platform,
        successScore: p.successScore,
        usageCount: p.usageCount,
      }));

      // Etiketli eğitim örneği sayımları (gerçek DB — boşsa 0, uydurma yok).
      const grouped = await prisma.trainingExample.groupBy({
        by: ["label"],
        where: { accountId: account.id },
        _count: { _all: true },
      });
      for (const g of grouped) {
        const n = g._count._all;
        trainingCorpus.total += n;
        if (g.label === "good") trainingCorpus.good += n;
        else if (g.label === "bad") trainingCorpus.bad += n;
        else if (g.label === "edited") trainingCorpus.edited += n;
      }
    }
  } catch (err) {
    if (isDbUnavailableError(err)) throw err;
    sectionErrors.push(`performance: ${redactError(err)}`);
  }

  // ── Son ham sinyaller (FeedbackEvent özeti + neden/düzenleme detayı) ──
  let recentSignals: KnowledgeReadModel["recentSignals"] = { counts: {}, neutralizedCount: 0, latest: [] };
  try {
    const account = await prisma.account.findUnique({ where: { handle: accountHandle }, select: { id: true } });
    if (account) {
      const cutoff = new Date(Date.now() - RECENT_SIGNAL_DAYS * 24 * 60 * 60 * 1000);
      const events = await prisma.feedbackEvent.findMany({
        where: { accountId: account.id, createdAt: { gte: cutoff } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          feedbackType: true,
          reason: true,
          editedContent: true,
          editDistance: true,
          neutralizedAt: true,
          createdAt: true,
        },
      });
      const counts: Record<string, number> = {};
      let neutralizedCount = 0;
      for (const e of events) {
        // ADR-045: etkisizleştirilen sinyaller ETKİN sayıma girmez (ayrı sayılır).
        if (e.neutralizedAt) {
          neutralizedCount++;
          continue;
        }
        counts[e.feedbackType] = (counts[e.feedbackType] ?? 0) + 1;
      }
      recentSignals = {
        counts,
        neutralizedCount,
        latest: events.slice(0, 8).map((e) => {
          const reasonText = extractReasonText(e.reason);
          const mechanical = isMechanicalReason(reasonText);
          return {
            id: e.id,
            feedbackType: e.feedbackType,
            createdAt: e.createdAt.toISOString(),
            mechanical,
            reasonExcerpt: !mechanical && reasonText ? reasonText.slice(0, REASON_EXCERPT_MAX) : null,
            editDistance: typeof e.editDistance === "number" ? e.editDistance : null,
            hasEdit: !!(e.editedContent && e.editedContent.trim().length > 0),
            neutralized: !!e.neutralizedAt,
          };
        }),
      };
    }
  } catch (err) {
    if (isDbUnavailableError(err)) throw err;
    sectionErrors.push(`signals: ${redactError(err)}`);
  }

  // Deterministik özet — LLM değil, gerçek sayılar.
  const summary = `@${accountHandle} için ${activeFacts.length} aktif yazım kuralı ve ${performanceLessons.length} doğrulanmış performans dersi kullanıyorum.`;

  return {
    accountHandle,
    summary,
    activeFacts,
    proposals,
    performanceLessons,
    candidatePatterns,
    trainingCorpus,
    recentSignals,
    policy: {
      promotionMinEvidence: PROMOTION_MIN_EVIDENCE,
      note: "Öğrenilmiş öneri en az 3 kaynaklı kanıtla yalnız incelemeye hazır olur; aktifleşme insan onayı ister. Öneriler taslakları ETKİLEMEZ.",
    },
    sectionErrors,
  };
}
