import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { modelConfigs, resolveModel } from "@/lib/ai/model-config";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        schedule: true,
      },
    });

    const profile = process.env.MODEL_PROFILE || "operator_quality";
    const enableFree = process.env.ENABLE_FREE_MODELS === "true";
    const cheapOverride = process.env.OPENROUTER_CHEAP_MODEL;
    const judgeOverride = process.env.OPENROUTER_JUDGE_MODEL;
    
    const freeOverridesIgnored = 
      (profile === "operator_quality" || profile === "premium") &&
      !enableFree &&
      (Boolean(cheapOverride?.includes(":free")) || Boolean(judgeOverride?.includes(":free")));

    const lastItem = await prisma.queueItem.findFirst({
      where: {
        scores: { contains: "modelUsed" }
      },
      orderBy: { createdAt: "desc" }
    });

    let lastUsedMetadata: any = null;
    if (lastItem && lastItem.scores) {
      try {
        const parsed = JSON.parse(lastItem.scores);
        if (parsed.modelUsed) {
          const acc = accounts.find(a => a.id === lastItem.accountId);
          lastUsedMetadata = {
            writer: parsed.modelUsed.writer || "unknown",
            judge: parsed.modelUsed.judge || "unknown",
            finalEditor: parsed.modelUsed.finalEditor || "unknown",
            fallbackUsed: parsed.modelUsed.writerFallbackUsed || parsed.modelUsed.judgeFallbackUsed || parsed.modelFallbackUsed || false,
            fallbackReason: parsed.modelUsed.writerFallbackReason || parsed.modelUsed.judgeFallbackReason || parsed.modelFallbackReason || "",
            createdAt: lastItem.createdAt,
            account: acc?.handle || "unknown",
          };
        }
      } catch {}
    }

    return NextResponse.json({
      openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      monthlyAiBudgetUsd: Number(process.env.MONTHLY_AI_BUDGET_USD ?? 10),
      premiumEnabled: process.env.ENABLE_PREMIUM_MODEL === "true",
      modelProfile: profile,
      freeOverridesIgnored,
      lastUsedMetadata,
      models: Object.values(modelConfigs).map((config) => ({
        ...config,
        activeModel: resolveModel(config.role),
      })),
      accounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayarlar alınamadı";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const {
      accountId,
      automationEnabled,
      dailyMaxPosts,
      quietStartHour,
      quietEndHour,
      requireApproval,
      scanCron,
      cadence,
    } = body;

    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId gereklidir." }, { status: 400 });
    }

    const schedule = await prisma.schedule.upsert({
      where: { accountId },
      create: {
        accountId,
        automationEnabled: automationEnabled ?? false,
        dailyMaxPosts: dailyMaxPosts ?? 3,
        quietStartHour: quietStartHour ?? 23,
        quietEndHour: quietEndHour ?? 8,
        requireApproval: requireApproval ?? true,
        scanCron: scanCron ?? "0 9 * * *",
        cadence: cadence ?? "daily",
      },
      update: {
        automationEnabled: automationEnabled !== undefined ? automationEnabled : undefined,
        dailyMaxPosts: dailyMaxPosts !== undefined ? dailyMaxPosts : undefined,
        quietStartHour: quietStartHour !== undefined ? quietStartHour : undefined,
        quietEndHour: quietEndHour !== undefined ? quietEndHour : undefined,
        requireApproval: requireApproval !== undefined ? requireApproval : undefined,
        scanCron: scanCron !== undefined ? scanCron : undefined,
        cadence: cadence !== undefined ? cadence : undefined,
      },
    });

    return NextResponse.json({ success: true, schedule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayarlar kaydedilemedi";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
