import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { action } = await req.json();

    if (action !== "start" && action !== "stop") {
      return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
    }

    const targetHandles = ["grafikcem", "maskulenkod"];
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

    return NextResponse.json({ success: true, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operator mode change failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
