/**
 * Small helpers for working with the `SourcePost.mediaUrls` column, which stores
 * a JSON-encoded string array of media URLs captured from a scanned tweet.
 */

/**
 * Parse a `SourcePost.mediaUrls` JSON string and return the first media URL, or
 * `null` when the column is empty, malformed, or contains no usable URL.
 *
 * Fail-soft: never throws on bad JSON — returns `null` instead.
 */
export function getFirstMediaUrl(mediaUrlsJson: string | null | undefined): string | null {
  if (!mediaUrlsJson || typeof mediaUrlsJson !== "string") return null;

  const trimmed = mediaUrlsJson.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;

    for (const entry of parsed) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        return entry.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}
