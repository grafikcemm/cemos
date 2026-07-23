"use client";

import { useCallback, useMemo } from "react";
import { useXAgentStore } from "@/store/xagent";
import { useAccounts } from "@/components/plan/useAccounts";
import { resolveActiveAccount } from "./activeAccount";

/**
 * WP-04 / P0-2 (canlı repro 2026-07-23) — hesap bağlamının TEK otoritesi.
 *
 * Kusur: sidebar switcher'ı Zustand `activeChannel`'ı değiştirirken ekranlar
 * (ör. Profil → CemOS'un bildikleri) KENDİ `useState("grafikcem")` seçicilerini
 * tutuyordu → sidebar @maskulenkod iken hafıza @grafikcem'de kaldı; yanlış
 * hesabın hafızası/verisi kullanılabilirdi.
 *
 * Sözleşme (saf çekirdek + testler: ./activeAccount.ts):
 *  - `channel` HER ZAMAN global `activeChannel`'dır (persist'li, red-line store).
 *  - Ekran-içi hesap dropdown'ları KALDIRILMAZSA two-way bağlanır:
 *    value={channel}, onChange=setChannel → global switcher ile tek gerçek.
 *  - `accountId` çözülemezse null — FAIL-CLOSED: tüketici accountId'siz
 *    account-scoped fetch BAŞLATMAZ; `accounts[0]` fallback'i YASAK.
 */
export function useActiveAccount() {
  const channel = useXAgentStore((s) => s.activeChannel);
  const setActiveChannel = useXAgentStore((s) => s.setActiveChannel);
  const { accounts, loading, failed, reload } = useAccounts();

  const resolution = useMemo(() => resolveActiveAccount(accounts, channel), [accounts, channel]);

  const setChannel = useCallback(
    (handle: string) => {
      // Store tipi Channel union'ı; dropdown değerleri accounts listesinden
      // geldiği için runtime'da geçerli handle'dır.
      setActiveChannel(handle as Parameters<typeof setActiveChannel>[0]);
    },
    [setActiveChannel],
  );

  return {
    /** Global aktif hesap handle'ı — sidebar ile HER ZAMAN aynı. */
    channel,
    /** Two-way bind için setter (ekran dropdown'ı → global switcher). */
    setChannel,
    /** DB id; çözülemezse null (fail-closed — fetch başlatma). */
    accountId: resolution.accountId,
    /** true → liste dolu ama channel listede yok (gerçek uyumsuzluk). */
    channelUnknown: resolution.channelUnknown,
    accounts,
    accountsLoading: loading,
    accountsFailed: failed,
    reloadAccounts: reload,
  };
}
