import type { AdapterResult, PrepareInput, PublishAdapter } from "./contract";

/**
 * XApiPublishAdapter (ADR-025) — sözleşmeyi uygular fakat X API ödeme onayı
 * VERİLMEDİĞİ için kalıcı, typed blocked-external sonucu döner. Bu dosya
 * HİÇBİR koşulda ağ isteği atmaz, OAuth kurmaz, kredi/ödeme başlatmaz.
 * Gerçek entegrasyon: kullanıcı ödeme onayı + credential sağladığında bu
 * adaptörün gövdesi doldurulur; sözleşme ve state machine değişmez.
 */
const BLOCKED: Omit<AdapterResult & { ok: false }, "code"> & { code: "payment_approval_required" } = {
  ok: false,
  adapter: "x_api",
  code: "payment_approval_required",
  message:
    "CemOS içinden doğrudan yayın kapalı — X API pay-per-use ödeme onayı verilmedi. Şimdilik 'X'te aç' ile intent akışını kullan.",
  blockedExternal: true,
};

export const xApiPublishAdapter: PublishAdapter = {
  kind: "x_api",

  async prepare(_input: PrepareInput): Promise<AdapterResult> {
    return { ...BLOCKED };
  },

  async publish(): Promise<AdapterResult> {
    return { ...BLOCKED };
  },
};
