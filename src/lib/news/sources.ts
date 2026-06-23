// Static default RSS sources, ported from grafikcem-news-ai db-adapter
// (DEFAULT_STATIC_SOURCES), retargeted to the AI/design/tools niche only.
// Dropped sports feeds. These seed the NewsSource table on first sync.

export type DefaultSource = {
  name: string;
  url: string;
  feedUrl: string;
  sourceType: "rss";
  category: string;
  priority: number;
  reliability: "high" | "medium" | "low";
  fetchIntervalMin: number;
};

export const DEFAULT_SOURCES: DefaultSource[] = [
  { name: "The Verge AI", feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", url: "https://www.theverge.com", sourceType: "rss", category: "tech_news", priority: 95, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Ars Technica", feedUrl: "https://feeds.arstechnica.com/arstechnica/technology", url: "https://arstechnica.com", sourceType: "rss", category: "tech_news", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "TechCrunch AI", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", url: "https://techcrunch.com", sourceType: "rss", category: "tech_news", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "VentureBeat AI", feedUrl: "https://venturebeat.com/category/ai/feed/", url: "https://venturebeat.com", sourceType: "rss", category: "tech_news", priority: 80, reliability: "medium", fetchIntervalMin: 1440 },
  { name: "MIT Technology Review AI", feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", url: "https://www.technologyreview.com", sourceType: "rss", category: "tech_news", priority: 95, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Google AI Blog", feedUrl: "https://blog.google/technology/ai/rss/", url: "https://blog.google", sourceType: "rss", category: "tech_news", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "OpenAI Blog", feedUrl: "https://openai.com/blog/rss.xml", url: "https://openai.com", sourceType: "rss", category: "tech_news", priority: 95, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Anthropic News", feedUrl: "https://www.anthropic.com/news.rss", url: "https://www.anthropic.com", sourceType: "rss", category: "tech_news", priority: 95, reliability: "high", fetchIntervalMin: 1440 },
  { name: "DeepMind Blog", feedUrl: "https://deepmind.google/blog/rss.xml", url: "https://deepmind.google", sourceType: "rss", category: "tech_news", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "NVIDIA Blog", feedUrl: "https://blogs.nvidia.com/feed/", url: "https://blogs.nvidia.com", sourceType: "rss", category: "tech_news", priority: 80, reliability: "medium", fetchIntervalMin: 1440 },
  { name: "Figma Blog", feedUrl: "https://www.figma.com/blog/feed.xml", url: "https://www.figma.com", sourceType: "rss", category: "creative_design", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Framer Blog", feedUrl: "https://www.framer.com/blog/feed.xml", url: "https://www.framer.com", sourceType: "rss", category: "creative_design", priority: 80, reliability: "medium", fetchIntervalMin: 1440 },
  { name: "Smashing Magazine", feedUrl: "https://www.smashingmagazine.com/feed/", url: "https://www.smashingmagazine.com", sourceType: "rss", category: "creative_design", priority: 85, reliability: "high", fetchIntervalMin: 1440 },
  { name: "UX Collective", feedUrl: "https://uxdesign.cc/feed", url: "https://uxdesign.cc", sourceType: "rss", category: "creative_design", priority: 85, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Nielsen Norman Group", feedUrl: "https://www.nngroup.com/articles/feed/rss/", url: "https://www.nngroup.com", sourceType: "rss", category: "creative_design", priority: 90, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Indie Hackers", feedUrl: "https://www.indiehackers.com/feed.xml", url: "https://www.indiehackers.com", sourceType: "rss", category: "product_tools", priority: 75, reliability: "medium", fetchIntervalMin: 1440 },
  // En sağlam AI kaynakları genişletmesi — "en güncel ve çok konuşulan" hedefi.
  { name: "Wired AI", feedUrl: "https://www.wired.com/feed/tag/ai/latest/rss", url: "https://www.wired.com", sourceType: "rss", category: "tech_news", priority: 88, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Engadget", feedUrl: "https://www.engadget.com/rss.xml", url: "https://www.engadget.com", sourceType: "rss", category: "tech_news", priority: 78, reliability: "medium", fetchIntervalMin: 1440 },
  { name: "Hugging Face Blog", feedUrl: "https://huggingface.co/blog/feed.xml", url: "https://huggingface.co", sourceType: "rss", category: "tech_news", priority: 88, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Simon Willison", feedUrl: "https://simonwillison.net/atom/everything/", url: "https://simonwillison.net", sourceType: "rss", category: "tech_news", priority: 82, reliability: "high", fetchIntervalMin: 1440 },
  { name: "Latent Space", feedUrl: "https://www.latent.space/feed", url: "https://www.latent.space", sourceType: "rss", category: "tech_news", priority: 80, reliability: "medium", fetchIntervalMin: 1440 },
];
