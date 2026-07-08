import type { AccountProfile } from "@/lib/accounts";
import { getCompetitorPromptContext } from "@/lib/competitors";
import type { NextMove } from "@/lib/ai/next-move";
import { wrapUntrustedData, UNTRUSTED_DATA_NOTICE } from "@/lib/ai/untrustedData";

export type Draft = {
  content: string;
  mode: string;
  reason: string;
};

export type DraftWithAngle = {
  content: string;
  mode: string;
  angle: string;
  hookType: string;
  reason: string;
  /** Görsel modlarında (visual_drop, stat, taktik_kirilim) üretilen image-gen promptu. */
  imagePrompt?: string;
  /** İçeriğin okuyucuda tetiklediği tek somut sonraki hareket (payoff). */
  payoff?: NextMove;
};

export type RankedCandidate = {
  content: string;
  mode: string;
  angle: string;
  hookStrength: number;
  viralPotential: number;
  accountFit: number;
  turkishNaturalness: number;
  noveltyScore: number;
  risk: number;
  sourceFaithfulness: number;
  verdict: "approve" | "hold" | "reject";
  reason: string;
  /** Yargıcın taşıdığı sonraki hareket sinyali (writer'dan gelir). */
  payoff?: NextMove;
};

export type DraftScore = {
  content: string;
  mode: string;
  personaMatch: number;
  turkishNaturalness: number;
  hookStrength: number;
  clarity: number;
  /** Sprint 1 ayrışık alt-sinyal seti: novelty judge'dan (noveltyScore) gelir. */
  novelty: number;
  viralPotential: number;
  risk: number;
  sourceFaithfulness: number;
  verdict: "approve" | "hold" | "reject";
  reason: string;
  /** Kazananla birlikte persist edilen sonraki hareket (payoff) sinyali. */
  payoff?: NextMove;
};

export type BenchmarkResult = {
  account: string;
  modelUsed: {
    writer: string;
    judge: string;
    premium?: string;
    finalEditor?: string;
    writerFallbackUsed?: boolean;
    writerFallbackReason?: string;
    judgeFallbackUsed?: boolean;
    judgeFallbackReason?: string;
  };
  sourceInput: string;
  drafts: DraftScore[];
  rankedCandidates: RankedCandidate[];
  winner: DraftScore;
  publishDecision: "queue" | "hold" | "reject";
  estimatedCostUsd: number;
  usedMock: boolean;
  timings?: {
    writerMs: number;
    judgeMs: number;
    finalEditorMs?: number;
    totalMs?: number;
  };
};

// ─── Angle modes per account ─────────────────────────────────────────────────

const ANGLES: Record<string, string[]> = {
  grafikcem: [
    "tool_spotlight: yeni/güncel bir AI aracını içeriden ele al; adını ver, iş sürecine kattığını/katmadığını dürüstçe söyle, sert sayı/fiyat veya özellik dökümü ekle",
    "visual_drop: AI ile ürettiğin bir görseli paylaş; hangi araç/prompt ile yaptığını ve kritik trick'i anlat (görsel-prompt da üretilir)",
    "thread: uzun form, kaydedilmeyi hak eden döküm ('X aracının 7 kullanımı', 'client projesinde öğrendiklerim'); hook → numaralı/'→' madde dökümü → payoff",
    "hot_take: sektöre dair tartışmaya açık, kişisel net görüş; somut bir araca/sayıya yaslan, yumuşatma yok",
    "repo_kaynak: yararlı bir repo/free tool paylaş; adını ver + 1-2 cümle dürüst kişisel yorum ('bunu şunun için kullanıyorum çünkü...')",
  ],
  maskulenkod: [
    "sistem_analizi: 'Bu hatayı neden her erkek yapar?' formatında kısa keskin teşhis; davranışı sisteme/mekaniğe bağla",
    "sosyal_gozlem: 'şunu fark ettim:' gözlemi; güç dinamikleri + gerçekçi cinsiyet/ilişki dinamiği (hipergami/seçilme) sert ama dengeli",
    "thread: 'Maskülenliğin 5 yanlış anlaşılan gerçeği' formatında uzun form; hook → numaralı döküm → çıkış (bookmark+takip+e-kitap funnel)",
    "hot_take: 'Motivasyon içerikleri zararlı çünkü...' tarzı tartışmalı net görüş; slogan değil gerekçe",
    "disiplin_notu: 'şöyle kurulur' formatında pratik, uygulanabilir sistem notu; mekanik ve somut",
  ],

};

function getAnglesForAccount(handle: string): string[] {
  return ANGLES[handle] ?? ANGLES.grafikcem;
}

// ─── Gold-standard style references (few-shot: stili yakala, kopyalama) ───────
// Bu hesabın gerçek viral postlarından damıtılmış hedef stil. Modelin
// soyut yorum yerine somut araç + sert sayı + döküm üretmesi için.

export const GOLD_EXAMPLES: Record<string, string[]> = {
  grafikcem: [
    // tool_spotlight — araç + iş sürecine kattığı + döküm
    "WhatsApp otomasyonu satan ajansların sırrı ifşa oldu. OpenWA çıktı — ücretsiz, açık kaynak, self-hosted WhatsApp API Gateway. Twilio'nun mesaj başına 4 sente kestiği faturayı sıfıra çekiyor.\n\n→ Multi-session desteği\n→ REST API + dashboard\n→ n8n entegrasyonu\n→ Tek Docker komutu\n\nAltyapı bedava. Pasif gelir motoru hazır.",
    // thread — çok araçlı çalışan sistem, kaydedilmeyi hak eden döküm
    "Not alıp bir daha bakmamanın sebebi tembellik değil, notların birbirine bağlı olmaması.\n\nÜç araçla çözülüyor, her birinin tek görevi var:\n\n→ Obsidian: yakalama katmanı, ham not lokalde\n→ Claude: bağlama katmanı, hangi eski fikirle ilişkili çıkarıyor\n→ Notion: üretim katmanı, olgunlaşan not işe dönüşüyor\n\nObsidian'da topluyorsun, Claude ile bağlıyorsun, Notion'da işe çeviriyorsun.",
    // visual_drop — görsel + prompt/süreç trick'i
    "Bu mockup'ı Midjourney v7 + --sref ile tek seferde çıkardım. İş prompt'ta değil: stil referansını kilitleyip sadece sahneyi değiştiriyorum. 4 varyant, 2 dakika.",
    // hot_take — tek vuruş, sektör yorumu
    "Çoğu tasarımcı ChatGPT'ye aylık 20$ veriyor. Aynı işi açık kaynak modellerle 0₺'ye kuran araçlar var; fark kalitede değil, faturada.",
    // repo_kaynak — repo + kişisel kullanım yorumu
    "1400 ücretsiz API var. Hepsine tek satır manuel kod yazmadan Claude Code ile eriştim. 2 saatte çalışan mikro SaaS çıktı.",
  ],
  maskulenkod: [
    // sistem_analizi — keskin teşhis, sisteme bağla
    "Çoğu erkek güçsüz kalır — ideoloji eksikliğinden değil, sistem eksikliğinden.\n\nDisiplini bir hisse bağlarsan o his bittiğinde durursun. Sisteme bağlarsan his bitse de devam eder.",
    // sosyal_gozlem — güç dinamiği, dengeli
    "Şunu fark ettim: seçilmeyi bekleyen erkek zaten sıranın sonundadır.\n\nMesele kadın değil, kendi yönünü kurmamış olman.",
    // thread — uzun form, e-kitap funnel
    "Maskülenliğin 5 yanlış anlaşılan gerçeği 👇\n\n1. Güç bağırmak değil, sınır koymaktır.\n2. Disiplin motivasyon değil, sistemdir.\n3. Statü para değil, güvenilirliktir.\n4. Sessizlik zayıflık değil, seçimdir.\n5. Yön, onaydan önce gelir.\n\nHangisi sende eksik?",
    // disiplin_notu — pratik sistem
    "Sabah disiplini şöyle kurulur:\n\n→ Alarmı odanın öbür ucuna koy\n→ İlk 10 dakika telefon yok\n→ Tek bir 'kazanım' belirle, küçük olsun\n\nİrade değil, mekanik. Sistem seni taşır.",
  ],

};

function getGoldExamples(handle: string): string[] {
  return GOLD_EXAMPLES[handle] ?? [];
}

// ─── Viral pattern catalog (news-ai personalarından portlandı) ────────────────
// Hook iskeleti reçeteleri: modele ezber kopya yaptırmaz, açı seçerken iskelet
// olarak kullandırır. grafikcem'in 12 viral pattern'i + maskulenkod'un 4 tweet
// formatı, redesign yönüyle (soru-CTA yok, cringe jargon yok) uyumlu damıtıldı.

const VIRAL_PATTERNS: Record<string, string[]> = {
  grafikcem: [
    "Karşıtlık: 'Diğerleri X yaparken ben Y yapıyorum.'",
    "Merak açığı: 'Bu araç/yöntem hakkında kimse konuşmuyor.'",
    "Dönüşüm: 'X gün önce şu durumdaydım; şimdi bu noktadayım.'",
    "Hızlı sonuç: '[kısa süre]de [somut çıktı].'",
    "Superlatif: 'Şu ana kadar gördüğüm en iyi [araç/şey].' (sadece gerçekse)",
    "Otorite + kanıt: '[N] yıldır bu işi yapıyorum; öğrendiğim şu.'",
    "Problem-çözüm: '[Problem]? [Araç] ile [sürede] çözüyorum.'",
    "Araç kombinasyonu: '[Araç1] + [Araç2] = [çarpıcı sonuç].'",
    "Tartışma: 'Herkes X diyor; ben katılmıyorum çünkü...'",
    "Sosyal kanıt: '[Büyük hesap/kişi] de artık şunu kullanıyor.'",
    "Algoritma gözlemi: 'X şu an [pattern] içerikleri öne çıkarıyor.'",
  ],
  maskulenkod: [
    "Aforizma: '[Eylem] yapanın [sonuç] artar.'",
    "Denklem: 'Disiplin > Motivasyon.' (kısa, keskin karşıtlık)",
    "Kural listesi: '→ Kural 1 / → Kural 2 / → Kural 3.'",
    "Paradoks: 'Zayıf erkek X yapar; güçlü erkek Y yapar.'",
  ],
};

function getViralPatterns(handle: string): string[] {
  return VIRAL_PATTERNS[handle] ?? [];
}

// maskulenkod tematik içerik eksenleri (modlardan bağımsız konu havuzu).
const MASKULEN_PILLARS: string[] = [
  "İlişki dinamikleri ve öz saygı: sınır çizme, manipülasyonu fark etme, seçilme/hipergami gerçeği.",
  "Kişisel disiplin ve ucuz dopamin: zaman, dikkat, fiziksel/zihinsel güç.",
  "Zihniyet ve stoacılık: duygusal kontrol, yalnızlıktan güç, 'elalem ne der' korkusunu yenme.",
  "Başarı ve güç: acı toleransı, çalışmanın zekaya üstünlüğü, statü inşası.",
];

// maskulenkod imza kapanışları (opsiyonel; her tweet'te zorunlu değil).
const MASKULEN_CLOSINGS: string[] = ["Gerçeğe uyan.", "Odakta kal.", "Taviz verme."];

// ─── Account-specific writing rules ──────────────────────────────────────────

const ACCOUNT_WRITING_RULES: Record<string, string[]> = {
  grafikcem: [
    "Her taslak somut bir çapa taşımalı: adı geçen araç/ürün VEYA sert sayı/fiyat/oran. Soyut AI yorumu yasak.",
    "Genel 'AI iş akışını dönüştürüyor' tarzı cümleler yazma; çalışan somut bir araç, sistem ya da rakam göster.",
    "'Bu ne anlama geliyor?' kalıbını ve sona klişe soru-CTA eklemeyi ASLA kullanma. Sert, tek cümlelik payoff ile bitir.",
    "thread'de numaralı/'→' maddelenmiş döküm kullan; kısa modlarda (tool_spotlight/hot_take/repo_kaynak) tek vuruş yaz (≤280).",
    "visual_drop ve repo_kaynak'ta süreç/kullanım değerini anlat; sadece tanıtım yapma.",
    "Kaynakta olmayan sayı/iddia uydurma; ama kaynaktaki somut detayları (isim, fiyat, oran) öne çıkar.",
    "Kesinlikle / tartışmasız / kanıtlandı gibi kaynaksız kesin ifade kullanma.",
  ],
  maskulenkod: [
    "Hibrit eksen: ana çizgi disiplin/kimlik/sosyal GÜÇ (sistem olarak öğret); gerçekçi cinsiyet/ilişki dinamiği (hipergami/seçilme) yanında sert ama dengeli yaşar.",
    "Davranışı duyguya değil sisteme/mekaniğe bağla. Ayna tut, yumuşatma; ama kadın düşmanlığına/hakarete düşme.",
    "Terapist dili, kişisel gelişim klişesi, 'herkesin durumu farklı' yumuşatması, motivasyon sloganı yazma.",
    "thread dışı modlarda ≤280 yaz; thread'de hook → numaralı somut döküm → çıkış.",
    "Mağdur edebiyatı / 'kadınlar yüzünden' bahaneciliği yapma; sorumluluğu ve kurulabilir sistemi erkeğe geri ver.",
  ],

};

// ─── Writer prompt (multi-angle) ─────────────────────────────────────────────

/**
 * Aktif VoiceProfile'ın prompt'a giren damıtılmış hali (FIRST-SPRINT item 16).
 * JSON kolonları çağıran tarafta parse edilir; buraya düz yapı gelir.
 * NOT: Bu blok SYSTEM prompt'ta yaşar (Anthropic cache breakpoint'inden
 * faydalanır); grounding'in eski §1.7 SES PROFİLİ user-bloğu kaldırıldı —
 * ses tek yerden enjekte edilir, tekrar/şişme yok.
 */
export type DraftVoice = {
  personality?: string | null;
  toneTags: string[];
  vocabulary: string[];
  avoid: string[];
  rhythm?: string | null;
  mission?: string | null;
  pointOfView?: string | null;
  audience?: string | null;
};

function buildVoiceBlock(voice: DraftVoice | undefined): string[] {
  if (!voice) return [];
  const lines: string[] = [];
  if (voice.personality?.trim()) lines.push(`- Kişilik: ${voice.personality.trim()}`);
  if (voice.mission?.trim()) lines.push(`- Misyon: ${voice.mission.trim()}`);
  if (voice.pointOfView?.trim()) lines.push(`- Bakış açısı: ${voice.pointOfView.trim()}`);
  if (voice.audience?.trim()) lines.push(`- Hedef kitle: ${voice.audience.trim()}`);
  if (voice.toneTags.length > 0) lines.push(`- Ton etiketleri: ${voice.toneTags.join(", ")}`);
  if (voice.vocabulary.length > 0)
    lines.push(`- Sık kullandığı kelimeler/kalıplar: ${voice.vocabulary.join(", ")}`);
  if (voice.rhythm?.trim()) lines.push(`- Ritim: ${voice.rhythm.trim()}`);
  if (voice.avoid.length > 0) lines.push(`- Kaçındığı ifadeler: ${voice.avoid.join(", ")}`);
  if (lines.length === 0) return [];
  return [
    "",
    "SES PROFİLİ (yayınlanan gerçek tweetlerden damıtıldı — taslaklar bu sese uymalı):",
    ...lines,
  ];
}

export function buildDraftSystemPrompt(profile: AccountProfile, voice?: DraftVoice) {
  const competitorContext = getCompetitorPromptContext(profile.handle);
  const angles = getAnglesForAccount(profile.handle);
  const rules = ACCOUNT_WRITING_RULES[profile.handle] ?? [];
  const goldExamples = getGoldExamples(profile.handle);
  const viralPatterns = getViralPatterns(profile.handle);

  const goldBlock =
    goldExamples.length > 0
      ? [
          "",
          "HEDEF STİL ÖRNEKLERİ (bu hesabın gerçek viral postları — stili ve yoğunluğu yakala, BİREBİR KOPYALAMA):",
          ...goldExamples.map((ex, i) => `Örnek ${i + 1}:\n"""\n${ex}\n"""`),
          "Bu örneklerdeki ortak nokta: güçlü hook + somut çapa (araç, sayı, haber, skor veya veri) + net bir kapanış. Senin taslakların da bu yoğunlukta ve bu hesabın biçiminde olmalı.",
        ]
      : [];

  const patternBlock =
    viralPatterns.length > 0
      ? [
          "",
          "VİRAL PATERN REÇETELERİ (hook iskeleti seç — ezbere kopyalama, açıya uydur):",
          ...viralPatterns.map((p) => `- ${p}`),
        ]
      : [];

  const maskulenBlock =
    profile.handle === "maskulenkod"
      ? [
          "",
          "TEMATİK EKSENLER (konu havuzu — açılarla harmanla, çeşitlilik için dönüşümlü kullan):",
          ...MASKULEN_PILLARS.map((p) => `- ${p}`),
          "",
          `İMZA KAPANIŞLAR (uygunsa birini kullan, her tweet'te zorunlu değil): ${MASKULEN_CLOSINGS.join(" | ")}`,
        ]
      : [];

  return [
    `Sen ${profile.xHandle} için yüksek performanslı Türkçe X postaları yazan bir editörsün.`,
    `Persona: ${profile.persona}.`,
    `Konsept: ${profile.concept}.`,
    `Maksimum karakter: ${profile.maxChars}.`,
    "",
    "TON KURALLARI:",
    ...profile.toneRules.map((r) => `- ${r}`),
    "",
    "FORMAT KURALLARI:",
    ...profile.formatRules.map((r) => `- ${r}`),
    "",
    "YAZI KURALLARI (kritik):",
    ...rules.map((r) => `- ${r}`),
    "",
    "YASAK KURALLAR:",
    ...profile.forbiddenRules.map((r) => `- ${r}`),
    "",
    "KAYNAK HESAPLAR (sinyal kaynakları, kopya değil):",
    ...competitorContext.topAccounts.map(
      (a) => `- @${a.handle} (${a.category}): ${a.why}`,
    ),
    ...buildVoiceBlock(voice),
    ...goldBlock,
    ...patternBlock,
    ...maskulenBlock,
    "",
    `Aşağıdaki ${angles.length} farklı açıdan birer taslak yaz. Her açı için İNGİLİZCE değil TÜRKÇE yaz.`,
    "AÇILAR:",
    ...angles.map((a, i) => `${i + 1}. ${a}`),
    "",
    "Her taslak:",
    `- Maksimum ${profile.maxChars} karakter olmalı`,
    "- Güçlü bir hook ile başlamalı",
    "- Haber özeti değil, yorum/açı olmalı",
    "- Kendi başına tamamlanmış bir fikir taşımalı",
    "",
    "HOOK ÖNCE (kritik viralite kuralı):",
    "- İlk cümle tweet'in viral olup olmayacağını belirler. En güçlü çapayı (araç adı / sert sayı / beklenmedik tespit / karşıtlık) İLK cümleye koy.",
    "- Açıklayıcı/ısınma cümlesiyle başlama; doğrudan vur.",
    "- Hook iskeleti seç: karşıtlık, merak açığı, sert veri, kışkırtma veya dönüşüm.",
    "",
    "SONRAKİ HAREKET / PAYOFF (her taslak için zorunlu):",
    "- Her taslak okuyucuda TEK somut sonraki hareketi tetiklemeli ve bunu 'payoff' alanına yaz: save | reply | follow | quote | profile_visit | none.",
    "- save = kaydedilmeyi hak eden döküm/referans (özellikle thread). reply = tartışma açan net iddia (hot_take). follow = otorite/'bunu kaçırmamalıydım'. quote = alıntılanacak keskin tespit.",
    "- Düz, açıklayıcı, hiçbir hareket tetiklemeyen kapanış YASAK. 'none' yalnızca format gerçekten hareketsizse; aksi halde net bir payoff seç ve metni o hareketi davet edecek şekilde kapat.",
    "- Klişe soru-CTA ile payoff yaratma; payoff metnin gücünden doğmalı (sert tek cümle / kaydedilesi döküm).",
    "",
    "GÖRSEL MODLAR (visual_drop / stat / taktik_kirilim): mode bu modlardan biriyse, metne ek olarak 'imagePrompt' alanına İngilizce, image-gen aracına (Midjourney/DALL-E) yapıştırılabilir net bir görsel promptu yaz (sahne, stil, kompozisyon, renk). Diğer modlarda imagePrompt boş bırak.",
    "",
    UNTRUSTED_DATA_NOTICE,
    "",
    "Sadece JSON döndür. Markdown yok.",
  ].join("\n");
}

export function buildDraftUserPrompt(profile: AccountProfile, sourceInput: string) {
  const angles = getAnglesForAccount(profile.handle);

  return JSON.stringify({
    task: "Verilen kaynak için farklı açılardan Türkçe X taslakları üret.",
    account: profile.xHandle,
    sourceInput: wrapUntrustedData(sourceInput),
    angleCount: angles.length,
    outputSchema: {
      drafts: angles.map((a, i) => ({
        content: "Türkçe tweet metni",
        mode: profile.modes[i % profile.modes.length]?.id ?? "default",
        angle: `angle_${i + 1}`,
        hookType: "statement | question | stat | contrast | confession",
        reason: "Kısa Türkçe açıklama",
        payoff: "save | reply | follow | quote | profile_visit | none",
        imagePrompt: "(yalnızca görsel modlarda) İngilizce image-gen promptu, aksi halde boş",
      })),
    },
  });
}

// ─── Viral judge prompt ───────────────────────────────────────────────────────

export function buildJudgeSystemPrompt(profile: AccountProfile) {
  return [
    `Sen ${profile.xHandle} için viral potansiyeli ve hesap uyumunu değerlendiren bir içerik editörüsün.`,
    "Her taslağı 0-100 arasında puanla.",
    "Risk skoru: 0 güvenli, 100 tehlikeli.",
    "",
    "PUANLAMA KRİTERLERİ:",
    "- hookStrength: İlk cümle okuyucuyu durduruyor mu?",
    "- viralPotential: Retweet, alıntı veya yorum yaptırır mı?",
    "- accountFit: Hesabın persona ve konseptiyle uyuşuyor mu?",
    "- turkishNaturalness: Doğal Türkçe mi, çeviri/yapay hissettiriyor mu?",
    "- noveltyScore: Açı taze ve beklenmedik mi?",
    "- risk: Yanlış anlaşılma, hukuki sorun, iftira, nefret söylemi riski?",
    "- sourceFaithfulness: Kaynakta olmayan iddia var mı?",
    "",
    "SOMUT ÇAPA KURALI (grafikcem için kritik):",
    "- Taslakta adı geçen somut bir araç/ürün VEYA sert bir sayı/fiyat/oran YOKSA accountFit ve viralPotential'i 60'ın altına çek.",
    "- Soyut 'AI iş akışını dönüştürüyor', 'tasarımcılar vizyona odaklanacak' gibi genel yorumları düşük puanla.",
    "- 'Bu ne anlama geliyor?' veya sona klişe soru-CTA içeren taslakları hold/reject yap.",
    "",
    "SONRAKİ HAREKET / PAYOFF KURALI (path):",
    "- Her taslak için 'payoff' alanını döndür: save | reply | follow | quote | profile_visit | none — taslağın okuyucuda tetiklediği TEK somut hareket.",
    "- Düz, hareketsiz biten (payoff = none) ve formatı gereği bir payoff taşıması gereken (thread/tool_spotlight/repo_kaynak) taslakların viralPotential'ini 55'in altına çek ve verdict'i en fazla hold yap.",
    "- Güçlü, net payoff taşıyan (kaydedilesi döküm / tartışma açan iddia / alıntılanacak tespit) taslakları viralPotential'de ödüllendir.",
    "",
    "KARAR KURALI:",
    "- approve: hookStrength ≥ 70, accountFit ≥ 75, risk ≤ 30, sourceFaithfulness ≥ 70 ve payoff ≠ none",
    "- hold: Kaynak belirsiz, ton riskli, skor sınırda veya payoff zayıf/none",
    "- reject: Persona uyumsuz, güvensiz iddia, düşük kalite",
    "",
    UNTRUSTED_DATA_NOTICE,
    "",
    "En iyi 3 taslağı sıralayarak döndür. Sadece JSON. Markdown yok.",
  ].join("\n");
}

export function buildJudgeUserPrompt(profile: AccountProfile, sourceInput: string, drafts: Draft[] | DraftWithAngle[]) {
  const competitorContext = getCompetitorPromptContext(profile.handle);

  return JSON.stringify({
    task: "Taslakları viral potansiyel ve hesap uyumuna göre puanla ve en iyi 3'ü sırala.",
    account: profile.xHandle,
    persona: profile.persona,
    sourceInput: wrapUntrustedData(sourceInput),
    competitorContext: { niche: competitorContext.nicheDescription },
    drafts,
    outputSchema: {
      rankedCandidates: [
        {
          content: "aynı içerik",
          mode: "aynı mod",
          angle: "hangi açı",
          hookStrength: 0,
          viralPotential: 0,
          accountFit: 0,
          turkishNaturalness: 0,
          noveltyScore: 0,
          risk: 0,
          sourceFaithfulness: 0,
          verdict: "approve | hold | reject",
          reason: "kısa Türkçe açıklama",
          payoff: "save | reply | follow | quote | profile_visit | none",
        },
      ],
      winnerIndex: 0,
      publishDecision: "queue | hold | reject",
    },
  });
}

// ─── Legacy compatibility shims ──────────────────────────────────────────────
// draft-pipeline.ts uses these for the judge call fallback

export function buildLegacyJudgeUserPrompt(profile: AccountProfile, sourceInput: string, drafts: Draft[]) {
  const competitorContext = getCompetitorPromptContext(profile.handle);

  return JSON.stringify({
    task: "Score drafts and choose the best candidate.",
    account: profile.xHandle,
    sourceInput,
    competitorContext,
    scoringCriteria: [
      "personaMatch",
      "turkishNaturalness",
      "hookStrength",
      "clarity",
      "viralPotential",
      "risk",
      "sourceFaithfulness",
    ],
    publishGate: {
      queue: "personaMatch >= 80, risk <= 35, sourceFaithfulness >= 70",
      hold: "uncertain source, weak Turkish tone, risky claim, or score ambiguity",
      reject: "tone mismatch, unsafe claim, invented fact, or low quality",
    },
    drafts,
    outputSchema: {
      drafts: [
        {
          content: "same content",
          mode: "same mode",
          personaMatch: 0,
          turkishNaturalness: 0,
          hookStrength: 0,
          clarity: 0,
          viralPotential: 0,
          risk: 0,
          sourceFaithfulness: 0,
          verdict: "approve | hold | reject",
          reason: "short Turkish reason",
        },
      ],
      winnerIndex: 0,
      publishDecision: "queue | hold | reject",
    },
  });
}
