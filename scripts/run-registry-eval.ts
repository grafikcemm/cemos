/**
 * Registry contract eval CLI (ADR-034 §C/§J).
 *
 *   npx tsx scripts/run-registry-eval.ts                 # deterministic contract run (ücretsiz, hermetic)
 *   npx tsx scripts/run-registry-eval.ts --dry-run       # koşmadan case listesi + bütçe özeti
 *   npx tsx scripts/run-registry-eval.ts --max-cases=5   # ilk N fixture
 *   npx tsx scripts/run-registry-eval.ts --live          # allowlist'li canlı smoke (kapılar geçerse)
 *
 * Çıkış kodu gerçek sonucu temsil eder: passed=0; partial/failed=1;
 * blocked_external (live) = 0 ama durum açıkça raporlanır (dış engel test
 * başarısızlığı değildir). Secret değeri asla basılmaz.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { runRegistryContractEval } from "../src/lib/eval/registryContractRunner";
import { runLiveEvalSmoke, liveSmokePreflight } from "../src/lib/eval/liveSmoke";
import { prisma } from "../src/lib/db/client";

const LIVE = process.argv.includes("--live");
const DRY_RUN = process.argv.includes("--dry-run");
const maxArg = process.argv.find((a) => a.startsWith("--max-cases="));
const MAX_CASES = maxArg ? Number(maxArg.split("=")[1]) : undefined;

async function main() {
  if (LIVE) {
    const pre = await liveSmokePreflight();
    console.log(
      `Canlı smoke ön kontrol: ${pre.allowed ? "AÇIK" : "KAPALI"} | per-run tavan: $${pre.maxUsd.toFixed(2)}` +
        (pre.missing.length ? ` | eksik: ${pre.missing.join(", ")}` : "")
    );
    if (DRY_RUN) return;
    const res = await runLiveEvalSmoke("manual");
    console.log(
      `Canlı smoke: ${res.status} | curatorRun=${res.curatorRunId ?? "-"} | threadRun=${res.threadRunId ?? "-"} | maliyet $${res.totalCostUsd.toFixed(4)}`
    );
    for (const n of res.notes) console.log(`  ${n}`);
    if (res.status === "blocked_external") {
      console.log("SONUÇ: production code complete, live activation BLOCKED-EXTERNAL (test hatası değil).");
      return;
    }
    if (res.status !== "passed") process.exitCode = 1;
    return;
  }

  const res = await runRegistryContractEval({
    trigger: "manual",
    maxCases: Number.isFinite(MAX_CASES) ? MAX_CASES : undefined,
    dryRun: DRY_RUN,
  });

  console.log(
    `Registry contract eval | runId=${res.runId ?? "(dry-run)"} | mod=deterministic (hermetic, maliyet $0.00)`
  );
  for (const c of res.cases) {
    const mark = c.status === "passed" ? "PASS" : c.status === "skipped" ? "SKIP" : "FAIL";
    console.log(
      `${mark.padEnd(5)} ${c.caseKey.padEnd(30)} outcome=${c.outcome} trace=${c.traceStatus} ${c.latencyMs}ms` +
        (c.violations.length ? `\n      ${c.violations.join(" | ")}` : "")
    );
  }
  console.log(`Özet: ${res.passed} PASS / ${res.failed} FAIL / ${res.skipped} SKIP → durum: ${res.status}`);
  console.log(
    "NOT: deterministic geçiş 'production agent canlı doğrulandı' anlamına GELMEZ (mode=deterministic etiketi)."
  );
  if (!res.dryRun && res.status !== "passed") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("FAIL", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
