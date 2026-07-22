import { prisma } from "@/lib/db/client";
import { MIN_SUPPORT } from "@/lib/eval/lessonGate";
import { COLD_START_MIN_SAMPLE } from "@/lib/eval/performance";
import { READINESS_POLICY_VERSION } from "@/lib/services/readinessService";
import { evalRunRepo } from "@/lib/db/evalRunRepo";

/**
 * ADR-046 (Phase 5C): DÜRÜST kalite-kalibrasyon durumu. Deterministik, LLM'SİZ.
 *
 * Amaç: sistem "kalibre edildi" YALANINI söylemesin. Ölçüm altyapısı + korelasyon
 * mantığı (PerformanceSnapshot/IgInsightSnapshot/patternPromotion+lessonGate) ZATEN
 * var; eksik olan tek şey bu dürüst DURUM yüzeyiydi. Gerçek sonuç örneklemleri mevcut
 * eşiklere (MIN_SUPPORT, COLD_START_MIN_SAMPLE) karşı sayılır; yetersizse AÇIKÇA
 * "kalibre değil / yetersiz örneklem" raporlanır (readinessService insufficient_sample
 * deseni). Bölüm bazlı fail-soft. Sıfır satırda uydurma skor YOK.
 */

export type SignalSample = {
  key: string;
  label: string;
  observed: number;
  floor: number;
  sufficient: boolean;
  note: string;
};

export type EvalSummary = {
  present: boolean;
  status: string | null;
  mode: string | null;
  policyVersion: string | null;
  passed: number;
  failed: number;
  at: string | null;
};

export type CalibrationStatus = {
  /** Gerçek sonuç verisiyle kalibrasyon AKTİF mi? (yetersiz örneklem → false). */
  outcomeCalibrated: boolean;
  reason: string;
  samples: SignalSample[];
  /** PerformanceSnapshot.normalizedScore şu an baseline-normalize mi, yoksa HAM mı? */
  normalization: { active: boolean; note: string };
  thresholds: { readinessPolicyVersion: string; provisional: boolean; note: string };
  eval: { registryContract: EvalSummary; golden: EvalSummary };
  /** Canlı sonuç beslemeleri neden yok (BLOCKED-EXTERNAL). */
  blockers: string[];
  sectionErrors: string[];
};

const EMPTY_EVAL: EvalSummary = { present: false, status: null, mode: null, policyVersion: null, passed: 0, failed: 0, at: null };

function summarizeEval(run: {
  status: string;
  mode: string;
  policyVersion: string | null;
  passedCount: number;
  failedCount: number;
  createdAt: Date;
} | null): EvalSummary {
  if (!run) return EMPTY_EVAL;
  return {
    present: true,
    status: run.status,
    mode: run.mode,
    policyVersion: run.policyVersion ?? null,
    passed: run.passedCount,
    failed: run.failedCount,
    at: run.createdAt.toISOString(),
  };
}

export async function buildCalibrationStatus(): Promise<CalibrationStatus> {
  const sectionErrors: string[] = [];
  const samples: SignalSample[] = [];

  // ── Gerçek sonuç örneklemleri (own-content outcome) ──
  let matchedOutcomes = 0;
  try {
    // Eşleşen yayın-sonrası ölçüm = distinct publishedPostId (window'lar tek satıra iner).
    const byPost = await prisma.performanceSnapshot.groupBy({
      by: ["publishedPostId"],
      _count: { _all: true },
    });
    matchedOutcomes = byPost.length;
    samples.push({
      key: "matched_outcomes",
      label: "Eşleşen yayın-sonrası ölçüm (X)",
      observed: matchedOutcomes,
      floor: COLD_START_MIN_SAMPLE,
      sufficient: matchedOutcomes >= COLD_START_MIN_SAMPLE,
      note: "Manuel-yayın + canlı SocialData eşleşmesi gerektirir (canlı besleme yok → boş).",
    });
  } catch (err) {
    sectionErrors.push(`matched_outcomes: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  try {
    const igDays = await prisma.igInsightSnapshot.count();
    samples.push({
      key: "ig_insight_days",
      label: "Instagram günlük insight günü",
      observed: igDays,
      floor: COLD_START_MIN_SAMPLE,
      sufficient: igDays >= COLD_START_MIN_SAMPLE,
      note: "Own-account IG (Composio/Meta) canlı sync gerektirir — binding yok → boş.",
    });
  } catch (err) {
    sectionErrors.push(`ig_insight_days: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  try {
    const validated = await prisma.viralPattern.count({ where: { validatedAt: { not: null } } });
    const candidates = await prisma.viralPattern.count({ where: { validatedAt: null, isActive: true } });
    samples.push({
      key: "validated_patterns",
      label: "Doğrulanmış pattern (lessonGate geçti)",
      observed: validated,
      floor: 1,
      sufficient: validated >= 1,
      note: `Aday (doğrulanmamış): ${candidates}. Doğrulama tekrar+anlamlılık+marka-veto ister (MIN_SUPPORT=${MIN_SUPPORT}).`,
    });
  } catch (err) {
    sectionErrors.push(`validated_patterns: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  // Sonuç-temelli kalibrasyon YALNIZ eşleşen own-content sonucu yeterse aktiftir.
  const outcomeCalibrated = matchedOutcomes >= COLD_START_MIN_SAMPLE;
  const reason = outcomeCalibrated
    ? `Eşleşen sonuç örneklemi ${matchedOutcomes} ≥ ${COLD_START_MIN_SAMPLE} — sonuç-temelli sinyaller kullanılabilir.`
    : `Yetersiz gerçek sonuç örneklemi (eşleşen ${matchedOutcomes} < ${COLD_START_MIN_SAMPLE}). Sistem KALİBRE DEĞİL — kalite eşikleri deterministik/provisional kalır; canlı sonuç beslemeleri gelene dek "kalibre edildi" İLAN EDİLMEZ.`;

  // ── Normalizasyon dürüstlüğü ──
  const normalization = {
    active: false,
    note: "PerformanceSnapshot.normalizedScore şu an HAM engagement skorudur — z-score/baseline normalizasyonu (normalizePerformance) kablolanmadı; own-account baseline (std dahil) yok. Baseline kurulana dek normalize İDDİA EDİLMEZ.",
  };

  // ── Eşik durumu (provisional) ──
  const thresholds = {
    readinessPolicyVersion: READINESS_POLICY_VERSION,
    provisional: READINESS_POLICY_VERSION.includes("provisional"),
    note: "Yayına-hazırlık eşikleri PROVISIONAL — canlı kalibrasyon (gerçek sonuç + labeled data) bekliyor; sonuç güzel görünsün diye gevşetilmez.",
  };

  // ── Eval geçmişi (hermetik $0 çalışır; canlı ücretli BLOCKED) ──
  let evalSummary = { registryContract: EMPTY_EVAL, golden: EMPTY_EVAL };
  try {
    const [reg, golden] = await Promise.all([
      evalRunRepo.latestRunByKind("registry_contract"),
      evalRunRepo.latestRunByKind("golden_live"),
    ]);
    evalSummary = { registryContract: summarizeEval(reg), golden: summarizeEval(golden) };
  } catch (err) {
    sectionErrors.push(`eval: ${err instanceof Error ? err.message : "okunamadı"}`);
  }

  const blockers = [
    "Canlı X API yayın + SocialData eşleşmesi (PerformanceSnapshot) — ödeme/adapter BLOCKED-EXTERNAL.",
    "Own-account Instagram (IgInsightSnapshot) — Composio/Meta binding + credential yok.",
    "Canlı ücretli eval/curation — liveGates 4-kapı (OPENROUTER_KEY_ROTATED_AT vb.) kapalı.",
  ];

  return {
    outcomeCalibrated,
    reason,
    samples,
    normalization,
    thresholds,
    eval: evalSummary,
    blockers,
    sectionErrors,
  };
}
