/**
 * CemOS Learn — Obsidian GitHub vault köprüsü. Vercel yerel diske yazamaz;
 * bunun yerine pack hazır olunca markdown dosyaları GitHub Contents API ile
 * bir vault reposuna commit edilir. Kullanıcı tarafında Obsidian Git eklentisi
 * repoyu çeker → sıfır manuel indirme.
 *
 * Sözleşme obsidianWriter ile aynı: ASLA throw etmez (fail-open), env eksikse
 * no-op (null). Env: OBSIDIAN_GITHUB_REPO="owner/repo", OBSIDIAN_GITHUB_DIR
 * (opsiyonel alt dizin), OBSIDIAN_GITHUB_TOKEN veya GITHUB_PERSONAL_ACCESS_TOKEN.
 */

import { buildPackBundleForExport } from "./obsidianWriter";

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 20_000;

export type GithubExportResult = { written: number; repo: string; folder: string } | null;

type GithubConfig = { owner: string; repo: string; dir: string; token: string };

function getGithubConfig(): GithubConfig | null {
  const repoFull = (process.env.OBSIDIAN_GITHUB_REPO ?? "").trim();
  const token = (process.env.OBSIDIAN_GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "").trim();
  if (!repoFull || !token || !repoFull.includes("/")) return null;
  const [owner, repo] = repoFull.split("/", 2);
  if (!owner || !repo) return null;
  const dir = (process.env.OBSIDIAN_GITHUB_DIR ?? "CemOS Learn").trim().replace(/^\/+|\/+$/g, "");
  return { owner, repo, dir, token };
}

async function githubRequest(
  cfg: GithubConfig,
  method: "GET" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CemOS-Learn",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Tek dosyayı upsert eder (varsa sha ile günceller). Başarı → true. */
async function putFile(cfg: GithubConfig, repoPath: string, content: string, message: string): Promise<boolean> {
  const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
  const apiPath = `/repos/${cfg.owner}/${cfg.repo}/contents/${encodedPath}`;

  // Mevcut dosyanın sha'sı (güncelleme için zorunlu; 404 = yeni dosya).
  let sha: string | undefined;
  const existing = await githubRequest(cfg, "GET", apiPath);
  if (existing.status === 200 && typeof existing.json.sha === "string") {
    sha = existing.json.sha;
  }

  const put = await githubRequest(cfg, "PUT", apiPath, {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  });
  if (put.status !== 200 && put.status !== 201) {
    console.warn(`[learn] github vault PUT ${repoPath} → HTTP ${put.status}`);
    return false;
  }
  return true;
}

/**
 * Hazır (QA-geçmiş) pack'in Obsidian bundle'ını vault reposuna commit'ler.
 * Env yok / pack hazır değil → null. Kısmi başarıda yazılan sayıyı döner.
 */
export async function exportPackToGithub(packId: string): Promise<GithubExportResult> {
  try {
    const cfg = getGithubConfig();
    if (!cfg) return null;

    const bundle = await buildPackBundleForExport(packId);
    if (!bundle) return null;

    let written = 0;
    for (const f of bundle.files) {
      // Repo içi path: <dir>/<bundle path>; ters yol / mutlak yol dışlanır.
      const clean = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (clean.includes("..")) continue;
      const repoPath = cfg.dir ? `${cfg.dir}/${clean}` : clean;
      const ok = await putFile(cfg, repoPath, f.content, `learn: ${bundle.folderName}`);
      if (ok) written += 1;
    }
    if (written > 0) {
      console.log(`[learn] github vault: ${written} dosya → ${cfg.owner}/${cfg.repo}/${cfg.dir}`);
    }
    return { written, repo: `${cfg.owner}/${cfg.repo}`, folder: bundle.folderName };
  } catch (err) {
    console.warn(`[learn] github vault export failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
