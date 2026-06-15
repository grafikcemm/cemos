import { NextResponse } from "next/server";
import { competitorGroups } from "@/lib/competitors";

export async function GET() {
  return NextResponse.json({ competitors: competitorGroups });
}
