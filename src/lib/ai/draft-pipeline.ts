import type { AccountProfile } from "@/lib/accounts";
import { createMockBenchmark } from "@/lib/ai/mock-benchmark";
import { redactError } from "@/lib/utils/redactSecrets";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  type BenchmarkResult,
  type DraftWithAngle,
  type DraftScore,
  type DraftVoice,
  type RankedCandidate,
  type RequestedDraftFormat,
} from "@/lib/ai/prompts";
import { generateJsonGated } from "@/lib/ai/generateGated";
import type { JsonSchemaSpec } from "@/lib/ai/openrouter";
import { runDeterministicHeuristics } from "@/lib/safety/heuristics";
import { getJudgeMode } from "@/lib/ai/model-config";
import type { AiBudgetClass } from "@/lib/config/costGate";
import {
  normalizeThreadSegments,
  validateThreadSegments,
  type ThreadSegment,
} from "@/lib/growth-engine/threadSegments";

type DraftResponse = {
  drafts: DraftWithAngle[];
};

type JudgeResponse = {
  rankedCandidates: RankedCandidate[];
  winnerIndex: number;
  publishDecision: "queue" | "hold" | "reject";
};

export function rankedToScore(rc: RankedCandidate): DraftScore {
  return {
    content: rc.content,
    mode: rc.mode,
    personaMatch: rc.accountFit,
    turkishNaturalness: rc.turkishNaturalness,
    hookStrength: rc.hookStrength,
    clarity: Math.round((rc.hookStrength + rc.turkishNaturalness) / 2),
    novelty: rc.noveltyScore ?? 0,
    viralPotential: rc.viralPotential,
    risk: rc.risk,
    sourceFaithfulness: rc.sourceFaithfulness,
    verdict: rc.verdict,
    reason: rc.reason,
    payoff: rc.payoff,
    threadSegments: rc.threadSegments ?? null,
  };
}

/**
 * Phase 2D (ADR-033): writer artık strict json_schema ile typed çıktı üretir —
 * thread modunda yapısal threadSegments zorunlu alan olarak şemadadır.
 * 400/422'de openrouter degrade zinciri json_object'e düşer — davranış kaybı yok.
 */
const WRITER_RESPONSE_SCHEMA: JsonSchemaSpec = {
  name: "writer_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["drafts"],
    properties: {
      drafts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["content", "mode", "angle", "hookType", "reason", "payoff", "imagePrompt", "threadSegments"],
          properties: {
            content: { type: "string" },
            mode: { type: "string" },
            angle: { type: "string" },
            hookType: { type: "string" },
            reason: { type: "string" },
            payoff: { type: ["string", "null"] },
            imagePrompt: { type: ["string", "null"] },
            threadSegments: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text"],
                properties: { text: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Judge yanıtı için strict json_schema (cemos-final-judge preseti). Phase 2D:
 * sourceDraftIndex provenance alanı eklendi — judge'ın yeniden yazdığı content
 * otorite DEĞİLDİR, canonical içerik writer adayından bağlanır.
 */
const JUDGE_RESPONSE_SCHEMA: JsonSchemaSpec = {
  name: "judge_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["rankedCandidates", "winnerIndex", "publishDecision"],
    properties: {
      winnerIndex: { type: "integer" },
      publishDecision: { type: "string", enum: ["queue", "hold", "reject"] },
      rankedCandidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "sourceDraftIndex",
            "content", "mode", "angle", "hookStrength", "viralPotential",
            "accountFit", "turkishNaturalness", "noveltyScore", "risk",
            "sourceFaithfulness", "verdict", "reason", "payoff",
          ],
          properties: {
            sourceDraftIndex: { type: "integer" },
            content: { type: "string" },
            mode: { type: "string" },
            angle: { type: "string" },
            hookStrength: { type: "number" },
            viralPotential: { type: "number" },
            accountFit: { type: "number" },
            turkishNaturalness: { type: "number" },
            noveltyScore: { type: "number" },
            risk: { type: "number" },
            sourceFaithfulness: { type: "number" },
            verdict: { type: "string", enum: ["approve", "hold", "reject"] },
            reason: { type: "string" },
            payoff: { type: ["string", "null"] },
          },
        },
      },
    },
  },
};

/** Writer taslağını normalize et: segmentler trim'li, boşlar atılmış, boş liste → null. */
function normalizeWriterDraft(d: DraftWithAngle): DraftWithAngle {
  return { ...d, threadSegments: normalizeThreadSegments(d.threadSegments ?? null) };
}

/** Taslak, istenen segment sınırında GEÇERLİ yapısal thread mi? */
function hasValidThread(d: DraftWithAngle, segmentLimit: number): boolean {
  if (!d.threadSegments || d.threadSegments.length === 0) return false;
  return validateThreadSegments(d.threadSegments, segmentLimit).ok;
}

function promoteDraft(d: DraftWithAngle, reason: string): RankedCandidate {
  return {
    content: d.content, mode: d.mode, angle: d.angle ?? "",
    hookStrength: 50, viralPotential: 50, accountFit: 50,
    turkishNaturalness: 50, noveltyScore: 50, risk: 20, sourceFaithfulness: 80,
    verdict: "hold" as const, reason,
    payoff: d.payoff,
    threadSegments: d.threadSegments ?? null,
  };
}

/** Fast-path adayı: skor sinyali YOK (0) — eski davranışla birebir; segmentler korunur. */
function fastCandidate(d: DraftWithAngle, reason: string): RankedCandidate {
  return {
    content: d.content, mode: d.mode, angle: d.angle ?? "",
    hookStrength: 0, viralPotential: 0, accountFit: 0,
    turkishNaturalness: 0, noveltyScore: 0, risk: 0, sourceFaithfulness: 0,
    verdict: "approve" as const, reason,
    payoff: d.payoff,
    threadSegments: d.threadSegments ?? null,
  };
}

/**
 * Phase 2D judge provenance bağlama (ADR-033):
 *  - Geçerli sourceDraftIndex → writer taslağına deterministik bağla.
 *  - Geçersiz/eksik indeks → birebir content eşleşmesiyle deterministik fallback.
 *  - Hâlâ çözülemeyen veya aynı taslağı ikinci kez isteyen aday DÜŞER (fail-closed;
 *    aynı aday iki indeksle duplicate edilmez).
 *  - Canonical content/mode/threadSegments/payoff WRITER adayından gelir;
 *    judge yalnız skor/verdict/reason sahibidir.
 */
export function bindJudgeCandidates(
  ranked: RankedCandidate[],
  writerDrafts: DraftWithAngle[]
): RankedCandidate[] {
  const used = new Set<number>();
  const out: RankedCandidate[] = [];
  for (const rc of ranked) {
    let idx =
      typeof rc.sourceDraftIndex === "number" &&
      Number.isInteger(rc.sourceDraftIndex) &&
      rc.sourceDraftIndex >= 0 &&
      rc.sourceDraftIndex < writerDrafts.length
        ? rc.sourceDraftIndex
        : -1;
    if (idx < 0) {
      const target = (rc.content ?? "").trim();
      idx = writerDrafts.findIndex((d, i) => !used.has(i) && d.content.trim() === target);
    }
    if (idx < 0 || used.has(idx)) continue;
    used.add(idx);
    const src = writerDrafts[idx];
    out.push({
      ...rc,
      sourceDraftIndex: idx,
      content: src.content,
      mode: src.mode,
      angle: src.angle ?? rc.angle,
      payoff: src.payoff ?? rc.payoff,
      threadSegments: src.threadSegments ?? null,
    });
  }
  return out;
}

export async function runDraftPipeline(
  profile: AccountProfile,
  sourceInput: string,
  opts?: {
    deadlineMs?: number;
    accountId?: string;
    voice?: DraftVoice;
    budgetClass?: AiBudgetClass;
    /** Phase 2D: çağıranın istediği format (thread zorunlu / tweet / auto). */
    format?: RequestedDraftFormat;
  }
): Promise<BenchmarkResult> {
  const totalStart = Date.now();
  const format = opts?.format;
  const segmentLimit = format?.segmentLimit ?? 280;
  const threadRequired = format?.intent === "thread";

  if (!process.env.OPENROUTER_API_KEY) {
    const mock = createMockBenchmark(profile);
    // Explicit thread isteği mock'la KARŞILANAMAZ — sahte thread üretilmez.
    return {
      ...mock,
      sourceInput,
      rankedCandidates: [],
      ...(threadRequired ? { threadRequestUnsatisfied: true } : {}),
    };
  }

  const judgeMode = getJudgeMode(profile.handle);

  // Prefer the REAL OpenRouter request cost (usage.cost) over the token estimate.
  // `actualCostUsd` always falls back to the estimate inside generateJson, so this
  // is non-breaking and simply tightens cost accuracy when the provider reports it.
  const costOf = (run: { actualCostUsd?: number; estimatedCostUsd: number }) =>
    typeof run.actualCostUsd === "number" ? run.actualCostUsd : run.estimatedCostUsd;

  // ── Phase 1: Multi-angle writer (one repair retry before falling back to mock) ──
  const writerStart = Date.now();
  const callWriter = () =>
    generateJsonGated<DraftResponse>({
      preset: "cemos-writer",
      system: buildDraftSystemPrompt(profile, opts?.voice, format),
      user: buildDraftUserPrompt(profile, sourceInput, format),
      temperature: 0.9,
      deadlineMs: opts?.deadlineMs,
      jsonSchema: WRITER_RESPONSE_SCHEMA,
      purpose: "writer_x_draft",
      accountId: opts?.accountId,
      platform: "x",
      budgetClass: opts?.budgetClass,
    });

  const extractDrafts = (run: Awaited<ReturnType<typeof callWriter>>): DraftWithAngle[] =>
    Array.isArray(run.data.drafts)
      ? run.data.drafts.filter((d) => d?.content?.trim()).map(normalizeWriterDraft)
      : [];

  let draftRun = await callWriter();
  let draftsRaw = extractDrafts(draftRun);

  // Repair retry (tek): boş writer JSON'ı VEYA explicit thread isteğinde geçerli
  // segment yokluğu — writer en pahalı kaybedilecek çıktı. Deadline içinde kalır.
  const needsRepair =
    draftsRaw.length === 0 ||
    (threadRequired && !draftsRaw.some((d) => hasValidThread(d, segmentLimit)));
  if (needsRepair && (!opts?.deadlineMs || Date.now() < opts.deadlineMs)) {
    draftRun = await callWriter();
    draftsRaw = extractDrafts(draftRun);
  }
  const writerMs = Date.now() - writerStart;

  if (draftsRaw.length === 0) {
    const mock = createMockBenchmark(profile);
    return {
      ...mock,
      sourceInput,
      rankedCandidates: [],
      timings: { writerMs, judgeMs: 0 },
      ...(threadRequired ? { threadRequestUnsatisfied: true } : {}),
    };
  }

  // ── Explicit thread isteği repair'den sonra da karşılanmadıysa: judge'a para
  //    HARCAMADAN typed unsatisfied sonucu dön — çağıran QueueItem yazmaz. ──
  if (threadRequired && !draftsRaw.some((d) => hasValidThread(d, segmentLimit))) {
    const promoted = draftsRaw.slice(0, 3).map((d) =>
      promoteDraft(d, "thread isteği karşılanamadı: geçerli yapısal segment yok")
    );
    return {
      account: profile.handle,
      modelUsed: {
        writer: draftRun.model,
        judge: "skipped:thread_unsatisfied",
        writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
        writerFallbackReason: draftRun.modelFallbackReason,
      },
      sourceInput,
      drafts: promoted.map(rankedToScore),
      rankedCandidates: promoted,
      winner: rankedToScore(promoted[0]),
      publishDecision: "hold",
      estimatedCostUsd: costOf(draftRun),
      usedMock: false,
      threadRequestUnsatisfied: true,
      timings: { writerMs, judgeMs: 0 },
    };
  }

  // ── Risk-based fast path ──────────────────────────────────────────────────
  if (judgeMode === "off") {
    const best = draftsRaw[0];
    const fastWinner: DraftScore = {
      content: best.content,
      mode: best.mode,
      personaMatch: 0, turkishNaturalness: 0, hookStrength: 0,
      clarity: 0, novelty: 0, viralPotential: 0, risk: 0, sourceFaithfulness: 0,
      verdict: "approve",
      reason: "judge-off: skip",
      payoff: best.payoff,
      threadSegments: best.threadSegments ?? null,
    };
    const fastCandidates: RankedCandidate[] = draftsRaw
      .slice(0, 3)
      .map((d) => fastCandidate(d, "judge-off"));
    return {
      account: profile.handle,
      modelUsed: {
        writer: draftRun.model,
        judge: "off",
        writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
        writerFallbackReason: draftRun.modelFallbackReason,
      },
      sourceInput,
      drafts: [fastWinner],
      rankedCandidates: fastCandidates,
      winner: fastWinner,
      publishDecision: "queue",
      estimatedCostUsd: costOf(draftRun),
      usedMock: false,
      timings: { writerMs, judgeMs: 0 },
    };
  }

  if (judgeMode === "risk_based") {
    const firstContent = draftsRaw[0]?.content ?? "";
    const heuristic = runDeterministicHeuristics(firstContent, "TWEET", profile.maxChars, profile.handle);
    if (heuristic.issues.length === 0) {
      const first = draftsRaw[0];
      const fastWinner: DraftScore = {
        content: firstContent,
        mode: first?.mode ?? profile.modes[0]?.id ?? "default",
        personaMatch: 0, turkishNaturalness: 0, hookStrength: 0,
        clarity: 0, novelty: 0, viralPotential: 0, risk: 0, sourceFaithfulness: 0,
        verdict: "approve",
        reason: "fast-path: deterministic lint passed",
        payoff: first?.payoff,
        threadSegments: first?.threadSegments ?? null,
      };
      const fastCandidates: RankedCandidate[] = draftsRaw
        .slice(0, 3)
        .map((d) => fastCandidate(d, "fast-path"));
      return {
        account: profile.handle,
        modelUsed: {
          writer: draftRun.model,
          judge: "skipped",
          writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
          writerFallbackReason: draftRun.modelFallbackReason,
        },
        sourceInput,
        drafts: [fastWinner],
        rankedCandidates: fastCandidates,
        winner: fastWinner,
        publishDecision: "queue",
        estimatedCostUsd: costOf(draftRun),
        usedMock: false,
        timings: { writerMs, judgeMs: 0 },
      };
    }
  }

  // ── Deadline guard: out of time → promote the writer's drafts directly rather
  //    than spend a doomed judge call or lose everything to the mock fallback. ──
  if (typeof opts?.deadlineMs === "number" && Date.now() >= opts.deadlineMs) {
    const promoted: RankedCandidate[] = draftsRaw
      .slice(0, 3)
      .map((d) => promoteDraft(d, "deadline: judge atlandı"));
    return {
      account: profile.handle,
      modelUsed: {
        writer: draftRun.model,
        judge: "skipped:deadline",
        writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
        writerFallbackReason: draftRun.modelFallbackReason,
      },
      sourceInput,
      drafts: promoted.map(rankedToScore),
      rankedCandidates: promoted,
      winner: rankedToScore(promoted[0]),
      publishDecision: "hold",
      estimatedCostUsd: costOf(draftRun),
      usedMock: false,
      timings: { writerMs, judgeMs: 0 },
    };
  }

  // ── Phase 2: Viral judge ──────────────────────────────────────────────────
  const judgeStart = Date.now();
  const judgeRun = await generateJsonGated<JudgeResponse>({
    preset: "cemos-final-judge",
    system: buildJudgeSystemPrompt(profile),
    user: buildJudgeUserPrompt(profile, sourceInput, draftsRaw),
    temperature: 0.2,
    deadlineMs: opts?.deadlineMs,
    jsonSchema: JUDGE_RESPONSE_SCHEMA,
    purpose: "judge_x_critique",
    accountId: opts?.accountId,
    platform: "x",
    budgetClass: opts?.budgetClass,
  });
  const judgeMs = Date.now() - judgeStart;

  // Phase 2D: judge sonucunu writer adaylarına deterministik bağla — segmentler
  // ve canonical içerik writer'dan gelir; çözümlenemeyen aday düşer (fail-closed).
  const bound = bindJudgeCandidates(
    Array.isArray(judgeRun.data.rankedCandidates) ? judgeRun.data.rankedCandidates : [],
    draftsRaw
  ).slice(0, 3);

  // Fallback: if judge returns empty/unresolvable ranked, promote drafts directly
  const effectiveCandidates: RankedCandidate[] =
    bound.length > 0
      ? bound
      : draftsRaw.slice(0, 3).map((d) => promoteDraft(d, "judge döndürmedi"));

  const winner = rankedToScore(effectiveCandidates[0]);
  const allDraftScores = effectiveCandidates.map(rankedToScore);

  // ── Phase 3: Final Editor (Optional cila step on the winner) ──────────────────
  // A third premium call is opt-in. The writer + cross-family judge already
  // provide the production quality gate; leaving this implicit burned budget.
  const enableFinalEditor = process.env.ENABLE_FINAL_EDITOR === "true";
  let finalEditorMs = 0;
  let finalEditorCost = 0;
  let finalEditorModelUsed = "none";

  // Phase 2D segment parity (ADR-033): final editor tek birleşik metni yeniden
  // yazar ve segmentleri stale bırakırdı → thread kazananında AÇIKÇA atlanır.
  const winnerIsThread = Array.isArray(winner.threadSegments) && winner.threadSegments.length > 0;
  if (enableFinalEditor && winnerIsThread) {
    finalEditorModelUsed = "skipped:thread_segment_contract";
  }

  const editorDeadlineOk = !(typeof opts?.deadlineMs === "number" && Date.now() >= opts.deadlineMs);
  if (enableFinalEditor && !winnerIsThread && editorDeadlineOk && winner && winner.content) {
    const editorStart = Date.now();
    try {
      const buildFinalEditorSystemPrompt = (prof: AccountProfile) => `
Sen profesyonel bir Türkçe Baş Editörsün. Görevin, sağlanan sosyal medya taslağını aşağıdaki kurallara göre en mükemmel, doğal ve dikkat çekici hale getirmektir.

YAYINCI PROFİLİ VE HESAP TONU:
- Kullanıcı Adı: @${prof.handle}
- Konsept: ${prof.concept}
- Maksimum Karakter Limiti: ${prof.maxChars} karakter. Kesinlikle bu limiti aşma.

DÜZELTME VE CİLALAMA TALİMATLARI:
1. Türkçe Doğallığı: Yapay zeka veya çeviri kokan yapıları temizle. Türkçe diline, mecazlarına ve kelime oyunlarına uygun, samimi, akıcı ve doğal bir dil kullan.
2. Soru Kalıplarını Temizle: Cümle sonlarındaki gereksiz ve klişe soru kalıplarını (örn. "Peki siz ne düşünüyorsunuz?", "Sizce bu doğru mu?") tamamen temizle. Okuyucuyla daha özgüvenli ve iddialı bir ton kur.
3. Güçlü Hook (Giriş): Giriş cümlesini daha merak uyandırıcı, çarpıcı ve güçlü hale getir.
4. Hesap Tonuna Uyum: Metni @${prof.handle} hesabının tarzına (teknik, samimi veya dinamik) kusursuzca uyarla.
5. Yapı: Linkleri, emojileri veya etiketleri (varsa) bozma, yerlerini koru.

Girdi olarak verilen metni düzenle ve sadece düzenlenmiş nihai JSON objesini döndür. Başka hiçbir açıklama yazma.
`;

      const buildFinalEditorUserPrompt = (originalContent: string) => `
Düzenlenecek Orijinal Taslak:
"""
${originalContent}
"""

Lütfen bu metni cila kurallarına göre düzenle ve aşağıdaki JSON formatında döndür:
{
  "content": "düzenlenmiş doğal türkçe metin"
}
`;

      const editorRun = await generateJsonGated<{ content: string }>({
        preset: "cemos-final-judge",
        system: buildFinalEditorSystemPrompt(profile),
        user: buildFinalEditorUserPrompt(winner.content),
        temperature: 0.3,
        deadlineMs: opts?.deadlineMs,
        purpose: "judge_final_polish",
        accountId: opts?.accountId,
        platform: "x",
        budgetClass: opts?.budgetClass,
      });

      if (editorRun.data?.content) {
        winner.content = editorRun.data.content;
        finalEditorModelUsed = editorRun.model;
        finalEditorCost = costOf(editorRun);
      }
    } catch (editorErr) {
      console.warn("[Draft Pipeline] Final Editor step failed:", redactError(editorErr));
    }
    finalEditorMs = Date.now() - editorStart;
  }

  return {
    account: profile.handle,
    modelUsed: {
      writer: draftRun.model,
      judge: judgeRun.model,
      finalEditor: finalEditorModelUsed,
      writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
      writerFallbackReason: draftRun.modelFallbackReason,
      judgeFallbackUsed: judgeRun.modelFallbackUsed ?? false,
      judgeFallbackReason: judgeRun.modelFallbackReason,
    },
    sourceInput,
    drafts: allDraftScores,
    rankedCandidates: effectiveCandidates,
    winner,
    publishDecision: judgeRun.data.publishDecision ?? "hold",
    estimatedCostUsd: costOf(draftRun) + costOf(judgeRun) + finalEditorCost,
    usedMock: false,
    timings: { writerMs, judgeMs, finalEditorMs, totalMs: Date.now() - totalStart },
  };
}

export type { ThreadSegment };
