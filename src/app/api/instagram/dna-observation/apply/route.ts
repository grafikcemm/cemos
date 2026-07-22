import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { getInstagramDnaObservation } from "@/lib/instagram/dnaObservationService";
import {
  CAPTION_DNA_APPLY_FIELDS,
  applyObservationToCaptionDna,
  applyObservationToSeriesHashtags,
  type ApplyResult,
} from "@/lib/instagram/dnaApplyService";

/**
 * "DNA'ya uygula" — açık insan onayı endpoint'i (Phase 3A §D/§E, ADR-035).
 *
 * Governance: istemci YALNIZ alan seçimi + expectedVersion gönderir; uygulanan
 * DEĞERLERİ sunucu güncel gözlemden kendisi türetir (sahte değer enjeksiyonu
 * imkânsız). Boş seçim mutation yapmaz; stale version → 409 (değerler zaten
 * uygulanmışsa idempotent 200 alreadyApplied); yetersiz kanıt → 422.
 * Otomatik apply YOK — bu endpoint yalnız UI onay akışından çağrılır.
 */

const MAX_BODY_CHARS = 256 * 1024;

const ApplySchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("caption_dna"),
    accountId: z.string().min(1).max(64),
    selectedFields: z.array(z.enum(CAPTION_DNA_APPLY_FIELDS)).max(CAPTION_DNA_APPLY_FIELDS.length),
    expectedVersion: z.number().int().min(0).nullable(),
  }),
  z.object({
    target: z.literal("series_hashtag"),
    seriesId: z.string().min(1).max(64),
    expectedVersion: z.number().int().min(1),
  }),
]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json({ success: status < 400, ...body }, { status });
}

function mapApplyError(r: Extract<ApplyResult, { ok: false }>) {
  const status =
    r.code === "version_conflict"
      ? 409
      : r.code === "not_found"
        ? 404
        : r.code === "empty_selection"
          ? 400
          : 422; // insufficient_evidence
  return json(status, { error: r.message, code: r.code });
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return json(403, { error: "Yetkisiz", code: "forbidden" });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json(413, { error: "body_too_large", code: "body_too_large" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json(400, { error: "Geçersiz JSON", code: "invalid_json" });
  }
  const parsed = ApplySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json(400, { error: "Geçersiz istek alanları", code: "invalid_fields" });
  }

  try {
    // Sunucu gözlemi HER apply'da yeniden hesaplar — istemciden değer alınmaz.
    const current = await getInstagramDnaObservation();
    if (current.status !== "ok" || !current.observation || !current.account) {
      return json(422, {
        error: `Gözlem hazır değil (${current.status}): ${current.reason}`,
        code: "observation_unavailable",
      });
    }

    const input = parsed.data;
    if (input.target === "caption_dna") {
      // Cross-account apply fail-closed: yalnız single-IG contract hesabı.
      if (input.accountId !== current.account.id) {
        return json(422, {
          error: "accountId bağlı Instagram hesabıyla eşleşmiyor",
          code: "account_mismatch",
        });
      }
      const r = await applyObservationToCaptionDna({
        accountHandle: current.account.handle,
        selectedFields: input.selectedFields,
        expectedVersion: input.expectedVersion,
        observation: current.observation,
      });
      if (!r.ok) return mapApplyError(r);
      return json(200, { applied: r });
    }

    const r = await applyObservationToSeriesHashtags({
      seriesId: input.seriesId,
      expectedVersion: input.expectedVersion,
      observation: current.observation,
    });
    if (!r.ok) return mapApplyError(r);
    return json(200, { applied: r });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Uygulama başarısız" });
  }
}
