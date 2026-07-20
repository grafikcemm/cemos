import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { modelConfigs, resolveModel } from "@/lib/ai/model-config";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { getModelProfile } from "@/lib/services/settingsService";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const accounts = await prisma.account.findMany({
      include: {
        schedule: true,
      },
      // Stable order: clients that default to accounts[0] (Seriler seed/handoff)
      // must bind the SAME account every time, not a non-deterministic Postgres
      // row order. Account selector for explicit choice is a separate follow-up.
      orderBy: { createdAt: "asc" },
    });

    // Durable, server-authoritative profile (Phase 5F §6) — reflects the
    // persisted operator choice, not just this instance's env.
    const profile = await getModelProfile();
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
    return fail(message, 500);
  }
}

const ScheduleSchema = z.object({
  accountId: z.string().min(1),
  automationEnabled: z.boolean().optional(),
  dailyMaxPosts: z.number().int().optional(),
  quietStartHour: z.number().int().optional(),
  quietEndHour: z.number().int().optional(),
  requireApproval: z.boolean().optional(),
  scanCron: z.string().optional(),
  cadence: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ScheduleSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const {
      accountId,
      automationEnabled,
      dailyMaxPosts,
      quietStartHour,
      quietEndHour,
      requireApproval,
      scanCron,
      cadence,
    } = parsed.data;

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

    return ok({ schedule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayarlar kaydedilemedi";
    return fail(message, 500);
  }
}
