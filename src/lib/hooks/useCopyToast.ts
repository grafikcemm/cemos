"use client";

import { useCallback } from "react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { useToast } from "@/components/ui/Toast";

/**
 * Panoya kopyala + toast — eskiden 8 tab'da tekrarlayan handleCopy mantığını birleştirir.
 * `const copy = useCopyToast(); copy(text)` veya `copy(text, "Prompt kopyalandı")`.
 */
export function useCopyToast(): (text: string, okMsg?: string) => Promise<void> {
  const toast = useToast();
  return useCallback(
    async (text: string, okMsg = "Panoya kopyalandı") => {
      const ok = await copyToClipboard(text);
      if (ok) toast.success(okMsg);
      else toast.error("Kopyalama başarısız.");
    },
    [toast],
  );
}
