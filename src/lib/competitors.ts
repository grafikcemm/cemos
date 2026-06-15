import rawCompetitors from "@/data/competitors.json";
import type { AccountHandle } from "@/lib/accounts";

export type CompetitorAccount = {
  handle: string;
  name: string;
  category: string;
  why: string;
  language: "TR" | "EN" | string;
  avg_engagement: "orta" | "yüksek" | "yÃ¼ksek" | string;
};

export type CompetitorGroup = {
  description: string;
  source_note: string;
  accounts: CompetitorAccount[];
};

export const competitorGroups = rawCompetitors as Record<AccountHandle, CompetitorGroup>;

export function getCompetitorGroup(account: AccountHandle) {
  return competitorGroups[account];
}

export function getHighSignalCompetitors(account: AccountHandle, limit = 8) {
  const group = getCompetitorGroup(account);
  return group.accounts
    .filter((item) => item.avg_engagement.includes("yüksek") || item.avg_engagement.includes("yÃ¼ksek"))
    .slice(0, limit);
}

export function getCompetitorPromptContext(account: AccountHandle) {
  const group = getCompetitorGroup(account);
  const topAccounts = getHighSignalCompetitors(account, 10);

  return {
    nicheDescription: group.description,
    competitorCount: group.accounts.length,
    topAccounts: topAccounts.map((item) => ({
      handle: item.handle,
      name: item.name,
      category: item.category,
      language: item.language,
      why: item.why,
    })),
  };
}

export function getCompetitorStats(account: AccountHandle) {
  const group = getCompetitorGroup(account);
  const languages = group.accounts.reduce<Record<string, number>>((acc, item) => {
    acc[item.language] = (acc[item.language] ?? 0) + 1;
    return acc;
  }, {});

  const highSignal = getHighSignalCompetitors(account, group.accounts.length).length;

  return {
    total: group.accounts.length,
    highSignal,
    languages,
    description: group.description,
  };
}
