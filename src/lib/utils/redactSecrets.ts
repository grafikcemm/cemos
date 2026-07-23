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
    // Connection strings (postgres/mysql/mongo/redis/amqp) — mask the whole authority+path
    // (also covers a password embedded in the userinfo, e.g. Neon's user:pass@host).
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqp):\/\/[^\s"'<>]+/gi, "$1://[REDACTED]")
    // Dash/underscore-prefixed provider keys (OpenAI sk-, GitHub ghp-, Slack xoxb-, fal-, …).
    .replace(/\b(sk|ak|ck|pk|rk|xoxb|ghp|gho|ghs|glpat|fal)[-_][A-Za-z0-9_-]{6,}/g, "[REDACTED_KEY]")
    // Google API keys — Gemini transcript + YouTube Data API authenticate with these, and
    // they ride in the request URL as ?key=, so a thrown fetch error can echo them.
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]")
    // Credentials carried as URL query params (?key= for Google, ?access_token= /
    // fb_exchange_token= for Meta Graph, generic token/apikey/secret/signature).
    .replace(
      /([?&](?:api_?key|access_?token|refresh_?token|client_secret|fb_exchange_token|apikey|token|key|auth|password|pwd|sig|signature)=)[^&\s"'<>]+/gi,
      "$1[REDACTED]",
    )
    // Bearer tokens in Authorization headers / logged text.
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]")
    // Meta (Facebook/Instagram) long-lived Graph tokens ride BARE (EAA…), not inside a
    // ?access_token= query, so the query rule above misses them (igClient / Graph errors).
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[REDACTED_KEY]")
    // Credentials embedded in NON-DB URL userinfo (https://user:pass@host) — only DB
    // schemes were masked above; a thrown fetch/redirect error can echo an http(s) one.
    .replace(/\b(https?|ftps?|wss?):\/\/[^/\s:@"'<>]+:[^/\s@"'<>]+@/gi, "$1://[REDACTED]@")
    // Local filesystem paths — an fs / Obsidian-export / ENOENT error echoes the OS
    // username; mask the user segment (the structural prefix is kept for triage).
    .replace(/([A-Za-z]:\\Users\\)[^\\/\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/(\/(?:home|Users)\/)[^/\s"'<>]+/g, "$1[REDACTED]")
    // BARE Prisma connection-error fragments (SEC-M1, live-proven 2026-07-23): P1000/
    // P1001/P1002 carry the DB authority WITHOUT scheme/userinfo — "Can't reach
    // database server at `host:5432`", "credentials for `user`" — so the scheme rule
    // above misses them. Mask any backticked value after "at "/"for ", plus a
    // generic backticked host:port as defense-in-depth for other driver messages.
    .replace(/(\b(?:at|for)\s+`)[^`]+(`)/gi, "$1[REDACTED_HOST]$2")
    .replace(/`[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}:\d{2,5}`/g, "`[REDACTED_HOST]`");
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
