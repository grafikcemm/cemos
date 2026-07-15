import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

/**
 * Entegrasyon yapılandırma durumu (05 §G2). Yalnız env NAME + VAR/YOK
 * (Boolean) döner — secret VALUE ASLA istemciye/loga/DOM'a çıkmaz. Canlı derin
 * probe /api/health'te (Sistem); burada hafif "yapılandırıldı mı" kontrolü
 * (timeout yok → panel asla "bilinmiyor"a düşmez). X API doğrudan yayın kalıcı
 * ENGELLİ (ödeme onayı yok).
 */

type Group = "core" | "social" | "optional";
type Status = "connected" | "missing" | "blocked" | "optional";
type Provider = { key: string; name: string; group: Group; status: Status; envNames: string[]; note?: string };

function has(...names: string[]): boolean {
  return names.some((n) => Boolean(process.env[n] && String(process.env[n]).trim().length > 0));
}

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const providers: Provider[] = [
    {
      key: "openrouter",
      name: "OpenRouter",
      group: "core",
      status: has("OPENROUTER_API_KEY") ? "connected" : "missing",
      envNames: ["OPENROUTER_API_KEY"],
      note: "Tüm LLM üretimi. 402 = kredi tükendi (üretim durur, okuma sürer).",
    },
    {
      key: "socialdata",
      name: "SocialData",
      group: "core",
      status: has("SOCIALDATA_API_KEY") ? "connected" : "missing",
      envNames: ["SOCIALDATA_API_KEY"],
      note: "X/Twitter verisi (resmî X API değil).",
    },
    {
      key: "neon",
      name: "Neon (PostgreSQL)",
      group: "core",
      status: has("DATABASE_URL") ? "connected" : "missing",
      envNames: ["DATABASE_URL"],
    },
    {
      key: "credenc",
      name: "Kimlik şifreleme",
      group: "core",
      status: has("CREDENTIAL_ENC_KEY") ? "connected" : "missing",
      envNames: ["CREDENTIAL_ENC_KEY"],
      note: "Saklanan token'lar için AES-GCM anahtarı.",
    },
    {
      key: "meta",
      name: "Meta / Instagram",
      group: "social",
      status: has("META_ACCESS_TOKEN") ? "connected" : "missing",
      envNames: ["META_ACCESS_TOKEN", "META_IG_USER_ID"],
      note: "IG rakip radarı + outlier. instagram_basic + business_discovery izni gerekir.",
    },
    {
      key: "xapi",
      name: "X API — doğrudan yayın",
      group: "social",
      status: "blocked",
      envNames: [],
      note: "CemOS içinden doğrudan yayın için ödeme onayı gerekiyor. Şu an intent-only (X'te aç).",
    },
    {
      key: "youtube",
      name: "YouTube",
      group: "social",
      status: has("YOUTUBE_API_KEY") ? "connected" : "missing",
      envNames: ["YOUTUBE_API_KEY"],
      note: "Fırsat motoru + brief üretimi.",
    },
    {
      key: "obsidian",
      name: "Obsidian / GitHub",
      group: "optional",
      status: has("OBSIDIAN_GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "OBSIDIAN_VAULT_PATH") ? "connected" : "optional",
      envNames: ["OBSIDIAN_GITHUB_REPO", "OBSIDIAN_GITHUB_TOKEN"],
      note: "Öğrenme paketi export. Yoksa export açık blocked-external (sessiz no-op değil).",
    },
    {
      key: "gemini",
      name: "Gemini",
      group: "optional",
      status: has("GEMINI_API_KEY") ? "connected" : "optional",
      envNames: ["GEMINI_API_KEY"],
      note: "Öğrenme transcript fallback.",
    },
    {
      key: "supadata",
      name: "Supadata",
      group: "optional",
      status: has("SUPADATA_API_KEY") ? "connected" : "optional",
      envNames: ["SUPADATA_API_KEY"],
      note: "Öğrenme transcript sağlayıcı.",
    },
    {
      key: "fal",
      name: "Fal (görsel)",
      group: "optional",
      status: has("FAL_KEY") ? "connected" : "optional",
      envNames: ["FAL_KEY"],
      note: "Görsel üretimi.",
    },
  ];

  return ok({ providers });
}
