# XPatla Rakip Analizi

Tarih: 20 Mayis 2026  
Kapsam: Oturum acik dashboard uzerinden kara kutu urun analizi, gorunen frontend/API izleri, XAgent akislari, fiyat/limit sinyalleri ve Xagent icin uygulanabilir cikarimlar.

## 1. Kisa Ozet

XPatla tek bir "AI tweet yazici" degil; X uzerinde buyume icin paketlenmis bir operasyon sistemi gibi konumlanmis. Ana kolonlar:

- Koc / Growth OS egitim modulu
- Manuel icerik uretimi: tweet, thread, alinti, yanit, makale, rehber, bildirim
- XAgent: kaynak takip, viral firsat tarama, draft uretme, onay/zamanlama/yayinlama
- DM Agent: Max plana kapali, inbox/persona/yanit yonetimi vaadi
- Market: kredi karsiligi kampanya/etkilesim ekonomisi
- Circle / Topluluk / Referral: SaaS buyume ve retention mekanikleri
- Public API ve Claude MCP connector

Senin kisisel Xagent icin en degerli cekirdek: XAgent kaynak tarama + stil profili + draft kuyruğu + manuel onay + planlama. Market, Circle, referral, genis fiyatlandirma, ekip/enterprise ve topluluk katmanlari kisisel kurulum icin ikincil veya gereksiz.

## 2. Gozlenen Teknoloji ve Entegrasyonlar

Kesin gorunenler:

- Frontend: Next.js 16.2.4, Turbopack chunk yapisi, React.
- Auth: Clerk. Giris `accounts.xpatla.com` ve script `clerk.xpatla.com/npm/@clerk/clerk-js@5`.
- Billing: Stripe izleri ve `/api/billing/*` endpoint ailesi.
- Analytics: Google Tag Manager `G-F2XN9J43KB`, Cloudflare Insights.
- Chat widget: `solviachat.com/widget.js`.
- X/Twitter: X OAuth, X profil/linkleri, X posting connect/disconnect, tweet fetch/post endpoints.
- Telegram: `t.me/xpatla_bot` ile topluluk join token akisi.
- MCP: `https://xpatla.com/mcp`, OAuth 2.0 + PKCE, JWT RS256, 2 saat access token TTL, 24 saat session TTL.
- Public API: `https://xpatla.com/api/v1`, Bearer token, 30/dk rate limit.

Gorunen ama dikkatli yorumlanmasi gerekenler:

- LLM saglayicisi client tarafindan net gorunmuyor. Frontend kodunda OpenAI/Gemini saglayici izi yok. "Claude" cok kez MCP connector ve dokuman ornekleri olarak geciyor; bu, uretimde Anthropic kullandiklarini kanitlamaz.
- Supabase kelimesi tek bir ortak uretim masasi metninde geciyor; aktif database altyapisi oldugunu kanitlamaz.

## 3. XAgent Calisma Mantigi

Temel model:

1. Kullanici X hesabini bagliyor.
2. Stil profili seciliyor: uretim bu hesabin gecmis tweet tarzina gore yapiliyor.
3. Izlenen kaynak hesaplar ekleniyor.
4. Kaynaklardan son postlar cekiliyor.
5. Like/RT esigini gecenler akis havuzuna dusuyor.
6. Kullanici tweet / quote / reply tipinde draft urettiriyor veya otomasyon bunu yapiyor.
7. Draft "onayda" durumuna geliyor.
8. Kullanici duzenliyor, onayliyor, zamanliyor veya hemen gonderiyor.
9. Yayinlanmis Agent postlari Market Boost icin aday oluyor.

Gozlenen durum sayaclari:

- Uretim
- Yeni
- Planli
- Yayinda
- Red
- Akis

Gozlenen XAgent kilidi:

- Otomasyon baslatmak icin en az 3 aktif izlenen kaynak gerekli.
- Test hesabinda 1/3 kaynak oldugu icin otomasyon butonu disabled idi.

## 4. XAgent Ayarlari

Kurulum sihirbazi 8 adim:

- XAgent'a hosgeldin
- X hesabini bagla
- Hedef hesaplari ekle
- Stil profilini sec
- Tarama ayarlari
- Paylasim ayarlari
- Calisma modu
- Ilk taramayi baslat

Agent ayarlari:

- Tarama basi draft: 1, 3, 5, 10
- Format: Micro, Punch, Spark, Storm
- Dil: Oto, TR, EN
- Viral aci: Dengeli, Iddiali, Deadpan, Leak, X-Ray
- Medya politikasi:
  - Gorselsiz uret ve paylas
  - Video linklerini kapat

Tarama paneli:

- Hesap basina post: 3, 5, 10, 20
- Maks post yasi: 3s, 6s, 12s, 24s, 48s
- Manuel tarama maliyeti: aktif kaynak x post sayisi x agent_fetch

Otomasyon paneli:

- Otomatik tarama araligi: 5dk, 15dk, 30dk, 60dk, 120dk
- Post ritmi: 15dk, 30dk, 60dk, 120dk, 240dk
- Gunluk maksimum: 3, 5, 10, 15, 25
- Takvim stratejisi: Aralik, Mesai, Manuel slot
- Sessiz saatler: baslangic/bitis saatleri

Kaynak ayarlari:

- Rol/tip: hepsi, tweet, quote, reply
- Esik presetleri:
  - Hafif: 10 like, 2 RT
  - Standart: 30 like, 5 RT
  - Secici: 100 like, 20 RT
  - Siki: 250 like, 50 RT
- Manuel minimum like / minimum retweet girisi
- Kaynagi duraklat, X'te ac, kaldir

## 5. Test Edilen Draft Akisi

Bir akis postundan "uret" calistirildi.

Gozlem:

- Uretim sirasinda satir "uretiliyor" durumuna gecti.
- Yaklasik 1 dakika icinde draft olustu.
- Kredi 1.175'ten 1.160'a dustu, yani Punch tweet draft maliyeti 15 kredi.
- Akis sayaci 5'ten 4'e dustu.
- Yeni/uretim sayaclari 1 oldu.
- Draft status: onayda.
- Draft tip: tweet.
- Format: punch.
- Karakter sayaci: 233/280.

Draft aksiyonlari:

- gizle
- medyayi degistir
- arastir
- medyasiz
- sil
- zamanla
- simdi gonder
- duzenle / detay

Editor:

- Textarea icinde draft duzenlenebiliyor.
- Butonlar: onayla, planla, editoru gizle, simdi gonder, reddet.

Planlama:

- Manuel tarih/saat inputlari var.
- Hizli slotlar: 15 dk, 30 dk, 1 saat, 2 saat, 4 saat, sonraki mesai.
- "Random saat degil; sectigin kadar sure sonrasini hesaplar" notu var.

Kalite notu:

- Uretilen draftta dilsel kalite sorunu gozlemlendi: "N şu" gibi bozuk bir ifade uretildi.
- Bu, otomatik kalite kontrol / grammar pass / final lint adiminin eksik oldugunu dusunduruyor.

## 6. Gorunen API Endpoint Aileleri

XAgent:

- `GET /api/xagent/schedule?username=...`
- `PUT /api/xagent/schedule`
- `POST /api/xagent/schedule/toggle`
- `POST /api/xagent/schedule/reset`
- `POST /api/xagent/run-once`
- `GET/POST /api/xagent/sources`
- `PATCH/DELETE /api/xagent/sources/{id}`
- `POST /api/xagent/sources/refresh-profile`
- `GET /api/xagent/queue?...`
- `PATCH /api/xagent/queue/{id}`
- `POST /api/xagent/queue/{id}/generate`
- `POST /api/xagent/queue/{id}/schedule`
- `POST /api/xagent/queue/{id}/post-now`
- `POST /api/xagent/queue/{id}/media-search`
- `GET /api/xagent/growth/status?username=...`
- `POST /api/xagent/growth/generate`
- `POST /api/xagent/growth/claim`
- `POST /api/xagent/growth/repair`

Twitter/X:

- `GET /api/twitter/drafts`
- `POST /api/twitter/drafts/create`
- `POST /api/twitter/drafts/edit`
- `POST /api/twitter/post`
- `POST /api/twitter/post-thread`
- `GET /api/twitter/tweet?id=...`
- `GET /api/twitter/tweet?url=...`

DM Agent:

- `GET /api/dm/inbox?username=...`
- `GET /api/dm/conversation/...`
- `POST /api/dm/draft`
- `POST /api/dm/send`
- `GET/POST /api/dm/personas`
- `GET/PATCH/DELETE /api/dm/personas/{id}`
- `POST /api/dm/personas/{id}/knowledge`
- `POST /api/dm/personas/{id}/knowledge/import-url`
- `POST /api/dm/personas/{id}/test`
- `GET/POST /api/dm/strategy`

Public API v1:

- `POST /api/v1/tweets/generate`
- `POST /api/v1/quotes/generate`
- `POST /api/v1/replies/generate`
- `POST /api/v1/threads/generate`
- `GET /api/v1/credits/balance`
- `GET /api/v1/accounts`
- `GET /api/v1/style/{username}`
- `GET /api/v1/topics/suggest`
- `POST /api/v1/post/tweet`
- `GET /api/v1/usage`
- `GET /api/v1/x/profile/{username}`
- `GET /api/v1/x/tweets/{username}`
- `GET /api/v1/x/tweet/{tweet_id}`
- API key yonetimi: `/api/v1/keys`, regenerate/delete.

Diger endpoint aileleri:

- Billing: checkout, portal, status, packages, credits purchase, pause/downgrade.
- Campaign/Market: campaigns active/create/my/stats/approve/participate/end.
- Referral: generate-code, validate, stats, history, redeem-credits.
- Team: members, invite, usage, approvals.
- Telegram: status, members, regenerate-token.
- Reddit: analyze-subreddit, fetch-post.
- Onboarding/coach: onboarding analyze/sync, coach progress.

## 7. Kredi Maliyetleri

Frontend cost tablosu:

- tweet:
  - micro: 15
  - punch: 15
  - spark: 20
  - classic: 20
  - storm: 25
  - longform: 25
  - thunder: 30
  - mega: 30
- thread: 100
- quote: 25
- reply: 25
- article: 150
- topic: 20
- style refresh: 10
- bookmark refresh: 30
- account onboard: 150
- image: 4
- scrape profile: 1
- scrape tweets: 2
- scrape tweet: 1
- post tweet: 2
- agent_fetch: 5
- agent_generate:
  - micro: 15
  - punch: 15
  - spark: 20
  - storm: 25
- agent_post: 10
- agent_chat: 5
- agent_rewrite: 20
- DM:
  - inbox refresh 10: 1
  - inbox refresh 20: 2
  - target refresh: 2
  - draft single: 3
  - strategy tree: 5
  - send: 3
  - persona test: 2

Not: UI API dokumaninda bazi yerlerde "3-10 kredi" yazar, fakat dashboard ve frontend cost tablosunda yeni maliyetler 15+ seviyesinde. Dokuman/gercek maliyet uyumsuzlugu var.

## 8. Public API ve MCP

API Keys ekrani:

- Base URL: `xpatla.com/api/v1`
- Auth: Bearer Token
- Rate limit: 30/dk
- API key sadece bir kez gosteriliyor.
- Aktif key sayaci var.
- Format bazli maliyet tablosu var.
- Parametreler: `twitter_username`, `topic`, `format`, `count`, `persona`, `tone`, `language`, `apex_mode`, `generate_image`, `image_style`.
- Response alanlari: `tweets[].text`, `char_count`, `quality_score`, `hook_score`, `generated_images`, `credits_used`, `credits_remaining`, `generation_id`.

MCP ekrani:

- Claude connector odakli.
- Server URL: `https://xpatla.com/mcp`
- Auth: OAuth 2.0 + PKCE
- Token: JWT RS256, 2 saat TTL
- OIDC discovery: `/mcp-auth/.well-known/openid-configuration`
- JWKS: `/mcp-auth/.well-known/jwks.json`
- 13 tool + 3 resource + 4 prompt
- Uyumlu oldugu soylenen yuzeyler: claude.ai, Claude Desktop, Claude Code

MCP tool listesi:

- `xpatla_generate_tweets`
- `xpatla_generate_quotes`
- `xpatla_generate_replies`
- `xpatla_generate_thread`
- `xpatla_suggest_topics`
- `xpatla_analyze_profile`
- `xpatla_get_style_profile`
- `xpatla_list_accounts`
- `xpatla_check_credits`
- `xpatla_fetch_tweets`
- `xpatla_get_analytics`
- `xpatla_manage_drafts`
- `xpatla_post_to_x`

## 9. Diger Urun Modulleri

Koc:

- X Growth OS egitim sistemi.
- 61 ders/ogeye bolunmus.
- Kategoriler: X Growth OS, Sifirdan Zirveye, Hizli Kazanimlar, Platform Rehberleri, Icerik Formatlari, Temel Bilgiler, Buyume Stratejileri, Hook Formulleri, Zamanlama, Profil Optimizasyonu, Kampanya Sistemi, Hesap Ayarlari, Yasakli Kelimeler.
- "Yenile 10 kr" ile radar/analiz refresh var.

Uret:

- Manuel uretim yuzeyi.
- Modlar: Tweet, Thread, Alinti, Yanit, Makale, Rehber, Bildirim.
- Kaynak tipleri: Serbest, Bookmark, Satis.
- Formatlar: Micro, Punch, Spark, Storm, Thunder.
- Dil ve aci secicileri.

DM Agent:

- Pro hesapta kilitli, Max plan istiyor.
- Vaad edilenler: inbox okuma, persona hafizasi, onayli yanit yonetimi.
- Outreach kampanyalari launch guvenligi icin kapali tutuluyor.

Circle:

- Kullanici eslestirme / mini growth crew.
- Basvuru alanlari: X username, dil, nis, aktiflik, dashboard hesabi, hedef.
- Spam degil gercek yorum/feedback/check-in kulturu vurgusu.

Market:

- Kredi karsiligi kampanya/etkilesim sistemi.
- Kampanya olustur, kampanyalar, istatistik, rehber, algo, kredi tablari.
- XAgent icinde Market Boost: sadece X'te yayinlanmis Agent postlarina kampanya acar.
- Minimum 20 kredi/aksiyon, minimum 100 kredi harcama sinyali.

Paylasimlar:

- Profil + takvim gorunumu.
- Bugun ve sonraki gunler icin slotlar.
- Kuyrukta, zamanli, gonderildi, basari metrikleri.

Referral:

- Viral referral sistemi.
- Ref kodu/linki, Stripe kupon, bonus kredi, referral odul tierlari.
- Kullaniciya cold DM stratejileri bile veriyor.

Topluluk:

- Telegram grubu, Deadint toplulugu.
- Telegram bot tokenli join linki.

Rehber:

- Yardim merkezi ve changelog.
- Bazi i18n anahtarlari cevrilmeden gorunuyor; kalite borcu var.

Settings:

- Dil secimi.
- Bagli hesaplar ve X OAuth durumlari.
- Stil profilini yeniden olusturma: Pro icin ayda 10 hak.
- Hikaye bankasi: 0/20.
- Urunlerim: 0/10.
- XPatla ID ve kredi hediye etme.
- Abonelik ve hesap yonetimi.

## 10. UX / Urun Degerlendirmesi

Gucu:

- Tek ekranda kaynak, akis, draft, ayar, maliyet ve otomasyon gorunuyor.
- Kullaniciya maliyeti surekli gosteriyor.
- XAgent akisi net: tara, uret, onayla, planla/gonder.
- Kredi sistemi her ozellige guzel baglanmis.
- MCP/API ekrani ileri seviye kullanici icin guclu farklilasiyor.
- Preset yaklasimi iyi: format, viral aci, dil, kaynak esigi, schedule slotlari.
- Onboarding wizard sadece ogretmiyor, domain modelini anlatiyor.

Zayifliklar:

- Arayuz cok kalabalik; kisisel kullanici icin gorsel yuk yuksek.
- Onboarding/popup/banner cok fazla ayni anda cikiyor.
- Uretim sirasinda sure/ETA yok; uzun beklemede kullanici tedirgin olur.
- Draft kalitesinde grammar/final lint eksigi var.
- Bazi rehber metinleri i18n key olarak gorunuyor.
- API dokumani ile cost tablosu arasinda uyumsuzluk var.
- Ayarlar butonu, profil secici, agent ayarlari ve global ayarlar sinirlari karisik.
- SaaS growth modulleri ana urun akisini sisiriyor.

## 11. Xagent Icin Oncelikli Yol Haritasi

Hemen yap:

- Kaynak hesap ekleme ve rol secimi: tweet / quote / reply / hepsi.
- Kaynak bazli esik: min like, min RT, presetler.
- Manuel tarama: kaynak x post sayisi maliyeti ve son tarama zamani.
- Akis havuzu: bulunan postlar, metrikler, X linki, uret/quote/reply aksiyonlari.
- Stil profili: kendi hesabindan stil cikarimi, dil/ton/uzunluk.
- Draft kuyrugu: yeni, onayda, planli, yayinlandi, red.
- Draft editor: metin duzenleme, karakter sayaci, onayla, reddet, planla.
- Planlama: manuel tarih/saat + hizli slotlar.
- Kredi/maliyet gostergesi veya kisisel surumde en azindan islem maliyeti logu.
- Hata/timeout/ETA: uretim basladi, devam ediyor, tamamlandi, basarisiz oldu.

Sonra yap:

- Otomatik tarama araligi.
- Sessiz saatler.
- Gunluk post limiti.
- Mesai/slot stratejisi.
- Medya politikasi.
- Medya arama/degerlendirme.
- Growth bonus veya aylik uretim hakki.
- API endpointleri.
- MCP connector.

Kisisel kullanim icin muhtemelen gereksiz:

- Referral sistemi.
- Circle eslestirme.
- Market kampanya ekonomisi.
- Stripe fiyatlandirma/plan matrisi.
- Telegram topluluk join akisi.
- Team/enterprise.
- Public API key yonetimi, eger sadece kendi otomasyonun kullanacaksa.
- DM Agent, outreach hedefin yoksa.

## 12. Xagent Icin Teknik Tasarim Notlari

Onerilen veri modeli:

- `accounts`: X hesaplari, OAuth durumu, stil profili durumu.
- `style_profiles`: dil, formalite, emoji, lowercase, uzunluk, konu vektorleri, ornek postlar.
- `sources`: username, role, enabled, min_likes, min_retweets, priority, last_scanned_at.
- `source_posts`: tweet_id, source_id, text, metrics, posted_at, scanned_at, media, status.
- `agent_queue`: source_post_id, generated_text, intent, format, status, scheduled_at, posted_tweet_id.
- `agent_schedule`: account_id, enabled, scan_interval, post_interval, daily_limit, quiet_start/end, calendar_strategy.
- `credit_ledger` veya `usage_log`: islem tipi, maliyet, sonuc, hata.

Onerilen servisler:

- X OAuth/posting service.
- Tweet fetcher/scraper service.
- Source scanner.
- Candidate scorer.
- Style profiler.
- Draft generator.
- Draft linter/quality pass.
- Scheduler/worker.
- Publisher.
- Usage/credit tracker.

Kritik kalite farki:

- Draft uretiminden sonra mutlaka "final polish / typo guard" calistir.
- Turkce metin icin karakter, anlatim bozuklugu, anlamsiz parca, yarim cumle ve link temizligi kontrolu koy.
- XPatla'nin yakalanan zayifligi burada: iyi fikirden sonra bozuk bir cumle cikabiliyor.

## 13. Rekabet Firsatlari

XPatla'nin kompleksligi senin icin firsat:

- Daha sade, kisisel, hizli XAgent paneli.
- Daha net "neden bu post secildi?" aciklamasi.
- Daha guvenilir kalite kontrol.
- Uretim sirasinda acik progress: kaynak okundu, stil uygulandi, draft yaziliyor, kalite kontrol, hazir.
- Gereksiz SaaS modullerini cikartip gercek is akisini hizlandirma.
- "Benim hesabim icin en iyi 3 firsat" gibi karar destek katmani.
- Drafti otomatik degil, yardimci pilot gibi sunmak.

En guclu MVP:

1. X hesabini bagla.
2. 3-10 kaynak ekle.
3. Manuel tara.
4. Viral adaylari goster.
5. Tek tikla tweet/quote/reply draft uret.
6. Stil + kalite kontrol uygula.
7. Duzenle ve zamanla.

Bu MVP, XPatla'nin en yararli cekirdegini verir; Circle/Market/Referral olmadan da deger uretir.

