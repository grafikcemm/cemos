import { NextRequest, NextResponse } from "next/server";
import { accountList, accountProfiles, type AccountHandle } from "@/lib/accounts";
import { runAccountBenchmark } from "@/lib/ai/benchmark";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const account = body.account as AccountHandle | "all" | undefined;
    const profiles =
      account && account !== "all" ? [accountProfiles[account]].filter(Boolean) : accountList;

    if (profiles.length === 0) {
      return NextResponse.json({ error: "Unknown account." }, { status: 400 });
    }

    const results = await Promise.all(profiles.map((profile) => runAccountBenchmark(profile)));
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Benchmark failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
