import { buildGenerationContext, buildGenerationContextFallback } from "./context-builder";
import { critiqueDrafts } from "./draft-critic";
import { buildMemoryPromptBlock } from "./vector-memory";
import { buildTurkeyContext } from "./turkey-context";
import { pickVisualKeywordHints } from "./keyword-hints";
import { normalizeNextMove } from "@/lib/ai/next-move";
import type {
  GenerateDraftsInputRaw,
  GenerateDraftsResult,
  DraftVariant,
  GenerationContext
} from "./types";

export async function generateDrafts(
  input: GenerateDraftsInputRaw
): Promise<GenerateDraftsResult> {
  const warnings: string[] = [];
  let context: GenerationContext;

  try {
    context = await buildGenerationContext({
      accountHandle: input.accountHandle,
      actionType: input.actionType,
      sourcePostId: input.sourcePostId,
      sourceContent: input.sourceContent,
      sourceUrl: input.sourceUrl,
      sourceHandle: input.sourceHandle,
      modeId: input.modeId,
      patternId: input.patternId,
      patternName: input.patternName,
      manualIdea: input.manualIdea,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Context builder error";
    warnings.push(`Context builder failed, using fallback context: ${errMsg}`);
    context = buildGenerationContextFallback({
      accountHandle: input.accountHandle,
      actionType: input.actionType,
      sourceContent: input.sourceContent || input.manualIdea || "Default content idea",
    });
  }

  // Closure D: writer failure must NOT fall back to canned marketing copy — that
  // presents fabricated, source-unrelated text as real generated drafts (a
  // success lie). Let the error propagate so the route returns an honest 402
  // (budget) / 5xx and the UI shows its blocked/error state instead.
  const drafts: DraftVariant[] = await generateDraftsWithAI(context);

  // Critique drafts using Draft Critic
  let draftsWithCritic: Array<{ draft: DraftVariant; critic: any }> = [];
  try {
    draftsWithCritic = await critiqueDrafts(drafts, context);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Critique failed";
    warnings.push(`Critique failed: ${errMsg}`);
    // Closure D: drafts are real AI output, but WITHOUT a critic verdict we must
    // NOT fabricate publish-readiness. Mark degraded + "rewrite" (needs manual
    // review) with neutral scores — never a fake "publish" at 75.
    draftsWithCritic = drafts.map((draft) => ({
      draft,
      critic: {
        personaMatchScore: 0,
        hookStrengthScore: 0,
        clarityScore: 0,
        viralityScore: 0,
        noveltyScore: 0,
        riskScore: 0,
        publishScore: 0,
        publishRecommendation: "rewrite",
        rewriteSuggestion: "",
        reason: "Kritik yapılamadı — otomatik değerlendirme yok; yayından önce manuel incele.",
        confidence: 0,
        degraded: true,
      },
    }));
  }

  return {
    success: true,
    context,
    drafts: draftsWithCritic,
    warnings,
  };
}

export async function generateDraftsWithAI(
  context: GenerationContext,
  options?: any
): Promise<DraftVariant[]> {
  const { generateJsonGated } = await import("@/lib/ai/generateGated");

  const { system, user } = buildDraftGenerationPrompt(context);

  const response = await generateJsonGated<{
    drafts: Array<{
      content: string;
      angle: "safe" | "strong" | "provocative";
      reasoning: string;
      patternUsed?: string;
      imagePrompt?: string;
      payoff?: string;
    }>;
  }>({
    role: "creativeWriter",
    system,
    user,
    temperature: 0.7,
    purpose: "writer_x_growth",
    platform: "x",
  });

  if (!response?.data?.drafts || !Array.isArray(response.data.drafts)) {
    throw new Error("Invalid response format from OpenRouter.");
  }

  return normalizeDraftVariants(response.data, context);
}

/**
 * DEAD (closure D): hardcoded, per-account marketing copy. No longer wired to
 * any generation path — `generateDrafts` rethrows on writer failure instead of
 * serving fabricated content. Retained only for its isolated unit tests; slated
 * for removal in the dead-code sweep. Do NOT re-invoke this as a fallback: it
 * returns source-unrelated canned text and would reintroduce the success lie.
 */
export function generateDraftsFallback(
  context: GenerationContext,
  count = 3
): DraftVariant[] {
  const handle = context.accountProfile?.handle || "grafikcem";
  const actionType = context.actionType || "tweet";
  const variants: DraftVariant[] = [];

  const safeAngle = "safe";
  const strongAngle = "strong";
  const provocativeAngle = "provocative";

  if (handle === "grafikcem") {
    if (actionType === "reply") {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Katılıyorum, özellikle yapay zeka entegrasyonu tasarımcının iş akışını tamamen optimize ediyor.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Simple helpful editorial response.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Bu araçları kullanmayan tasarımcıların sektörde kalması imkansız. Süreçleri tamamen AI yönetiyor.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong bold claim about workflow shift.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "AI yeteneği öldürmez, vasatlığı eler. Asıl soru: Tasarımcılar sadece birer operatör mü olacak?",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative debate prompt on role change.",
      });
    } else if (actionType === "quote") {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Günün en değerli AI gelişmesi bu olabilir. Tasarım süreçlerini inanılmaz bir boyuta taşıyacak.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Safe quote endorsement.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Gelişmeler gösteriyor ki, geleneksel ajans modellerinin ömrü bitti. Artık bireysel AI stüdyoları dönemi.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong industry analysis quote.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Popüler görüşlerin aksine, bu AI güncellemesi bir kolaylık değil. Birçok ajans için açık bir tehdit.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative counter-perspective.",
      });
    } else {
      // tweet — hot_take (≤280, somut çapa) + thread (uzun, araç+sayı+döküm)
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Çoğu tasarımcı ChatGPT'ye aylık 20$ veriyor. Aynı işi açık kaynak modellerle 0₺'ye kuran araçlar çıktı; fark kalitede değil, faturada.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "hot_take: tek vuruş, sert fiyat karşılaştırması (somut çapa).",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Ajansların gizlediği iş akışı aslında üç araç:\n\n→ Topla: ham fikir/asset tek yerde\n→ Bağla: Claude ile ilişkilendir ve düzenle\n→ Üret: şablona dök, çıktı al\n\nKod yok, tekrar yok. Pasif üretim hattı bu kadar basit.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "thread: çalışan sistem, '→' dökümü, payoff.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Pahalı stok ve tasarım araçlarına para yakmayı bırak. Açık kaynak self-hosted alternatifler aynı çıktıyı sıfır abonelik ücretiyle veriyor. Vendor lock-in bir tercih, zorunluluk değil.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "hot_take: ters köşe, somut maliyet tespiti.",
      });
    }
  } else if (handle === "maskulenkod") {
    if (actionType === "reply") {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Doğru yoldasın. Disiplin her şeyden önce gelir.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Basic encouraging but stoic reply.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Şikayet etmeyi bırakmadığın sürece o döngüden asla çıkamayacaksın. Ayna tut kendine.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong direct mirror reaction.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Zayıflığı öven modern dünya yalanlarına kanmayın. Güçlü olmak bir seçenek değil zorunluluktur.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative stoic response.",
      });
    } else {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Şunu yapıyorsan disiplinini kaybetmişsin demektir: Her sabah ertelediğin o ilk alarm seni zihnen geriye atar.\n\nDisiplin zayıflık kabul etmez.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Safe authority style stoic mirror post.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Hâlâ para kazanmanın sadece çok çalışmak olduğunu sanıyorsan modern dünyayı hiç anlamamışsın. Zihniyetini değiştirmeden yerinde sayacaksın.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong pessimistic reality post.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Modern dünya erkekleri zayıflatmak üzerine kurulu. Konfor alanından çıkmayan, iradesini teslim eden erkekler ezilmeye mahkumdur.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative masculine authority claims.",
      });
    }
  } else {
    if (actionType === "reply") {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Taktiksel olarak haklı bir yorum. Savunma hattı tamamen çökmüş durumda.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Safe tactical sports response.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Bu transfer politikasıyla bu takımın şampiyon olması mucize olur. Gerçekçi olalım.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong criticism on transfer strategy.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Boş fanatizmi bırakın, bu hoca tercihinin sahada hiçbir mantığı yok. Sezon sonu hüsran kapıda.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative prophecy sports response.",
      });
    } else {
      variants.push({
        id: `fallback-${Date.now()}-0`,
        content: "Futbolumuzda taktiksel kriz devam ediyor. Büyük kulüplerin transfer stratejileri hâlâ günü kurtarma odaklı.",
        angle: safeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Safe soccer analysis post.",
      });
      variants.push({
        id: `fallback-${Date.now()}-1`,
        content: "Bu teknik direktör tercihiyle bu takımın şampiyon olması imkansız. Sezon sonu yine hüsranla bitecek gibi görünüyor.",
        angle: strongAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Strong sports prophecy statement.",
      });
      variants.push({
        id: `fallback-${Date.now()}-2`,
        content: "Süper Lig'in kalitesi her geçen gün düşüyor, boş fanatizm gerçekleri örtemez. Bu sistem tamamen değişmeli.",
        angle: provocativeAngle,
        actionType,
        accountHandle: handle,
        reasoning: "Provocative anger style league review.",
      });
    }
  }

  return variants.slice(0, count);
}

export function normalizeDraftVariants(
  raw: any,
  context: GenerationContext
): DraftVariant[] {
  const list = raw?.drafts || [];
  return list.map((item: any, i: number) => {
    const angle = item.angle === "safe" || item.angle === "strong" || item.angle === "provocative"
      ? item.angle
      : (i === 0 ? "safe" : i === 1 ? "strong" : "provocative");
      
    return {
      id: `draft-${Date.now()}-${i}`,
      content: typeof item.content === "string" ? item.content.trim() : "Empty generated draft content.",
      angle,
      actionType: context.actionType,
      accountHandle: context.accountProfile.handle,
      modeId: context.modeId,
      patternUsed: typeof item.patternUsed === "string" ? item.patternUsed : undefined,
      reasoning: typeof item.reasoning === "string" ? item.reasoning : "Successfully normalized from AI output.",
      imagePrompt:
        typeof item.imagePrompt === "string" && item.imagePrompt.trim().length > 0
          ? item.imagePrompt.trim()
          : undefined,
      payoff: normalizeNextMove(item.payoff),
    };
  });
}

export function buildDraftGenerationPrompt(
  context: GenerationContext
): { system: string; user: string } {
  const profile = context.accountProfile;
  const constraints = context.constraints;

  const memoryBlock = context.memoryContext
    ? buildMemoryPromptBlock(context.memoryContext)
    : "";

  // A.1 — Sinyal-kökenli üretim: kaynağın NEDEN viral olduğunu writer'a ver.
  const pe = context.patternExtraction as
    | { hook?: string; emotionalTrigger?: string; viralityReason?: string }
    | undefined;
  const signalBlock =
    pe && (pe.hook || pe.viralityReason)
      ? `\nNEDEN VİRAL (kaynak sinyali — bu açıyı koru, birebir kopyalama):\n- Hook: ${pe.hook ?? "-"}\n- Duygu/tetikleyici: ${pe.emotionalTrigger ?? "-"}\n- Viralite sebebi: ${pe.viralityReason ?? "-"}\nBu sinyali kendi açına taşı; kaynağı özetleme.\n`
      : "";

  // Per-account format policy (emoji + structure) driven by generationRules.
  // Falls back to the historic "no emoji / no hashtag / plain text" behavior
  // when a profile does not opt in (keeps grafikcem & maskulenkod unchanged).
  const genRules = (profile.generationRules ?? {}) as Partial<{
    allowEmoji: boolean;
    allowStructure: boolean;
    noHashtags: boolean;
  }>;
  const allowEmoji = genRules.allowEmoji ?? false;
  const allowStructure = genRules.allowStructure ?? false;
  const noHashtags = genRules.noHashtags ?? true;

  const formatConstraints: string[] = [
    `- Maksimum karakter sınırı: ${constraints.maxChars} karakter. Kesinlikle aşma!`,
  ];
  if (allowEmoji) {
    formatConstraints.push(
      "- Ölçülü sinyal emojisi kullanabilirsin (örn. 🚨 son dakika, 💰 para, 👀 dikkat, ⚔️ eşleşme, 🔥 form; kulüp renkleri 🟡🔴 🟡🔵 ⚫⚪). Her emoji bir işe yarasın; emoji yığını yapma."
    );
  } else {
    formatConstraints.push("- Emoji kullanma.");
  }
  if (noHashtags) {
    formatConstraints.push("- Hashtag (#) kullanma.");
  }
  if (allowStructure) {
    formatConstraints.push(
      "- Skor, sıralama veya istatistik gerektiğinde satır kırılımı ve kısa madde listesi kullanabilirsin; düz paragraf zorunlu değil."
    );
  }
  formatConstraints.push("- Tonal tutarlılık en yüksek önceliktir.");

  const formatGuide = profile.format ? `Format Rehberi: ${profile.format}\n` : "";
  const viralMechanicGuide = profile.viralMechanic
    ? `Viral Mekanik: ${profile.viralMechanic}\n`
    : "";

  const styleEnforcement =
    profile.handle === "grafikcem"
      ? `
SOMUT ÇAPA ZORUNLULUĞU (grafikcem — kritik):
- Her taslak somut bir çapa taşımalı: adı geçen araç/ürün VEYA sert sayı/fiyat/oran. Soyut "AI iş akışını dönüştürüyor" tarzı cümleler YASAK.
- "Bu ne anlama geliyor?" kalıbını ve sona klişe soru-CTA eklemeyi ASLA kullanma. Sert, tek cümlelik bir payoff ile bitir.
- 5 içerik direği: tool_spotlight (araç + iş sürecine kattığı), visual_drop (görsel + prompt/süreç), hot_take (sektör yorumu), thread (uzun form, bookmark çeken döküm), repo_kaynak (repo/free tool + yorum).
- Kısa modlar tek vuruş (≤280); thread uzun form: hook → numaralı/"→" madde dökümü → payoff.
- 3 taslaktan en az 1'i thread uzunluğunda (döküm + payoff) olsun.

HEDEF STİL ÖRNEKLERİ (bu hesabın gerçek viral postları — yoğunluğu yakala, kopyalama):
1) "WhatsApp otomasyonu satan ajansların sırrı ifşa oldu. OpenWA çıktı — ücretsiz, açık kaynak, self-hosted. Twilio'nun mesaj başına 4 sente kestiği faturayı sıfıra çekiyor. → Multi-session → REST API + dashboard → n8n entegrasyonu → tek Docker komutu. Altyapı bedava."
2) "Bu mockup'ı Midjourney v7 + --sref ile tek seferde çıkardım. İş prompt'ta değil: stil referansını kilitleyip sahneyi değiştiriyorum. 4 varyant, 2 dakika."
3) "1400 ücretsiz API var. Hepsine tek satır manuel kod yazmadan Claude Code ile eriştim. 2 saatte çalışan mikro SaaS çıktı."
`
      : profile.handle === "maskulenkod"
      ? `
HİBRİT EKSEN (maskulenkod — kritik):
- Ana çizgi: erkekliği SİSTEM olarak öğret (disiplin, kimlik, sosyal güç). Davranışı duyguya değil mekaniğe bağla.
- Yanında gerçekçi cinsiyet/ilişki dinamiği (hipergami, seçilme, statü) sert ama DENGELİ yaşar — kadın düşmanlığı/hakaret/mağdur edebiyatı YASAK.
- 5 içerik direği: sistem_analizi (keskin teşhis), sosyal_gozlem (güç dinamiği gözlemi), thread (uzun form, e-kitap funnel), hot_take (tartışmalı görüş), disiplin_notu (pratik sistem).
- thread dışı modlar ≤280 ve tek tweet; thread: hook → numaralı somut döküm → çıkış.

HEDEF STİL ÖRNEKLERİ (yoğunluğu yakala, kopyalama):
1) "Çoğu erkek güçsüz kalır — ideoloji eksikliğinden değil, sistem eksikliğinden. Disiplini hisse bağlarsan his bitince durursun; sisteme bağlarsan devam eder."
2) "Şunu fark ettim: seçilmeyi bekleyen erkek zaten sıranın sonundadır. Mesele kadın değil, kendi yönünü kurmamış olman."
3) "Maskülenliğin 5 yanlış anlaşılan gerçeği 👇 1. Güç bağırmak değil sınır koymaktır. 2. Disiplin motivasyon değil sistemdir. ..."
`
      : "";

  // Görsel modlarında (emitsImagePrompt) image-gen promptu iste.
  const selectedModeEmitsImage = Boolean(
    (context.selectedMode as { emitsImagePrompt?: boolean } | undefined)?.emitsImagePrompt
  );
  // Anahtar Kelime Kütüphanesi'nden görsel stil ipuçları (F5e) — image prompt'a
  // premium tasarım terimleri enjekte edilir (fail-soft: liste boşsa atlanır).
  const keywordHints = selectedModeEmitsImage
    ? pickVisualKeywordHints(context.sourceContent ?? profile.handle, 10)
    : [];
  const keywordHintLine =
    keywordHints.length > 0
      ? ` Aşağıdaki İngilizce stil anahtar kelimelerini uygun olanları seçerek değerlendir (hepsini kullanma): ${keywordHints.join(", ")}.`
      : "";
  const imagePromptBlock = selectedModeEmitsImage
    ? `\nGÖRSEL ÜRETİMİ (bu mod görsel direği): Her taslak için metne ek olarak "imagePrompt" alanına İngilizce, image-gen aracına (Midjourney/DALL-E) yapıştırılabilir net bir görsel promptu yaz (sahne, stil, kompozisyon, renk, oran).${keywordHintLine} Görselin kendisini üretme; sadece promptu ver.\n`
    : "";

  // Türkiye-stickiness bağlamı (doğal Türkçe + yerel gündem).
  const turkeyBlock = `\n${buildTurkeyContext(profile.handle)}\n`;

  const system = `Sen bir sosyal medya pazarlama uzmanı ve içerik üreticisisin.
Hedef hesap: @${profile.handle}
Hesap Personası: ${profile.persona}
Açıklama: ${profile.description}
Tonal Karakter: ${constraints.tone}
${formatGuide}${viralMechanicGuide}Yazım Dili: ${constraints.language} (Türkçe yazmalısın)

YASAKLI TERİMLER (Bu kelimeleri kesinlikle kullanma):
${constraints.forbidden.map((term) => `- ${term}`).join("\n")}

ÜRETİM KISITLAMALARI:
${formatConstraints.join("\n")}

Aksiyon Türü: ${context.actionType.toUpperCase()}
Talimatlar:
${context.actionType === "reply" ? "- Kısa, doğrudan ve net bir yanıt üret. Soruya veya yoruma direkt cevap ver." : ""}
${context.actionType === "quote" ? "- Alıntı yapılan gönderinin üzerine ek değer katan, itiraz eden veya yeni bir perspektif getiren bir alıntı metni yaz." : ""}
${context.actionType === "tweet" ? "- Bağımsız, dikkat çekici, kancalı ve etkileyici bir standalone tweet yaz." : ""}

Seçilen İçerik Modu Talimatları:
${context.selectedMode?.instruction || ""}
${styleEnforcement}${turkeyBlock}${imagePromptBlock}
Viral Pattern Kılavuzları (Mümkünse bunlardaki kancaları veya yapıları uygula):
${context.relevantPatterns.map((p) => `- Adı: ${p.patternName}\n  Yapı: ${p.structureJson || ""}\n  Örnek: ${p.exampleGood || ""}`).join("\n")}
${signalBlock}${memoryBlock}
SONRAKİ HAREKET / PAYOFF (her taslak için zorunlu):
- Her taslak okuyucuda TEK somut sonraki hareketi tetiklemeli ve bunu "payoff" alanına yaz: save | reply | follow | quote | profile_visit | none.
- Düz, hareketsiz biten kapanış yasak; "none" yalnızca format gerçekten hareketsizse. Payoff metnin gücünden doğmalı, klişe soru-CTA ile değil.

İstenen JSON formatında tam olarak 3 farklı alternatif taslak üret.
Açı türleri şunlar olmalıdır:
1. "safe": Personaya tam oturan, güvenli, dengeli ve yapıcı alternatif.
2. "strong": Güçlü bir iddiaya sahip, net pozisyon alan, tavizsiz alternatif.
3. "provocative": Popüler görüşleri veya dogmaları sorgulayan, tartışma tetikleyecek cesur alternatif.

ÇIKTI SADECE AŞAĞIDAKİ JSON ŞABLONUNDA OLMALIDIR (Markdown fences kullanmadan, doğrudan parse edilebilir JSON):
{
  "drafts": [
    {
      "content": "taslak icerigi metni",
      "angle": "safe",
      "reasoning": "bu taslagin persona ve tonal aciklamasi",
      "patternUsed": "kullanilan pattern adi",
      "payoff": "save | reply | follow | quote | profile_visit | none",
      "imagePrompt": "${selectedModeEmitsImage ? "Ingilizce image-gen promptu (bu mod gorsel direkti)" : "(bu modda bos birak)"}"
    },
    ...
  ]
}`;

  const user = `Aşağıdaki kaynak içeriği kullanarak hedeflenen tonda 3 taslak alternatifi üret.

Kaynak İçerik:
"${context.sourceContent || ""}"

Kaynak URL: ${context.sourceUrl || "Yok"}
Kaynak Yazar: ${context.sourceHandle || "Bilinmiyor"}`;

  return { system, user };
}
