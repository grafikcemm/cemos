import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { profile } = await req.json();

    if (profile !== "dev" && profile !== "operator_quality" && profile !== "premium") {
      return NextResponse.json({ success: false, error: "Geçersiz profil değeri." }, { status: 400 });
    }

    // 1. Update the process.env in-memory immediately for current server execution
    process.env.MODEL_PROFILE = profile;

    // 2. Write it permanently to .env.local file
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf-8");
      
      const regex = /^MODEL_PROFILE=.*$/m;
      if (regex.test(content)) {
        content = content.replace(regex, `MODEL_PROFILE=${profile}`);
      } else {
        // Append it at the end
        content = content.trim() + `\nMODEL_PROFILE=${profile}\n`;
      }
      
      fs.writeFileSync(envPath, content, "utf-8");
    } else {
      // Create a brand new file
      fs.writeFileSync(envPath, `MODEL_PROFILE=${profile}\n`, "utf-8");
    }

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model profili güncellenemedi";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
