// Shared Toolbox types + cell helpers — used by ToolboxTab and ToolboxToolCard.

export type Tool = {
  id: string;
  title: string;
  url: string;
  resourceType: string;
  category: string;
  platform: string | null;
  useCase: string | null;
  description: string;
  whyUseful: string | null;
  tags: string[];
  xValueScore: number;
  sourceReliability: string;
  contentFormat: string | null;
  linkStatus: string | null;
  lastCheckedAt: string | null;
  isFavorite: boolean;
};

export const reliabilityColor = (r: string) =>
  r === "high" ? "var(--green)" : r === "medium" ? "var(--yellow)" : "var(--danger)";

export const linkColor = (s: string | null) =>
  s === "alive" ? "var(--green)" : s === "dead" ? "var(--danger)" : "var(--text-muted)";
