"use client";

import { useCallback, useEffect, useState } from "react";

export type AccountOpt = { id: string; handle: string };

/**
 * Paylaşılan hesap seçici kaynağı — Plan yüzeyleri (Takvim/Fırsatlar/Seriler)
 * accountId'yi tek yerden `GET /api/settings` üzerinden alır. Ekran başına
 * kopya settings-fetch yerine ortak hook (design-quality: DRY).
 */
export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      const opts: AccountOpt[] = (json.accounts ?? []).map((a: { id: string; handle: string }) => ({
        id: a.id,
        handle: a.handle,
      }));
      setAccounts(opts);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { accounts, loading, failed, reload };
}
