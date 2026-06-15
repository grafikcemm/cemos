# 2026 Algoritma & Büyüme İstihbaratı — Operatör Özeti

Kaynak: 2026-06 derin araştırma raporu (X · Instagram · YouTube). Motorun
İŞLEDİĞİ kısımlar (pattern/negatif/eval/eşikler) `scripts/ingest-research.ts`
ile DB'de; bu dosya motorun işlemediği, operatörün (Cem) günlük kararlarında
kullanacağı kısımların özetidir. Güven seviyeleri rapordan korunmuştur.

> Genel uyarı: Üç platform da tam rank ağırlığı yayımlamıyor. Sayısal eşikler
> "platform gerçeği" değil **bootstrap kalibrasyonu** — 30-60 post verisi
> birikince kendi yüzdeliklerinle (p75/p25) güncelle.

## A. Platform algoritma sinyalleri (2026)

**X** [yüksek güven]
- For You ≈ 1500 aday/istek; ~yarısı ağ-dışı. Sıralama neural network; X artık
  "hiçbir sinyale statik ağırlık yok" diyor — 2023 ağırlık tabloları bayat.
- Gerçek **reply + repost** hâlâ en derin sinyal; coordinated engagement,
  pod, follow-churn = açık ceza + monetization amplification limiti riski.
- Dış link ağırlıklı postlar in-feed conversation'ı zayıflatır (link çöplüğü).

**Instagram** [yüksek güven]
- Tek algoritma yok; yüzey başına sinyal karışımı. Suggested posts: aktivite,
  bağlantılar, post bilgisi, hesap bilgisi, Threads aktivitesi.
- **Shares > saves > comments > likes** niyet derinliği (motor 4/5/2/1 zaten
  uyumlu). Reels'te share, carousel'de save baskın.
- Account Status + recommendation eligibility = non-follower reach ön koşulu.
- 2025-12'den beri Meta AI etkileşimleri kişiselleştirme sinyali; 2026-06
  "Your Algorithm" → konu kümeleri kullanıcı eliyle ayarlanabilir → açık topic
  etiketi ve semantik tutarlılık daha değerli.

**YouTube** [yüksek güven]
- Üç sepet: **appeal** (impressions+CTR), **engagement** (retention, AVD, APV,
  watch time), **satisfaction** (like/dislike, survey, dönüşlü izleme).
- "Audience follows the video, not the channel" — küçük kanal sıfırdan öneri
  alabilir. Thumbnail A/B kazananı **watch time share** ile seçilir (salt CTR değil).
- Shorts 2025-03'ten beri view sayımı kolay + `engaged views` ayrı; Shorts
  3 dakikaya kadar çıkabiliyor; Shorts açıklama linkleri tıklanamaz → funnel
  = related video köprüsü.

## C. Hook / format / zamanlama (TR)

**Hook kalıpları** [orta güven]
- grafikcem: `[Araç] iyi değil → [iş çıktısı] için en hızlı seçenek` ·
  `[Sert sayı] dakikada [çıktı]. Ama bir sorun var` · `[Fiyat] verip bunu
  almak mantıksız → eğer [koşul] yoksa`.
- maskulenkod: `Sorunun [dış düşman] değil → [iç sistem açığı]` · `[Davranış]
  küçük görünür. Bedeli statüdür` · `Erkekliği motivasyon sanırsan her
  pazartesi yeniden başlarsın`.

**Yapı**
- X thread: grafikcem 6-12 tweet, maskulenkod 7-14. İlk tweet tek başına
  çalışmalı; 2., 4. ve son tweet mini-payoff. Kapanış = kayıtlık ("Bunu teklif
  hazırlarken aç", "Zayıf güne sakla"), soru-CTA değil.
- IG carousel: 6-9 slide; slide başına TEK fikir; son slide özet/uygula.
- Bookmark sayıları artık herkese açık — kalite göstergesi; payout girdisi
  olduğu RESMEN söylenmedi [orta güven].

**TR posting pencereleri** [orta güven — test başlangıcı]
- X: Salı-Perşembe 10:00-17:00 + ikinci pencere 20:30-22:30.
- IG: Pzt 14-16, Salı 13-19, Çrş 12-21, Prş 12-14 + TR pratik 19:30-21:30.
- YouTube: long-form 17:00-20:00, Shorts 12-14 + 19-22 (resmî "en iyi saat" yok).

**Frekans önerisi** [operasyonel]
- grafikcem: X günde 1 ana post + 3-6 stratejik reply; IG haftada 3 carousel +
  2 Reels + günlük Stories; YT haftada 2-4 Shorts + 10-14 günde 1 long-form.
- maskulenkod: X günde 1 ana + 3-8 conversation reply; IG haftada 2 carousel +
  2 Reels; YT haftada 2 Shorts + ayda 2 long-form.

## E. 2025→2026 değişimleri

- Kısa-formun otomatik üstünlüğü bitti: IG Reels reach yıllık **-%35**, genel
  post reach -%31; carousel impressions/interactions'ta öne çıktı [orta güven].
- X: impressions hafif düşüş, replies + reposts artış, link clicks düşüş.
- YouTube: video başına views + comments artışı; uzun-form yeniden güçlü.
- **AI içerik**: platformlar ceza değil şeffaflık istiyor — Meta "AI info"
  etiketi, YouTube realistic-synthetic disclosure, X 2026-03'ten itibaren
  bazı kategorilerde disclosure'ı gelir kesintisine bağladı. grafikcem
  AI-görsel paylaşırken süreci/bağlamı görünür yap (zaten profile forbidden'a
  işlendi).

## G. Referans hesap havuzu (benchmark — düşük/orta güven, 1st-party analytics yok)

grafikcem için: @rowancheung (X, haber→karar-kuralı çevirisi), @levelsio (X,
açık sayı/build-in-public), @mattwolfe (YT, kriterli araç kıyası),
@satorigraphics (YT, hatayı ekranda gösterme), @barisozcan (YT, teknik konuyu
hikâyeye paketleme).
Çalınacak mekanik: haber değil **karar kuralı** yazmak; karşılaştırma
kriterini baştan ilan etmek; hatayı görsel olarak göstermek.

maskulenkod için: @hamza97 (YT, sistem-olarak-gelişim), @ChrisWillx (X,
quote-potential tek cümleler), @AlexHormozi (IG, maliyet/teşvik klipleri),
@RyanHoliday (YT, sakin tonla ağır konu), @DailyStoic (IG, poster-cümle).
Çalınacak mekanik: utandırmadan sorumluluğa çağırmak; tek cümlede çerçeve
derinliği; bir içerikte TEK ders.
Negatif sinyaller: kült tonu, aforizma fazlası, clip-farm hissi, bağlamsız bragging.

## J. Monetization & funnel

- **X (grafikcem)**: gelir = verified Home Timeline impressions; en iyi paket
  bookmark-worthy derin thread + Article karışımı. Bookmark dolaylı kalite
  göstergesi.
- **IG**: Reels keşif + DM/share üretir; carousel save + geri dönüş üretir.
  Satış zinciri: `Reel → Carousel → DM/link-in-bio`.
- **YouTube**: Shorts description linki tıklanamaz → funnel `Short → related
  video → long-form → ürün/hizmet`.
- **maskulenkod e-kitap**: dönüşümü taşıyan şey hot take değil, kaydedilen
  sistem içeriği (thread + carousel). Hot take üst-funnel dikkat işi.

## Motorda karşılığı olanlar (referans)

| Araştırma | Motor karşılığı |
|---|---|
| B pattern kütüphanesi (29) | `ViralPattern` (ingest script) + `pattern-extractor` katalogları |
| H negatif örnekler (12) | `TrainingExample label="bad"` + `account-profiles.forbidden` |
| I golden case'ler (10) | `EvalTest` + `npm run eval:run` |
| D eşikler | `ENGAGEMENT_HIGH_MIN_<HANDLE>` / `IG_ENGAGEMENT_*` env |
| F ytOutcome | `ytOwnPerformanceService` (`YT_OWN_CHANNEL_*` env ile aktive) |
