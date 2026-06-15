const PREVIEW_LEN = 140;

function preview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LEN);
}

export class FetchJsonError extends Error {
  readonly status: number;
  readonly bodyPreview: string;

  constructor(message: string, status: number, bodyPreview: string) {
    super(message);
    this.name = "FetchJsonError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

/**
 * fetch + JSON parse with real error handling. Vercel timeouts (504) and crash
 * pages return PLAIN TEXT — calling res.json() on those throws the cryptic
 * `Unexpected token 'A', "An error o"... is not valid JSON`. This wrapper reads
 * the body once, surfaces the status + a short preview in Turkish instead, and
 * prefers the API's own `{ error }` message when the error body IS json.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();

  let data: unknown;
  let parsed = false;
  try {
    data = JSON.parse(text);
    parsed = true;
  } catch {
    // handled below — non-JSON bodies fall through to the error paths
  }

  if (!res.ok) {
    const apiError =
      parsed && data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "";
    throw new FetchJsonError(
      `Sunucu hatası (${res.status}): ${apiError || preview(text) || res.statusText}`,
      res.status,
      preview(text)
    );
  }

  if (!parsed) {
    throw new FetchJsonError(
      `Beklenmeyen sunucu yanıtı (JSON değil): ${preview(text)}`,
      res.status,
      preview(text)
    );
  }

  return data as T;
}
