/**
 * DB URL güvenlik sınıflandırması (ADR-035 — 2026-07-17 migrate-diff olayı sonrası).
 *
 * Olay: production Neon URL'i `prisma migrate diff --shadow-database-url`'e
 * geçirildi ve production sıfırlandı (komut shadow hedefini RESET eder; read-only
 * DEĞİLDİR). Bu modül tekrarını kod seviyesinde reddeder:
 *
 *   - Shadow/scratch hedefi YALNIZ yerel/ephemeral URL olabilir.
 *   - `db push` benzeri şema-dayatan komutlar production-benzeri URL'e karşı
 *     çalıştırılamaz (tek yol: elle yazılmış additive SQL + `migrate deploy`,
 *     bkz. scripts/safe-migrate-deploy.ts + docs/cemos-rebuild/DB-SAFETY.md).
 *
 * Saf/deterministik: ağ yok, env okuma yok, log yok. Hata mesajları ve
 * fingerprint çıktısı ASLA credential/query/parola içermez.
 */

export type DatabaseUrlClass = "local_ephemeral" | "production_like" | "invalid";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Host + port'u credential'sız/query'siz döndürür (log-güvenli fingerprint).
 * Parse edilemeyen URL için "invalid-url" döner — asla ham girdiyi geri basmaz.
 */
export function sanitizeDbHostFingerprint(rawUrl: string): string {
  const parsed = tryParse(rawUrl);
  if (!parsed) return "invalid-url";
  if (parsed.protocol === "file:") return "file:local";
  const host = parsed.hostname || "unknown-host";
  return parsed.port ? `${host}:${parsed.port}` : host;
}

function tryParse(rawUrl: string): URL | null {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") return null;
  try {
    // "prisma+postgres://" gibi bileşik şemaları URL sınıfı zaten kabul eder.
    return new URL(rawUrl.trim());
  } catch {
    return null;
  }
}

/**
 * URL'i sınıflandırır. Bilinmeyen/uzak her host "production_like" sayılır
 * (fail-closed): yalnız açıkça yerel host'lar ephemeral kabul edilir.
 */
export function classifyDatabaseUrl(rawUrl: string): DatabaseUrlClass {
  const parsed = tryParse(rawUrl);
  if (!parsed) return "invalid";
  if (parsed.protocol === "file:") return "local_ephemeral";
  const host = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "local_ephemeral";
  }
  return "production_like";
}

export class DbSafetyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DbSafetyError";
    this.code = code;
  }
}

/**
 * Shadow/scratch DB hedefi guard'ı. Production-benzeri URL veya ana DB ile aynı
 * host → throw. Mesajlar yalnız sanitize fingerprint taşır.
 */
export function assertSafeShadowUrl(shadowUrl: string, mainDatabaseUrl?: string): void {
  const cls = classifyDatabaseUrl(shadowUrl);
  if (cls === "invalid") {
    throw new DbSafetyError("shadow_url_invalid", "Shadow URL parse edilemedi.");
  }
  if (cls === "production_like") {
    throw new DbSafetyError(
      "shadow_url_production_like",
      `Shadow hedefi production-benzeri (${sanitizeDbHostFingerprint(shadowUrl)}). ` +
        "Shadow/scratch DB YALNIZ yerel/ephemeral olabilir — shadow hedefi RESET edilir."
    );
  }
  if (mainDatabaseUrl) {
    const shadowFp = sanitizeDbHostFingerprint(shadowUrl);
    const mainFp = sanitizeDbHostFingerprint(mainDatabaseUrl);
    if (shadowFp !== "invalid-url" && shadowFp === mainFp) {
      throw new DbSafetyError(
        "shadow_url_equals_main",
        `Shadow hedefi ana DATABASE_URL host'u ile aynı (${shadowFp}).`
      );
    }
  }
}

/**
 * Şema-dayatan komut (db push / reset benzeri) hedef guard'ı: production-benzeri
 * URL'e karşı throw. Production şema değişikliği tek yoldan geçer:
 * elle SQL + `prisma migrate deploy` (DB-SAFETY.md prosedürü).
 */
export function assertSafeDbPushTarget(databaseUrl: string): void {
  const cls = classifyDatabaseUrl(databaseUrl);
  if (cls === "invalid") {
    throw new DbSafetyError("db_url_invalid", "DATABASE_URL parse edilemedi.");
  }
  if (cls === "production_like") {
    throw new DbSafetyError(
      "db_push_production_blocked",
      `DATABASE_URL production-benzeri (${sanitizeDbHostFingerprint(databaseUrl)}). ` +
        "`db push` bu hedefe yasak — prosedür: docs/cemos-rebuild/DB-SAFETY.md " +
        "(elle additive SQL + `npm run db:migrate`)."
    );
  }
}

/** Migration SQL'inde destructive kalıp taraması (statik, satır-bazlı). */
const DESTRUCTIVE_SQL_PATTERNS: ReadonlyArray<{ code: string; re: RegExp }> = [
  { code: "drop_table", re: /\bDROP\s+TABLE\b/i },
  { code: "drop_column", re: /\bDROP\s+COLUMN\b/i },
  { code: "truncate", re: /\bTRUNCATE\b/i },
  { code: "drop_schema", re: /\bDROP\s+SCHEMA\b/i },
  { code: "drop_database", re: /\bDROP\s+DATABASE\b/i },
  { code: "alter_type_narrowing", re: /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i },
  { code: "delete_all", re: /\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/i },
];

export type DestructiveSqlFinding = { code: string; line: number; snippet: string };

/**
 * Elle yazılmış migration SQL'ini veri-kaybı kalıplarına karşı tarar.
 * Yorum satırları (`--`) atlanır. Boş dizi = additive görünüm (statik kanıt;
 * insan incelemesinin yerine geçmez).
 */
export function scanMigrationSqlForDestructiveOps(sql: string): DestructiveSqlFinding[] {
  const findings: DestructiveSqlFinding[] = [];
  const lines = sql.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const effective = line.replace(/--.*$/, "");
    if (effective.trim() === "") continue;
    for (const { code, re } of DESTRUCTIVE_SQL_PATTERNS) {
      if (re.test(effective)) {
        findings.push({ code, line: i + 1, snippet: effective.trim().slice(0, 120) });
      }
    }
  }
  return findings;
}
