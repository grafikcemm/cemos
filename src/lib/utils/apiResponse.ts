import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Shared API response + request-parsing helpers.
 *
 * Envelope contract: every JSON API response is `{ success: boolean, ... }`.
 * Success carries domain fields (e.g. `{ success: true, items }`); failure
 * carries `{ success: false, error }` plus optional `code`/`detail`.
 *
 * Intentional non-envelope endpoints (documented exceptions): `GET /api/health`
 * returns a raw health object for uptime probes and is NOT normalized here.
 */

type JsonValue = Record<string, unknown>;

/**
 * Kaza sonucu secret sızıntısına karşı tek choke-point (SEC / DH-014). `fail()`'e
 * ham `err.message` geçen ~119 route bir Prisma bağlantı hatası (DATABASE_URL) ya
 * da bir sağlayıcı gövdesi (OpenRouter vb.) döndürebilir. Bilinen credential
 * kalıpları HER mesajda maskelenir; 5xx gövdeleri ayrıca sınırlanır. Normal kısa
 * kullanıcı mesajları desen eşleşmediğinden DEĞİŞMEZ. (Session gate zaten dış
 * saldırganı engeller — bu operatör/log yüzeyi için derinlik savunması.)
 */
function redactSecrets(msg: string): string {
  return String(msg ?? "")
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqp):\/\/[^\s"'<>]+/gi, "$1://[REDACTED]")
    .replace(/\b(sk|ak|ck|pk|rk|xoxb|ghp|gho|ghs|glpat|fal)[-_][A-Za-z0-9_-]{6,}/g, "[REDACTED_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]");
}

/** Build a `{ success: true, ...payload }` response. */
export function ok(payload: JsonValue = {}, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, ...payload }, init);
}

/** Build a `{ success: false, error, ...extra }` response with a status code. */
export function fail(
  error: string,
  status: number,
  extra?: JsonValue,
): NextResponse {
  const safe = redactSecrets(error);
  // 5xx: ham/sınırsız sağlayıcı/DB gövdesini sınırla (info-leak + verbosity).
  const bounded = status >= 500 && safe.length > 300 ? `${safe.slice(0, 300)}…` : safe;
  return NextResponse.json({ success: false, error: bounded, ...extra }, { status });
}

export type ParsedBody<T = unknown> =
  | { ok: true; data: T }
  | { ok: false };

/**
 * Safely parse a JSON request body.
 * - Empty/whitespace body → `{ ok: true, data: {} }` (optional-body routes keep
 *   working; Zod still rejects missing required fields downstream).
 * - Genuinely malformed JSON → `{ ok: false }` so the caller returns 400 instead
 *   of leaking a 500 with the raw parser message.
 */
export async function parseJsonBody<T = unknown>(
  req: NextRequest,
): Promise<ParsedBody<T>> {
  const text = await req.text().catch(() => "");
  if (text.trim() === "") return { ok: true, data: {} as T };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}
