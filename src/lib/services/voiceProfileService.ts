/**
 * Ses profili damıtma (xpatla stil klonlama). Hesabın kendi yayınlanmış
 * tweetlerini (PublishLog) örnekleyip cheapWriter ile bir ses profiline
 * (kişilik/ton/kelime dağarcığı/ritim/kaçınılacaklar) damıtır ve versiyonlu
 * olarak upsert eder. grounding.ts aktif profili "SES PROFİLİ" bloğu olarak
 * yazım prompt'una enjekte eder.
 *
 * Fail-open: yeterli örnek yok / LLM hata → no-op sonuç (cron'u bozmaz).
 */

import { prisma } from "@/lib/db/client";
import { generateJson } from "@/lib/ai/openrouter";
import { getBudgetStatus } from "@/lib/config/costGate";
import { accountRepo } from "@/lib/db/accountRepo";

const MIN_SAMPLES = 8; // altında anlamlı stil çıkmaz
const MAX_SAMPLES = 40;

type DistilledVoice = {
  personality: string;
  toneTags: string[];
  vocabulary: string[];
  rhythm: string;
  avoid: string[];
};

type SyncResult =
  | { ok: true; accountHandle: string; version: number; samples: number }
  | { ok: false; accountHandle: string; reason: string };

function buildSystemPrompt(): string {
  return [
    "Sen bir yazım-sesi analistisin. Sana bir kişinin gerçek tweetleri veriliyor.",
    "Görev: bu tweetlerden yazarın ÖZGÜN sesini çıkar — genel/klişe değil, bu kişiye özgü.",
    "Yalnızca şu JSON şemasını döndür (Türkçe değerler):",
    '{"personality": string, "toneTags": string[], "vocabulary": string[], "rhythm": string, "avoid": string[]}',
    "- personality: 1-2 cümle kişilik/ton özeti.",
    "- toneTags: 3-6 ton etiketi (ör. iğneleyici, samimi, teknik).",
    "- vocabulary: yazarın sık kullandığı 8-12 karakteristik kelime/ifade.",
    "- rhythm: cümle uzunluğu/kalıp ritmi (ör. kısa vurucu cümleler, sonda twist).",
    "- avoid: yazarın ASLA yapmadığı 2-4 şey (ör. emoji spam, hashtag yığını).",
  ].join("\n");
}

/** Bir hesap için ses profilini yeniden damıtır ve yeni versiyon olarak yazar. */
async function syncForAccount(accountHandle: string): Promise<SyncResult> {
  const account = await accountRepo.findByHandle(accountHandle);
  if (!account) return { ok: false, accountHandle, reason: "account_not_found" };

  const logs = await prisma.publishLog.findMany({
    where: { accountId: account.id, success: true, platform: "x" },
    orderBy: { publishedAt: "desc" },
    take: MAX_SAMPLES,
    select: { content: true },
  });
  const samples = logs
    .map((l) => (l.content ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);

  if (samples.length < MIN_SAMPLES) {
    return { ok: false, accountHandle, reason: `insufficient_samples(${samples.length}/${MIN_SAMPLES})` };
  }

  // LLM harcaması bütçe kapısında — tükenmişse damıtma atlanır.
  const budget = await getBudgetStatus();
  if (!budget.allowed) return { ok: false, accountHandle, reason: "budget_exhausted" };

  const userPrompt =
    "Tweetler:\n" + samples.map((t, i) => `${i + 1}. ${t}`).join("\n");

  let distilled: DistilledVoice;
  try {
    const res = await generateJson<DistilledVoice>({
      role: "cheapWriter",
      system: buildSystemPrompt(),
      user: userPrompt,
      temperature: 0.4,
      maxTokens: 900,
    });
    distilled = res.data;
  } catch (err) {
    return { ok: false, accountHandle, reason: `llm_error:${err instanceof Error ? err.message : "unknown"}` };
  }

  const clean = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12) : [];

  // Önceki aktif profilleri pasifleştir, yeni versiyon yaz (rollback: isActive toggle).
  const prev = await prisma.voiceProfile.findFirst({
    where: { accountId: account.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (prev?.version ?? 0) + 1;

  await prisma.voiceProfile.updateMany({
    where: { accountId: account.id, isActive: true },
    data: { isActive: false },
  });

  await prisma.voiceProfile.create({
    data: {
      accountId: account.id,
      name: "auto",
      personality: typeof distilled.personality === "string" ? distilled.personality.slice(0, 500) : "",
      toneTagsJson: JSON.stringify(clean(distilled.toneTags)),
      vocabularyJson: JSON.stringify(clean(distilled.vocabulary)),
      rhythm: typeof distilled.rhythm === "string" ? distilled.rhythm.slice(0, 300) : "",
      avoidJson: JSON.stringify(clean(distilled.avoid)),
      mode: "personal",
      version: nextVersion,
      isActive: true,
      sourceAttribution: `auto-distilled from ${samples.length} published tweets`,
    },
  });

  return { ok: true, accountHandle, version: nextVersion, samples: samples.length };
}

export const voiceProfileService = {
  syncForAccount,
  MIN_SAMPLES,
};
