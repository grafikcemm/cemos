/**
 * Eval golden-case runner (Sprint 2 eval-parity → Faz 2E ADR-034 §D).
 * DB'deki EvalTest kayıtlarını ÜRETİMLE AYNI motordan geçirir:
 *
 *   - Üretim (CANLI) modu: `runDraftPipeline` — YALNIZ `--live` + güvenlik
 *     kapıları (OPENROUTER_KEY_ROTATED_AT + AI_EVAL_SPEND_ENABLED +
 *     PHASE2E_LIVE_EVAL_APPROVED + PHASE2E_LIVE_MAX_USD) geçerse koşar; aksi
 *     halde BLOCKED raporlanır. Anahtar mevcut diye sessizce harcanmaz.
 *   - "MODE: score_direct": deterministik `scoreDraftFallback` — LLM'siz CI kapısı.
 *   - "MODE: thread_contract": deterministik thread sözleşmesi doğrulaması
 *     (validateThreadSegments; segment ≤280, ≥2 segment) — LLM'siz.
 *
 *   npx tsx scripts/run-eval-tests.ts                    # deterministik case'ler; canlılar BLOCKED
 *   npx tsx scripts/run-eval-tests.ts --all              # skorlanmışlar dahil yeniden koş
 *   npx tsx scripts/run-eval-tests.ts --live             # kapılar geçerse canlı generate case'leri
 *   npx tsx scripts/run-eval-tests.ts --max-cases=10     # ilk N test
 *
 * Hesap kaynağı (Faz 2E): hardcoded handle listesi KALDIRILDI — testlerin
 * accountId'leri DB'den çözülür, canlı profil `getRuntimeProfile` (ADR-031
 * runtime source-of-truth) ile gelir. goldenSet içindeki iki seeded hesap
 * FIXTURE'dır (seed-eval-golden.ts) — production hesap keşfiyle karışmaz.
 *
 * Tarihçe: her koşu EvalRun + EvalCaseResult'a yazılır (EvalTest'in son-sonuç
 * overwrite'ı artık tek audit kaynağı değil). Maliyet: her canlı case'in
 * pipeline maliyeti EvalCaseResult.costUsd'a yazılır; UsageLog zaten gated
 * primitive'ten `budgetClass: evaluation` ile düşer — üç kayıt tutarlıdır.
 *
 * PASS kriterleri expectedBehavior'daki "PASS: ..." satırından okunur:
 *   "clarity >= 75, risk <= 25"            → hepsi geçmeli (AND)
 *   "clarity >= 75 OR novelty >= 55"       → virgül-grubu içinde OR: biri yeter
 *
 * Sessiz-mock politikası korunur: gerçek LLM koşmadıysa skor kaydedilmez.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";
import { evalTestRepo } from "../src/lib/db/evalTestRepo";
import { evalRunRepo, type EvalCaseStatus } from "../src/lib/db/evalRunRepo";
import { runDraftPipeline } from "../src/lib/ai/draft-pipeline";
import { getRuntimeProfile } from "../src/lib/accounts/profileRepository";
import { getLiveEvalGate } from "../src/lib/config/liveGates";
import { validateThreadSegments } from "../src/lib/growth-engine/threadSegments";
import { scoreDraftFallback } from "../src/lib/growth-engine/scorer";
import type { DraftScore as PipelineDraftScore } from "../src/lib/ai/prompts";
import type { DraftScore as HeuristicDraftScore } from "../src/lib/growth-engine/types";

const RUN_ALL = process.argv.includes("--all");
const LIVE = process.argv.includes("--live");
const maxCasesArg = process.argv.find((a) => a.startsWith("--max-cases="));
const MAX_CASES = maxCasesArg ? Number(maxCasesArg.split("=")[1]) : undefined;
const GOLDEN_POLICY_VERSION = "2E-1";

/**
 * Ortak metrik uzayı: PASS kriter adları (küçük harf) → 0-100 skor.
 */
type MetricRecord = Record<string, number>;

function metricsFromPipeline(winner: PipelineDraftScore): MetricRecord {
  return {
    clarity: winner.clarity,
    hookstrength: winner.hookStrength,
    novelty: winner.novelty,
    noveltyscore: winner.novelty,
    risk: winner.risk,
    virality: winner.viralPotential,
    personamatch: winner.personaMatch,
    audiencefit: winner.personaMatch,
    turkishnaturalness: winner.turkishNaturalness,
    sourcefaithfulness: winner.sourceFaithfulness,
  };
}

function metricsFromHeuristic(score: HeuristicDraftScore): MetricRecord {
  return {
    clarity: score.clarityScore,
    hookstrength: score.hookStrengthScore,
    novelty: score.noveltyScore,
    noveltyscore: score.noveltyScore,
    risk: score.riskScore,
    virality: score.viralityScore,
    personamatch: score.personaMatchScore,
    audiencefit: score.personaMatchScore,
    publish: score.publishScore,
  };
}

type CriterionResult = {
  raw: string;
  status: "pass" | "fail" | "skipped";
  actual?: number;
};

function parsePassLine(expectedBehavior: string | null): string | null {
  if (!expectedBehavior) return null;
  const m = expectedBehavior.match(/PASS:\s*(.+)$/ms);
  return m ? m[1].trim() : null;
}

function isScoreDirect(expectedBehavior: string | null): boolean {
  return /MODE:\s*score_direct/i.test(expectedBehavior ?? "");
}

/** Faz 2E: deterministik thread sözleşme modu — sourceContent = JSON segment listesi. */
function isThreadContract(expectedBehavior: string | null): boolean {
  return /MODE:\s*thread_contract/i.test(expectedBehavior ?? "");
}

function threadContractMetrics(sourceContent: string | null): MetricRecord {
  try {
    const parsed = JSON.parse(sourceContent ?? "[]");
    const segments = Array.isArray(parsed) ? parsed.map((t: unknown) => ({ text: String(t ?? "") })) : null;
    const validation = validateThreadSegments(segments, 280);
    return { valid: validation.ok ? 1 : 0 };
  } catch {
    return { valid: 0 };
  }
}

/** Tek atomik kriteri ("clarity >= 75") ortak metrik uzayına karşı değerlendirir. */
function evalAtom(atom: string, metrics: MetricRecord): CriterionResult {
  const m = atom.trim().match(/^(\w+)\s*(>=|<=)\s*(\d+)$/);
  if (!m) return { raw: atom.trim(), status: "skipped" };
  const actual = metrics[m[1].toLowerCase()];
  if (typeof actual !== "number" || isNaN(actual)) {
    return { raw: atom.trim(), status: "skipped" };
  }
  const threshold = Number(m[3]);
  const pass = m[2] === ">=" ? actual >= threshold : actual <= threshold;
  return { raw: atom.trim(), status: pass ? "pass" : "fail", actual };
}

/** Virgülle ayrılmış kriter grupları; grup içinde " OR " varsa biri yeterli. */
function evaluateCriteria(passLine: string, metrics: MetricRecord): CriterionResult[] {
  return passLine.split(",").map((group) => {
    const atoms = group.split(/\s+OR\s+/i).map((a) => evalAtom(a, metrics));
    if (atoms.length === 1) return atoms[0];
    const anyPass = atoms.some((a) => a.status === "pass");
    const allSkipped = atoms.every((a) => a.status === "skipped");
    return {
      raw: group.trim(),
      status: allSkipped ? "skipped" : anyPass ? "pass" : "fail",
      actual: atoms.find((a) => a.actual !== undefined)?.actual,
    };
  });
}

type Row = { name: string; verdict: string; score: number; detail: string; costUsd: number };

async function main() {
  const gate = getLiveEvalGate();
  const liveAllowed = LIVE && gate.allowed;
  console.log(
    `Eval runner | ${RUN_ALL ? "--all (hepsi)" : "yalnız skorlanmamış"} | canlı: ${
      liveAllowed ? `AÇIK (tavan $${gate.maxUsd.toFixed(2)})` : LIVE ? `KAPALI (eksik: ${gate.missing.join(", ")})` : "istenmedi"
    }`
  );

  const allTests = await prisma.evalTest.findMany({
    where: RUN_ALL ? {} : { score: null },
    orderBy: { createdAt: "asc" },
  });
  const tests = typeof MAX_CASES === "number" && Number.isFinite(MAX_CASES) ? allTests.slice(0, Math.max(0, MAX_CASES)) : allTests;
  if (tests.length === 0) {
    console.log("Koşulacak eval test yok. (--all ile hepsini yeniden koşabilirsin.)");
    return;
  }

  // Hesaplar testlerin KENDİ accountId'lerinden çözülür (hardcoded liste yok).
  const accountIds = [...new Set(tests.map((t) => t.accountId))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, handle: true },
  });
  const handleById = new Map(accounts.map((a) => [a.id, a.handle]));

  await evalRunRepo.reconcileStaleRunning().catch(() => 0);
  const run = await evalRunRepo
    .createRun({
      kind: "golden_live",
      mode: liveAllowed ? "live" : "deterministic",
      trigger: "manual",
      policyVersion: GOLDEN_POLICY_VERSION,
    })
    .catch(() => null); // koşu kaydı düşse bile in-memory rapor yaşar

  const rows: Row[] = [];
  let liveSpentUsd = 0;

  async function recordCase(test: { id: string; testName: string; accountId: string }, status: EvalCaseStatus, score: number | null, costUsd: number, detail: string) {
    if (!run) return;
    await evalRunRepo
      .recordCase({
        runId: run.id,
        caseKey: test.testName,
        fixtureId: test.id,
        status,
        score,
        costUsd,
        details: { detail: detail.slice(0, 400) },
      })
      .catch(() => {});
  }

  for (const test of tests) {
    const handle = handleById.get(test.accountId);
    if (!handle) {
      rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "hesap bulunamadı", costUsd: 0 });
      await recordCase(test, "skipped", null, 0, "hesap bulunamadı");
      continue;
    }
    const passLine = parsePassLine(test.expectedBehavior);
    if (!passLine) {
      rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "PASS satırı yok", costUsd: 0 });
      await recordCase(test, "skipped", null, 0, "PASS satırı yok");
      continue;
    }

    try {
      let metrics: MetricRecord;
      let generatedOutput: string;
      let caseCostUsd = 0;

      if (isThreadContract(test.expectedBehavior)) {
        // Faz 2E: deterministik thread sözleşmesi — LLM yok, ücret yok.
        metrics = threadContractMetrics(test.sourceContent);
        generatedOutput = "(thread_contract deterministik doğrulama)";
      } else if (isScoreDirect(test.expectedBehavior)) {
        // Deterministik doğrudan skor — LLM yok, sourceContent skorlanır.
        metrics = metricsFromHeuristic(
          scoreDraftFallback({
            content: test.sourceContent ?? "",
            accountHandle: handle,
          })
        );
        generatedOutput = test.sourceContent ?? "";
      } else {
        // Üretim (CANLI) modu — güvenlik/harcama kapıları zorunlu (ADR-034 §D).
        if (!liveAllowed) {
          const reason = LIVE
            ? `kapılar eksik: ${gate.missing.join(", ")}`
            : "canlı mod istenmedi (--live verilmedi)";
          rows.push({ name: test.testName, verdict: "BLOCKED", score: 0, detail: reason, costUsd: 0 });
          await recordCase(test, "blocked_external", null, 0, reason);
          continue;
        }
        if (liveSpentUsd >= gate.maxUsd) {
          const reason = `per-run harcama tavanı doldu ($${liveSpentUsd.toFixed(4)}/$${gate.maxUsd.toFixed(2)})`;
          rows.push({ name: test.testName, verdict: "BLOCKED", score: 0, detail: reason, costUsd: 0 });
          await recordCase(test, "blocked_external", null, 0, reason);
          continue;
        }
        // Canlı profil DB runtime source-of-truth'tan (ADR-031).
        const profile = await getRuntimeProfile(handle, { requireGenerationReady: true }).catch(() => null);
        if (!profile) {
          rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "runtime profil yok/hazır değil", costUsd: 0 });
          await recordCase(test, "skipped", null, 0, "runtime profil yok");
          continue;
        }
        const result = await runDraftPipeline(profile, test.sourceContent ?? "", {
          accountId: test.accountId,
          budgetClass: "evaluation",
        });
        caseCostUsd = result.estimatedCostUsd;
        liveSpentUsd += result.estimatedCostUsd;

        // Sessiz-mock politikası: gerçek LLM koşmadıysa skor ANLAMSIZ.
        if (result.usedMock) {
          rows.push({
            name: test.testName,
            verdict: "MOCK",
            score: 0,
            detail: "gerçek LLM koşmadı (anahtar yok / sağlayıcı hatası) — skor kaydedilmedi",
            costUsd: caseCostUsd,
          });
          await recordCase(test, "skipped", null, caseCostUsd, "usedMock");
          continue;
        }
        if (!result.winner?.content) {
          await evalTestRepo.recordResult(test.id, {
            generatedOutput: "",
            score: 0,
            failureReason: "draft üretilemedi (pipeline boş döndü)",
          });
          rows.push({ name: test.testName, verdict: "FAIL", score: 0, detail: "draft yok", costUsd: caseCostUsd });
          await recordCase(test, "failed", 0, caseCostUsd, "draft yok");
          continue;
        }
        metrics = metricsFromPipeline(result.winner);
        generatedOutput = result.winner.content;
      }

      const criteria = evaluateCriteria(passLine, metrics);
      const scored = criteria.filter((c) => c.status !== "skipped");
      const passed = scored.filter((c) => c.status === "pass");
      const score = scored.length === 0 ? 0 : Math.round((passed.length / scored.length) * 100);
      const failures = criteria
        .filter((c) => c.status === "fail")
        .map((c) => `${c.raw} (gerçek: ${c.actual ?? "?"})`);
      const skipped = criteria.filter((c) => c.status === "skipped").map((c) => c.raw);

      // DB yazımı fail-soft: pool timeout skoru çöpe atmasın, in-memory rapor yine dursun.
      let recordNote = "";
      try {
        await evalTestRepo.recordResult(test.id, {
          generatedOutput,
          score,
          failureReason:
            failures.length > 0
              ? failures.join("; ") + (skipped.length ? ` | skipped: ${skipped.join("; ")}` : "")
              : skipped.length
                ? `skipped: ${skipped.join("; ")}`
                : undefined,
        });
      } catch (recordErr) {
        recordNote = ` [DB yazılamadı: ${recordErr instanceof Error ? recordErr.message.split("\n")[0] : "?"}]`;
      }

      const verdict = score === 100 ? "PASS" : score >= 50 ? "PARTIAL" : "FAIL";
      const detail = (failures.length ? failures.join("; ") : "tüm kriterler geçti") + recordNote;
      rows.push({ name: test.testName, verdict, score, detail, costUsd: caseCostUsd });
      await recordCase(test, score === 100 ? "passed" : "failed", score, caseCostUsd, detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Sağlayıcı-erişilemez hataları test hatası DEĞİL — LLM yok demektir.
      const llmUnavailable = /402|Insufficient credits|401|invalid.*api key/i.test(msg);
      const detail = llmUnavailable ? `LLM erişilemedi: ${msg.split("\n")[0].slice(0, 120)}` : msg.slice(0, 200);
      rows.push({ name: test.testName, verdict: llmUnavailable ? "MOCK" : "ERROR", score: 0, detail, costUsd: 0 });
      await recordCase(test, llmUnavailable ? "skipped" : "failed", null, 0, detail);
    }
  }

  console.log("\n--- EVAL SONUÇLARI ---");
  for (const r of rows) {
    console.log(`${r.verdict.padEnd(7)} ${String(r.score).padStart(3)}  ${r.name}\n        ${r.detail}`);
  }
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const partial = rows.filter((r) => r.verdict === "PARTIAL").length;
  const fail = rows.filter((r) => r.verdict === "FAIL" || r.verdict === "ERROR").length;
  const mock = rows.filter((r) => r.verdict === "MOCK").length;
  const blocked = rows.filter((r) => r.verdict === "BLOCKED").length;
  console.log(
    `\nÖzet: ${pass} PASS / ${partial} PARTIAL / ${fail} FAIL-ERROR / ${mock} MOCK / ${blocked} BLOCKED (toplam ${rows.length}) | canlı harcama $${liveSpentUsd.toFixed(4)}`
  );
  if (blocked > 0) {
    console.log(
      "BLOCKED-EXTERNAL: canlı generate case'leri güvenlik/harcama kapıları olmadan koşulmaz — bu bir test başarısızlığı DEĞİLDİR."
    );
  }
  if (mock > 0) {
    console.log(
      "DOĞRULANAMADI: üretim-modu testler gerçek LLM olmadan skorlanmaz — rotasyon + onay kapılarını tamamlayıp --live ile koş."
    );
  }

  if (run) {
    const failedCount = fail;
    const passedCount = pass;
    const skippedCount = rows.length - pass - fail; // partial→failed sayılmaz; MOCK/SKIP/BLOCKED buraya
    const status =
      blocked === rows.length
        ? "blocked_external"
        : failedCount === 0 && partial === 0
          ? "passed"
          : failedCount + partial === rows.length
            ? "failed"
            : "partial";
    await evalRunRepo
      .finishRun(run.id, {
        status,
        passedCount,
        failedCount: failedCount + partial,
        skippedCount,
        totalCostUsd: liveSpentUsd,
        summary: { total: rows.length, pass, partial, fail, mock, blocked },
      })
      .catch(() => {});
    console.log(`EvalRun: ${run.id} (${status})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
