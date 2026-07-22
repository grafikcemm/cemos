import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * App-level envelope encryption for secrets stored in the DB
 * (e.g. IntegrationCredential.value — Meta access tokens).
 *
 * Format: `v1:<iv b64>:<authTag b64>:<ciphertext b64>` (AES-256-GCM).
 * Key comes from CREDENTIAL_ENC_KEY (32 bytes, base64). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Backward compatibility: `decrypt` returns unprefixed input unchanged, so rows
 * written before encryption keep working and get encrypted on their next upsert.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENC_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENC_KEY not set — required to encrypt/decrypt integration credentials",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

/** Encrypt plaintext into the versioned envelope string. */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/** True if `stored` is a value produced by `encryptSecret`. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`);
}

/**
 * Decrypt an envelope string. Legacy plaintext (no `v1:` prefix) is returned
 * unchanged for transparent migration.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext passthrough
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted credential envelope");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
