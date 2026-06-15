import { NextRequest, NextResponse } from "next/server";
import { embedTrainingExamplesByAccount } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { validateAccountHandle } from "@/lib/growth-engine/account-profiles";
import { accountRepo } from "@/lib/db/accountRepo";
import { z } from "zod";

const Schema = z.object({
  accountHandle: z.enum(["grafikcem", "maskulenkod"])
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const result = Schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Validation error: invalid accountHandle" },
        { status: 400 }
      );
    }

    const { accountHandle } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return NextResponse.json(
        { success: false, error: "Invalid accountHandle" },
        { status: 400 }
      );
    }

    const dbAccount = await accountRepo.findByHandle(accountHandle);
    if (!dbAccount) {
      return NextResponse.json(
        { success: false, error: `Account profile not found in DB for handle: ${accountHandle}` },
        { status: 400 }
      );
    }

    const stats = await embedTrainingExamplesByAccount(dbAccount.id);

    return NextResponse.json({
      success: true,
      ...stats
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
