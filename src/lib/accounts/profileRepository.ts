import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  accountProfiles,
  FORMAT_TIERS,
  type AccountProfile as BootstrapAccountProfile,
  type FormatTierId,
} from "@/lib/accounts";

/**
 * Phase 2C (ADR-031) — hesap profili runtime source of truth = DB.
 *
 * Katmanlar:
 *  - `Account` + `StyleProfile` satırları OTORİTE (seed bunları TS bootstrap
 *    verisinden doldurur; sonrası DB'de yaşar).
 *  - `@/lib/accounts` içindeki `accountProfiles` artık BOOTSTRAP/fixture
 *    verisidir: seed kaynağı, test fixture'ı ve YALNIZ DB'ye ulaşılamadığında
 *    (bağlantı hatası) iki tohumlu hesap için kullanılabilirlik fallback'i.
 *    Bilinmeyen bir handle bootstrap üzerinden ASLA doğrulanmış sayılmaz.
 *  - Güvenlik/trust-boundary doğrulaması: `isKnownAccountHandleDb` /
 *    `assertKnownAccountHandleDb` — DB'ye sorar, fail-closed.
 *  - Üretim hazırlığı: `getRuntimeProfile(handle, { requireGenerationReady })`
 *    — `isActive` + `profileStatus === "active"` olmayan hesap üretime giremez.
 */

const FORMAT_TIER_IDS = Object.keys(FORMAT_TIERS) as [FormatTierId, ...FormatTierId[]];

export const AccountModeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  instruction: z.string().min(1),
  format: z.enum(FORMAT_TIER_IDS),
});

export const RuntimeAccountProfileSchema = z.object({
  handle: z.string().min(1),
  xHandle: z.string().min(1),
  displayName: z.string(),
  persona: z.string().min(1),
  concept: z.string().min(1),
  language: z.string().min(1),
  maxChars: z.number().int().positive(),
  defaultDraftCount: z.number().int().positive(),
  autonomy: z.string(),
  toneRules: z.array(z.string()),
  formatRules: z.array(z.string()),
  forbiddenRules: z.array(z.string()),
  formats: z.array(z.enum(FORMAT_TIER_IDS)).min(1),
  modes: z.array(AccountModeSchema).min(1),
  benchmarkInput: z.string(),
  platform: z.string(),
  profileStatus: z.string(),
  isActive: z.boolean(),
  profileVersion: z.number().int(),
  /** true → DB'ye ulaşılamadı, tohumlu bootstrap kopyası kullanılıyor (dürüst işaret). */
  degraded: z.boolean(),
});

export type RuntimeAccountProfile = z.infer<typeof RuntimeAccountProfileSchema>;

export type AccountProfileErrorCode =
  | "unknown_handle"
  | "inactive"
  | "profile_incomplete"
  | "profile_invalid"
  | "db_unavailable";

export class AccountProfileError extends Error {
  readonly code: AccountProfileErrorCode;
  constructor(code: AccountProfileErrorCode, message: string) {
    super(message);
    this.name = "AccountProfileError";
    this.code = code;
  }
}

type AccountRow = {
  handle: string;
  xHandle: string;
  persona: string;
  concept: string;
  maxChars: number;
  platform: string;
  displayName: string;
  language: string;
  autonomy: string;
  defaultDraftCount: number;
  formatsJson: string;
  benchmarkInput: string;
  profileStatus: string;
  isActive: boolean;
  profileVersion: number;
  styleProfile: {
    toneRules: string;
    formatRules: string;
    forbiddenRules: string;
    modes: string;
  } | null;
};

const ACCOUNT_SELECT = {
  handle: true,
  xHandle: true,
  persona: true,
  concept: true,
  maxChars: true,
  platform: true,
  displayName: true,
  language: true,
  autonomy: true,
  defaultDraftCount: true,
  formatsJson: true,
  benchmarkInput: true,
  profileStatus: true,
  isActive: true,
  profileVersion: true,
  styleProfile: {
    select: { toneRules: true, formatRules: true, forbiddenRules: true, modes: true },
  },
} as const;

function parseJsonField<T>(raw: string, schema: z.ZodType<T>, field: string, handle: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountProfileError(
      "profile_invalid",
      `@${handle} profili bozuk: ${field} geçerli JSON değil.`
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AccountProfileError(
      "profile_invalid",
      `@${handle} profili bozuk: ${field} şemaya uymuyor.`
    );
  }
  return result.data;
}

/** DB satırı → doğrulanmış runtime profili. Zod'suz JSON tüketimi YOK. */
export function rowToRuntimeProfile(row: AccountRow): RuntimeAccountProfile {
  if (!row.styleProfile) {
    throw new AccountProfileError(
      "profile_incomplete",
      `@${row.handle} profili eksik: StyleProfile satırı yok (kural listeleri tanımsız).`
    );
  }
  const stringList = z.array(z.string());
  const profile: RuntimeAccountProfile = {
    handle: row.handle,
    xHandle: row.xHandle,
    displayName: row.displayName || row.handle,
    persona: row.persona,
    concept: row.concept,
    language: row.language,
    maxChars: row.maxChars,
    defaultDraftCount: row.defaultDraftCount,
    autonomy: row.autonomy,
    toneRules: parseJsonField(row.styleProfile.toneRules, stringList, "toneRules", row.handle),
    formatRules: parseJsonField(row.styleProfile.formatRules, stringList, "formatRules", row.handle),
    forbiddenRules: parseJsonField(
      row.styleProfile.forbiddenRules,
      stringList,
      "forbiddenRules",
      row.handle
    ),
    formats: parseJsonField(
      row.formatsJson,
      z.array(z.enum(FORMAT_TIER_IDS)).min(1),
      "formatsJson",
      row.handle
    ),
    modes: parseJsonField(row.styleProfile.modes, z.array(AccountModeSchema).min(1), "modes", row.handle),
    benchmarkInput: row.benchmarkInput,
    platform: row.platform,
    profileStatus: row.profileStatus,
    isActive: row.isActive,
    profileVersion: row.profileVersion,
    degraded: false,
  };
  const checked = RuntimeAccountProfileSchema.safeParse(profile);
  if (!checked.success) {
    throw new AccountProfileError("profile_invalid", `@${row.handle} profili şemaya uymuyor.`);
  }
  return checked.data;
}

/** Tohumlu bootstrap profili → runtime şekli (yalnız DB-erişilemez fallback'i). */
export function bootstrapRuntimeProfile(bootstrap: BootstrapAccountProfile): RuntimeAccountProfile {
  return RuntimeAccountProfileSchema.parse({
    handle: bootstrap.handle,
    xHandle: bootstrap.xHandle,
    displayName: bootstrap.handle,
    persona: bootstrap.persona,
    concept: bootstrap.concept,
    language: bootstrap.language,
    maxChars: bootstrap.maxChars,
    defaultDraftCount: bootstrap.defaultDraftCount,
    autonomy: bootstrap.autonomy,
    toneRules: bootstrap.toneRules,
    formatRules: bootstrap.formatRules,
    forbiddenRules: bootstrap.forbiddenRules,
    formats: bootstrap.formats,
    modes: bootstrap.modes,
    benchmarkInput: bootstrap.benchmarkInput,
    platform: "x",
    profileStatus: "active",
    isActive: true,
    profileVersion: 0,
    degraded: true,
  });
}

// ── In-process cache (serverless-dostu: kısa TTL; otorite yine DB) ────────────
const CACHE_TTL_MS = 60_000;
type CacheState = { at: number; rows: AccountRow[] } | null;
let cache: CacheState = null;

export function invalidateAccountProfileCache(): void {
  cache = null;
}

function isConnectivityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /P1001|ECONNREFUSED|ETIMEDOUT|connection pool|Can't reach database/i.test(msg);
}

async function loadRows(): Promise<AccountRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = (await prisma.account.findMany({
    select: ACCOUNT_SELECT,
    orderBy: { handle: "asc" },
  })) as AccountRow[];
  cache = { at: Date.now(), rows };
  return rows;
}

export type AccountListEntry = {
  handle: string;
  displayName: string;
  profileStatus: string;
  isActive: boolean;
  platform: string;
  /** Profil JSON'ları Zod'dan geçti mi (geçmediyse üretime giremez). */
  profileValid: boolean;
  degraded: boolean;
};

/**
 * Tüm hesapların liste görünümü (UI/dropdown/cron seçimi için). DB'ye
 * ulaşılamazsa tohumlu bootstrap listesi `degraded: true` ile döner —
 * sessiz değil, işaretli fallback.
 */
export async function listAccountEntries(): Promise<AccountListEntry[]> {
  try {
    const rows = await loadRows();
    return rows.map((row) => {
      let profileValid = true;
      try {
        rowToRuntimeProfile(row);
      } catch {
        profileValid = false;
      }
      return {
        handle: row.handle,
        displayName: row.displayName || row.handle,
        profileStatus: row.profileStatus,
        isActive: row.isActive,
        platform: row.platform,
        profileValid,
        degraded: false,
      };
    });
  } catch (err) {
    if (!isConnectivityError(err)) throw err;
    return Object.values(accountProfiles).map((p) => ({
      handle: p.handle,
      displayName: p.handle,
      profileStatus: "active",
      isActive: true,
      platform: "x",
      profileValid: true,
      degraded: true,
    }));
  }
}

/**
 * Üretime girebilecek handle listesi: isActive + profileStatus === "active" +
 * profil Zod'dan geçiyor. Draft/incomplete/invalid hesap ASLA listelenmez.
 */
export async function listGenerationReadyHandles(): Promise<{ handles: string[]; degraded: boolean }> {
  const entries = await listAccountEntries();
  const degraded = entries.some((e) => e.degraded);
  return {
    handles: entries
      .filter((e) => e.isActive && e.profileStatus === "active" && e.profileValid)
      .map((e) => e.handle),
    degraded,
  };
}

/**
 * Trust-boundary doğrulaması (memory scope, feedback, API route'ları):
 * handle DB'de var VE aktif mi? DB'ye ulaşılamazsa FAIL-CLOSED: tohumlu iki
 * hesap için bootstrap kabul edilir (mevcut davranış korunur), bunun dışında
 * `db_unavailable` fırlatılır — bilinmeyen handle bağlantı hatasından yetki alamaz.
 */
export async function isKnownAccountHandleDb(handle: string): Promise<boolean> {
  if (typeof handle !== "string" || handle.trim() === "") return false;
  try {
    const rows = await loadRows();
    const row = rows.find((r) => r.handle === handle);
    return Boolean(row && row.isActive);
  } catch (err) {
    if (isConnectivityError(err) && handle in accountProfiles) return true;
    if (isConnectivityError(err)) {
      throw new AccountProfileError(
        "db_unavailable",
        "Hesap doğrulaması yapılamadı: veritabanına ulaşılamıyor."
      );
    }
    throw err;
  }
}

export async function assertKnownAccountHandleDb(handle: string): Promise<string> {
  const ok = await isKnownAccountHandleDb(handle);
  if (!ok) {
    throw new AccountProfileError("unknown_handle", `Bilinmeyen hesap handle'ı: ${handle}`);
  }
  return handle;
}

/**
 * Cron hesap seçimi (ADR-031): yalnız üretim-hazır hesaplar; tek-hesap
 * parametresi de aynı listeden doğrulanır (listede yoksa boş döner —
 * draft/inaktif hesap cron'a manuel parametreyle de sokulamaz).
 */
export async function resolveCronHandles(
  handleParam: string | null
): Promise<{ handles: string[]; degraded: boolean }> {
  const { handles, degraded } = await listGenerationReadyHandles();
  if (handleParam) {
    return { handles: handles.filter((h) => h === handleParam), degraded };
  }
  return { handles, degraded };
}

/**
 * Tek hesabın doğrulanmış runtime profili.
 *  - Bilinmeyen handle → `unknown_handle` (fail-closed).
 *  - `isActive === false` → `inactive`.
 *  - `requireGenerationReady` + `profileStatus !== "active"` → `profile_incomplete`
 *    (yeni hesap, profili tamamlanmadan üretime giremez; grafikcem'e düşme YOK).
 *  - Bozuk JSON → `profile_invalid`.
 *  - DB'ye ulaşılamazsa yalnız tohumlu hesaplar bootstrap kopyasıyla döner
 *    (`degraded: true`), diğer her şey `db_unavailable`.
 */
export async function getRuntimeProfile(
  handle: string,
  opts?: { requireGenerationReady?: boolean }
): Promise<RuntimeAccountProfile> {
  let rows: AccountRow[];
  try {
    rows = await loadRows();
  } catch (err) {
    if (isConnectivityError(err)) {
      const bootstrap = accountProfiles[handle as keyof typeof accountProfiles];
      if (bootstrap) return bootstrapRuntimeProfile(bootstrap);
      throw new AccountProfileError(
        "db_unavailable",
        "Hesap profili yüklenemedi: veritabanına ulaşılamıyor."
      );
    }
    throw err;
  }
  const row = rows.find((r) => r.handle === handle);
  if (!row) throw new AccountProfileError("unknown_handle", `Bilinmeyen hesap handle'ı: ${handle}`);
  if (!row.isActive) {
    throw new AccountProfileError("inactive", `@${handle} hesabı devre dışı.`);
  }
  if (opts?.requireGenerationReady && row.profileStatus !== "active") {
    throw new AccountProfileError(
      "profile_incomplete",
      `@${handle} profili henüz tamamlanmadı (durum: ${row.profileStatus}) — üretime giremez.`
    );
  }
  return rowToRuntimeProfile(row);
}
