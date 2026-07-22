/**
 * Phase 2D (ADR-033) — mevcut thread taslakları için deterministik, additive
 * threadSegments backfill'i. LLM YOK; metin yeniden yazılmaz/özetlenmez.
 *
 *   npx tsx scripts/backfill-thread-segments.ts           # DRY-RUN (default; DB yazmaz)
 *   npx tsx scripts/backfill-thread-segments.ts --apply   # uygula (compare-and-set)
 *
 * Bağlayıcı davranış:
 *  - Yalnız açık thread adayları: draftType=THREAD VEYA mode=thread.
 *  - Yalnız threadSegments IS NULL doldurulur; mevcut geçerli segment overwrite
 *    EDİLMEZ; geçersiz non-null JSON sessizce düzeltilmez — yalnız raporlanır.
 *  - published/manual_published/rejected tarihî kayıtlar MUTATE EDİLMEZ (rapor).
 *  - Tek uzun metin tek segment yapılmaz; belirsiz metin olduğu gibi kalır.
 *  - Açık numaralı yapı / boş-satır blokları deterministik split edilir.
 *  - mode=thread + draftType=TWEET kayıtta split başarılıysa draftType=THREAD'e
 *    yükseltilir (reason koduyla raporlanır); belirsizse draftType'a DOKUNULMAZ.
 *  - Status değişmez (needs_edit/new insan kapısı korunur); readiness persist edilmez.
 *  - Apply compare-and-set'tir (WHERE threadSegments IS NULL) → yarışa dayanıklı,
 *    idempotent; ikinci apply 0 mutasyon.
 *  - İçerik metni LOGLANMAZ — yalnız aggregate sayılar + reason kodları.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { deterministicThreadSplit } from "../src/lib/growth-engine/threadBackfill";
import {
  effectiveThreadSegmentLimit,
  parseThreadSegments,
  serializeThreadSegments,
} from "../src/lib/growth-engine/threadSegments";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const PROTECTED_STATUSES = new Set(["published", "manual_published", "rejected"]);

async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, maxChars: true, handle: true } });
  const accById = new Map(accounts.map((a) => [a.id, a]));

  const candidates = await prisma.queueItem.findMany({
    where: {
      OR: [{ draftType: { in: ["THREAD", "thread"] } }, { mode: "thread" }],
    },
    select: {
      id: true,
      accountId: true,
      draftType: true,
      mode: true,
      status: true,
      content: true,
      editedContent: true,
      threadSegments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const counts: Record<string, number> = {
    candidates: candidates.length,
    alreadyValidSegments: 0,
    invalidNonNullReported: 0,
    skippedProtectedStatus: 0,
    splitBlankBlocks: 0,
    splitNumberedMarkers: 0,
    ambiguousUntouched: 0,
    singleBlockUntouched: 0,
    overLimitUntouched: 0,
    promotedDraftTypeThread: 0,
    applied: 0,
    racedSkipped: 0,
  };

  for (const item of candidates) {
    if (item.threadSegments != null && item.threadSegments.trim() !== "") {
      // Mevcut non-null: geçerliyse dokunma; geçersizse yalnız raporla.
      if (parseThreadSegments(item.threadSegments)) counts.alreadyValidSegments++;
      else counts.invalidNonNullReported++;
      continue;
    }
    if (PROTECTED_STATUSES.has(item.status)) {
      counts.skippedProtectedStatus++;
      continue;
    }

    const acc = accById.get(item.accountId);
    const segmentLimit = effectiveThreadSegmentLimit(acc?.maxChars ?? 280);
    const text = (item.editedContent?.trim() || item.content.trim());
    const split = deterministicThreadSplit(text, segmentLimit);

    if (!split.ok) {
      if (split.reason === "single_block") counts.singleBlockUntouched++;
      else if (split.reason === "segment_over_limit") counts.overLimitUntouched++;
      else counts.ambiguousUntouched++;
      continue;
    }

    if (split.strategy === "blank_blocks") counts.splitBlankBlocks++;
    else counts.splitNumberedMarkers++;

    const promote = item.draftType.toUpperCase() !== "THREAD";
    if (promote) counts.promotedDraftTypeThread++;

    if (APPLY) {
      // Compare-and-set: yalnız hâlâ NULL ise yaz — eşzamanlı koşu/ikinci apply
      // duplicate yazamaz; status'a ve content'e DOKUNULMAZ.
      const res = await prisma.queueItem.updateMany({
        where: { id: item.id, threadSegments: null },
        data: {
          threadSegments: serializeThreadSegments(split.segments),
          ...(promote ? { draftType: "THREAD" } : {}),
        },
      });
      if (res.count === 1) counts.applied++;
      else {
        counts.racedSkipped++;
        if (promote) counts.promotedDraftTypeThread--;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        generatedAtIso: new Date().toISOString(),
        counts,
        note: APPLY
          ? "Uygulandı — yalnız threadSegments IS NULL satırlar yazıldı; status/content değişmedi."
          : "DRY-RUN — DB'ye HİÇBİR yazma yapılmadı. Uygulamak için --apply.",
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("[backfill-thread-segments] FAIL:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
