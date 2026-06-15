import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { getHighSignalCompetitors } from "@/lib/competitors";
import type { SourcePost } from "@/lib/agent/types";

const accountSourceIdeas: Record<AccountHandle, string[]> = {
  grafikcem: [
    "Yeni bir AI aracinin tasarim ekiplerinde uretim hizini artirdigi duyuruldu.",
    "Bir model guncellemesi gorsel uretimde kontrol ve tutarlilik tarafini iyilestirdi.",
    "Yaratici ekipler icin AI workflow otomasyonu tekrar gundeme geldi.",
    "AI urunleri artik tekil demo degil, tasarim surecinin altyapisi gibi konumlanmaya basladi.",
  ],
  maskulenkod: [
    "Modern iliskilerde erkeklerin secilmeyi beklemesi ve kendi yonunu kaybetmesi tartisiliyor.",
    "Disiplin, para ve sorumluluk temalari etrafinda kisa ama sert fikirler yukseliyor.",
    "Erkeklerin kendi hayatini insa etmeden iliskiye tutunmasi yeniden gundem oldu.",
    "Kisisel gelisim dili yumusarken sert ve dogrudan cizgi daha fazla reaksiyon aliyor.",
  ],
};

function scoreFromSeed(seed: string, min: number, max: number) {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + (total % (max - min + 1));
}

export function createSourcePosts(account: AccountHandle | "all" = "all", perAccount = 5): SourcePost[] {
  const handles = account === "all" ? (Object.keys(accountProfiles) as AccountHandle[]) : [account];

  return handles.flatMap((handle) => {
    const competitors = getHighSignalCompetitors(handle, perAccount);
    const ideas = accountSourceIdeas[handle];

    return competitors.map((competitor, index) => {
      const seed = `${handle}-${competitor.handle}-${index}`;
      const sourceText = ideas[index % ideas.length];
      const riskScore = scoreFromSeed(seed, 8, 32);
      const opportunityScore = scoreFromSeed(seed, 72, 96);

      return {
        id: `${handle}-${competitor.handle}-${index}`,
        account: handle,
        sourceHandle: competitor.handle,
        sourceName: competitor.name,
        sourceCategory: competitor.category,
        sourceLanguage: competitor.language,
        sourceText,
        publishedAgo: `${scoreFromSeed(seed, 1, 9)}s once`,
        suggestedAction: handle === "maskulenkod" ? "tweet" : opportunityScore > 86 ? "tweet" : "reply",
        opportunityScore,
        relevanceScore: scoreFromSeed(seed, 76, 98),
        freshnessScore: scoreFromSeed(seed, 68, 95),
        controversyScore: scoreFromSeed(seed, 45, 92),
        riskScore,
        status: "new",
      };
    });
  });
}
