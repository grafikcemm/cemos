import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { runDeterministicHeuristics } from "../src/lib/safety/heuristics";

const prisma = new PrismaClient();
const isDryRun = !process.argv.includes("--apply");

async function main() {
  console.log(`\n[repair-bad-encoding-queue] mode=${isDryRun ? "dry-run" : "apply"}\n`);

  const items = await prisma.queueItem.findMany({
    select: { id: true, content: true, editedContent: true, draftType: true },
  });

  const corrupted = items.filter((item) => {
    const ec = item.editedContent ?? "";
    return ec.includes("�") || ec.includes("ï¿½");
  });

  if (corrupted.length === 0) {
    console.log("✓ Bozuk encoding içeren QueueItem bulunamadı.");
    return;
  }

  console.log(`Bozuk QueueItem sayısı: ${corrupted.length}\n`);
  console.log("ID                                   | editedContent (ilk 60 karakter)");
  console.log("─".repeat(80));

  for (const item of corrupted) {
    const preview = (item.editedContent ?? "").slice(0, 60).replace(/\n/g, " ");
    console.log(`${item.id} | ${preview}`);

    if (!isDryRun) {
      const freshLint = runDeterministicHeuristics(
        item.content,
        item.draftType ?? "TWEET"
      );
      await prisma.queueItem.update({
        where: { id: item.id },
        data: {
          editedContent: null,
          lintReport: JSON.stringify(freshLint),
        },
      });
    }
  }

  console.log("\n" + "─".repeat(80));
  if (isDryRun) {
    console.log(`[dry-run] ${corrupted.length} kayıt etkilenecekti. Uygulamak için --apply flag'i ekleyin.`);
  } else {
    console.log(`✓ ${corrupted.length} QueueItem güncellendi (editedContent=null, lintReport yenilendi).`);
  }
}

main()
  .catch((err) => {
    console.error("Hata:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
