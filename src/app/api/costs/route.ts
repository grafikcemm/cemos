import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getCostLimits } from "@/lib/config/costLimits";
import { getBudgetStatus } from "@/lib/config/costGate";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

// SocialData per-tweet unit price (mirrors calculateCost in socialdata.ts).
const SOCIALDATA_UNIT_PRICE = 0.0002;

function parseMeta(meta: string | null): { purpose: string | null; preset: string | null; budgetClass: string | null } {
  if (!meta) return { purpose: null, preset: null, budgetClass: null };
  try {
    const parsed = JSON.parse(meta) as { purpose?: unknown; preset?: unknown; budgetClass?: unknown };
    return {
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : null,
      preset: typeof parsed.preset === "string" ? parsed.preset : null,
      budgetClass: typeof parsed.budgetClass === "string" ? parsed.budgetClass : null,
    };
  } catch {
    return { purpose: null, preset: null, budgetClass: null };
  }
}

// Faz 2E (ADR-034 §I): evaluation harcaması meta.budgetClass "evaluation" VEYA
// purpose "eval_" prefix'iyle ayrı sınıflanır; production kürasyonu ayrıdır.
// (Satır-bazlı isSocialData/isOpenRouter/purposeOf helpers WP-02d groupBy
// geçişinde grouped-satır eşdeğerleriyle [isSocialG/isOpenRouterG] değiştirildi.)
const CURATION_PURPOSE = "research_opportunity_curation";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }

  // Egress fast-path (SystemHealthProvider polling'i): SADECE bugünün toplam
  // maliyeti — tek DB AGGREGATE. Ana yol aylık TÜM UsageLog satırlarını Node'a
  // çeker (~binlerce satır/istek); 5 dk'da bir polling bunu Neon egress'ine
  // çeviriyordu. Tam döküm (line items / daily series / evaluation) yalnız
  // CostsTab'ın parametresiz çağrısında hesaplanır.
  if (req.nextUrl.searchParams.get("scope") === "today") {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const agg = await prisma.usageLog.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { date: todayStr },
      });
      return NextResponse.json({ today: { totalUsd: Number((agg._sum.estimatedCostUsd ?? 0).toFixed(5)) } });
    } catch (err) {
      const dbRes = dbErrorResponse(err);
      if (dbRes) return dbRes;
      const message = err instanceof Error ? err.message : "Maliyet alınamadı";
      return fail(message, 500); // redakte + 5xx sınırlı (ham DB/connection-string sızmaz)
    }
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = new Date().toISOString().slice(0, 7);

    // WP-02d — ay görünümü DB-side aggregate/groupBy'a taşındı. Eski yol ayın TÜM
    // UsageLog satırlarını (meta JSON'ları dahil) Node'a çekiyordu; 62×500'lük
    // fırtınanın ve data-transfer kotasının baş sürücüsüydü. Yeni yol 3 dar sorgu:
    //  (1) tam groupBy(date,provider,type,model) → tüm SAYISAL kırılımlar
    //      (bugün/ay toplamları, byModel, socialData, fal, transcript, dailySeries)
    //      grouped satırlardan BİREBİR türetilir;
    //  (2) dar select {meta, estimatedCostUsd, provider, type} → byPurpose/
    //      byPreset/evaluation/curation. meta JSON string kolonu DB-side
    //      ayrıştırılamaz; kolon non-nullable @default("{}") olduğundan
    //      "meta'sız" diye ayrı sınıf yok — default "{}" ~2 bayttır ve
    //      purpose fallback'i Node'da satır-bazlı eski semantikle birebir
    //      çalışır. Tam gövde (id/createdAt/model/tweetCount/platform)
    //      taşınmaz.
    // Review MEDIUM: iki okuma TEK MVCC snapshot'ından gelmeli — RepeatableRead
    // olmadan aradaki eşzamanlı UsageLog yazımı Σ(line-items)=ay-toplamı
    // uzlaşmasını o cevap için sessizce bozardı (eski tek-findMany buna bağışıktı).
    const [groups, metaRows] = await prisma.$transaction(
      [
        prisma.usageLog.groupBy({
          by: ["date", "provider", "type", "model"],
          where: { date: { startsWith: thisMonthStr } },
          // $transaction-array tiplemesi orderBy'ı zorunlu kılar; deterministik sıra bonus.
          orderBy: { date: "asc" },
          _sum: { estimatedCostUsd: true, tweetCount: true },
          _count: { _all: true },
        }),
        prisma.usageLog.findMany({
          where: { date: { startsWith: thisMonthStr } },
          select: { meta: true, estimatedCostUsd: true, provider: true, type: true },
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );

    type Group = {
      date: string;
      provider: string | null;
      type: string;
      model: string | null;
      _sum: { estimatedCostUsd: number | null; tweetCount: number | null };
      _count: { _all: number };
    };
    const g = groups as unknown as Group[];
    const sumOf = (rows: Group[]) => rows.reduce((a, r) => a + (r._sum.estimatedCostUsd ?? 0), 0);
    const tweetsOf = (rows: Group[]) => rows.reduce((a, r) => a + (r._sum.tweetCount ?? 0), 0);
    const callsOf = (rows: Group[]) => rows.reduce((a, r) => a + r._count._all, 0);
    const isSocialG = (r: { provider: string | null; type: string }) =>
      r.provider === "socialdata" || r.type === "scan";
    const isOpenRouterG = (r: { provider: string | null; type: string }) =>
      r.provider === "openrouter" || r.type === "openrouter" || r.type === "generation";

    const todayGroups = g.filter((r) => r.date === todayStr);
    const todayTotalUsd = sumOf(todayGroups);
    const monthTotalUsd = sumOf(g);

    const limits = getCostLimits();
    const budgetUsd = limits.monthlyBudgetUsd;
    const budgetStatus = await getBudgetStatus({ budgetClass: "essential" });

    // ── PROVIDER LINE ITEMS (month-to-date) ───────────────────────────────────
    const socialGroups = g.filter(isSocialG);
    const socialTweets = tweetsOf(socialGroups);
    const socialCostUsd = sumOf(socialGroups);

    const orGroups = g.filter(isOpenRouterG);
    const orTotalUsd = sumOf(orGroups);

    // byModel: groupBy zaten model bazında — birebir (calls = satır sayısı).
    const byModelMap = new Map<string, { model: string; costUsd: number; calls: number }>();
    for (const row of orGroups) {
      const model = row.model && row.model.trim().length > 0 ? row.model : "unknown";
      const entry = byModelMap.get(model) ?? { model, costUsd: 0, calls: 0 };
      entry.costUsd += row._sum.estimatedCostUsd ?? 0;
      entry.calls += row._count._all;
      byModelMap.set(model, entry);
    }

    // byPurpose/byPreset: her OR satırının meta'sı parse edilir; purpose'suz
    // meta ("{}"/eski satır) eski purposeOf fallback semantiğiyle bucket'lanır
    // (generation → draft_generation, diğer OR → other; preset → "(rol yolu)").
    const byPurposeMap = new Map<string, { purpose: string; costUsd: number; calls: number }>();
    const byPresetMap = new Map<string, { preset: string; costUsd: number; calls: number }>();
    const addPurpose = (purpose: string, costUsd: number, calls: number) => {
      const entry = byPurposeMap.get(purpose) ?? { purpose, costUsd: 0, calls: 0 };
      entry.costUsd += costUsd;
      entry.calls += calls;
      byPurposeMap.set(purpose, entry);
    };
    const addPreset = (preset: string, costUsd: number, calls: number) => {
      const entry = byPresetMap.get(preset) ?? { preset, costUsd: 0, calls: 0 };
      entry.costUsd += costUsd;
      entry.calls += calls;
      byPresetMap.set(preset, entry);
    };
    const metaOrRows = (metaRows as Array<{ meta: string | null; estimatedCostUsd: number; provider: string | null; type: string }>).filter(isOpenRouterG);
    for (const row of metaOrRows) {
      const parsed = parseMeta(row.meta);
      addPurpose(
        parsed.purpose ?? (row.type === "generation" ? "draft_generation" : "other"),
        row.estimatedCostUsd,
        1,
      );
      addPreset(parsed.preset ?? "(rol yolu)", row.estimatedCostUsd, 1);
    }
    const round5 = (n: number) => Number(n.toFixed(5));
    const sortByCost = <T extends { costUsd: number }>(arr: T[]) =>
      arr.sort((a, b) => b.costUsd - a.costUsd).map((e) => ({ ...e, costUsd: round5(e.costUsd) }));

    // fal.ai image + transcript (gemini/supadata) spend: summed into the month
    // total but previously shown in NO line item, so Σ(line items) < total. Break
    // them out so the Costs breakdown reconciles against the grand total.
    const falGroups = g.filter((r) => r.type === "image" || r.provider === "fal");
    const falCostUsd = sumOf(falGroups);
    const transcriptGroups = g.filter((r) => r.type === "transcript");
    const transcriptCostUsd = sumOf(transcriptGroups);

    const lineItems = {
      socialData: {
        provider: "socialdata",
        tweets: socialTweets,
        unitPriceUsd: SOCIALDATA_UNIT_PRICE,
        costUsd: round5(socialCostUsd),
      },
      openRouter: {
        provider: "openrouter",
        costUsd: round5(orTotalUsd),
        byPurpose: sortByCost([...byPurposeMap.values()]),
        byModel: sortByCost([...byModelMap.values()]),
        byPreset: sortByCost([...byPresetMap.values()]),
      },
      fal: {
        provider: "fal",
        images: callsOf(falGroups),
        costUsd: round5(falCostUsd),
      },
      transcript: {
        provider: "transcript",
        count: callsOf(transcriptGroups),
        costUsd: round5(transcriptCostUsd),
      },
    };

    // ── 30-day daily series (total spend per day) ─────────────────────────────
    const dailyMap: Record<string, { date: string; totalUsd: number; socialDataUsd: number; openRouterUsd: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap[dateStr] = { date: dateStr, totalUsd: 0, socialDataUsd: 0, openRouterUsd: 0 };
    }
    for (const row of g) {
      const bucket = dailyMap[row.date];
      if (!bucket) continue;
      const cost = row._sum.estimatedCostUsd ?? 0;
      bucket.totalUsd += cost;
      if (isSocialG(row)) bucket.socialDataUsd += cost;
      else if (isOpenRouterG(row)) bucket.openRouterUsd += cost;
    }
    const dailySeries = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        totalUsd: round5(d.totalUsd),
        socialDataUsd: round5(d.socialDataUsd),
        openRouterUsd: round5(d.openRouterUsd),
      }));

    return NextResponse.json({
      // Backward-friendly keys (Topbar + SettingsTab read today.totalUsd / month.*).
      today: {
        totalUsd: round5(todayTotalUsd),
        socialDataTweets: tweetsOf(todayGroups.filter(isSocialG)),
        socialDataUsd: round5(sumOf(todayGroups.filter(isSocialG))),
        openRouterUsd: round5(sumOf(todayGroups.filter(isOpenRouterG))),
      },
      month: {
        totalUsd: round5(monthTotalUsd),
        budgetUsd,
        socialDataUsd: lineItems.socialData.costUsd,
        openRouterUsd: lineItems.openRouter.costUsd,
        // Bütçe kapısının GERÇEKTEN uyguladığı OpenRouter aylık harcaması:
        // max(local ledger, provider /key toplamı). Local satır-kalemi provider'ın
        // ALTINDA kalabilir (paylaşımlı key / eski yazılmamış çağrılar) → generation
        // provider figürüne yakın bloklanırken headline az gösteriyordu. Bu alan
        // uygulanan gerçeği yüzeye çıkarır (openRouterUsd satır-kalemi Σ=total
        // uzlaşması için korunur).
        openRouterEnforcedUsd: round5(budgetStatus.spentUsd),
        providerUsageUsd:
          budgetStatus.providerUsageMonthlyUsd != null ? round5(budgetStatus.providerUsageMonthlyUsd) : null,
        falUsd: lineItems.fal.costUsd,
        transcriptUsd: lineItems.transcript.costUsd,
      },
      lineItems,
      budgetStatus,
      // Faz 2E (ADR-034 §I): evaluation bütçesi/harcaması — production curation
      // harcamasından AYRI (farklı purpose/budget class). Her ikisi de meta'dan
      // türediğinden yalnız metaRows'tan hesaplanır (meta'sız satır tanım gereği
      // evaluation/curation olamaz — eski davranışla birebir).
      evaluation: {
        enabled: limits.evalSpendEnabled,
        monthlyBudgetUsd: limits.evalMonthlyBudgetUsd,
        monthSpendUsd: round5(
          metaRows
            .filter((l) => {
              const parsed = parseMeta(l.meta);
              return parsed.budgetClass === "evaluation" || (parsed.purpose ?? "").startsWith("eval_");
            })
            .reduce((a, l) => a + l.estimatedCostUsd, 0),
        ),
        curationMonthSpendUsd: round5(
          metaOrRows
            .filter((l) => parseMeta(l.meta).purpose === CURATION_PURPOSE)
            .reduce((a, l) => a + l.estimatedCostUsd, 0)
        ),
      },
      dailySeries,
      limits: {
        dailyTweetBudget: limits.dailyTweetBudget,
        maxSourcesPerAccount: limits.maxSourcesPerAccount,
        maxTweetsPerSource: limits.maxTweetsPerSource,
        monthlyBudgetUsd: limits.monthlyBudgetUsd,
        costPerItem: limits.costPerItem,
        costPerGeneration: limits.costPerGeneration,
      },
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const message = err instanceof Error ? err.message : "Maliyetler alınamadı";
    return fail(message, 500);
  }
}
