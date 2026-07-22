import { z } from "zod";
import type { AccountProfile } from "@/lib/accounts";
import { generateJsonGated } from "@/lib/ai/generateGated";
import type { JsonSchemaSpec } from "@/lib/ai/openrouter";
import {
  buildSubscores14,
  aggregateComposite,
  scoreKaynakGuveni,
  scoreTazelik,
  scoreUretilebilirlik,
  scoreYayinaHazir,
  type Subscores14,
  type CompositeResult,
} from "@/lib/eval/subscores14";

/**
 * Batched 14-skor judge (Sprint 9 — EVALUATION-SPEC §2 entegrasyonu).
 *
 * TEK batched `cemos-final-judge` çağrısı [J] alt-skorlarını üretir; [D]
 * alt-skorlar saf kod ($0). EVAL14_ENABLED bayrağıyla kademeli: kapalıyken
 * pipeline davranışı BİREBİR aynıdır (çağrı yok, maliyet yok). Açıkken bile
 * fail-open: judge hatası taslak üretimini asla bozmaz (subscores14 alanı
 * boş kalır, mevcut 8-sinyal sözleşmesi zaten dolu).
 */

export function isEval14Enabled(): boolean {
  return process.env.EVAL14_ENABLED === "true";
}

/** [J] alt-skorları — model çıktısı Zod ile doğrulanır (repair generateGated'te). */
const JudgeScoresSchema = z.object({
  ilgi: z.number().min(0).max(100),
  hesapUyumu: z.number().min(0).max(100),
  sesUyumu: z.number().min(0).max(100),
  ozgunluk: z.number().min(0).max(100),
  bilgiDegeri: z.number().min(0).max(100),
  kancaGucu: z.number().min(0).max(100),
  tutma: z.number().min(0).max(100),
  kaydetme: z.number().min(0).max(100),
  paylasim: z.number().min(0).max(100),
  tartisma: z.number().min(0).max(100),
  evidence: z.string(),
});
export type JudgeScores = z.infer<typeof JudgeScoresSchema>;

const JUDGE14_JSON_SCHEMA: JsonSchemaSpec = {
  name: "judge_subscores14",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "ilgi", "hesapUyumu", "sesUyumu", "ozgunluk", "bilgiDegeri",
      "kancaGucu", "tutma", "kaydetme", "paylasim", "tartisma", "evidence",
    ],
    properties: {
      ilgi: { type: "number" },
      hesapUyumu: { type: "number" },
      sesUyumu: { type: "number" },
      ozgunluk: { type: "number" },
      bilgiDegeri: { type: "number" },
      kancaGucu: { type: "number" },
      tutma: { type: "number" },
      kaydetme: { type: "number" },
      paylasim: { type: "number" },
      tartisma: { type: "number" },
      evidence: { type: "string" },
    },
  },
};

function buildJudge14SystemPrompt(profile: AccountProfile): string {
  return `Sen bağımsız bir içerik kalite hakemisin. @${profile.handle} hesabı için yazılmış TEK bir taslağı 10 boyutta 0-100 arası puanlarsın.

HESAP BAĞLAMI: ${profile.concept}

BOYUTLAR (her biri 0-100):
- ilgi: hedef kitlenin bu konuya gerçek ilgisi
- hesapUyumu: hesabın konu alanına uyum
- sesUyumu: hesabın sesine/tonuna uyum (kurumsal dil = düşük)
- ozgunluk: klişe/tekrar değil, taze açı
- bilgiDegeri: okuyan somut bir şey öğreniyor mu
- kancaGucu: ilk cümle durduruyor mu
- tutma: sonuna kadar okutur mu
- kaydetme: kaydetmeye değer referans değeri
- paylasim: paylaşma dürtüsü (abartıysa da yüksek VERME — bait cezalandırılır)
- tartisma: yanıt/tartışma doğurma (rage-bait'e yüksek VERME)

KURALLAR:
- Nazik olma; vasat içeriğe 50 üstü verme.
- Kaynaksız iddia, sahte aciliyet, clickbait → ilgili skorları düşür.
- "evidence" alanına 1-2 cümlelik Türkçe gerekçe yaz.
- SADECE istenen JSON'u döndür.`;
}

function buildJudge14UserPrompt(sourceText: string, draftContent: string): string {
  return `KAYNAK (taslağın dayandığı içerik):
"""
${sourceText.slice(0, 2000)}
"""

DEĞERLENDİRİLECEK TASLAK:
"""
${draftContent}
"""

10 boyutu puanla ve JSON döndür.`;
}

export type Judge14Result = {
  subscores: Subscores14;
  composite: CompositeResult;
  judgeModel: string;
  evidence: string;
  costUsd: number;
};

export type Judge14DeterministicInput = {
  /** #1 kaynak güveni girdileri. */
  sourceTier: "verified" | "known" | "unknown";
  corroborations: number;
  /** #2 tazelik: kaynağın yayın zamanı (bilinmiyorsa now → 100). */
  sourcePublishedAtMs: number | null;
  /** #13 üretilebilirlik. */
  charCount: number;
  maxChars: number;
  usedMock: boolean;
  /** #14 yayına-hazır veto girdileri. */
  highLeakCount: number;
  lintErrorCount: number;
};

/**
 * Tek batched judge çağrısı + [D] skorların kod tarafı + agregasyon.
 * Fail-open DEĞİL: hata fırlatır — çağıran (draftService) yutar; böylece
 * canlı doğrulama script'i gerçek hatayı görür.
 */
export async function runBatchedJudge14(input: {
  profile: AccountProfile;
  sourceText: string;
  draftContent: string;
  deterministic: Judge14DeterministicInput;
  accountId?: string;
  deadlineMs?: number;
}): Promise<Judge14Result> {
  const { profile, sourceText, draftContent, deterministic: det } = input;

  const run = await generateJsonGated<JudgeScores>({
    preset: "cemos-final-judge",
    system: buildJudge14SystemPrompt(profile),
    user: buildJudge14UserPrompt(sourceText, draftContent),
    temperature: 0.2,
    deadlineMs: input.deadlineMs,
    jsonSchema: JUDGE14_JSON_SCHEMA,
    purpose: "judge_x_subscores14",
    accountId: input.accountId,
    platform: "x",
  });

  const judged = JudgeScoresSchema.parse(run.data);

  const nowMs = Date.now();
  const subscores = buildSubscores14({
    // [D] — saf kod
    kaynakGuveni: scoreKaynakGuveni({ sourceTier: det.sourceTier, corroborations: det.corroborations }),
    tazelik: scoreTazelik({ publishedAtMs: det.sourcePublishedAtMs ?? nowMs, nowMs }),
    uretilebilirlik: scoreUretilebilirlik({
      charCount: det.charCount,
      maxChars: det.maxChars,
      needsImage: false,
      imageReady: false,
      usedMock: det.usedMock,
    }),
    yayinaHazir: scoreYayinaHazir({
      highLeakCount: det.highLeakCount,
      lintErrorCount: det.lintErrorCount,
      formatValid: det.charCount > 0 && det.charCount <= det.maxChars,
    }),
    // [J] — batched judge
    ilgi: judged.ilgi,
    hesapUyumu: judged.hesapUyumu,
    sesUyumu: judged.sesUyumu,
    ozgunluk: judged.ozgunluk,
    bilgiDegeri: judged.bilgiDegeri,
    kancaGucu: judged.kancaGucu,
    tutma: judged.tutma,
    kaydetme: judged.kaydetme,
    paylasim: judged.paylasim,
    tartisma: judged.tartisma,
  });

  return {
    subscores,
    composite: aggregateComposite(subscores),
    judgeModel: run.model,
    evidence: judged.evidence,
    costUsd: typeof run.actualCostUsd === "number" ? run.actualCostUsd : run.estimatedCostUsd,
  };
}
