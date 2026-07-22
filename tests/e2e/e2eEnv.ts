/**
 * E2E ortam sertleştirmesi — Neon egress closure (KIRMIZI ÇİZGİ).
 *
 * Playwright webServer'ına PRODUCTION `DATABASE_URL`'i veya HERHANGİ bir sağlayıcı
 * secret'ını (OpenRouter/Meta/Composio/SocialData/Fal/...) ASLA vermez. `DATABASE_URL`
 * yalnız EPHEMERAL (localhost / loopback / CI-service) olabilir; uzak/Neon/Supabase/
 * Vercel Postgres FAIL-CLOSED reddedilir. Guard'lar gerçek testlerle kanıtlanır
 * (`e2eEnv.test.ts`). Amaç: E2E koşusu production Neon'a TEK bir ağ isteği bile
 * yapamasın (egress + veri riski).
 */

type Env = Record<string, string | undefined>;

/** Sunucu child process'ine geçirilecek SİSTEM/toolchain anahtarları (açık allowlist).
 *  App secret'ları (DATABASE_URL / *_API_KEY / *_SECRET / *_TOKEN / provider) BİLİNÇLİ
 *  dışarıda — allowlist, yeni eklenen bir secret'ın sızmasını da engeller. */
const SYSTEM_ALLOW =
  /^(PATH|Path|SystemRoot|SystemDrive|windir|ComSpec|PATHEXT|TEMP|TMP|TMPDIR|USERPROFILE|USERNAME|USER|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES|ProgramFiles.*|ProgramW6432|PROGRAMDATA|ALLUSERSPROFILE|PUBLIC|NUMBER_OF_PROCESSORS|PROCESSOR_.*|OS|COMPUTERNAME|NVM_.*|NODE|npm_.*|CI|GITHUB_ACTIONS|RUNNER_.*|NEXT_TELEMETRY_DISABLED|LANG|LC_.*|SHELL|SHLVL|PWD)$/;

const EPHEMERAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** postgres URL'inden host'u çıkar; ayrıştırılamazsa null (güvenme). */
export function dbUrlHost(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;
  try {
    const u = new URL(s.replace(/^postgres(ql)?:/i, "http:"));
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Yalnız localhost/loopback/*.local (veya boş → dummy) EPHEMERAL sayılır.
 *  Neon/Supabase/Vercel/herhangi bir uzak host = false. */
export function isEphemeralDbUrl(raw: string | undefined | null): boolean {
  if (!raw || raw.trim() === "") return true; // boş → resolveE2eDatabaseUrl dummy localhost verir
  const host = dbUrlHost(raw);
  if (host === null) return false; // ayrıştırılamayan = fail-closed
  return EPHEMERAL_HOSTS.has(host) || host.endsWith(".local");
}

export function assertEphemeralDbUrl(raw: string | undefined | null): void {
  if (!isEphemeralDbUrl(raw)) {
    const host = dbUrlHost(raw ?? "") ?? "(ayrıştırılamadı)";
    throw new Error(
      `E2E FAIL-CLOSED: DATABASE_URL host '${host}' EPHEMERAL değil ` +
        `(localhost / 127.0.0.1 / ::1 / *.local bekleniyor). E2E production/remote ` +
        `(Neon/Supabase/Vercel) DB'ye ASLA bağlanamaz — Neon egress + veri riski. ` +
        `E2E_DATABASE_URL'i localhost'a ayarla veya boş bırak (dummy kullanılır).`,
    );
  }
}

/** Hermetik testlerde HİÇ bağlanılmayan yer-tutucu (tüm API page.route ile mock'lu).
 *  CI'nın gerçek-Postgres job'ı E2E_DATABASE_URL'i localhost service'e ayarlar. */
const DUMMY_LOCAL_DB = "postgresql://e2e:e2e@127.0.0.1:5432/cemos_e2e_hermetic";

/** E2E DATABASE_URL: yalnız `E2E_DATABASE_URL` (ephemeral doğrulanır), yoksa dummy
 *  localhost. `process.env.DATABASE_URL`'e (production Neon) ASLA düşmez. */
export function resolveE2eDatabaseUrl(env: Env = process.env): string {
  const explicit = env.E2E_DATABASE_URL;
  if (explicit && explicit.trim() !== "") {
    assertEphemeralDbUrl(explicit);
    return explicit;
  }
  return DUMMY_LOCAL_DB;
}

/** webServer ve global-setup ile PAYLAŞILAN session imza sırrı (dummy). */
export const E2E_SESSION_SECRET = "e2e-session-secret-not-a-real-key";

/**
 * `.env.local` içindeki üretim kimlik-bilgisi anahtarları (AGENTS enum'undan; `src/`
 * process.env kullanımıyla doğrulandı). `next dev` DEVELOPMENT modda koşar → `.env.local`
 * yüklenir; bunları process.env'de BOŞ-gölgeleyince (Next yük sırası: process.env İLK,
 * bulununca durur — Next 16 env docs) `.env.local` değerleri ASLA yüklenmez. Yeni bir
 * secret eklenirse buraya + `.env.example`'a eklenmeli. DATABASE_URL ayrı (dummy'e set).
 */
const SECRET_SHADOW_KEYS = [
  "OPENROUTER_API_KEY",
  "META_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_APP_ID",
  "META_PAGE_ID",
  "META_IG_USER_ID",
  "COMPOSIO_CONSUMER_API_KEY",
  "COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID",
  "COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE",
  "SOCIALDATA_API_KEY",
  "FAL_KEY",
  "GEMINI_API_KEY",
  "SUPADATA_API_KEY",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "GITHUB_TOKEN",
  "OBSIDIAN_GITHUB_TOKEN",
  "CRON_SECRET",
  "CREDENTIAL_ENC_KEY",
  "VERCEL_APP_CLIENT_SECRET",
  "XAGENT_SNAPSHOT_TOKEN",
  "YOUTUBE_API_KEY",
  "AUTH_ALLOWED_VERCEL_USERS",
];

/**
 * Playwright webServer child env'i — AÇIK sistem-allowlist + üretim secret'ları için
 * BOŞ-gölge. Production `DATABASE_URL` dummy ephemeral'e zorlanır; sağlayıcı secret'ları
 * (`.env.local`'den `next dev`'in yeniden yükleyeceği) process.env önceliğiyle "" olur →
 * E2E canlı sağlayıcıya çağrı yapamaz, Neon'a bağlanamaz. NODE_ENV set edilmez: `next dev`
 * kendi 'development'ını atar (gölgeler NODE_ENV'den bağımsız güvenli kılar).
 */
export function buildE2eServerEnv(env: Env = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && SYSTEM_ALLOW.test(k)) out[k] = v;
  }
  out.NEXT_TELEMETRY_DISABLED = "1";
  out.SESSION_SECRET = E2E_SESSION_SECRET; // proxy session doğrulaması (dummy)
  out.DATABASE_URL = resolveE2eDatabaseUrl(env); // ephemeral (guarded)
  for (const key of SECRET_SHADOW_KEYS) {
    out[key] = ""; // .env.local üretim değerini process.env önceliğiyle bastır
  }
  return out;
}

/** Guard test için: bir env objesinde GERÇEK (boş olmayan) sağlayıcı/DB secret değeri
 *  taşıyan anahtarlar. Boş-gölge ("") ve dummy SESSION_SECRET sızıntı SAYILMAZ. */
const SECRET_KEY_RE =
  /(_API_KEY$|_SECRET$|_TOKEN$|^META_|^COMPOSIO_|^SOCIALDATA_|^FAL_KEY$|^FAL_|^OPENROUTER_|^GEMINI_|^SUPADATA_|^YOUTUBE_API|^CRON_SECRET$|^CREDENTIAL_ENC_KEY$|^VERCEL_APP_|^NEXT_PUBLIC_VERCEL_|^AUTH_ALLOWED_|^XAGENT_SNAPSHOT_TOKEN$|^OBSIDIAN_GITHUB_TOKEN$)/i;
export function leakedSecretKeys(env: Record<string, string>): string[] {
  return Object.keys(env).filter((k) => SECRET_KEY_RE.test(k) && k !== "SESSION_SECRET" && env[k] !== "");
}
