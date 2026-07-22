/**
 * Series DNA servisi (Sprint 4 — FINAL-CONTENT-ENGINE-SPEC §5).
 *
 * SeriesProfile = tekrarlayan format sözleşmesi (kapak formülü, slayt
 * arketipleri, değişken öğeler). Hesap kurallarını TEKRARLAMAZ, özelleştirir.
 * İlk seri: Best AI Tools (D5, report 09 §10.3 canonical seed).
 * DNA alanları human-gated: bu servis yalnız okur + idempotent seed eder;
 * düzenleme operatör işidir (version+promptVersion bump).
 */

import { prisma } from "@/lib/db/client";
import { wrapUntrustedData } from "@/lib/ai/untrustedData";

export type SeriesRecord = NonNullable<Awaited<ReturnType<typeof getSeries>>>;

function parseArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getSeries(accountId: string, seriesKey: string) {
  return prisma.seriesProfile.findFirst({
    where: { accountId, seriesKey, isActive: true },
    orderBy: { version: "desc" },
  });
}

export async function listActiveSeries(accountId: string) {
  return prisma.seriesProfile.findMany({
    where: { accountId, isActive: true },
    orderBy: { name: "asc" },
  });
}

/** Report 09 §10.3 canonical seed — İLK seri (idempotent: varsa dokunmaz). */
export async function seedBestAiTools(accountId: string): Promise<{ created: boolean; id: string }> {
  const existing = await getSeries(accountId, "best_ai_tools");
  if (existing) return { created: false, id: existing.id };

  const row = await prisma.seriesProfile.create({
    data: {
      accountId,
      seriesKey: "best_ai_tools",
      name: "Best AI Tools",
      platform: "instagram",
      purpose:
        "Tasarımcıya iş sürecini hızlandıran, çoğu ücretsiz/az bilinen AI aracını dürüstçe tanıtmak",
      audience: "Türk grafik tasarımcılar & içerik üreticiler (junior-mid)",
      objective: "save",
      format: "carousel",
      slideCountRange: "6-8",
      coverFormula:
        "Sert iddia + araç sayısı: 'Photoshop'a para verme — bu 5 ücretsiz AI aracı yeter'",
      slideArchetypesJson: JSON.stringify([
        "cover_hook",
        "arac_1 (isim+ne işe yarar)",
        "arac_2",
        "arac_3",
        "arac_4",
        "arac_5",
        "kapanış+CTA",
      ]),
      variableElementsJson: JSON.stringify([
        "hangi araçlar",
        "kapak iddiası",
        "niş (mockup/upscale/bg-remove)",
      ]),
      ctaFormula:
        "Kaydet + 'hangisini deneyeceksin?' YOK — 'listeyi kaydet, sırayla dene' tek cümle",
      captionDnaJson: JSON.stringify({
        hook: "kapak iddiasını tekrarla",
        body: "her aracın linkini/adını sırala",
        close: "sert tek cümle",
      }),
      hashtagDnaJson: JSON.stringify([
        "#grafiktasarım",
        "#yapayzeka",
        "#aitools",
        "#tasarımaraçları",
      ]),
      bannedRepetitionJson: JSON.stringify([
        "son 30 günde geçen araç adları",
        "'oyunun kuralları değişti' klişesi",
      ]),
      productionChecklistJson: JSON.stringify([
        "her slayt tek araç",
        "araç adı görselde okunur",
        "kapakta sayı var",
        "soyut AI yorumu yok",
      ]),
      evaluationRubricJson: JSON.stringify([
        "somut araç adı var mı",
        "fiyat/ücretsiz belirtilmiş mi",
        "kapak durduruyor mu",
        "kaydedilesi mi",
      ]),
    },
  });
  return { created: true, id: row.id };
}

/** ≤5 çeşitli seri örneği (few-shot hard cap — CONTENT-ENGINE §5.3). */
export const SERIES_FEWSHOT_CAP = 5;

export async function getSeriesExamples(accountId: string, seriesKey: string) {
  return prisma.trainingExample.findMany({
    where: { accountId, seriesKey, label: { in: ["positive", "edited"] } },
    orderBy: { createdAt: "desc" },
    take: SERIES_FEWSHOT_CAP,
  });
}

export type CarouselPromptInput = {
  series: {
    name: string;
    purpose: string;
    audience: string;
    objective: string;
    slideCountRange: string;
    coverFormula: string;
    slideArchetypesJson: string;
    variableElementsJson: string;
    ctaFormula: string;
    captionDnaJson: string;
    hashtagDnaJson: string;
    bannedRepetitionJson: string;
    evaluationRubricJson: string;
    promptVersion: string;
  };
  /** Aktif VoiceProfile'dan gelen ses satırları (opsiyonel). */
  voiceLines?: string[];
  /** ≤5 few-shot örnek metni (untrusted fence'e girer). */
  examples?: string[];
  /** Bu bölümün konusu/topic'i (untrusted fence'e girer). */
  topic: string;
};

/**
 * buildCarouselPrompt (CONTENT-ENGINE §5.3): Series DNA yapısal sözleşmesini
 * enjekte eder — çok-slaytlı çıktıda "stil parçalanmasını" önler. Canlı
 * "stili yakala, BİREBİR KOPYALAMA yapma" talimatı korunur; örnekler ve topic
 * untrusted DATA fence'i içinde.
 */
export function buildCarouselPrompt(input: CarouselPromptInput): { system: string; user: string } {
  const s = input.series;
  const archetypes = parseArray(s.slideArchetypesJson);
  const variables = parseArray(s.variableElementsJson);
  const banned = parseArray(s.bannedRepetitionJson);
  const rubric = parseArray(s.evaluationRubricJson);
  const hashtags = parseArray(s.hashtagDnaJson);

  const system = [
    `Sen "${s.name}" serisinin carousel yazarısın (promptVersion: ${s.promptVersion}).`,
    `Amaç: ${s.purpose}`,
    `Kitle: ${s.audience} | Hedef aksiyon: ${s.objective}`,
    "",
    "SERİ YAPI SÖZLEŞMESİ (her bölümde SABİT):",
    `- Slayt sayısı: ${s.slideCountRange}`,
    `- Kapak formülü: ${s.coverFormula}`,
    ...(archetypes.length ? [`- Slayt arketipleri (sıralı): ${archetypes.join(" → ")}`] : []),
    `- CTA formülü: ${s.ctaFormula}`,
    ...(hashtags.length ? [`- Hashtag seti: ${hashtags.join(" ")}`] : []),
    "",
    "HER BÖLÜMDE DEĞİŞMESİ ZORUNLU:",
    ...variables.map((v) => `- ${v}`),
    ...(banned.length ? ["", "TEKRAR YASAĞI:", ...banned.map((b) => `- ${b}`)] : []),
    ...(rubric.length ? ["", "KALİTE ÖLÇÜTLERİ (çıktın bunlardan geçmeli):", ...rubric.map((r) => `- ${r}`)] : []),
    ...(input.voiceLines?.length ? ["", "SES PROFİLİ:", ...input.voiceLines] : []),
    "",
    "Örneklerin stilini yakala ama BİREBİR KOPYALAMA yapma.",
    'Çıktı SADECE JSON: {"cover":"...","slides":[{"n":1,"copy":"≤20 kelime","visual":"görsel tarifi"}],"caption":"...","hashtags":["#..."]}',
  ].join("\n");

  const exampleBlock = input.examples?.length
    ? `Seri örnekleri (stil referansı — kopyalama):\n${wrapUntrustedData(
        input.examples.slice(0, SERIES_FEWSHOT_CAP).join("\n---\n")
      )}\n\n`
    : "";
  const user = `${exampleBlock}Bu bölümün konusu:\n${wrapUntrustedData(input.topic)}`;

  return { system, user };
}
