import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isLocalDevRuntime, timingSafeEqualStr } from "@/lib/utils/cronAuth";
import { redactError } from "@/lib/utils/redactSecrets";

function requireSnapshotAuth(req: NextRequest): boolean {
  const token = process.env.XAGENT_SNAPSHOT_TOKEN;
  // Fail-closed by default when unset — only a positively-identified local
  // dev/test runtime stays open (never Vercel / never an unset NODE_ENV).
  if (!token) return isLocalDevRuntime();
  return timingSafeEqualStr(req.headers.get("authorization") ?? "", `Bearer ${token}`);
}

function getIstanbulDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function getDayBounds(date: string): { start: Date; end: Date } {
  return {
    start: new Date(`${date}T00:00:00+03:00`),
    end: new Date(`${date}T23:59:59+03:00`),
  };
}

async function checkDbHealthy(todayStart: Date): Promise<{ healthy: boolean; warning?: string }> {
  try {
    const [totalItems, oldItems, totalLogs] = await Promise.all([
      prisma.queueItem.count(),
      prisma.queueItem.count({ where: { createdAt: { lt: todayStart } } }),
      prisma.publishLog.count({ where: { publishedAt: { lt: todayStart } } }),
    ]);
    // Historical records in either table → definitely not ephemeral
    if (oldItems > 0 || totalLogs > 0) return { healthy: true };
    // Only today's records → suspicious ephemeral restart
    if (totalItems > 0) {
      return { healthy: false, warning: "xagent_db_possibly_ephemeral: tüm kayıtlar bugün oluşturulmuş" };
    }
    return { healthy: true };
  } catch {
    return { healthy: false, warning: "xagent_db_unreachable" };
  }
}

function deriveMinNextAction(
  draftsPending: number,
  awaitingApproval: number,
  scheduled: number,
  requireApproval: boolean
): { action: string; reason: string } {
  if (draftsPending > 0 && requireApproval) return { action: "approve", reason: `${draftsPending} taslak onay bekliyor` };
  if (draftsPending > 0) return { action: "schedule", reason: `${draftsPending} taslak planlamaya hazır` };
  if (awaitingApproval > 0) return { action: "schedule", reason: `${awaitingApproval} onaylı içerik planlanmayı bekliyor` };
  if (scheduled > 0) return { action: "review_scheduled", reason: `${scheduled} içerik zamanlandı` };
  return { action: "generate", reason: "Bugün içerik üretilmedi" };
}

export async function GET(req: NextRequest) {
  if (!requireSnapshotAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = new URL(req.url).searchParams.get("date");
  const date = dateParam ?? getIstanbulDate();
  const { start: todayStart, end: todayEnd } = getDayBounds(date);

  const dbHealth = await checkDbHealthy(todayStart);
  const warnings: string[] = [];
  if (!dbHealth.healthy && dbHealth.warning) warnings.push(dbHealth.warning);

  try {
    const accounts = await prisma.account.findMany({ include: { schedule: true } });

    const accountsData = await Promise.all(
      accounts.map(async (account) => {
        const [draftsPending, awaitingApproval, scheduled, publishedToday] = await Promise.all([
          prisma.queueItem.count({
            where: { accountId: account.id, status: { in: ["new", "draft"] }, createdAt: { gte: todayStart, lte: todayEnd } },
          }),
          prisma.queueItem.count({ where: { accountId: account.id, status: "approved" } }),
          prisma.queueItem.count({ where: { accountId: account.id, status: "scheduled" } }),
          prisma.publishLog.count({
            where: { accountId: account.id, publishedAt: { gte: todayStart, lte: todayEnd }, success: true },
          }),
        ]);
        return {
          handle: account.handle,
          xHandle: account.xHandle,
          draftsPending,
          awaitingApproval,
          scheduled,
          publishedToday,
          minNextAction: deriveMinNextAction(draftsPending, awaitingApproval, scheduled, account.schedule?.requireApproval ?? true),
        };
      })
    );

    return NextResponse.json({
      app: "xagent",
      date,
      status: dbHealth.healthy ? "ok" : "degraded",
      generatedAt: new Date().toISOString(),
      data: { dbHealthy: dbHealth.healthy, accounts: accountsData },
      warnings: warnings.length > 0 ? warnings : null,
    });
  } catch (err) {
    console.error("[XAgent snapshot]", redactError(err));
    return NextResponse.json(
      { app: "xagent", date, status: "degraded", generatedAt: new Date().toISOString(), data: null, warnings: ["Prisma sorgu hatası"] },
      { status: 500 }
    );
  }
}
