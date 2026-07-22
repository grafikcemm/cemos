/**
 * CemOS Learn — sertleştirilmiş Obsidian GitHub vault köprüsü (4D). Vercel yerel diske
 * kalıcı yazamaz → pack hazır olunca markdown GitHub Contents API ile vault reposuna
 * commit'lenir; kullanıcı Obsidian Git eklentisiyle çeker.
 *
 * Sertleştirme:
 *  - Read-only preflight (repo erişimi + default branch) — yazmadan önce doğrular.
 *  - Unchanged-skip: mevcut dosya içeriği aynıysa PUT YOK (gereksiz commit üretmez).
 *  - Paylaşımlı kavram notu çok-pack birleştirilir (önceki kaynak korunur).
 *  - errorClass haritası: 401 auth · 403 forbidden/rate_limited · 404 not_found ·
 *    409 conflict · 422 unprocessable · network/timeout ayrı.
 *  - Kısmi başarı whole-success gibi RAPORLANMAZ (partial). Retry yalnız değişen/eksik dosyayı yazar.
 *  - Token ASLA loglanmaz; deterministik pack-kimlikli commit mesajı.
 *  - Env: OBSIDIAN_GITHUB_REPO="owner/repo", OBSIDIAN_GITHUB_DIR (ops), OBSIDIAN_GITHUB_TOKEN
 *    veya GITHUB_PERSONAL_ACCESS_TOKEN.
 */

import type { ObsidianBundle } from "./obsidian";
import {
  aggregate,
  notConfigured,
  type ChannelResult,
  type ExportFileResult,
} from "./obsidianExport";
import { contentHash, isManagedFile, mergeSharedConceptFile, packIdOf } from "./obsidianManifest";

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 20_000;

type GithubConfig = { owner: string; repo: string; dir: string; token: string };

export function getGithubConfig(): GithubConfig | null {
  const repoFull = (process.env.OBSIDIAN_GITHUB_REPO ?? "").trim();
  const token = (process.env.OBSIDIAN_GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "").trim();
  if (!repoFull || !token || !repoFull.includes("/")) return null;
  const [owner, repo] = repoFull.split("/", 2);
  if (!owner || !repo) return null;
  const dir = (process.env.OBSIDIAN_GITHUB_DIR ?? "CemOS Learn").trim().replace(/^\/+|\/+$/g, "");
  return { owner, repo, dir, token };
}

export function isGithubConfigured(): boolean {
  return getGithubConfig() !== null;
}

type GhResponse = { status: number; json: Record<string, unknown>; errorClass?: string };

/** Tek istek; token loglanmaz. Abort/timeout/network → status 0 + errorClass. */
async function githubRequest(
  cfg: GithubConfig,
  method: "GET" | "PUT",
  apiPath: string,
  body?: unknown
): Promise<GhResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GITHUB_API}${apiPath}`, {
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
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { status: 0, json: {}, errorClass: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP durum + gövde → errorClass. 403 + "rate limit" → rate_limited. */
function classify(res: GhResponse): string {
  if (res.errorClass) return res.errorClass;
  const s = res.status;
  const msg = typeof res.json.message === "string" ? res.json.message : "";
  if (s === 401) return "auth";
  if (s === 429) return "rate_limited";
  if (s === 403) return /rate limit/i.test(msg) ? "rate_limited" : "forbidden";
  if (s === 404) return "not_found";
  if (s === 409) return "conflict";
  if (s === 422) return "unprocessable";
  if (s >= 500) return "server_error";
  return `http_${s}`;
}

function b64decode(s: string): string {
  return Buffer.from(s.replace(/\n/g, ""), "base64").toString("utf8");
}
function b64encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/**
 * Bundle'ı GitHub vault reposuna yaz (tipli ChannelResult). Env yok → not_configured.
 * Preflight başarısız → failed(errorClass). Her dosya: GET (mevcut) → unchanged-skip
 * ya da (owned compare / shared merge) → PUT (sha ile update / yeni). Kısmi → partial.
 */
export async function writeGithubVault(bundle: ObsidianBundle): Promise<ChannelResult> {
  const cfg = getGithubConfig();
  if (!cfg) return notConfigured("github_vault", "OBSIDIAN_GITHUB_REPO / token ayarlı değil.");

  const targetLabel = `${cfg.owner}/${cfg.repo}/${cfg.dir}`.replace(/\/+$/, "");
  const fingerprint = contentHash(`${cfg.owner}/${cfg.repo}/${cfg.dir}`);

  // Read-only preflight: repo erişimi + default branch.
  const pre = await githubRequest(cfg, "GET", `/repos/${cfg.owner}/${cfg.repo}`);
  if (pre.status !== 200) {
    const errorClass = classify(pre);
    return {
      channel: "github_vault",
      state: "failed",
      written: 0,
      unchanged: 0,
      failed: 1,
      conflict: 0,
      manifestHash: bundle.manifestHash,
      targetLabel,
      targetFingerprint: fingerprint,
      errorClass,
      files: [],
      message: `Repo erişimi doğrulanamadı (${errorClass}).`,
    };
  }
  const branch = typeof pre.json.default_branch === "string" ? pre.json.default_branch : "main";
  const commitMsg = `learn(export): ${bundle.folderName} [${bundle.packId.slice(-6)}]`;

  const results: ExportFileResult[] = [];
  for (const f of bundle.files) {
    const clean = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (clean.includes("..")) {
      results.push({ path: f.path, outcome: "conflict", errorClass: "path_escape" });
      continue;
    }
    results.push(await putOne(cfg, branch, commitMsg, clean, f.content, f.scope, bundle.packId));
  }

  return aggregate("github_vault", results, bundle.manifestHash, targetLabel, fingerprint);
}

async function putOne(
  cfg: GithubConfig,
  branch: string,
  message: string,
  cleanPath: string,
  incoming: string,
  scope: "owned" | "shared",
  packId: string
): Promise<ExportFileResult> {
  const repoPath = cfg.dir ? `${cfg.dir}/${cleanPath}` : cleanPath;
  const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
  const apiPath = `/repos/${cfg.owner}/${cfg.repo}/contents/${encodedPath}`;

  // Mevcut dosya (içerik + sha).
  const existingRes = await githubRequest(cfg, "GET", `${apiPath}?ref=${encodeURIComponent(branch)}`);
  let sha: string | undefined;
  let existing: string | null = null;
  if (existingRes.status === 200) {
    if (typeof existingRes.json.sha === "string") sha = existingRes.json.sha;
    if (typeof existingRes.json.content === "string") existing = b64decode(existingRes.json.content);
  } else if (existingRes.status !== 404) {
    return { path: cleanPath, outcome: "failed", errorClass: classify(existingRes) };
  }

  // İçeriği belirle (owned compare / shared merge) + unchanged-skip.
  let toWrite: string;
  if (scope === "shared") {
    const merged = mergeSharedConceptFile(existing, incoming, packId);
    if (merged.kind === "conflict") return { path: cleanPath, outcome: "conflict", errorClass: merged.reason };
    if (merged.kind === "unchanged") return { path: cleanPath, outcome: "unchanged" };
    toWrite = merged.content;
  } else {
    if (existing !== null) {
      if (!isManagedFile(existing)) return { path: cleanPath, outcome: "conflict", errorClass: "unmanaged" };
      const owner = packIdOf(existing);
      if (owner !== null && owner !== packId) return { path: cleanPath, outcome: "conflict", errorClass: "other_pack" };
      if (existing === incoming) return { path: cleanPath, outcome: "unchanged" }; // gereksiz commit YOK
    }
    toWrite = incoming;
  }

  const put = await githubRequest(cfg, "PUT", apiPath, {
    message: `${message} — ${cleanPath}`,
    content: b64encode(toWrite),
    branch,
    ...(sha ? { sha } : {}),
  });
  if (put.status !== 200 && put.status !== 201) {
    return { path: cleanPath, outcome: "failed", errorClass: classify(put) };
  }
  return { path: cleanPath, outcome: "written" };
}
