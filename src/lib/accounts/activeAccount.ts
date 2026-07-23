/**
 * WP-04 / P0-2 — hesap bağlamı çözümlemesinin SAF çekirdeği (React'siz,
 * unit-testli). Hook (useActiveAccount) yalnız bunu store+useAccounts'a bağlar.
 *
 * FAIL-CLOSED kural: channel'ın DB karşılığı bulunamıyorsa (liste boş/yüklenmedi/
 * uyumsuz handle) accountId **null** döner — `accounts[0]` fallback'i YASAK;
 * tüketici accountId'siz account-scoped fetch başlatmaz (yanlış hesaba sessiz
 * düşüş = canlı P0-2'nin veri-sızıntı riski).
 */

export type AccountOption = { id: string; handle: string };

export type ActiveAccountResolution = {
  /** channel'ın DB id karşılığı; çözülemezse null (fail-closed). */
  accountId: string | null;
  /** Çözülen hesap satırı (id+handle) veya null. */
  account: AccountOption | null;
  /** true → channel listede yok AMA liste dolu (gerçek uyumsuzluk; UI uyarabilir). */
  channelUnknown: boolean;
};

export function resolveActiveAccount(
  accounts: readonly AccountOption[],
  channel: string,
): ActiveAccountResolution {
  const account = accounts.find((a) => a.handle === channel) ?? null;
  return {
    accountId: account?.id ?? null,
    account,
    channelUnknown: account === null && accounts.length > 0,
  };
}
