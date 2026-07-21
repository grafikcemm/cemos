/**
 * Pinned-IP fetch — closes the SSRF DNS-rebind TOCTOU (Faz Pre-Launch).
 *
 * `assertSafePin` resolves + validates a hostname's IPs ONCE. This helper then
 * dials THAT verified IP directly via a custom `lookup`, so the OS never does a
 * second DNS resolution at connect time (the window a rebind exploits). SNI,
 * the Host header, and certificate identity all stay on the original hostname,
 * so TLS validation is unchanged — only the destination IP is pinned.
 *
 * Runs on the Node.js runtime (the callers import Prisma, forcing Node), where
 * node:http/https are available. Bodies are hard-capped; the callers further
 * bound their reads (verifyWebsite.boundedText).
 */
import http from "node:http";
import https from "node:https";

/** Hard cap so a hostile server cannot stream unbounded data into memory. */
const MAX_BODY_BYTES = 512_000;

export function makePinnedFetch(pinIp: string, pinFamily: 4 | 6): typeof fetch {
  // net.LookupFunction — always hand back the pre-verified IP, ignoring hostname.
  // Node 20's Happy-Eyeballs (autoSelectFamily) calls lookup with { all:true }
  // and expects the array form; a plain connect wants the (address, family) form.
  const pinnedLookup = ((
    _hostname: string,
    options: { all?: boolean } | undefined,
    cb: (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    if (options?.all) cb(null, [{ address: pinIp, family: pinFamily }]);
    else cb(null, pinIp, pinFamily);
  }) as never;

  return (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;

    const headers: Record<string, string> = { host: url.host };
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }

    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      const options: https.RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: (init.method ?? "GET").toUpperCase(),
        headers,
        // SNI + cert identity stay on the hostname; only the socket dials pinIp.
        servername: isHttps ? url.hostname : undefined,
        lookup: pinnedLookup,
        signal: (init.signal as AbortSignal | undefined) ?? undefined,
      };

      const req = mod.request(options, (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let capped = false;
        res.on("data", (c: Buffer) => {
          if (capped) return;
          if (total + c.byteLength > MAX_BODY_BYTES) {
            chunks.push(c.subarray(0, MAX_BODY_BYTES - total));
            total = MAX_BODY_BYTES;
            capped = true;
            res.destroy();
            return;
          }
          chunks.push(c);
          total += c.byteLength;
        });
        const finish = () => {
          if (settled) return;
          settled = true;
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((vv) => h.append(k, vv));
            else if (v != null) h.set(k, String(v));
          }
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0, headers: h }));
        };
        res.on("end", finish);
        res.on("close", finish); // fires after an intentional destroy() past the cap
        res.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        // Preserve AbortError (callers map it to a typed timeout); wrap other
        // connection errors as TypeError to match global-fetch semantics
        // (verifyWebsite maps TypeError → "unreachable").
        if (err?.name === "AbortError") reject(err);
        else reject(new TypeError(String(err?.message ?? err)));
      });

      if (init.body != null) req.write(init.body as string);
      req.end();
    });
  }) as typeof fetch;
}
