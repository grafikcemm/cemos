import { prisma } from "@/lib/db/client";
import { enrichRepo } from "@/lib/news/newsAi";

// Trending GitHub repos via the GitHub search API (NOT html scraping). Repos
// created in the last 7 days, AI-topic, sorted by stars. Optional GITHUB_TOKEN
// bearer raises the rate limit (60→5000/h). Each repo is translated + scored +
// given a tweet hook by newsAi, then upserted as a RepoRadarItem labelled
// "GitHub Trending".

type GithubRepo = {
  full_name: string;
  name: string;
  owner: { login: string } | null;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string | null;
};

type GithubSearchResponse = { items?: GithubRepo[] };

function sevenDaysAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildSearchUrl(topic: string): string {
  const q = encodeURIComponent(`topic:${topic} created:>${sevenDaysAgoIso()}`);
  return `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=15`;
}

async function fetchTrending(topic: string): Promise<GithubRepo[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GrafikCem-XAgent/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(buildSearchUrl(topic), {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const json = (await res.json()) as GithubSearchResponse;
  return json.items ?? [];
}

export interface RepoRadarSyncResult {
  processed: number;
  errors: number;
  fetched: number;
}

export async function syncRepoRadar(opts: {
  topics?: string[];
  maxRepos?: number;
  deadlineMs?: number;
}): Promise<RepoRadarSyncResult> {
  const topics = opts.topics ?? ["ai", "llm", "agents"];
  const maxRepos = opts.maxRepos ?? 8;
  const deadline = opts.deadlineMs ?? Date.now() + 60_000;
  const result: RepoRadarSyncResult = { processed: 0, errors: 0, fetched: 0 };

  let repos: GithubRepo[] = [];
  try {
    const lists = await Promise.all(
      topics.map((t) => fetchTrending(t).catch(() => [] as GithubRepo[]))
    );
    const seen = new Set<string>();
    repos = lists.flat().filter((r) => {
      if (!r.html_url || seen.has(r.html_url)) return false;
      seen.add(r.html_url);
      return true;
    });
    // Highest-star first across topics.
    repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
  } catch (err) {
    result.errors++;
    console.warn("[repoRadar] fetch başarısız:", err);
    return result;
  }

  result.fetched = repos.length;

  for (const repo of repos.slice(0, maxRepos)) {
    if (Date.now() > deadline - 8000) break;

    const owner = repo.owner?.login ?? repo.full_name.split("/")[0] ?? "";
    const topicsList = repo.topics ?? [];

    try {
      const existing = await prisma.repoRadarItem.findUnique({
        where: { repoUrl: repo.html_url },
        select: { id: true },
      });

      const enrichment = await enrichRepo({
        name: repo.name,
        owner,
        description: repo.description || "",
        language: repo.language,
        stars: repo.stargazers_count,
        topics: topicsList,
      });

      const data = {
        repoName: repo.name,
        owner,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: JSON.stringify(topicsList),
        descriptionTr: enrichment.descriptionTr,
        whyItMatters: enrichment.whyItMatters,
        bestFor: enrichment.bestFor,
        tweetHook: enrichment.tweetHook,
        xValueScore: enrichment.xValueScore,
        lastCommitAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
        status: "active",
        modelUsed: enrichment.modelUsed,
      };

      if (existing) {
        await prisma.repoRadarItem.update({ where: { id: existing.id }, data });
      } else {
        await prisma.repoRadarItem.create({ data: { ...data, repoUrl: repo.html_url } });
      }
      result.processed++;
    } catch (err) {
      result.errors++;
      console.warn(`[repoRadar] ${repo.full_name} işlenemedi:`, err);
    }
  }

  return result;
}
