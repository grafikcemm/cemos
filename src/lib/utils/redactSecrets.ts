/**
 * Shared credential redaction (SEC / DH-014). Single source of truth for masking
 * known secret patterns before a string reaches an API body, a log line, a
 * report, or memory. Normal short user messages don't match the patterns and are
 * returned unchanged.
 *
 * Used by `apiResponse.fail()` (the API choke-point) and `logger` (server/worker
 * logs) so both share the same masking rules.
 */
export function redactSecrets(msg: string): string {
  return String(msg ?? "")
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqp):\/\/[^\s"'<>]+/gi, "$1://[REDACTED]")
    .replace(/\b(sk|ak|ck|pk|rk|xoxb|ghp|gho|ghs|glpat|fal)[-_][A-Za-z0-9_-]{6,}/g, "[REDACTED_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]");
}

/**
 * Reduce an unknown error to a redacted, single-line message. Never returns the
 * full error object or stack — a logged Prisma/provider error can otherwise carry
 * a connection string or response body.
 */
export function redactError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return redactSecrets(raw);
}
