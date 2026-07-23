import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

const ActionSchema = z.object({
  action: z.enum(["start", "stop"]),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ActionSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Invalid action.", 400, { detail: parsed.error.flatten() });
  }
  const { action } = parsed.data;
  try {

    // ADR-031: hedef hesaplar DB'den (üretim-hazır liste); literal değil.
    const { listGenerationReadyHandles } = await import("@/lib/accounts/profileRepository");
    const targetHandles = (await listGenerationReadyHandles()).handles;
    const accounts = await prisma.account.findMany({
      where: { handle: { in: targetHandles } }
    });

    if (action === "start") {
      // Start Operator Mode
      for (const account of accounts) {
        await prisma.schedule.upsert({
          where: { accountId: account.id },
          create: {
            accountId: account.id,
            automationEnabled: true,
            dailyMaxPosts: 1,
            requireApproval: true,
            cadence: "daily",
            scanCron: "0 9 * * *",
            quietStartHour: 23,
            quietEndHour: 8
          },
          update: {
            automationEnabled: true,
            dailyMaxPosts: 1,
            requireApproval: true,
            cadence: "daily",
            scanCron: "0 9 * * *"
          }
        });
      }
    } else if (action === "stop") {
      // Stop Operator Mode
      for (const account of accounts) {
        await prisma.schedule.updateMany({
          where: { accountId: account.id },
          data: {
            automationEnabled: false
          }
        });
      }
    }

    return ok({ action });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const message = err instanceof Error ? err.message : "Operator mode change failed";
    return fail(message, 500);
  }
}
