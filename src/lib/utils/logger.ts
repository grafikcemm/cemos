import { redactSecrets, redactError } from "./redactSecrets";

/**
 * Minimal structured, redacted logger for server/worker code (Phase 5F §15).
 *
 * Replaces raw `console.*` in long-running/background code (e.g. the Tier-2
 * worker) so a logged error object cannot leak a connection string, provider
 * body, or key. Error args are reduced to a redacted single-line message — no
 * full object or stack dump. Structured `[scope]` prefix keeps lines greppable.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, message: string, err?: unknown): void {
  const line = `[${scope}] ${redactSecrets(message)}${
    err !== undefined ? ` — ${redactError(err)}` : ""
  }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (scope: string, message: string): void => emit("info", scope, message),
  warn: (scope: string, message: string, err?: unknown): void => emit("warn", scope, message, err),
  error: (scope: string, message: string, err?: unknown): void => emit("error", scope, message, err),
};
