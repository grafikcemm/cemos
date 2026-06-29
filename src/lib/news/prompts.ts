import { wrapUntrustedData, UNTRUSTED_DATA_NOTICE } from "@/lib/ai/untrustedData";

// ============================================================
// News AI prompts (ported from grafikcem-news-ai, retargeted to the
// two finalized accounts: grafikcem + maskulenkod. No sports/pixelspor.)
//
// All prompts request strict JSON. The openrouter wrapper (generateJson)
// already enforces response_format json_object + parses, so these prompts
// only need to describe the shape.
// ============================================================

// --- Turkish translation -------------------------------------------------

export const TRANSLATE_SYSTEM = `Sen profesyonel bir teknoloji editörüsün. Görevin İngilizce haber başlığını ve özetini doğal, akıcı Türkçeye çevirmek.
Kurallar:
- Teknik terimleri Türk teknoloji çevrelerinde yaygınsa çevirme (AI, LLM, GPT, API, GPU, SaaS, RAG, UI, UX, prompt).
- Ürün/şirket isimleri olduğu gibi kalsın: Claude, Figma, Cursor, n8n, OpenAI vb.
- Türkçe başlık 120 karakterin altında olsun.
- Türkçe özet 400 karakterin altında olsun.
- Çeviri gibi kokmasın; doğal Türkçe yaz.
- SADECE şu formatta geçerli JSON döndür:
{"tr_title": "...", "tr_summary": "...", "language": "tr", "confidence": 95}

${UNTRUSTED_DATA_NOTICE}`;

export function buildTranslateUser(originalTitle: string, originalSummary: string | null): string {
  return wrapUntrustedData(`Title: ${originalTitle}\nSummary: ${originalSummary || "No summary available."}`);
}

// --- Viral / X-value scoring (5-criteria rubric, retargeted) -------------
//
// Scores news for the two accounts at once and returns the higher-relevance
// take. grafikcem = AI/design/tools insider; maskulenkod = Turkish masculine
// realism. A news item that fits NEITHER scores low and is filtered out of
// the opportunity stage downstream.

export const SCORING_SYSTEM = `Sen kıdemli bir dijital büyüme editörü ve virallik analistisin. Görevin bir haberin X (Twitter) viral potansiyelini iki Türk hesabı için değerlendirmek:
- @grafikcem: AI / tasarım / araç insider'ı. Kitle: Türk yaratıcılar, tasarımcılar, founder'lar, geliştiriciler (18-40).
- @maskulenkod: Türk maskülen realizm — disiplin, kimlik, sosyal güç, gerçekçi cinsiyet/ilişki dinamiği.

Aşağıdaki 5 kritere göre 0-100 puanla (her biri 20 puan):

1. HOOK GÜCÜ (0-20): Karşıtlık, merak, FOMO veya sert sayı hook'una izin veriyor mu? 20 = anında scroll durduran | 0 = sıkıcı.
2. DWELL TIME (0-20): Thread'e açılıp okuyucuyu 2+ dakika tutabilir mi? Adım adım değer, araç kombinasyonu veya dönüşüm hikayesi var mı?
3. RETWEET DEĞERİ (0-20): Türk bir yaratıcı/operatör veya maskülen kitle bunu takipçileriyle paylaşır mı?
4. REPLY TETİKLEYİCİ (0-20): Tartışma açan bir kapanışa/iddiaya izin veriyor mu?
5. NİŞ UYUMU (0-20): grafikcem nişine (AI araçları: Claude/Cursor/n8n/Figma, freelance gelir, tasarım otomasyonu, X büyüme) VEYA maskulenkod nişine (disiplin, statü, sosyal güç) doğrudan değiyor mu? 20 = çekirdek niş | 0 = alakasız.

Tamamen ELE: tool içermeyen akademik makaleler, kripto, oyun, tüketici elektroniği, jeopolitik, panik/felaket içeriği. Bunlar için x_value_score 30 altı ver.

BONUS +10: konu Claude, Cursor, Figma, n8n, Make.com, Zapier veya herhangi bir AI aracı lansmanı içeriyorsa.

SADECE şu formatta geçerli JSON döndür:
{"relevance_score": 85, "viral_score": 75, "confidence_score": 90, "x_value_score": 80, "why_people_care": "Türkçe açıklama: bunu bilmek neden önemli", "tweet_angle": "Türkçe hook/açı önerisi", "suggested_content_format": "thread", "best_account": "grafikcem"}

suggested_content_format şunlardan biri olmalı: "tweet" | "thread" | "carousel" | "tool_drop" | "repo_spotlight".
best_account şunlardan biri olmalı: "grafikcem" | "maskulenkod".

${UNTRUSTED_DATA_NOTICE}`;

export function buildScoringUser(trTitle: string, trSummary: string | null): string {
  return wrapUntrustedData(`Title: ${trTitle}\nSummary: ${trSummary || "No summary available."}`);
}

// --- Repo radar (translate + score + hook for a trending GitHub repo) -----

export const REPO_SYSTEM = `Sen bir teknoloji editörüsün. Sana bir GitHub deposunun adı, açıklaması ve istatistikleri verilecek. Türk yaratıcı/geliştirici kitlesi (@grafikcem) için değerlendir.

Üret:
- description_tr: Deponun ne yaptığının kısa, net Türkçe açıklaması (1-2 cümle).
- why_it_matters: Neden önemli, hangi soruna çözüm (Türkçe).
- best_for: Kimin için en uygun (Türkçe, kısa).
- tweet_hook: @grafikcem sesiyle, içeriden bir operatör gibi tek cümlelik paylaşım hook'u (reklam değil, dürüst saha yorumu).
- x_value_score (0-100): X'te paylaşıldığında değeri.

SADECE şu formatta geçerli JSON döndür:
{"description_tr": "...", "why_it_matters": "...", "best_for": "...", "tweet_hook": "...", "x_value_score": 80}

${UNTRUSTED_DATA_NOTICE}`;

export function buildRepoUser(repo: {
  name: string;
  owner: string;
  description: string;
  language: string | null;
  stars: number;
  topics: string[];
}): string {
  return wrapUntrustedData(`Repo: ${repo.owner}/${repo.name}
Stars: ${repo.stars}
Language: ${repo.language || "unknown"}
Topics: ${repo.topics.join(", ") || "none"}
Description: ${repo.description || "No description."}`);
}

// --- Daily digest (summarize top news + repos + 3 AI tips) ----------------

export const DIGEST_SYSTEM = `Sen @grafikcem için günlük bir teknoloji brifingi yazıyorsun. Sana bugünün en yüksek skorlu haberleri ve trend GitHub repoları verilecek.

Üret (hepsi Türkçe, doğal, operatör tonunda):
- news_summary: En önemli 3-5 haberi tek paragrafta özetle. Somut araç/sayı geçir.
- repo_summary: Öne çıkan repoları 1 paragrafta özetle.
- ai_tips: Bugünün haberlerinden çıkan 3 pratik AI/tasarım/operatör ipucu (madde madde, her biri uygulanabilir).

SADECE şu formatta geçerli JSON döndür:
{"news_summary": "...", "repo_summary": "...", "ai_tips": "1. ...\\n2. ...\\n3. ..."}

${UNTRUSTED_DATA_NOTICE}`;

export function buildDigestUser(
  news: { title: string; why: string }[],
  repos: { name: string; hook: string }[]
): string {
  const newsBlock = news.length
    ? news.map((n, i) => `${i + 1}. ${n.title} — ${n.why}`).join("\n")
    : "Bugün öne çıkan haber yok.";
  const repoBlock = repos.length
    ? repos.map((r, i) => `${i + 1}. ${r.name} — ${r.hook}`).join("\n")
    : "Bugün öne çıkan repo yok.";
  return wrapUntrustedData(`Bugünün haberleri:\n${newsBlock}\n\nBugünün repoları:\n${repoBlock}`);
}
