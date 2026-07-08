/**
 * Eval golden-case runner (Öğrenme Motoru v3). DB'deki EvalTest kayıtlarını
 * (scripts/ingest-research.ts ile seed'lenen) gerçek draft pipeline'ından
 * geçirir ve critic (DraftScore) skorlarını PASS kriterleriyle karşılaştırır.
 *
 *   npx tsx scripts/run-eval-tests.ts          # yalnız skorlanmamış (score=null) testler
 *   npx tsx scripts/run-eval-tests.ts --all    # hepsini yeniden koş (regresyon kontrolü)
 *
 * PASS kriterleri expectedBehavior'daki "PASS: ..." satırından okunur:
 *   "clarity >= 75, risk <= 25"            → hepsi geçmeli (AND)
 *   "clarity >= 75 OR novelty >= 55"       → virgül-grubu içinde OR: biri yeter
 * Kriter adları DraftScore alanlarına eşlenir; eşleşmeyen kriter "skipped"
 * sayılır (skoru etkilemez, raporda görünür).
 *
 * Sonuç: evalTestRepo.recordResult(id, { generatedOutput, score: geçen kriter
 * yüzdesi, failureReason: kalan kriterler }). LLM bütçesi generateDrafts içinde
 * zaten gate'li — ayrı guard yok. Test başına 1 draft (count:1).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";
import { evalTestRepo } from "../src/lib/db/evalTestRepo";
import { generateDrafts } from "../src/lib/growth-engine/draft-generator";
import { scoreDraftFallback } from "../src/lib/growth-engine/scorer";
import type { DraftScore } from "../src/lib/growth-engine/types";

const RUN_ALL = process.argv.includes("--all");

// passCriteria metrik adı → DraftScore alanı
const METRIC_MAP: Record<string, keyof DraftScore> = {
  clarity: "clarityScore",
  hookstrength: "hookStrengthScore",
  novelty: "noveltyScore",
  noveltyscore: "noveltyScore",
  risk: "riskScore",
  virality: "viralityScore",
  personamatch: "personaMatchScore",
  audiencefit: "personaMatchScore", // en yakın mevcut boyut
  publish: "publishScore",
};

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

/** Tek atomik kriteri ("clarity >= 75") critic skoruna karşı değerlendirir. */
function evalAtom(atom: string, critic: DraftScore): CriterionResult {
  const m = atom.trim().match(/^(\w+)\s*(>=|<=)\s*(\d+)$/);
  if (!m) return { raw: atom.trim(), status: "skipped" };
  const field = METRIC_MAP[m[1].toLowerCase()];
  if (!field) return { raw: atom.trim(), status: "skipped" };
  const actual = critic[field];
  if (typeof actual !== "number") return { raw: atom.trim(), status: "skipped" };
  const threshold = Number(m[3]);
  const pass = m[2] === ">=" ? actual >= threshold : actual <= threshold;
  return { raw: atom.trim(), status: pass ? "pass" : "fail", actual };
}

/** Virgülle ayrılmış kriter grupları; grup içinde " OR " varsa biri yeterli. */
function evaluateCriteria(passLine: string, critic: DraftScore): CriterionResult[] {
  return passLine.split(",").map((group) => {
    const atoms = group.split(/\s+OR\s+/i).map((a) => evalAtom(a, critic));
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
      let critic: DraftScore;
      let generatedOutput: string;

      if (isScoreDirect(test.expectedBehavior)) {
        // Deterministik doğrudan skor — LLM yok, sourceContent skorlanır.
        critic = scoreDraftFallback({
          content: test.sourceContent ?? "",
          accountHandle: handle,
        });
        generatedOutput = test.sourceContent ?? "";
      } else {
        const result = await generateDrafts({
          accountHandle: handle,
          actionType: "tweet",
          sourceContent: test.sourceContent ?? undefined,
          count: 1,
        });
        const best = [...result.drafts].sort((a, b) => b.critic.publishScore - a.critic.publishScore)[0];
        if (!best) {
          await evalTestRepo.recordResult(test.id, {
            generatedOutput: "",
            score: 0,
            failureReason: `draft üretilemedi: ${result.warnings.join("; ") || "bilinmeyen"}`,
          });
          rows.push({ name: test.testName, verdict: "FAIL", score: 0, detail: "draft yok" });
          continue;
        }
        critic = best.critic;
        generatedOutput = best.draft.content;
      }

      const criteria = evaluateCriteria(passLine, critic);
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
      rows.push({ name: test.testName, verdict: "ERROR", score: 0, detail: msg });
    }
  }

  console.log("\n--- EVAL SONUÇLARI ---");
  for (const r of rows) {
    console.log(`${r.verdict.padEnd(7)} ${String(r.score).padStart(3)}  ${r.name}\n        ${r.detail}`);
  }
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const partial = rows.filter((r) => r.verdict === "PARTIAL").length;
  const fail = rows.filter((r) => r.verdict === "FAIL" || r.verdict === "ERROR").length;
  console.log(`\nÖzet: ${pass} PASS / ${partial} PARTIAL / ${fail} FAIL-ERROR (toplam ${rows.length})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
