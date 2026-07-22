const PREVIEW_LEN = 140;

// A hanging serverless function (or a paused Neon cold-start) never sends a
// response, so an un-timed fetch pends forever and the caller's loading flag
// never clears. This ceiling turns that silent hang into a surfaced error.
const DEFAULT_TIMEOUT_MS = 15_000;

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

export type FetchJsonInit = RequestInit & {
  /** Abort (and reject) if no response arrives in this many ms. 0 disables. Default 15000. */
  timeoutMs?: number;
};

/**
 * fetch + JSON parse with real error handling. Vercel timeouts (504) and crash
 * pages return PLAIN TEXT — calling res.json() on those throws the cryptic
 * `Unexpected token 'A', "An error o"... is not valid JSON`. This wrapper reads
 * the body once, surfaces the status + a short preview in Turkish instead, and
 * prefers the API's own `{ error }` message when the error body IS json.
 *
 * A timeout (default 15s) guarantees the promise always settles: a hang rejects
 * with a distinct FetchJsonError instead of pending forever, so UIs can clear
 * their loading flag and show an error/retry state.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: FetchJsonInit
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = init ?? {};

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  let text: string;
  let res: Response;
  try {
    res = await fetch(input, { ...rest, signal: controller.signal });
    text = await res.text();
  } catch (err) {
    if (timedOut) {
      throw new FetchJsonError(`Sunucu zaman aşımına uğradı (${Math.round(timeoutMs / 1000)}s)`, 0, "");
    }
    if (controller.signal.aborted) {
      throw new FetchJsonError("İstek iptal edildi", 0, "");
    }
    // Genuine network-level rejections propagate untouched (unchanged contract).
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
  }

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
