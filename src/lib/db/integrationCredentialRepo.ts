import { prisma } from "@/lib/db/client";
import type { IntegrationCredential } from "@/generated/prisma/client";
import { encryptSecret, decryptSecret } from "@/lib/utils/secretCrypto";

/**
 * DB-tabanlı kimlik deposu. Meta token'ı burada tutmak, Vercel env'in runtime'da
 * değişmezliğini aşar — yenilenen token redeploy'suz devreye girer (igClient
 * DB → env sırasıyla okur).
 *
 * Güvenlik (SEC-03): `value` diskte AES-256-GCM ile şifrelenir (CREDENTIAL_ENC_KEY
 * ayarlıysa). Anahtar yoksa düz metin yazılır (test/local geri uyumluluğu).
 * Okuma her durumda `decryptSecret` üzerinden geçer — eski düz-metin satırlar
 * şeffaf çalışır, bir sonraki upsert'te şifrelenir.
 */
export type UpsertCredentialExtra = {
  expiresAt?: Date | null;
  meta?: Record<string, unknown>;
};

/** Şifreleme yalnız anahtar mevcutsa. Prod'da anahtar yoksa FAIL-CLOSED: düz metin
 *  secret yazmaktansa hata fırlat (SEC-03 / DH-010). Local/test'te (prod değil)
 *  geri uyumluluk için düz metin korunur. */
function encodeValue(value: string): string {
  if (process.env.CREDENTIAL_ENC_KEY) return encryptSecret(value);
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (isProd) {
    throw new Error(
      "CREDENTIAL_ENC_KEY tanımlı değil — credential düz metin olarak yazılamaz (SEC-03/DH-010). " +
        "Vercel production env'e 32-byte base64 bir anahtar ekleyin.",
    );
  }
  return value;
}

/** DB satırını, `value` çözülmüş şekilde döndürür (immutable kopya). */
function withDecryptedValue(
  row: IntegrationCredential | null
): IntegrationCredential | null {
  if (!row) return null;
  return { ...row, value: decryptSecret(row.value) };
}

export const integrationCredentialRepo = {
  async get(key: string): Promise<IntegrationCredential | null> {
    const row = await prisma.integrationCredential.findUnique({ where: { key } });
    return withDecryptedValue(row);
  },

  async upsert(
    key: string,
    value: string,
    extra?: UpsertCredentialExtra
  ): Promise<IntegrationCredential> {
    const data = {
      value: encodeValue(value),
      ...(extra?.expiresAt !== undefined ? { expiresAt: extra.expiresAt } : {}),
      ...(extra?.meta !== undefined ? { meta: JSON.stringify(extra.meta) } : {}),
    };
    const row = await prisma.integrationCredential.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    return withDecryptedValue(row) as IntegrationCredential;
  },
};
