import { getComposioConfig } from "@/lib/composio/config";
import { createComposioInstagramReadProvider } from "@/lib/instagram/providers/composioProvider";
import { metaGraphInstagramReadProvider } from "@/lib/instagram/providers/metaGraphProvider";
import type { InstagramReadProvider, ProviderHealth } from "@/lib/instagram/providers/types";

/**
 * Provider seçimi (ADR-032, INSTAGRAM_DATA_PROVIDER):
 *  - "composio": yalnız Composio. Sağlıksızsa Meta'ya SESSİZCE düşülmez —
 *    dürüst hata/degraded döner.
 *  - "meta": mevcut direct Meta Graph yolu.
 *  - "auto" (default): Composio configured + healthy → Composio; değilse Meta
 *    mümkünse fallback (fallbackReason ile İŞARETLİ — sessiz değil).
 */

export type ProviderSelection = {
  provider: InstagramReadProvider | null;
  providerId: "composio" | "meta" | "none";
  mode: "composio" | "meta" | "auto";
  fallbackUsed: boolean;
  fallbackReason?: string;
  composioHealth?: ProviderHealth;
  metaHealth?: ProviderHealth;
};

export async function selectInstagramReadProvider(deps?: {
  composio?: InstagramReadProvider;
  meta?: InstagramReadProvider;
}): Promise<ProviderSelection> {
  const cfg = getComposioConfig();
  const mode = cfg.provider;
  const composio = deps?.composio ?? createComposioInstagramReadProvider();
  const meta = deps?.meta ?? metaGraphInstagramReadProvider;

  if (mode === "meta") {
    const metaHealth = await meta.healthCheck();
    return {
      provider: metaHealth.healthy ? meta : null,
      providerId: metaHealth.healthy ? "meta" : "none",
      mode,
      fallbackUsed: false,
      metaHealth,
    };
  }

  const composioHealth = await composio.healthCheck();

  if (mode === "composio") {
    // Açık composio modu: Meta'ya sessiz düşüş YOK.
    return {
      provider: composioHealth.healthy ? composio : null,
      providerId: composioHealth.healthy ? "composio" : "none",
      mode,
      fallbackUsed: false,
      composioHealth,
    };
  }

  // auto
  if (composioHealth.healthy) {
    return {
      provider: composio,
      providerId: "composio",
      mode,
      fallbackUsed: false,
      composioHealth,
    };
  }
  const metaHealth = await meta.healthCheck();
  if (metaHealth.healthy) {
    return {
      provider: meta,
      providerId: "meta",
      mode,
      fallbackUsed: true,
      fallbackReason: `composio_${composioHealth.errorClass ?? composioHealth.connectionState}`,
      composioHealth,
      metaHealth,
    };
  }
  return {
    provider: null,
    providerId: "none",
    mode,
    fallbackUsed: false,
    fallbackReason: `composio_${composioHealth.errorClass ?? composioHealth.connectionState}+meta_${metaHealth.errorClass ?? metaHealth.connectionState}`,
    composioHealth,
    metaHealth,
  };
}
