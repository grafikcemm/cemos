import { z } from "zod";

/**
 * Faz 1E (ADR-025) — yayın adapter sözleşmesi. Intent penceresi açmak yayın
 * DEĞİLDİR: yalnız PublishAttempt(prepared) satırı üretir. PublishLog +
 * PublishedPost + QueueItem yayın durumu YALNIZ succeeded geçişinin
 * transaction'ında yazılır. X API adapter'ı ödeme onayı olmadığı için kalıcı
 * blocked-external sonucu döner ve ASLA ağ isteği atmaz.
 */

export const AdapterKindSchema = z.enum(["intent", "x_api"]);
export type AdapterKind = z.infer<typeof AdapterKindSchema>;

export const AttemptStateSchema = z.enum(["prepared", "succeeded", "failed"]);
export type AttemptState = z.infer<typeof AttemptStateSchema>;

/** Typed hata kodları — route'lar Türkçe, eyleme dönük mesajlara çevirir. */
export const PublishFailureCodeSchema = z.enum([
  "queue_item_not_found",
  "invalid_status",
  "already_published",
  "edit_required",
  "readiness_blocked",
  "prepare_not_found",
  "prepare_stale",
  "content_changed",
  "account_mismatch",
  "adapter_mismatch",
  "blocked_external",
  "payment_approval_required",
  "conflict",
]);
export type PublishFailureCode = z.infer<typeof PublishFailureCodeSchema>;

export class PublishFlowError extends Error {
  code: PublishFailureCode;
  reasons: { code: string; message: string }[];
  constructor(code: PublishFailureCode, reasons: { code: string; message: string }[] = []) {
    super(code);
    this.code = code;
    this.reasons = reasons;
  }
}

/** Yayın anında dondurulan readiness kanıtı (yalnız versiyon değil, karar + nedenler). */
export const ReadinessSnapshotSchema = z.object({
  state: z.enum(["ready", "needs_edit", "blocked"]),
  reasons: z.array(z.object({ code: z.string(), message: z.string() })),
  policyVersion: z.string(),
  assessedAt: z.string(),
});
export type ReadinessSnapshot = z.infer<typeof ReadinessSnapshotSchema>;

export const PrepareInputSchema = z.object({
  queueItemId: z.string().min(1),
  accountId: z.string().min(1),
  accountHandle: z.string().min(1),
  /** Yayınlanacak güncel metin (editedContent ?? content, trim'li). */
  text: z.string().min(1),
  contentHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  readinessSnapshot: ReadinessSnapshotSchema,
});
export type PrepareInput = z.infer<typeof PrepareInputSchema>;

export const AdapterResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    adapter: AdapterKindSchema,
    /** intent: kullanıcının yönlendirileceği URL; x_api: yok. */
    intentUrl: z.string().url().optional(),
    /** Gerçek API başarısında platform post id'si (intent'te yok). */
    externalId: z.string().nullable(),
  }),
  z.object({
    ok: z.literal(false),
    adapter: AdapterKindSchema,
    code: PublishFailureCodeSchema,
    /** Kullanıcıya gösterilecek Türkçe, eyleme dönük mesaj. */
    message: z.string(),
    /** Dış engel (ödeme/izin) — retry anlamsız, dürüst blocked-external UI. */
    blockedExternal: z.boolean().default(false),
  }),
]);
export type AdapterResult = z.infer<typeof AdapterResultSchema>;

/**
 * Adapter sözleşmesi. `prepare` yan-etkisizdir (DB yazımı service'te);
 * `publish` yalnız gerçek API adapter'ında ağ isteği atabilir — intent'te
 * manuel onay akışı kullanılır, x_api'de ödeme onayı yokken daima typed
 * blocked-external döner.
 */
export interface PublishAdapter {
  readonly kind: AdapterKind;
  prepare(input: PrepareInput): Promise<AdapterResult>;
  publish(input: PrepareInput & { attemptId: string }): Promise<AdapterResult>;
}

/** X intent URL'si — tek üretim noktası (UI elle kurmaz). */
export function buildIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
