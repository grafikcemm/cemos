import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { makePinnedFetch } from "./pinnedFetch";

// Proves the pin closes the DNS-rebind TOCTOU: makePinnedFetch dials the given
// IP regardless of the URL hostname, so no second DNS resolution happens at
// connect time — exactly the window a rebind attack exploits.
describe("makePinnedFetch — connection pinned to the verified IP", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  it("dials the pinned IP regardless of the URL hostname, preserving the Host header", async () => {
    let sawHost = "";
    let sawMethod = "";
    server = http.createServer((req, res) => {
      sawHost = req.headers.host ?? "";
      sawMethod = req.method ?? "";
      res.writeHead(200, { "x-ok": "1" });
      res.end("hello");
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;

    // "totally.invalid.example" does NOT resolve in real DNS — the request can
    // ONLY connect by using the pinned 127.0.0.1, proving connect uses the pin.
    const pinned = makePinnedFetch("127.0.0.1", 4);
    const res = await pinned(`http://totally.invalid.example:${port}/x`);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-ok")).toBe("1");
    expect(await res.text()).toBe("hello");
    // SNI/Host identity stays on the original hostname (only the IP is pinned).
    expect(sawHost).toContain("totally.invalid.example");
    expect(sawMethod).toBe("GET");
  });

  it("honors an AbortSignal (timeout path stays a real abort)", async () => {
    server = http.createServer(() => {
      /* never responds → the abort must fire */
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;

    const ctrl = new AbortController();
    const pinned = makePinnedFetch("127.0.0.1", 4);
    const p = pinned(`http://slow.invalid.example:${port}/`, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toThrowError();
  });
});
