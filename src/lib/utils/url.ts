/**
 * URL safety helpers for rendering app-data-derived links.
 *
 * Content can enter the app from untrusted ingestion paths (toolbox imports,
 * scraped tweets, library entries). A persisted `javascript:`/`data:` URL would
 * execute on click. React does not block these at runtime, so validate the
 * scheme before binding to an `href`.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Return `url` only if it parses and uses an allowed scheme; otherwise
 * `undefined` so the caller can render inert text instead of a live link.
 */
export function safeExternalHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (ALLOWED_PROTOCOLS.has(parsed.protocol)) return url;
  } catch {
    return undefined;
  }
  return undefined;
}
