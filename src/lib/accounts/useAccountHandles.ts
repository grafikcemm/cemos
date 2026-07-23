"use client";

import { useAccounts } from "@/components/plan/useAccounts";
import { DEFAULT_CHANNELS } from "@/store/xagent";
import { deriveAccountHandles } from "./deriveAccountHandles";

/**
 * Batch-C sözleşmesi: per-account aksiyon/gruplama listeleri DB listesinden
 * türetilir; yüklenene dek DEFAULT_CHANNELS bootstrap'ı görünümü ayakta tutar
 * (mutation'lar zaten item/handle-scoped — yanlış hesaba yazım riski yok).
 */
export function useAccountHandles(): string[] {
  const { accounts } = useAccounts();
  return deriveAccountHandles(accounts, DEFAULT_CHANNELS);
}
