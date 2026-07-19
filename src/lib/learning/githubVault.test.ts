import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeGithubVault } from "./githubVault";
import type { ObsidianBundle, ObsidianFile } from "./obsidian";
import { MANAGED_FLAG } from "./obsidianManifest";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

const ownedContent = (packId: string, body: string) => `---\n${MANAGED_FLAG}\ncemos_pack_id: ${packId}\n---\n${body}`;

function mkBundle(files: ObsidianFile[], packId = "pack_gh11111"): ObsidianBundle {
  return {
    folderName: "F",
    packId,
    manifestHash: "h1",
    files,
    meta: { pipelineVersion: "v2", promptVersion: "v2", sourceBasis: "transcript", sourceKind: "youtube", qaVerdict: "pass", qaCoverage: 0.8, fileCount: files.length },
  };
}

const owned = (path: string, body: string, packId = "pack_gh11111"): ObsidianFile => ({
  path,
  content: ownedContent(packId, body),
  scope: "owned",
  packId,
});

type MockRes = { status: number; json: () => Promise<Record<string, unknown>> };
function res(status: number, json: Record<string, unknown> = {}): MockRes {
  return { status, json: async () => json };
}

beforeEach(() => {
  process.env.OBSIDIAN_GITHUB_REPO = "owner/vault";
  process.env.OBSIDIAN_GITHUB_TOKEN = "ghp_SECRET_TOKEN_VALUE";
  process.env.OBSIDIAN_GITHUB_DIR = "CemOS Learn";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OBSIDIAN_GITHUB_REPO;
  delete process.env.OBSIDIAN_GITHUB_TOKEN;
  delete process.env.OBSIDIAN_GITHUB_DIR;
});

describe("writeGithubVault — unchanged-skip", () => {
  it("mevcut içerik aynıysa PUT YOK (gereksiz commit üretmez)", async () => {
    const body = ownedContent("pack_gh11111", "# A");
    const calls: { method: string; path: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      const p = url.replace("https://api.github.com", "");
      calls.push({ method, path: p });
      if (p === "/repos/owner/vault") return res(200, { default_branch: "main" });
      if (method === "GET" && p.includes("/contents/")) return res(200, { sha: "abc", content: b64(body) });
      return res(200, {});
    }));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    expect(r.state).toBe("already_current");
    expect(r.unchanged).toBe(1);
    expect(calls.some((c) => c.method === "PUT")).toBe(false); // hiç PUT yok
  });
});

describe("writeGithubVault — yeni dosya + partial", () => {
  it("404 → yeni dosya PUT → written", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
      const p = url.replace("https://api.github.com", "");
      const method = init?.method ?? "GET";
      if (p === "/repos/owner/vault") return res(200, { default_branch: "main" });
      if (method === "GET") return res(404, {});
      return res(201, {});
    }));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    expect(r.state).toBe("succeeded");
    expect(r.written).toBe(1);
  });

  it("bir dosya PUT 422 → partial", async () => {
    let putCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
      const p = url.replace("https://api.github.com", "");
      const method = init?.method ?? "GET";
      if (p === "/repos/owner/vault") return res(200, { default_branch: "main" });
      if (method === "GET") return res(404, {});
      putCount += 1;
      return putCount === 1 ? res(201, {}) : res(422, { message: "Invalid" });
    }));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A"), owned("B.md", "# B")]));
    expect(r.state).toBe("partial");
    expect(r.written).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.files.find((f) => f.outcome === "failed")?.errorClass).toBe("unprocessable");
  });
});

describe("writeGithubVault — errorClass + secret güvenliği", () => {
  it("preflight 401 → failed(auth)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(401, { message: "Bad credentials" })));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    expect(r.state).toBe("failed");
    expect(r.errorClass).toBe("auth");
  });

  it("403 rate limit → failed(rate_limited)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(403, { message: "API rate limit exceeded" })));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    expect(r.errorClass).toBe("rate_limited");
  });

  it("sonuçta token/secret SIZMAZ", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
      const p = url.replace("https://api.github.com", "");
      if (p === "/repos/owner/vault") return res(200, { default_branch: "main" });
      return (init?.method ?? "GET") === "GET" ? res(404, {}) : res(201, {});
    }));
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    const dump = JSON.stringify(r);
    expect(dump).not.toContain("ghp_SECRET_TOKEN_VALUE");
    expect(r.targetLabel).toBe("owner/vault/CemOS Learn");
  });

  it("env yok → not_configured (app hatası değil)", async () => {
    delete process.env.OBSIDIAN_GITHUB_REPO;
    const r = await writeGithubVault(mkBundle([owned("A.md", "# A")]));
    expect(r.state).toBe("not_configured");
  });
});
