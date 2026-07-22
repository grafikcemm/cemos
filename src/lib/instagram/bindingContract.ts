import { prisma } from "@/lib/db/client";

/**
 * Single-IG binding sözleşmesi (Phase 3A §B — ADR-035).
 *
 * IgMedia/IgComment/IgInsightSnapshot GLOBAL tablolardır (accountId yok).
 * Sessiz cross-account attribution YASAK; bu modül global veriyi hangi hesabın
 * sahiplenebileceğini fail-closed çözer:
 *
 *   - TAM 1 hesaba bağlı Instagram binding → açık single-IG contract (o hesap
 *     global IG verisinin sahibi sayılır).
 *   - 0 binding → "config_required" (gözlem/DNA akışı bloklanır; tahmin yok).
 *   - Birden fazla FARKLI hesaba binding → "multi_binding_blocked" — çözüm
 *     Phase 3 sonrası multi-account migration'ıdır (IgMedia'ya accountId);
 *     bu oturumda spekülatif şema değişikliği yapılmaz.
 *   - Aynı hesabın birden çok provider satırı (composio+meta) tek hesap sayılır;
 *     tercih composio > meta, sonra en yeni lastVerifiedAt.
 *
 * Deterministik, yazma YOK. Hata mesajları secret içermez.
 */

export type InstagramBindingStatus =
  | "ok"
  | "config_required"
  | "multi_binding_blocked"
  | "account_unresolved";

export type ResolvedInstagramBinding = {
  status: InstagramBindingStatus;
  /** status==="ok" iken dolu. */
  account?: { id: string; handle: string };
  binding?: {
    provider: string;
    externalHandle: string;
    connectionStatus: string;
    lastVerifiedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
  };
  /** multi_binding_blocked iken kaç FARKLI hesap bağlı. */
  distinctAccountCount?: number;
  /** Operatöre gösterilecek Türkçe açıklama (secret'sız). */
  reason: string;
};

const PROVIDER_PREFERENCE = ["composio", "meta"];

export async function resolveSingleInstagramBinding(): Promise<ResolvedInstagramBinding> {
  const bindings = await prisma.accountPlatformBinding.findMany({
    where: { platform: "instagram" },
    select: {
      accountId: true,
      provider: true,
      externalHandle: true,
      connectionStatus: true,
      lastVerifiedAt: true,
      lastSuccessfulSyncAt: true,
    },
  });

  if (bindings.length === 0) {
    return {
      status: "config_required",
      reason:
        "Bağlı Instagram hesabı yok. Entegrasyonlar'dan Composio bağlantısını tamamla " +
        "(COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID + COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE) " +
        "ve bir sync çalıştır.",
    };
  }

  const distinctAccounts = [...new Set(bindings.map((b) => b.accountId))];
  if (distinctAccounts.length > 1) {
    return {
      status: "multi_binding_blocked",
      distinctAccountCount: distinctAccounts.length,
      reason:
        `${distinctAccounts.length} farklı hesaba Instagram binding'i var; global IG verisi ` +
        "tek hesaba güvenle atfedilemez (fail-closed). Çözüm: Phase 3 multi-account migration'ı.",
    };
  }

  const preferred = [...bindings].sort((a, b) => {
    const pa = PROVIDER_PREFERENCE.indexOf(a.provider);
    const pb = PROVIDER_PREFERENCE.indexOf(b.provider);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return (b.lastVerifiedAt?.getTime() ?? 0) - (a.lastVerifiedAt?.getTime() ?? 0);
  })[0];

  const account = await prisma.account.findUnique({
    where: { id: preferred.accountId },
    select: { id: true, handle: true, isActive: true },
  });
  if (!account || !account.isActive) {
    return {
      status: "account_unresolved",
      reason:
        "Binding bir CemOS hesabına işaret ediyor ama hesap bulunamadı veya pasif — " +
        "gözlem fail-closed durdu.",
    };
  }

  return {
    status: "ok",
    account: { id: account.id, handle: account.handle },
    binding: {
      provider: preferred.provider,
      externalHandle: preferred.externalHandle,
      connectionStatus: preferred.connectionStatus,
      lastVerifiedAt: preferred.lastVerifiedAt,
      lastSuccessfulSyncAt: preferred.lastSuccessfulSyncAt,
    },
    reason: "Tek Instagram binding'i çözüldü.",
  };
}
