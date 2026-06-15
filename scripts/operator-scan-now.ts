import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { operatorReadinessService } from "../src/lib/services/operatorReadinessService";
import { workerService } from "../src/lib/services/workerService";

async function main() {
  console.log("=========================================");
  console.log("          Operator Scan Now              ");
  console.log("=========================================\n");

  try {
    // 1. Initial readiness state check
    const initialRes = await operatorReadinessService.getReadiness();

    // 2. Validate API Keys
    if (!process.env.OPENROUTER_API_KEY || !process.env.SOCIALDATA_API_KEY) {
      console.log("HATA: API Anahtarları eksik!");
      console.log(`- OpenRouter API: ${process.env.OPENROUTER_API_KEY ? "Mevcut" : "EKSİK"}`);
      console.log(`- SocialData API: ${process.env.SOCIALDATA_API_KEY ? "Mevcut" : "EKSİK"}`);
      console.log("\nOperator Readiness: NOT READY");
      process.exit(1);
    }

    // 3. Validate Budget
    if (initialRes.monthlyBudgetExceeded) {
      console.log(`HATA: Aylık bütçe limiti aşıldı! ($${initialRes.totalMonthCost.toFixed(2)} / $${Number(process.env.MONTHLY_AI_BUDGET_USD || "7").toFixed(2)})`);
      console.log("\nOperator Readiness: NOT READY");
      process.exit(1);
    }

    // 4. Run worker service scan with force bypass of 18 hour limit and targeted accounts
    const targetHandles = ["grafikcem", "maskulenkod"];
    console.log("Hedef hesaplar için tarama başlatılıyor:", targetHandles.join(", "));
    
    const scanResult = await workerService.scanTick(new Date(), {
      force: true,
      targetHandles
    });

    if (scanResult && !scanResult.success && scanResult.reason === "locked") {
      console.log("HATA: Başka bir tarama işlemi şu an aktif durumda (Kilit mevcut).");
      console.log("\nOperator Readiness: NOT READY");
      process.exit(1);
    }

    // 5. Fetch updated readiness state
    const finalRes = await operatorReadinessService.getReadiness();

    // 6. Print formatted account results
    console.log("\nOperator Scan Now");
    
    const results = (scanResult as any)?.results || [];
    
    targetHandles.forEach(h => {
      const accRes = results.find((r: any) => r.account === h);
      if (accRes) {
        if (accRes.draftsCreated > 0) {
          console.log(`- ${h}: generated ${accRes.draftsCreated} draft`);
        } else {
          // Map reason to match user format
          let reasonText = accRes.reason || "bilinmiyor";
          if (reasonText === "duplicate") reasonText = "duplicate";
          else if (reasonText === "quality blocked") reasonText = "kalite blocker";
          else if (reasonText === "API error") reasonText = "API hatası";
          else if (reasonText === "daily draft limit reached") reasonText = "bütçe limiti";
          else if (reasonText === "no source posts found") reasonText = "kaynak bulunamadı";

          console.log(`- ${h}: skipped, neden: ${reasonText}`);
        }
      } else {
        // Fallback check if it was completely skipped in the loop or already generated prior
        const stats = finalRes.stats[h];
        if (stats && stats.todayItems > 0) {
          console.log(`- ${h}: skipped, neden: bütçe limiti`);
        } else {
          console.log(`- ${h}: skipped, neden: kaynak bulunamadı`);
        }
      }
    });

    console.log(`\nOperator Readiness: ${finalRes.ready ? "\x1b[32mREADY\x1b[0m" : "\x1b[31mNOT READY\x1b[0m"}`);
    if (!finalRes.ready) {
      console.log("Kalan Eksikler:");
      finalRes.issues.forEach(iss => console.log(`- ${iss}`));
      process.exit(1);
    }
  } catch (err) {
    console.error("\nHATA: operator-scan-now çalışırken beklenmeyen bir hata oluştu:", err);
    process.exit(1);
  }
}

main();
