/**
 * Phase 2D — READ-ONLY thread envanteri + kalibrasyon örneklem denetimi.
 *
 * Gerçek DB'de thread taslaklarının yapısal/etiket durumunu AGGREGATE sayar.
 * Gizlilik sözleşmesi: taslak METNİ asla yazdırılmaz — yalnız sayılar,
 * min/max/percentile ve reason kodları. Secret/raw scores JSON basılmaz.
 *
 *   npx tsx scripts/audit-thread-readiness.ts        # read-only (tek mod)
 *
 * Script hiçbir yazma yapmaz (yalnız findMany/aggregate).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { assessQueueItemReadiness } from "../src/lib/services/readinessAdapter";
import { parseThreadSegments } from "../src/lib/growth-engine/threadSegments";

const prisma = new PrismaClient();

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function dist(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, handle: true, maxChars: true } });
  const accById = new Map(accounts.map((a) => [a.id, a]));

  // Thread evreni: draftType=THREAD VEYA mode=thread (case-insensitive draftType).
  const items = await prisma.queueItem.findMany({
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
      scores: true,
      lintReport: true,
      sourcePostId: true,
      newsItemId: true,
    },
  });

  const totalQueue = await prisma.queueItem.count();

  let draftTypeThread = 0;
  let modeThread = 0;
  let modeThreadButTweet = 0;
  let segNull = 0;
  let segValid = 0;
  let segInvalidJson = 0;
  let segEmptyOrSingle = 0;
  let segOver280 = 0;
  let withScores = 0;
  let judgedTrue = 0;
  const statusDist: string[] = [];
  const accountDist: string[] = [];
  const readinessStates: string[] = [];
  const readinessReasons: string[] = [];
  const segCounts: number[] = [];
  const segCharLens: number[] = [];
  const joinedLens: number[] = [];

  for (const it of items) {
    const isTypeThread = it.draftType.toUpperCase() === "THREAD";
    if (isTypeThread) draftTypeThread++;
    if (it.mode === "thread") modeThread++;
    if (it.mode === "thread" && !isTypeThread) modeThreadButTweet++;

    statusDist.push(it.status);
    accountDist.push(accById.get(it.accountId)?.handle ?? "unknown");
    joinedLens.push((it.editedContent ?? it.content ?? "").trim().length);

    if (it.threadSegments == null || it.threadSegments.trim() === "") {
      segNull++;
    } else {
      const parsed = parseThreadSegments(it.threadSegments);
      if (!parsed) {
        segInvalidJson++;
      } else {
        const texts = parsed.map((s) => s.text.trim());
        const nonEmpty = texts.filter(Boolean);
        if (nonEmpty.length <= 1) segEmptyOrSingle++;
        else segValid++;
        if (texts.some((t) => t.length > 280)) segOver280++;
        segCounts.push(nonEmpty.length);
        for (const t of nonEmpty) segCharLens.push(t.length);
      }
    }

    let judged = false;
    try {
      const scores = it.scores ? JSON.parse(it.scores) : null;
      if (scores && typeof scores === "object" && Object.keys(scores).length > 0) {
        withScores++;
        judged = scores?.telemetry?.judged === true;
      }
    } catch {
      /* bozuk scores = skorsuz sayılır */
    }
    if (judged) judgedTrue++;

    const acc = accById.get(it.accountId);
    const readiness = assessQueueItemReadiness(it, {
      handle: acc?.handle ?? "unknown",
      maxChars: acc?.maxChars ?? 280,
    });
    readinessStates.push(readiness.state);
    for (const r of readiness.reasons) readinessReasons.push(r.code);
  }

  // ── Kalibrasyon örneklem denetimi (etiketli örnekler) ──────────────────────
  // pozitif sinyal adayı: published / manual_published / approved
  // negatif sinyal adayı: rejected
  // needs_edit doğrudan negatif etiket DEĞİL; judged=false kalibrasyon doğrusu değil.
  const POS = new Set(["published", "manual_published", "approved", "scheduled"]);
  const NEG = new Set(["rejected"]);
  let posJudged = 0;
  let negJudged = 0;
  for (const it of items) {
    let judged = false;
    try {
      judged = JSON.parse(it.scores ?? "{}")?.telemetry?.judged === true;
    } catch { /* yok */ }
    if (!judged) continue;
    if (POS.has(it.status)) posJudged++;
    else if (NEG.has(it.status)) negJudged++;
  }
  // Örneklem yeterlilik kriteri (dokümante): eşik başına en az 10 judged pozitif
  // VE 10 judged negatif thread örneği olmadan skor eşiği kalibre EDİLMEZ.
  const MIN_LABELED_PER_CLASS = 10;
  const calibrationStatus =
    posJudged >= MIN_LABELED_PER_CLASS && negJudged >= MIN_LABELED_PER_CLASS
      ? "sufficient_sample"
      : "insufficient_sample";

  segCounts.sort((a, b) => a - b);
  segCharLens.sort((a, b) => a - b);
  joinedLens.sort((a, b) => a - b);

  const report = {
    generatedAtIso: new Date().toISOString(),
    totalQueueItems: totalQueue,
    threadUniverse: items.length,
    counts: {
      draftTypeThread,
      modeThread,
      modeThreadButDraftTypeTweet: modeThreadButTweet,
      threadSegmentsNull: segNull,
      threadSegmentsValid: segValid,
      threadSegmentsInvalidJson: segInvalidJson,
      threadSegmentsEmptyOrSingle: segEmptyOrSingle,
      anySegmentOver280: segOver280,
      withScores,
      judgedTrue,
      judgedFalse: items.length - judgedTrue,
    },
    statusDistribution: dist(statusDist),
    accountDistribution: dist(accountDist),
    readinessStateDistribution: dist(readinessStates),
    readinessReasonDistribution: dist(readinessReasons),
    segmentCountStats:
      segCounts.length > 0
        ? { n: segCounts.length, min: segCounts[0], p50: pct(segCounts, 50), p90: pct(segCounts, 90), max: segCounts[segCounts.length - 1] }
        : null,
    segmentCharStats:
      segCharLens.length > 0
        ? { n: segCharLens.length, min: segCharLens[0], p50: pct(segCharLens, 50), p90: pct(segCharLens, 90), max: segCharLens[segCharLens.length - 1] }
        : null,
    joinedTextCharStats:
      joinedLens.length > 0
        ? { n: joinedLens.length, min: joinedLens[0], p50: pct(joinedLens, 50), p90: pct(joinedLens, 90), max: joinedLens[joinedLens.length - 1] }
        : null,
    calibration: {
      minLabeledPerClass: MIN_LABELED_PER_CLASS,
      judgedPositive: posJudged,
      judgedNegative: negJudged,
      calibrationStatus,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error("[audit-thread-readiness] FAIL:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
