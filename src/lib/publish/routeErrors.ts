import { PublishFlowError, type PublishFailureCode } from "./contract";

/** Typed publish hatası → HTTP status + Türkçe, eyleme dönük mesaj. */
const ERROR_MAP: Record<PublishFailureCode, { status: number; message: string }> = {
  queue_item_not_found: { status: 404, message: "Taslak bulunamadı." },
  invalid_status: { status: 409, message: "Durum geçersiz — bu taslak yayınlanabilir durumda değil." },
  already_published: { status: 409, message: "Bu taslak zaten paylaşıldı olarak işaretli." },
  edit_required: { status: 422, message: "Taslak artık yayınlanmaya hazır değil — önce düzenle." },
  readiness_blocked: { status: 422, message: "Taslak yayınlanamaz — önce engelleyen sorunları gider." },
  prepare_not_found: { status: 422, message: "Hazırlık bulunamadı — önce 'X'te aç' ile hazırla." },
  prepare_stale: { status: 422, message: "Hazırlık eski — yeniden 'X'te aç'." },
  content_changed: { status: 422, message: "İçerik değişti — yeniden 'X'te aç'." },
  account_mismatch: { status: 409, message: "Hesap/taslak eşleşmesi geçersiz." },
  adapter_mismatch: { status: 409, message: "Bu yayın yolu bu hazırlıkla kullanılamaz." },
  blocked_external: { status: 409, message: "Harici yayın izni bulunmuyor." },
  payment_approval_required: {
    status: 409,
    message: "Harici yayın izni bulunmuyor — X API ödeme onayı verilmedi.",
  },
  conflict: { status: 409, message: "Eşzamanlı işlem çakışması — sayfayı yenile." },
};

export function publishErrorResponse(err: unknown): {
  status: number;
  error: string;
  code: string;
  reasons?: { code: string; message: string }[];
} {
  if (err instanceof PublishFlowError) {
    const m = ERROR_MAP[err.code];
    return {
      status: m.status,
      error: m.message,
      code: err.code,
      reasons: err.reasons.length > 0 ? err.reasons : undefined,
    };
  }
  const msg = err instanceof Error ? err.message : "Beklenmeyen hata.";
  return { status: 500, error: msg, code: "internal" };
}
