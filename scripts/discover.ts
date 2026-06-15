import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { accountList } from "../src/lib/accounts";
import { pipelineService } from "../src/lib/services/pipelineService";

/**
 * One-shot multi-source discovery + daily generation for all accounts.
 * Idempotent and safe to re-run. Replaces the always-on cron worker for the
 * manual-operator workflow: schedule it with OS cron / Task Scheduler, or hit
 * /api/cron/daily from an external scheduler.
 */
async function main(): Promise<void> {
  console.log("XAgent keşif + üretim (tek-atış) başlıyor...");
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn("OPENROUTER_API_KEY yok — pre-filter/üretim mock/fail-open modda çalışır.");
  }

  for (const profile of accountList) {
    try {
      const s = await pipelineService.runDailyForAccount(profile.handle);
      const byType = JSON.stringify(s.discovery?.byType ?? {});
      console.log(
        `@${profile.handle}: keşif=${s.discovery?.inserted ?? 0} ${byType} | taslak=${s.created}/${s.target} blok=${s.blocked} hata=${s.errors} | ${s.reason}`
      );
      if (s.discovery?.errors.length) {
        console.warn(`  uyarılar: ${s.discovery.errors.slice(0, 5).join(" | ")}`);
      }
    } catch (err) {
      console.error(`@${profile.handle} hata:`, err);
    }
  }

  console.log("Keşif tamamlandı.");
  process.exit(0);
}

main();
