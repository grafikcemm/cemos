/**
 * Batch-C sözleşmesi — per-account aksiyon/gruplama listelerinin (Toolbox üret
 * butonları, Haber Havuzu, Sabah özet sayaçları/kuyruğu) SAF çekirdeği.
 * `useAccountHandles` hook'u yalnız bunu `useAccounts` + `DEFAULT_CHANNELS`'a
 * bağlar (React'siz, unit-testli — bkz. ./activeAccount.ts idiomu).
 *
 * DB listesi doluyken DB sırası (API: createdAt asc) döner; boşken (yüklenmedi
 * / DB down) bootstrap fallback döner — tüketici hiçbir durumda boş liste
 * render etmez.
 */
export function deriveAccountHandles(
  accounts: readonly { handle: string }[],
  fallback: readonly string[],
): string[] {
  return accounts.length > 0 ? accounts.map((a) => a.handle) : [...fallback];
}
