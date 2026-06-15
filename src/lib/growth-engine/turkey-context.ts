import type { AccountHandle } from "@/lib/accounts";

/**
 * Türkiye-stickiness katmanı.
 *
 * İçeriğin Türkiye'de tutması için iki şey gerekir:
 *  1. Doğal Türkçe — çeviri kokmayan, yerel deyiş ve ritim.
 *  2. Yerel bağlam — TR gündemi, kültürel referans, doğru zamanlama.
 *
 * Bu modül prompt'a enjekte edilen bir bağlam bloğu üretir. Hesap-agnostik
 * doğallık kuralları + hesap-bazlı gündem/zamanlama ipuçları.
 */

/** Tüm hesaplar için ortak TR doğallık kuralları (çeviri-kokusu engelleyici). */
const TR_NATURALNESS_RULES: string[] = [
  "Doğal, akıcı Türkçe yaz; çeviri kokan ('bu, ... olan bir şeydir') yapılar kullanma.",
  "Yerel deyiş ve günlük ritim kullan; resmi/yapay AI tonundan kaçın.",
  "İngilizce terimi yalnızca Türk kitlenin gerçekten kullandığı haliyle bırak (prompt, thread, transfer); gerisini Türkçeleştir.",
  "Kısaltma ve noktalama Türk X kullanımıyla uyumlu olsun; abartılı büyük harf/emoji yığını yok.",
];

/** Hesap-bazlı TR gündem + zamanlama bağlamı. */
const ACCOUNT_TR_CONTEXT: Record<AccountHandle, string[]> = {
  grafikcem: [
    "Kitle: Türk tasarımcı, freelancer ve founder'lar. Referans: Türkçe tech/AI gündemi (webrazzi, ShiftDelete), yerel ajans/freelance gerçekliği.",
    "Fiyatları ve maliyeti TL bağlamında da düşün (abonelik $ ama 'TL'ye vuran fatura' Türk kitlede daha çok tutar).",
    "Global AI haberini Türk yaratıcının iş akışına indir: 'bu bizde şuna yarar' köprüsü kur.",
  ],
  maskulenkod: [
    "Kitle: Türk genç-orta yaş erkek. Referans: yerel ilişki/statü/iş gerçekliği; soyut Batılı redpill jargonu değil.",
    "Türk sosyal dinamiğine özgü gözlem kullan (mahalle/aile/iş baskısı, sosyal statü algısı) ama klişeye düşme.",
    "Akşam saatleri (20:00-24:00 TSİ) bu kitlede yüksek etkileşim; içerik o ritimde 'oturup okunacak' yoğunlukta olsun.",
  ],

};

/**
 * Prompt'a enjekte edilecek TR-stickiness bağlam bloğunu üretir.
 * draft-generator buildDraftGenerationPrompt içinde kullanılır.
 */
export function buildTurkeyContext(handle: string): string {
  const accountCtx = ACCOUNT_TR_CONTEXT[handle as AccountHandle] ?? [];
  const lines = [
    "TÜRKİYE BAĞLAMI (içeriğin Türkiye'de tutması için kritik):",
    ...TR_NATURALNESS_RULES.map((r) => `- ${r}`),
    ...accountCtx.map((r) => `- ${r}`),
  ];
  return lines.join("\n");
}

/** Hesap-bazlı önerilen yayın zamanı ipucu (UI/zamanlama için, Europe/Istanbul). */
export function getPostingTimeHint(handle: string): string {
  switch (handle as AccountHandle) {
    case "maskulenkod":
      return "Akşam 20:00-24:00 TSİ (oturup okuma/kaydetme penceresi).";
    case "grafikcem":
      return "Hafta içi öğle (12:00-14:00) ve akşam (19:00-22:00) TSİ; thread'ler akşam.";
    default:
      return "Hafta içi öğle ve akşam TSİ.";
  }
}
