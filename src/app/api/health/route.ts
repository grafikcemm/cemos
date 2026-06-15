import { NextResponse } from "next/server";
import { healthService } from "@/lib/services/healthService";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deep = searchParams.get("deep") === "true";
    const health = await healthService.getHealth({ deep });
    return NextResponse.json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sağlık durumu kontrol edilemedi";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
