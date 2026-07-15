/**
 * Erişim parolası hash üretici (ADR-013/017).
 *
 *   npx tsx scripts/hash-access-password.ts "guclu-parolan"
 *
 * Çıktı ACCESS_PASSWORD_HASH ortam değişkenine yazılır (Vercel + .env.local).
 * Düz parola HİÇBİR yere kaydedilmez. SESSION_SECRET'i ayrıca üretin:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { hashPassword } from "../src/lib/auth/session";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("Kullanım: tsx scripts/hash-access-password.ts <parola (≥8 karakter)>");
  process.exit(1);
}

// Yalnız hash yazdırılır; düz parola loglanmaz.
process.stdout.write(hashPassword(password) + "\n");
