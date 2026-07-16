/**
 * Instagram read-tool allowlist'i (ADR-032). İKİ katmanlı güvenlik:
 *  1. EXPLICIT SLUG ALLOWLIST — yalnız burada listelenen tool'lar çağrılabilir.
 *  2. DENY PATTERN — allowlist'e yanlışlıkla yazılsa bile write/DM fiili içeren
 *     slug çağrısı reddedilir (isim değişse de savunma kalır).
 *
 * Slug kaynağı: Composio Instagram toolkit dokümantasyonu (sürüm 20260708_00,
 * erişim 2026-07-16). Canlı MCP discovery henüz doğrulanamadı (consumer key
 * yok — BLOCKED-EXTERNAL); bu yüzden çağrı yolu ek olarak runtime'da
 * `tools/list` discovery'siyle slug'ın gerçekten var olduğunu doğrular ve
 * eşleşmeyen sözleşmede fail-closed durur.
 *
 * DM/messaging tool'ları (LIST_ALL_CONVERSATIONS/GET_CONVERSATION/
 * LIST_ALL_MESSAGES) READ olsalar bile bilinçli olarak allowlist DIŞIDIR —
 * Phase 2C direktifi DM verisini yasaklar.
 */

export const INSTAGRAM_READ_TOOL_ALLOWLIST = [
  "INSTAGRAM_GET_USER_INFO",
  "INSTAGRAM_GET_USER_INSIGHTS",
  "INSTAGRAM_GET_IG_USER_MEDIA",
  "INSTAGRAM_GET_IG_MEDIA",
  "INSTAGRAM_GET_IG_MEDIA_CHILDREN",
  "INSTAGRAM_GET_IG_MEDIA_INSIGHTS",
  "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
] as const;

export type InstagramReadTool = (typeof INSTAGRAM_READ_TOOL_ALLOWLIST)[number];

/**
 * Write/tehlikeli fiil kalıpları — slug'da geçen HERHANGİ biri çağrıyı keser.
 * (MESSAGE/CONVERSATION read tool'ları da DM yasağı gereği burada.)
 */
const DENY_VERB_PATTERN =
  /(CREATE|POST|PUBLISH|SEND|DELETE|REPLY|UPDATE|MARK_SEEN|COMMENT_CREATE|MESSAGE|CONVERSATION|MEDIA_PUBLISH|UPLOAD|EDIT|REVOKE|DISCONNECT)/i;

export type ToolPolicyDecision =
  | { allowed: true; slug: InstagramReadTool }
  | { allowed: false; reason: "not_in_allowlist" | "denied_verb" };

export function evaluateToolPolicy(slug: string): ToolPolicyDecision {
  if (DENY_VERB_PATTERN.test(slug)) return { allowed: false, reason: "denied_verb" };
  if (!(INSTAGRAM_READ_TOOL_ALLOWLIST as readonly string[]).includes(slug)) {
    return { allowed: false, reason: "not_in_allowlist" };
  }
  return { allowed: true, slug: slug as InstagramReadTool };
}
