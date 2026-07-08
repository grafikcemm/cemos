/**
 * Eval golden-case runner (Öğrenme Motoru v3 → Sprint 2 eval-parity).
 * DB'deki EvalTest kayıtlarını ÜRETİMLE AYNI motordan geçirir:
 *
 *   - Üretim modu: `runDraftPipeline` (tek X motoru — writer/judge preset'leri,
 *     morning-draft ile birebir aynı yol). Eski growth-engine `generateDrafts`
 *     standı kaldırıldı (Sprint 2 eval-parity).
 *   - "MODE: score_direct": sourceContent'in kendisi deterministik
 *     `scoreDraftFallback` ile skorlanır — LLM'siz CI kapısı (Sprint 1 item 19).
 *
 *   npx tsx scripts/run-eval-tests.ts          # yalnız skorlanmamış (score=null) testler
 *   npx tsx scripts/run-eval-tests.ts --all    # hepsini yeniden koş (regresyon kontrolü)
 *
 * PASS kriterleri expectedBehavior'daki "PASS: ..." satırından okunur:
 *   "clarity >= 75, risk <= 25"            → hepsi geçmeli (AND)
 *   "clarity >= 75 OR novelty >= 55"       → virgül-grubu içinde OR: biri yeter
 * Kriter adları ortak metrik uzayına eşlenir; eşleşmeyen kriter "skipped"
 * sayılır (skoru etkilemez, raporda görünür).
 *
 * Gerçek LLM yoksa (anahtar yok / 402 → pipeline mock'a düşer) üretim-modu test
 * SKORLANMAZ: verdict MOCK raporlanır, DB'ye sonuç yazılmaz (score null kalır) —
 * mock skorla sahte PASS/FAIL üretmek yasak (sessiz-mock politikası).
 *
 * Sonuç: evalTestRepo.recordResult(id, { generatedOutput, score: geçen kriter
 * yüzdesi, failureReason: kalan kriterler }). LLM bütçesi generateJsonGated
 * içinde zaten gate'li — ayrı guard yok.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";
import { evalTestRepo } from "../src/lib/db/evalTestRepo";
import { runDraftPipeline } from "../src/lib/ai/draft-pipeline";
import { accountProfiles, type AccountHandle } from "../src/lib/accounts";
import { scoreDraftFallback } from "../src/lib/growth-engine/scorer";
import type { DraftScore as PipelineDraftScore } from "../src/lib/ai/prompts";
import type { DraftScore as HeuristicDraftScore } from "../src/lib/growth-engine/types";

const RUN_ALL = process.argv.includes("--all");

/**
 * Ortak metrik uzayı: PASS kriter adları (küçük harf) → 0-100 skor.
 * İki kaynaktan doldurulur: pipeline judge skoru (üretim modu) veya
 * deterministik heuristik skor (score_direct modu).
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

/**
 * Golden set score_direct modu (FIRST-SPRINT item 19): "MODE: score_direct"
 * işaretli testlerde sourceContent'in KENDİSİ deterministik scoreDraftFallback
 * ile skorlanır — LLM çağrısı yok. Bilinen-kötü örneklerin düşük skorlaması
 * bu yoldan CI kapısı olur.
 */
function isScoreDirect(expectedBehavior: string | null): boolean {
  return /MODE:\s*score_direct/i.test(expectedBehavior ?? "");
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

async function main() {
  console.log(`Eval runner | ${RUN_ALL ? "--all (hepsi)" : "yalnız skorlanmamış"}`);

  const accounts = await prisma.account.findMany({
    where: { handle: { in: ["grafikcem", "maskulenkod"] } },
    select: { id: true, handle: true },
  });
  const handleById = new Map(accounts.map((a) => [a.id, a.handle]));

  const tests = await prisma.evalTest.findMany({
    where: RUN_ALL ? {} : { score: null },
    orderBy: { createdAt: "asc" },
  });
  if (tests.length === 0) {
    console.log("Koşulacak eval test yok. (--all ile hepsini yeniden koşabilirsin.)");
    return;
  }

  const rows: { name: string; verdict: string; score: number; detail: string }[] = [];

  for (const test of tests) {
    const handle = handleById.get(test.accountId);
    if (!handle) {
      rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "hesap bulunamadı" });
      continue;
    }
    const passLine = parsePassLine(test.expectedBehavior);
    if (!passLine) {
      rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "PASS satırı yok" });
      continue;
    }

    try {
      let metrics: MetricRecord;
      let generatedOutput: string;

      if (isScoreDirect(test.expectedBehavior)) {
        // Deterministik doğrudan skor — LLM yok, sourceContent skorlanır.
        metrics = metricsFromHeuristic(
          scoreDraftFallback({
            content: test.sourceContent ?? "",
            accountHandle: handle,
          })
        );
        generatedOutput = test.sourceContent ?? "";
      } else {
        // Üretim modu: TEK X MOTORU — morning-draft ile birebir aynı pipeline
        // (cemos-writer/cemos-final-judge preset'leri, budget gate, UsageLog).
        const profile = accountProfiles[handle as AccountHandle];
        if (!profile) {
          rows.push({ name: test.testName, verdict: "SKIP", score: 0, detail: "canlı profil yok" });
          continue;
        }
        const result = await runDraftPipeline(profile, test.sourceContent ?? "", {
          accountId: test.accountId,
        });

        // Sessiz-mock politikası: gerçek LLM koşmadıysa (anahtar yok / tüm
        // modeller hata → mock) skor ANLAMSIZ — kaydetme, MOCK raporla.
        if (result.usedMock) {
          rows.push({
            name: test.testName,
            verdict: "MOCK",
            score: 0,
            detail: "gerçek LLM koşmadı (anahtar yok / sağlayıcı hatası) — skor kaydedilmedi",
          });
          continue;
        }
        if (!result.winner?.content) {
          await evalTestRepo.recordResult(test.id, {
            generatedOutput: "",
            score: 0,
            failureReason: "draft üretilemedi (pipeline boş döndü)",
          });
          rows.push({ name: test.testName, verdict: "FAIL", score: 0, detail: "draft yok" });
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
      rows.push({
        name: test.testName,
        verdict,
        score,
        detail: (failures.length ? failures.join("; ") : "tüm kriterler geçti") + recordNote,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Sağlayıcı-erişilemez hataları (402 kredi bitik / anahtar reddi) test
      // hatası DEĞİL — LLM yok demektir. MOCK sınıfına alınır, DB'ye yazılmaz.
      const llmUnavailable = /402|Insufficient credits|401|invalid.*api key/i.test(msg);
      rows.push({
        name: test.testName,
        verdict: llmUnavailable ? "MOCK" : "ERROR",
        score: 0,
        detail: llmUnavailable ? `LLM erişilemedi: ${msg.split("\n")[0].slice(0, 120)}` : msg,
      });
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
  console.log(
    `\nÖzet: ${pass} PASS / ${partial} PARTIAL / ${fail} FAIL-ERROR / ${mock} MOCK (toplam ${rows.length})`
  );
  if (mock > 0) {
    console.log(
      "DOĞRULANAMADI: üretim-modu testler gerçek LLM olmadan skorlanmaz — OpenRouter kredisi/anahtarı ekleyip yeniden koş."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
