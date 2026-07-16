/**
 * Composio runtime bridge yapılandırması (ADR-032). SERVER-ONLY: consumer API
 * key yalnız server environment'tan okunur; NEXT_PUBLIC_* değişkeni YOKTUR ve
 * hiçbir değer client bundle'ına/log'a çıkmaz (yalnız env ADLARI raporlanır).
 *
 * CemOS runtime köprüsü Claude Code'un user-scope MCP config'inden TAMAMEN
 * bağımsızdır: aynı resmî MCP endpoint'ine kendi HTTP istemcisiyle bağlanır.
 */

/** Resmî Composio MCP endpoint'i — ADR-032 gereği transport DEĞİŞTİRİLMEZ. */
export const COMPOSIO_MCP_ENDPOINT = "https://connect.composio.dev/mcp";

/** Auth header adı (Composio consumer key sözleşmesi). */
export const COMPOSIO_AUTH_HEADER = "x-consumer-api-key";

export type ComposioConfig = {
  configured: boolean;
  /** Secret DEĞİL — yalnız varlık bilgisi raporlanır. */
  hasApiKey: boolean;
  connectedAccountId: string;
  accountHandle: string;
  toolkitVersion: string;
  provider: "auto" | "composio" | "meta";
};

/** Server-only okuma. Key değeri asla return payload'larına konmaz. */
export function readComposioApiKey(): string | null {
  const v = process.env.COMPOSIO_CONSUMER_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export function getComposioConfig(): ComposioConfig {
  const hasApiKey = readComposioApiKey() !== null;
  const connectedAccountId = process.env.COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID?.trim() ?? "";
  const accountHandle = process.env.COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE?.trim() ?? "";
  const rawProvider = process.env.INSTAGRAM_DATA_PROVIDER?.trim().toLowerCase() ?? "auto";
  const provider: ComposioConfig["provider"] =
    rawProvider === "composio" || rawProvider === "meta" ? rawProvider : "auto";
  return {
    // configured = köprünün çalışması için gereken üç parça da mevcut:
    // key + açık connected-account seçimi + CemOS hesap binding'i.
    configured: hasApiKey && connectedAccountId !== "" && accountHandle !== "",
    hasApiKey,
    connectedAccountId,
    accountHandle,
    toolkitVersion: process.env.COMPOSIO_INSTAGRAM_TOOLKIT_VERSION?.trim() ?? "",
    provider,
  };
}

/** Eksik parçaların env ADLARI (UI/rapor için) — değer asla dönmez. */
export function missingComposioEnvNames(): string[] {
  const cfg = getComposioConfig();
  const missing: string[] = [];
  if (!cfg.hasApiKey) missing.push("COMPOSIO_CONSUMER_API_KEY");
  if (!cfg.connectedAccountId) missing.push("COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID");
  if (!cfg.accountHandle) missing.push("COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE");
  return missing;
}
