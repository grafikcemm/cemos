import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { operatorReadinessService } from "../src/lib/services/operatorReadinessService";

async function main() {
  console.log("=========================================");
  console.log("  Operator Mode Readiness Smoke Test  ");
  console.log("=========================================\n");

  try {
    const targetHandles = ["grafikcem", "maskulenkod"];
    const res = await operatorReadinessService.getReadiness();

    if (res.ready) {
      console.log("Operator Readiness: \x1b[32mREADY\x1b[0m\n");
      console.log(`Tebrikler! ${targetHandles.length}/${targetHandles.length} hedef hesap için bugünkü taze taslaklar hazır.`);
      console.log("Tahmini günlük akış süresi: \x1b[36m5-10 dk\x1b[0m\n");
    } else {
      console.log("Operator Readiness: \x1b[31mNOT READY\x1b[0m\n");
      console.log("Eksikler:");
      res.issues.forEach(iss => console.log(`- ${iss}`));
      console.log("");
    }

    console.log("Bugünkü Taslak Durumu:");
    targetHandles.forEach(h => {
      const s = res.stats[h];
      if (s && s.found) {
        console.log(`- ${h}: ${s.todayItems} taslak (Otomasyon: ${s.automationEnabled ? "Açık" : "Kapalı"}, Sıklık: ${s.cadence}, Limit: ${s.dailyMaxPosts})`);
      } else {
        console.log(`- ${h}: Bulunamadı`);
      }
    });
    console.log(`Toplam bugün hazır olan: ${res.todayItemsCount}/${targetHandles.length}\n`);

    console.log("Aktif Backlog Durumu (Tüm Zamanlar):");
    targetHandles.forEach(h => {
      console.log(`- ${h}: ${res.backlog[h] ?? 0} taslak`);
    });
    console.log("");

    console.log("Maliyet & Bütçe Durumu:");
    console.log(`- Bu ayki toplam AI maliyeti: $${res.totalMonthCost.toFixed(4)}`);
    console.log(`- Aylık limit: $${Number(process.env.MONTHLY_AI_BUDGET_USD || "7").toFixed(2)}`);
    console.log(`- Bütçe aşımı: ${res.monthlyBudgetExceeded ? "\x1b[31mAŞILDI\x1b[0m" : "\x1b[32mNormal\x1b[0m"}`);
    console.log("\n=========================================");

    if (!res.ready) {
      process.exit(1);
    }
  } catch (err) {
    console.error("HATA: Readiness script çalışırken beklenmeyen bir hata oluştu:", err);
    process.exit(1);
  }
}

main();
