import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const ProfileSchema = z.object({
  profile: z.enum(["dev", "operator_quality", "premium"]),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ProfileSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz profil değeri.", 400, { detail: parsed.error.flatten() });
  }
  const { profile } = parsed.data;
  try {

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

    return ok({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model profili güncellenemedi";
    return fail(message, 500);
  }
}
