import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { setFeedbackSignalNeutralized } from "@/lib/memory/signalBridge";

/**
 * ADR-045: yanlış ham öğrenme sinyalini etkisizleştir / geri al. Operatör bir
 * FeedbackEvent'i "gürültü" işaretler → köprü (signalBridge) onu GELECEK hafıza
 * önerilerine sokmaz; ham kayıt SİLİNMEZ (audit korunur). Fail-closed hesap
 * kapsamı (başka hesabın sinyali mutasyona uğramaz); idempotent.
 */

const Schema = z.object({
  accountHandle: z.string().min(1).max(40),
  id: z.string().min(1).max(64),
  action: z.enum(["neutralize", "restore"]),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = Schema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  const { accountHandle, id, action } = parsed.data;
  try {
    const r = await setFeedbackSignalNeutralized(accountHandle, id, action === "neutralize");
    if (!r.ok) {
      if (r.code === "not_found") return fail("Sinyal bulunamadı", 404, { code: r.code });
      return fail("Sinyal bu hesaba ait değil", 403, { code: r.code });
    }
    return ok({ id: r.id, neutralized: r.neutralized });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "İşlem başarısız", 500);
  }
}
