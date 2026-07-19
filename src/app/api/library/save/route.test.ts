import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/library/save — auth/CSRF guard, Zod validation, source resolution +
 * idempotent save, typed error → HTTP mapping. Real SaveSourceSchema (partial
 * mock) so invalid `source.kind` is rejected before any DB work.
 */

vi.mock("@/lib/boards/saveFromSource", async (orig) => {
  const actual = await orig<typeof import("@/lib/boards/saveFromSource")>();
  return { ...actual, resolveSourceToContentItem: vi.fn() };
});
vi.mock("@/lib/boards/saveToBoard", () => ({ saveContentToBoard: vi.fn() }));

import { POST } from "./route";
import { resolveSourceToContentItem } from "@/lib/boards/saveFromSource";
import { saveContentToBoard } from "@/lib/boards/saveToBoard";

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/library/save", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const sameOrigin = { "sec-fetch-site": "same-origin" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveSourceToContentItem).mockResolvedValue({
    ok: true,
    contentItem: { id: "ci-1", platform: "news", format: "news_article", title: "T", canonicalUrl: "https://n/1" } as never,
  });
  vi.mocked(saveContentToBoard).mockResolvedValue({
    ok: true,
    created: true,
    alreadySaved: false,
    board: { id: "b-1", name: "Kaydedilenler", accountId: null } as never,
    boardItem: { id: "bi-1" } as never,
    contentItem: { id: "ci-1", platform: "news", format: "news_article", title: "T", canonicalUrl: "https://n/1" } as never,
  });
});

describe("POST /api/library/save", () => {
  it("cross-site/plain request → 403, resolve/save çağrılmaz", async () => {
    const res = await POST(postReq({ source: { kind: "news", id: "n1" } }));
    expect(res.status).toBe(403);
    expect(resolveSourceToContentItem).not.toHaveBeenCalled();
    expect(saveContentToBoard).not.toHaveBeenCalled();
  });

  it("same-origin ama geçersiz source.kind → 400 (Zod), DB'ye gidilmez", async () => {
    const res = await POST(postReq({ source: { kind: "nonsense", id: "x" } }, sameOrigin));
    expect(res.status).toBe(400);
    expect(resolveSourceToContentItem).not.toHaveBeenCalled();
  });

  it("bozuk JSON → 400 (500 değil)", async () => {
    const req = new NextRequest("http://localhost:3000/api/library/save", {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOrigin },
      body: "{bozuk",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("geçerli istek → resolve + save, 201 created", async () => {
    const res = await POST(postReq({ source: { kind: "news", id: "n1" }, boardId: "b-1" }, sameOrigin));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.created).toBe(true);
    expect(json.board.id).toBe("b-1");
    expect(json.contentItem.id).toBe("ci-1");
    expect(saveContentToBoard).toHaveBeenCalledWith(
      expect.objectContaining({ contentItemId: "ci-1", boardId: "b-1", savedFrom: "save:news" }),
    );
  });

  it("kaynak bulunamadı → 404 typed", async () => {
    vi.mocked(resolveSourceToContentItem).mockResolvedValue({ ok: false, code: "source_not_found", message: "yok" });
    const res = await POST(postReq({ source: { kind: "news", id: "n1" } }, sameOrigin));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("source_not_found");
    expect(saveContentToBoard).not.toHaveBeenCalled();
  });

  it("scope mismatch → 403 typed", async () => {
    vi.mocked(saveContentToBoard).mockResolvedValue({ ok: false, code: "board_scope_mismatch", message: "değil" });
    const res = await POST(postReq({ source: { kind: "news", id: "n1" }, boardId: "b-x" }, sameOrigin));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("board_scope_mismatch");
  });

  it("zaten kayıtlı → 200 alreadySaved", async () => {
    vi.mocked(saveContentToBoard).mockResolvedValue({
      ok: true,
      created: false,
      alreadySaved: true,
      board: { id: "b-1", name: "Kaydedilenler", accountId: null } as never,
      boardItem: { id: "bi-1" } as never,
      contentItem: { id: "ci-1", platform: "news", format: "news_article", title: "T", canonicalUrl: null } as never,
    });
    const res = await POST(postReq({ source: { kind: "contentItem", contentItemId: "ci-1" } }, sameOrigin));
    expect(res.status).toBe(200);
    expect((await res.json()).alreadySaved).toBe(true);
  });
});
