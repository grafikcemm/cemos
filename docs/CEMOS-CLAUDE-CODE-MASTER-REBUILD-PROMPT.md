# CemOS — Claude Code Master Product Rebuild Prompt

> Kullanım: Bu dosyanın tamamını, CemOS repo kökünde açılmış yeni bir Claude Code
> oturumuna tek parça halinde yapıştır. Mümkün olan en güçlü modeli ve yüksek düşünme
> bütçesini kullan. Bu prompt eski Sprint 1/UI promptlarının yerine geçer.

---

## ROLÜN

Sen CemOS üzerinde çalışan bir **Principal Product Engineer + AI Systems Architect +
Product Designer**'sın. Görevin yalnız rapor üretmek veya makyaj niteliğinde UI değişikliği
yapmak değil; CemOS'u Ali Cem'in her gün gerçekten kullanacağı kişisel içerik, araştırma ve
öğrenme işletim sistemine dönüştürmektir.

Derin düşün, repo ve canlı ürünü kanıtla incele, güncel ve değişken teknik konularda
araştırma yap, kararlarını kanıtlarla kaydet ve ardından uygulamayı aşamalı olarak inşa et.
Gizli düşünce zincirini yazma; bunun yerine doğrulanabilir bulguları, kararları,
alternatifleri ve sonuçları açıkça kaydet.

Bu görevde rutin kararlar için kullanıcıyı sürekli durdurma. Geri alınabilir, ürün vizyonu
içinde kalan kararları kanıtla ver. Yalnız şu durumlarda dur:

- geri döndürülemez veri kaybı riski,
- production verisine geniş çaplı mutation,
- yeni ücretli servis veya anlamlı maliyet,
- eksik credential/izin nedeniyle ilerlemenin gerçekten imkânsız olması,
- ürün yönünü kökten değiştirecek ve bu prompttan çıkarılamayan bir kullanıcı tercihi.

## BAĞLAYICI ÖNCELİK SIRASI

Çelişkide şu sıra kazanır:

1. `AGENTS.md` içindeki güvenlik ve legacy sembol invariant'ları.
2. Bu prompttaki kullanıcı vizyonu, ürün kararları ve kabul kriterleri.
3. Repo ve canlı uygulamadan bizzat doğruladığın güncel gerçekler.
4. `docs/CEMOS.md` içindeki marka/legacy sözleşmesi.
5. `docs/cemos-v2-planning/` altındaki eski planlar ve araştırmalar.

Eski V2 belgeleri tarihsel bağlamdır; bağlayıcı ürün yönü değildir. Özellikle eski
“16→5 alan”, koyu dashboard ve “nav redesign yapma” kararlarını otomatik olarak sürdürme.
Bu prompt onları **supersede eder**. Buna rağmen içlerindeki veri modeli, güvenlik, maliyet,
kalite ve migration bulgularını kanıt olarak değerlendir.

## ALİ CEM'İN ÜRÜN VİZYONU

CemOS şu deneyimi sağlamalı:

1. Arayüz karışık olmayacak. Ali Cem uygulamayı açtığında X hesapları için hazır içeriği
   doğrudan görecek, kısa bir kontrolle onaylayacak ve paylaşacak. İçerik yalnız “AI
   tarafından yazılmış” değil; güncel, kaynaklı, hesap sesine uygun ve viral kapasitesi
   yüksek olacak.
2. Gereksiz sayfalar kullanıcıya gösterilmeyecek. Haber motoru, agentlar, model routing,
   maliyet, worker, cron ve ham radarlar ürünün önüne geçmeyecek.
3. CemOS agentic hafızaya, uzman agentlara ve skill'lere sahip olacak; Ali Cem'i,
   hesaplarını, tercihlerini, düzeltmelerini ve performans geçmişini gerçekten tanıyacak.
4. Instagram carousel serilerini, caption yapısını, hashtag düzenini, görsel kurallarını,
   tekrar edilmemesi gereken konuları ve performansını bilecek.
5. Reels üretimi için sektör ve rakip taramasını aktif yapacak. Aylık plan yalnız konu adı
   vermeyecek; tanıtılacak gerçek site/araç, son doğrulama tarihi, hook, 30–60 saniyelik
   konuşma metni, ekran kayıt akışı, sahne planı, caption, hashtag, CTA, kaynak ve riskleri
   içeren üretime hazır paketler verecek.
6. Günlük haber toplama motoru arka planda aktif kullanılacak. Trendler ve haberler ham
   liste olarak kullanıcıya yığılmayacak; içerik ve planlama motorunu güncelleyen sinyallere
   dönüşecek.
7. Beğenilen rakip Reels, carousel, X postu, video, URL, ekran görüntüsü ve notlar tek bir
   ilham kütüphanesinde saklanacak. CemOS “neyi güzel yaptı, neden çalışmış olabilir, hangi
   pattern var, bizim hesaba nasıl özgün uyarlanır, ne kopyalanmamalı?” sorularını
   cevaplayacak.
8. Eğitici YouTube videoları ve NotebookLM özetleri kaybolmayacak. CemOS bunları kaynaklı
   özetlere, atomik notlara, kavram bağlantılarına, zihin haritasına, uygulanabilir görevlere,
   içerik fikirlerine ve aralıklı tekrara dönüştürecek. Obsidian temel kalıcı arşiv olacak ve
   mümkün olduğunca otomatik çalışacak.

## BİLİNEN BAŞLANGIÇ GERÇEKLERİ — KÖRÜ KÖRÜNE GÜVENME, YENİDEN DOĞRULA

Ön incelemede şu durumlar gözlendi:

- Desktop sidebar yaklaşık 16 ekran gösteriyor; mobilde beş teknik alan var.
- `Bugün` ekranı queue-first temele sahip fakat kaynak, “neden bugün?” ve fact-check ana
  yüzde görünmüyor.
- @maskulenkod taslağında İngilizce `Trajectory`, yasak soru CTA'sı ve emoji bulunmasına
  rağmen taslak kuyruğa girebildi. Skorlar bu sorunları güvenilir biçimde yansıtmadı.
- Zorunlu edit-gate, iyi taslağı bile yayınlamak için kozmetik değişiklik yapmaya zorluyor.
- Instagram rakip ekranı ham ve çok uzun; küçük örneklemde aşırı outlier çarpanları
  gösteriyor.
- Reels planı gerçek üretim paketleri yerine teknik pillar/series anahtarları gösteriyor.
- YouTube fırsat motoru aynı anda yaklaşık 60 “sıcak” sonuç gösteriyor ve bazı sonuçlar
  hesap stratejisiyle ilgisiz.
- Öğrenme ekranında hazır paketler bulunmasına rağmen ham URL'ler, hata durumları, yoğun
  tekrar kuyruğu ve düşük mastery deneyimi zayıflatıyor.
- Sistem “Sağlıklı” derken yüzlerce failed haber kaydı gösterebiliyor.
- Deploy'a uygulama içi login olmadan erişilebildi; repo tek-operatör ve Vercel Deployment
  Protection varsayımına dayanıyor olabilir.
- Typecheck ve mevcut Vitest suite'i başlangıçta yeşildi. Mühendislik temeli tamamen kırık
  değil; ana sorun ürün örgütlenmesi ve güvenilir çıktı kalitesi.

Bu maddeleri başlangıç hipotezi kabul et. Kod, canlı UI, API ve güvenli read-only veri
sorgularıyla yeniden doğrula; yanlış veya eskimiş olanları düzelt.

## KORUNACAK TEKNİK TEMEL

Repo önemli bir altyapıya sahip. Önce envanterini çıkar, sonra yeniden kullan:

- Next.js 16.2.6 + React 19.
- Prisma/PostgreSQL/Neon veri katmanı ve additive şema yaklaşımı.
- `ContentItem`, `Creator`, `Board`, `Idea`, `VoiceProfile`, `MemoryFact`, `CaptionDna`,
  `HashtagDna`, `SeriesProfile`, `IgWatchAccount`, `ReelDossier`, `ReelPlan`,
  `WebsiteVerification`, `Learn*`, `PublishedPost`, `PerformanceSnapshot` ve ilgili
  servisler.
- OpenRouter preset/routing, usage logging ve cost gate'leri.
- Haber, X discovery, Instagram, YouTube, öğrenme, memory retrieval, performance learning
  ve Obsidian export hatları.
- Mevcut testler, route contract'ları ve kullanıcı verisi.

Varsayılan kararlar:

- Supabase'e geçme. Prisma/Neon'u koru. pgvector ancak ölçülmüş retrieval ölçek sorunu varsa
  ayrı ve kanıtlı optimizasyon olarak değerlendir.
- Yeni n8n altyapısı icat etme. Mevcut cron/job/worker mimarisini önce değerlendir.
- Backend'i baştan yazma. Çalışan motorları servis katmanında konsolide et ve yeni ürüne
  bağla.
- Şema değişiklikleri additive, default'lu ve production-safe olsun. Veri silme veya destructive
  migration yapma.
- Kullanıcı değişikliklerini ve kirli worktree'yi koru; ilgisiz dosyaları revert etme.

## ASLA BOZULMAYACAK LEGACY SÖZLEŞME

Şunları yeniden adlandırma veya kaldırma:

- `useXAgentStore`
- `useCemOsStore` alias'ı
- localStorage key `"xagent-store"`
- `XAgentApp.tsx`
- `src/store/xagent.ts`
- mevcut HTTP User-Agent kimlikleri

Marka adı her görünür yerde **CemOS** olacak. Detay için önce `AGENTS.md` ve
`docs/CEMOS.md` oku.

Next.js koduna dokunmadan önce ilgili konu için mutlaka
`node_modules/next/dist/docs/` altındaki güncel yerel dokümanı oku. Bu sürümü eğitim
verisindeki klasik Next.js varsayımlarıyla kullanma.

## YENİ ÜRÜN BİLGİ MİMARİSİ

Ana navigasyon üç kullanıcı görevine inmeli:

1. **Bugün** — hazır içerik karar kuyruğu.
2. **Plan** — X, Instagram carousel ve Reels üretim/aylık planlama.
3. **Kütüphane** — ilham, rakip içerikleri, araçlar, eğitimler ve Obsidian bilgisi.

Ek kurallar:

- Toolbox Ali Cem'in gerçekten kullandığı bir alan; kaldırma. Ana navigasyonu şişirmeden
  sabit hızlı erişim, komut menüsü veya utility shortcut olarak koru.
- Sistem, maliyet, entegrasyon ve ayarlar profil/utility menüsünde yaşasın.
- `Ctrl/Cmd+K` yalnız ekran arama olmasın. Kaynak ekleme, içerik bulma, plan oluşturma ve
  “CemOS'a sor” komutlarını birleştiren global command surface olsun.
- Agent, skill, worker, cron, token, provider ve model isimleri ana navigasyonda görünmesin.
  Kullanıcı sonuç, gerekçe, kaynak ve gerekiyorsa denetim izini görsün.
- Legacy ekran/route id'lerini hemen silme. Persist edilmiş state ve deep link'ler için alias
  veya compatibility katmanı kullan; eski yüzeyleri primary nav'dan demote et.
- Aktif X hesaplarını DB/config'den dinamik oku. İki hesap varsayma; var olmayan hesap
  uydurma.

## GÖRSEL VE ETKİLEŞİM YÖNÜ

Mevcut “AI kontrol odası / koyu teknik dashboard” hissini korumak zorunda değilsin. Yeni
CemOS sakin, editoryal, güvenilir ve içerik-öncelikli bir çalışma alanı olmalı.

- Varsayılan yön: açık kırık beyaz/nötr arka plan, koyu antrasit metin, tek kontrollü vurgu
  rengi. İyi gerekçen varsa erişilebilir dark mode ekle; dark dashboard'u varsayılan kabul
  etme.
- İlk viewport'ta gerçek iş ve birincil aksiyon görünsün.
- Büyük KPI kutuları, neon/gradient atmosferi, dekoratif chart'lar, kart içinde kart ve ham
  telemetri kullanma.
- 900–1000px civarı okunabilir ana içerik genişliği, güçlü tipografik hiyerarşi, geniş boşluk,
  ince sınırlar ve düşük görsel gürültü kullan.
- Bir kartta tek baskın eylem olsun.
- Desktop, tablet ve mobilde aynı görev korunmalı; mobil ayrı bir ikinci ürün gibi
  davranmamalı.
- WCAG erişilebilirliği, klavye erişimi, görünür focus, reduced-motion, Türkçe karakter ve
  uzun içerik taşması zorunlu.

Güncel ürün tasarım örneklerini araştırabilirsin. Linear, Notion, Raycast, Typefully,
Buffer/Later ve modern editorial tools gibi ürünleri görev akışı açısından incele; görseli
kopyalama. Araştırma sonuçlarını kaynakları ve erişim tarihiyle blueprint'e yaz.

## TAM UYGULAMA REDESIGN'I — EN SONA BIRAKMA

Bu iş yalnız `Bugün` ekranının veya sidebar'ın makyajı değildir. **CemOS'un uygulama shell'i,
sidebar'ı, topbar'ı, bütün görünen sayfaları, alt sekmeleri, formları, listeleri, kartları,
drawer/modal yapısı, loading/empty/error/success durumları ve mobil davranışı baştan sona
yeniden tasarlanacaktır.**

Tam redesign'i diğer bütün backend/agent/memory işleri bittikten sonraya bırakma. Doğru sıra:

1. Önce bütün ürünün bilgi mimarisi ve görsel sistemi planlanır.
2. Yeni shell, sidebar/navigation ve ortak primitive'ler ilk uygulama dalgasında kurulur.
3. `Bugün`, `Plan`, `Kütüphane`, Toolbox ve utility/system yüzeyleri sırayla yeni sisteme
   taşınır.
4. Sonraki agent, Reels, memory ve Learn özellikleri yalnız yeni tasarım sistemi içinde
   geliştirilir; eski UI'ya yeni modül eklenmez.
5. Geçiş süresince compatibility route/state korunabilir fakat kullanıcıya yarım eski + yarım
   yeni, tutarsız bir ürün teslim edilmez.

### Redesign planı koddan önce bütün ekranları kapsamalı

`docs/cemos-rebuild/04-COMPLETE-UI-REDESIGN-PLAN.md` oluştur ve en az şunları içer:

- Mevcut bütün görünür ekranların, alt sekmelerin, command palette hedeflerinin ve utility
  yüzeylerinin envanteri.
- Her mevcut ekran için kesin karar: `keep / merge / demote / replace / remove-from-nav`.
- Her ekranın yeni evi: `Bugün / Plan / Kütüphane / Toolbox / profile-utility`.
- Eski → yeni route/tab/state alias ve migration haritası.
- Desktop shell, dar sidebar/rail, topbar, command/CemOS assistant, profile menüsü ve detail
  drawer yapısı.
- Mobil bottom navigation, sheet/drawer ve tek-odak çalışma akışı.
- Bütün yeni sayfaların low-fidelity wireframe'i.
- Her sayfanın `loading / empty / error / partial / success / stale / blocked-external`
  durumları.
- Sayfalar arası kullanıcı akışları ve primary/secondary action hiyerarşisi.
- Responsive grid, içerik genişliği, spacing, typography, renk, radius, shadow, icon, motion
  ve focus kuralları.
- Hangi mevcut UI component'inin yeniden kullanılacağı, hangisinin refactor edileceği ve
  hangisinin emekli edileceği.
- Erişilebilirlik ve klavye sözleşmesi.
- Görsel regresyon/screenshot test matrisi.

Ek olarak iki bağlayıcı belge oluştur:

- `docs/cemos-rebuild/05-SCREEN-BY-SCREEN-SPEC.md`: kullanıcıya görünecek **her sayfa** için
  amaç, içerik sırası, component ağacı, aksiyonlar, state'ler, desktop/mobile wireframe ve
  acceptance criteria.
- `docs/cemos-rebuild/06-DESIGN-SYSTEM-SPEC.md`: tokenlar, primitive'ler, layout contract,
  component variant'ları ve örnek kullanım kuralları.

Bu belgelerde yalnız soyut sıfatlar kullanma. Ölçü, hiyerarşi, max-width, breakpoint,
component davranışı ve state contract'ları uygulanabilir kesinlikte olsun.

### Zorunlu ekran kapsamı

Yeni tasarım en az şu kullanıcı yüzeylerini kapsamalı:

- Uygulama shell'i ve tüm sidebar/navigation davranışı.
- Global command bar + CemOS assistant.
- Bugün: X içerik kontrol/yayın kuyruğu ve detay drawer'ı.
- Plan ana ekranı.
- X plan/takvim yüzeyi.
- Instagram carousel serileri ve Series DNA.
- Reels aylık planı ve dossier detay yüzeyi.
- Seçilmiş trend/rakip fırsatları.
- Unified Kütüphane ana ekranı ve global search.
- İlham/rakip içerik detay analizi.
- Board/collection yüzeyleri.
- YouTube/NotebookLM öğrenme inbox'ı.
- Learn Pack, atomik not, zihin haritası ve review yüzeyleri.
- Toolbox ve araç detayları.
- `CemOS'un bildikleri` hafıza yüzeyi.
- Entegrasyonlar ve hesap ayarları.
- Sistem sağlığı, maliyet ve teknik detaylar.
- Onboarding/ilk kurulum, boş veri, dış izin engeli ve erişim koruması ekranları.

Ham legacy modül sayısını birebir yeni sayfa sayısına çevirme. Örneğin Haber Havuzu, Viral
Radar, Keşif Motoru ve YouTube fırsatları tek tek top-level ekran olmak yerine Plan içindeki
seçilmiş fırsatlar ve gerektiğinde açılan araştırma detayları olabilir.

### Tasarım onay kapısı

Kodlamadan önce tasarım belgelerini kendi içinde şu sorularla eleştir:

- Ali Cem uygulamayı ilk kez açınca 10 saniyede ne yapacağını anlıyor mu?
- Sidebar bütün ürünü açıklamaya mı çalışıyor, yoksa yalnız görevleri mi gösteriyor?
- Her sayfada tek baskın amaç var mı?
- Sistem/agent telemetrisi içeriğin önüne geçiyor mu?
- Desktop ve mobil aynı zihinsel modeli koruyor mu?
- Bütün legacy özelliklerin yeni evi belli mi?
- Bir özellik yeni tasarıma uymuyorsa gerçekten gerekli mi, yoksa arka plana mı alınmalı?

Bu kapı geçmeden rastgele component restyle etmeye başlama. Ancak kullanıcıdan rutin görsel
onay bekleyerek bütün işi durdurma: araştırmaya ve ürün hedeflerine dayanarak tek bir güçlü
tasarım yönü seç, kararını belgeleyip uygula.

## BUGÜN — BİRİNCİL ÜRÜN

Ana ekran dashboard değil, karar kuyruğudur. Açılışta şunlar görünmeli:

- tarih ve “N içerik hazır” özeti,
- aktif hesap filtreleri,
- tek odaklı sıradaki içerik,
- kalan içeriklerin sessiz kuyruğu.

İçerik kartının ana yüzünde yalnızca:

- hesap ve platform,
- içerik metni ve medya,
- `Neden bugün?`,
- kaynak/fact-check güven durumu,
- `Düzenle`,
- `Onayla ve yayınla` veya entegrasyon yoksa açıkça `X'te aç`.

Detay panelinde:

- kaynaklar ve doğrulama tarihi,
- kullanılan güncel sinyaller,
- benzer eski içerikler,
- hesap/seri uyumu,
- alternatif hook'lar,
- originality kontrolü,
- agent/pipeline audit izi,
- model/maliyet yalnız teknik detay olarak.

Zorunlu kozmetik edit-gate'i şu güven modeliyle değiştir:

- `ready`: kalite kapılarını geçen taslak, değişiklik zorunlu olmadan insan tarafından
  onaylanabilir.
- `needs_edit`: açık Türkçe nedenlerle düzenleme zorunlu.
- `blocked`: kaynak, güvenlik veya doğruluk sorunu çözülmeden yayınlanamaz.

Asla otomatik yayınlama yapma. İnsan onayı zorunlu kalsın. Gerçek X yayın entegrasyonu
uygulanacaksa güncel resmi X API dokümanını araştır, OAuth kullanıcı yetkisi, media akışı,
rate limit, hata yönetimi ve duplicate-post önleyen idempotency tasarla. Credential yoksa
UI ve servis contract'ını tamamla, güvenli fallback olarak intent/copy akışını koru ve
`BLOCKED-EXTERNAL` olarak raporla.

## VİRAL KALİTE MOTORU

“Viral” kelimesini tek sahte kesinlik puanına indirgeme. Viral kapasite şu kapıların birlikte
geçilmesidir:

1. Kaynak güncelliği ve güvenilirliği.
2. Hesap ve kitle uyumu.
3. Somut, güçlü ve özgün hook.
4. Net payoff/değer.
5. Doğal Türkçe ve hesap sesi.
6. Yenilik ve trend zamanlaması.
7. Fact-check ve iddia desteği.
8. Rakip metnine aşırı benzememe.
9. Önceki gerçek performansla benzerlik/farklılık.
10. Format ve platform uygunluğu.

Observed bad drafts için regression fixture'ları ekle. Özellikle:

- yabancı kelime sızıntısı (`Trajectory` gibi),
- anayasa/promptta yasak olmasına rağmen soru CTA'sı,
- @grafikcem için kaynaksız soyut AI yorumu,
- emoji/hashtag yasağı ihlali,
- `thread` etiketiyle format uyuşmazlığı,
- düşük doğal Türkçe,
- kaynaksız sayı veya ürün iddiası.

İçerik üretim hattı kontrollü ve izlenebilir olsun:

`sinyal toplama → dedup/topic cluster → account fit → fırsat seçimi → çoklu aday →
viral edit → brand guard → fact-check → originality → final gate → insan onayı →
publish log → performans öğrenmesi`

Her adım için typed input/output, timeout, retry, cost class, trace ve deterministik test
tanımla. Çoklu agent tartışmasını yalnız yüksek değerli kalite kapılarında kullan; her küçük
işte sınırsız agent döngüsü kurma.

## AGENT VE SKILL MİMARİSİ

Kullanıcı çok sayıda agent ve skill istiyor; bunu menü kalabalığı olarak değil, görünmez ve
denetlenebilir iş gücü olarak kur.

Asgari uzmanlık rolleri:

- Cem Orchestrator
- Trend Scout
- Account Strategist
- Content Creator
- Viral Editor
- Brand Guardian
- Fact Checker
- Originality Critic
- Competitor Analyst
- Reels Planner
- Performance Learner
- Knowledge Curator

Önce mevcut `src/lib/agents`, `src/lib/agent`, AI presetleri ve servisleri haritala. Aynı işi
yapan yeni agent yazma. Eksik rolleri config-driven registry ile ekle.

Her agent/skill tanımı şu contract'a sahip olsun:

- amaç ve tetikleyici,
- izin verilen tool/servisler,
- typed input/output schema,
- model/preset ve bütçe sınıfı,
- timeout/retry/fallback,
- hangi hafızayı okuyup yazabileceği,
- provenance ve trace,
- unit/eval fixture'ları.

External içerik her zaman untrusted data olarak çitlenmeli. Hiçbir rakip postu, web sayfası,
transkript veya NotebookLM metni agent talimatlarını değiştirememeli.

## AGENTIC HAFIZA — “BENİ TANIYOR” KABULÜ

Hafızayı yalnız vector search olarak ele alma. Aşağıdaki katmanları mevcut modellerle
eşleştir ve eksikleri additive biçimde tamamla:

- Kimlik hafızası: Ali Cem'in hedefleri, işi, ilkeleri ve öncelikleri.
- Hesap hafızası: her sosyal hesabın ayrı audience, voice, topic ve sınırları.
- Stil hafızası: hook, ritim, caption, CTA, emoji, hashtag, carousel ve görsel düzen.
- Seri hafızası: her carousel/Reels serisinin formülü ve geçmiş bölümleri.
- Episodik hafıza: onay, red, düzenleme ve nedenleri.
- Performans hafızası: gerçek platform metrikleri ve zaman pencereleri.
- Bilgi hafızası: videolar, makaleler, notlar, araçlar ve araştırmalar.
- Negatif hafıza: kullanılmaması gereken klişeler, konular ve başarısız kalıplar.

Hafıza yazma yönetimi:

- External veri kimlik hafızasına doğrudan yazamaz.
- Kimlik/stil değişiklikleri provenance, confidence, evidence count ve insan onayı taşır.
- Silme yerine supersede/version zinciri kullan.
- CemOS, “Benim hakkımda ne biliyorsun?” sorusuna kaynaklı ve düzenlenebilir cevap verebilsin.
- UI'da ayrı top-level “Memory Admin” yaratma. Profil/ayarlar içindeki sakin bir “CemOS'un
  bildikleri” yüzeyi yeterli.
- İlk AI taslağı ile yayımlanan metin arasındaki edit diff, silinen/eklenen ifadeler, tekrar
  edilen ret nedenleri ve performans geri bildirimi öğrenme sinyali olsun.

## INSTAGRAM CAROUSEL VE REELS

Mevcut `SeriesProfile`, `VisualStyleProfile`, `VoiceProfile`, `CaptionDna` ve `HashtagDna`
modellerini çalışan bir ürün akışına bağla.

Her carousel serisi için CemOS şunları bilmeli:

- amaç ve audience,
- format ve slide sayısı,
- kapak/hook formülü,
- slide archetype'ları,
- görsel hiyerarşi ve tasarım sistemi,
- metin yoğunluğu,
- caption ve CTA formülü,
- hashtag grupları,
- geçmiş konular ve tekrar yasakları,
- yayın performansı,
- operatörün yaptığı düzeltmeler.

Geçmiş içeriklerden DNA çıkarırken provenance göster ve kullanıcı onayı olmadan kimlik
kurallarını kalıcılaştırma. Meta izinleri yetersizse CSV/export, URL, ekran görüntüsü veya
manuel örnek girişiyle sistemi kullanılabilir bırak.

Reels aylık planı ham pillar isimleri göstermemeli. Her plan slotu açıldığında üretime hazır
bir dossier sunmalı:

- konu ve stratejik amaç,
- gerçek site/araç ve canonical URL,
- son doğrulama zamanı, erişilebilirlik, redirect, fiyat/plan bilgisi ve confidence,
- Türkiye erişimi hakkında doğrulanabilen sinyal; doğrulanamıyorsa açık belirsizlik,
- neden bu hesap/kitle için seçildiği,
- ilk 2 saniye hook,
- 30–60 saniye konuşma metni,
- zaman çizelgesi ve sahne planı,
- ekran kaydı sırası, cursor/zoom/highlight notları,
- cover/on-screen copy,
- caption, hashtag ve CTA,
- kaynaklar, riskler ve expiry,
- ilham alınan pattern ve nasıl özgünleştirildiği,
- gerekli asset checklist ve üretim tahmini.

`WebsiteVerification` deterministik kanıt kapısı olarak kalmalı. SSRF korumalarını aşındırma.
Araç adlı dossier, geçerli verification olmadan `ready` olamaz. Tier-2 browser doğrulaması
yalnız resmi sayfa JS ile render olmadan doğrulanamıyorsa ve güvenli sınırlar içinde gerekliyse
eklenmeli.

## GÜNLÜK HABER VE TREND MOTORU

Haber Havuzu, Repo Radar, YouTube fırsatları ve sosyal sinyaller ana menüde ayrı ayrı görünmek
zorunda değil. Bunları Plan ve Bugün'ü besleyen arka plan araştırma katmanına dönüştür.

Her sinyal için:

- kaynak ve yayın zamanı,
- dedup/topic cluster,
- hesap/kitle uyumu,
- freshness ve half-life,
- doğrulama seviyesi,
- önerilen platform/format,
- “neden şimdi?” gerekçesi,
- daha önce işlendi mi kontrolü,
- içerik veya plan slotuna provenance bağlantısı

saklanmalı.

Raw 60 sonuç yerine editoryal olarak seçilmiş birkaç fırsat göster. Kullanıcı isterse detaydan
ham araştırmaya inebilsin. “Sağlıklı” durumu yalnız cron tick'e göre değil; çıktı üretilmesi,
failed backlog, staleness, bugünkü digest/sinyal ve kritik entegrasyon hatalarına göre hesaplanmalı.

## RAKİP VE İLHAM KÜTÜPHANESİ

Tek unified library kur. X/Instagram/YouTube için ayrı kaydetme menüleri çoğaltma.

Girdi yolları:

- Instagram/X/YouTube/web URL,
- ekran görüntüsü,
- video veya dosya yükleme,
- manuel not,
- mevcut radar sonuçlarından `Kaydet`,
- ileride mobil share/browser extension için açık API contract'ı.

Her kayıtta mümkün olduğunda:

- ilk hook/ilk üç saniye,
- içerik vaadi,
- hikâye yapısı ve tempo,
- görsel hiyerarşi ve metin yoğunluğu,
- CTA ve yorum tetikleyici,
- neden çalışmış olabileceği,
- confidence ve kullanılan kanıt,
- Ali Cem'in hesabına nasıl uyarlanacağı,
- kopyalanmaması gereken öğeler,
- üç özgün içerik fikri

üretilmeli.

Amaç metni kopyalamak değil yapısal pattern çıkarmaktır. Copyright, platform policy, PII ve
özel hesap sınırlarına uy.

## YOUTUBE + NOTEBOOKLM + OBSIDIAN ÖĞRENME SİSTEMİ

> **✅ DURUM — Phase 4C TAMAMLANDI (ADR-042; 2026-07-19):** intake (youtube/manuel/NotebookLM,
> provider/basis sunucu-set, içerik SHA-256 idempotent) + resumable grounded Pack + atomik not +
> gerçek zihin haritası (notes/graph/tasks artık PASSTHROUGH DEĞİL + content_ideas) + uygulama görevi +
> içerik fikri (öneri, otomatik terfi yok) + review (server-side idempotent) TESLİM. Pipeline v2 (v1
> pack'ler okunur, reprocess yok); basis-farkı → NotebookLM iddiaları asla "videoda doğrulandı" görünmez.
> Detay: `DECISIONS.md` ADR-042/043 + `IMPLEMENTATION-STATE.md`. **✅ Phase 4D TAMAMLANDI (ADR-043;
> 2026-07-19):** deterministik + basis-farkında v2 Obsidian bundle + tipli export durum makinesi (9
> durum, secret/path yok) + sertleştirilmiş yerel (realpath+symlink guard+atomic+conflict) / GitHub
> (preflight+unchanged-skip+errorClass+partial) kanallar + `LearnExportAttempt` kalıcı audit (additive
> migration) + gate'li auto-export (`OBSIDIAN_AUTO_EXPORT`) + export paneli/`/export` API; 10 runtime-DARK
> ABSORBED legacy component fiziksel silindi (alias/legacy sembol korundu; savedTweets drenajı AppShell'e
> taşındı). **Obsidian CANLI kanal doğrulaması (gerçek vault yazımı / gerçek GitHub commit) = BLOCKED-EXTERNAL**
> (env/target/onay yok — kod+test+hermetik doğrulandı, gerçek yazma yok). Canlı ücretli AI $0.

Mevcut Learn pipeline'ını çöpe atma. Önce `LearnSource`, transcript/chunk, pack, concept,
review, resumable job, Obsidian bundle, local writer ve GitHub vault bridge akışını test et.

Desteklenen girişler:

- YouTube URL,
- kullanıcının sağladığı transcript,
- NotebookLM özeti veya export metni,
- makale/URL/text geleceğine açık typed adapter.

Her kaynak için hedef çıktı:

- 30 saniyelik özet,
- yönetici özeti ve bölüm özeti,
- en önemli fikirler,
- kaynak/zaman kodlu atomik notlar,
- kavram bağlantıları,
- Mermaid zihin haritası veya Map of Content,
- uygulanabilir görev ve playbook,
- CemOS/iş/içerik üretimine uygulanacak noktalar,
- X/Instagram/Reels içerik fikirleri,
- ilgili eski notlarla bağlantı,
- confidence ve grounding coverage,
- 7/30/90 günlük veya mevcut scheduler ile uyumlu tekrar.

NotebookLM merkezi bağımlılık değil, giriş yöntemlerinden biri olsun.

Obsidian stratejisi:

- V1'de mevcut GitHub vault bridge + Obsidian Git yolunu doğrula ve kullanılabilir hale getir.
- Yerel `OBSIDIAN_VAULT_PATH` geliştirme/local kullanımını koru.
- İki yönlü gerçek zamanlı sync, offline conflict resolution veya vault'tan CemOS'a geri yazma
  şart olursa local bridge'i ayrı ADR ve go/no-go ile tasarla. Başlangıçta sırf raporda yazıyor
  diye yeni masaüstü uygulaması kurma.
- Export başarısını kullanıcıya göster; hata ve retry görünür olsun. “Otomatik düşer” deyip
  sessizce no-op yapma.

Öğrenme UI'ı ham URL ve 40 kartlık borç hissi yaratmamalı. `Inbox / Öğreniliyor / Hazır bilgi /
Bugünkü kısa tekrar` gibi sakin bir akış tasarla. Hatalı kaynak için anlaşılır sebep ve tek
eylemli recovery sun.

## GÜVENLİK VE OPERASYON P0

CemOS kişisel hafıza ve entegrasyon credential'ları taşıyacak. Public, auth'suz production
erişimi kabul edilemez.

- Mevcut Vercel Deployment Protection varsayımını doğrula.
- Uygulama public olacaksa uygun tek-operatör auth/access gate tasarla. Same-origin guard'ın
  authentication olmadığını açıkça kabul et.
- Cron/mutation guard'ları, secret encryption ve prompt-injection sınırlarını koru.
- Secret value loglama; yalnız env isimlerini raporla.
- Production'da destructive DB komutu, mass delete veya test publish yapma.
- Publish/generate gibi yan etkileri fixture/mock/safe branch ile doğrula.
- Dış içerik ve URL'lerde SSRF, XSS, prompt injection, redirect ve dosya yükleme sınırlarını test
  et.

## ARAŞTIRMA KURALI

Zamanla değişebilecek teknik gerçekleri hafızadan varsayma. Güncel araştırma gereken örnekler:

- X API publish/OAuth/media/rate-limit ve plan kısıtları,
- Meta Instagram Graph API ve business discovery izinleri,
- YouTube transcript/caption politikaları ve quota,
- Obsidian/GitHub sync seçenekleri,
- OpenRouter model/catalog ve structured-output davranışı,
- Next.js 16.2.6 APIsi.

Önce local resmi doküman veya repo kodunu kullan. Web gerekiyorsa resmi birincil kaynakları
tercih et, URL + erişim tarihi yaz ve marketing blogunu teknik gerçek kabul etme. Kullanıcı
verisini araştırma sitelerine gönderme.

## ÇALIŞMA PROGRAMI

Bu görev yalnız plan yazmakla bitmez. Aşağıdaki fazları sırayla yürüt. Her faz sonunda kanıt ve
durumu `docs/cemos-rebuild/IMPLEMENTATION-STATE.md` içinde güncelle. Context daralırsa bu dosya
sonraki oturumun kesin handoff'u olsun.

### Faz 0 — Baseline, araştırma ve kararlar

1. `git status --short` ve branch'i kontrol et; kullanıcı değişikliklerini koru.
2. `AGENTS.md`, `docs/CEMOS.md`, mevcut V2 final spec'leri ve son state/handoff belgelerini oku.
3. Next.js ilgili local docs'u oku.
4. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` baseline'ını çalıştır.
5. API, ekran, servis, model, agent, memory, job ve integration envanteri çıkar.
6. Canlı deploy'u read-only browser ile desktop/mobile test et. Mutation/publish/generation
   tetikleme.
7. Güvenli read-only DB sorgularıyla “kod var / veri var / UI'da çalışıyor” ayrımını doğrula.
8. Gerekli resmi web araştırmasını yap.
9. Şu belgeleri yaz:
   - `docs/cemos-rebuild/00-BASELINE-AND-GAPS.md`
   - `docs/cemos-rebuild/01-PRODUCT-AND-UX-BLUEPRINT.md`
   - `docs/cemos-rebuild/02-AGENT-MEMORY-DATA-ARCHITECTURE.md`
   - `docs/cemos-rebuild/03-DELIVERY-ROADMAP.md`
   - `docs/cemos-rebuild/04-COMPLETE-UI-REDESIGN-PLAN.md`
   - `docs/cemos-rebuild/05-SCREEN-BY-SCREEN-SPEC.md`
   - `docs/cemos-rebuild/06-DESIGN-SYSTEM-SPEC.md`
   - `docs/cemos-rebuild/DECISIONS.md`
   - `docs/cemos-rebuild/IMPLEMENTATION-STATE.md`

Blueprint içinde desktop/mobile wireframe'ler, state diagramları, data provenance, route/model
reuse map'i, hangi eski ekranın yeni nereye taşındığı ve görsel token yönü olsun.

### Faz 1 — P0 güven + tam yeni shell/sidebar + Bugün dikey dilimi

Önce gerçek günlük kullanımı mümkün kıl:

- erişim koruması ve doğru health contract,
- uygulamanın tamamının kullanacağı yeni design token/primitive katmanı,
- eski sidebar/topbar'ın yerine geçen üç görevli yeni shell ve navigation (ADR-040: "üç görev" = üç TOP-LEVEL alan; kabiliyetler hiyerarşik alt-nav + "Araştırma" grubu + "Şimdi" özetiyle görünür, saklanmaz),
- Toolbox quick access,
- global command/CemOS surface temeli,
- yeni Bugün kuyruğu,
- kaynak + neden bugün + fact-check görünümü,
- `ready / needs_edit / blocked` kalite contract'ı,
- zorunlu kozmetik edit-gate'in kaldırılması,
- observed bad-draft regression testleri,
- publish adapter contract + güvenli mevcut fallback,
- desktop/mobile E2E.

Shell/sidebar geçici restyle değil, nihai tasarım sisteminin gerçek temeli olmalı. Faz 1
tamamlanmadan ürünün temel probleminin çözüldüğünü iddia etme.

### Faz 2 — Hafıza ve agent orchestration

- Mevcut agent/skill envanterini registry contract'ına bağla.
- Memory fact governance ve “CemOS'un bildikleri” yüzeyini tamamla.
- Edit diff, red, onay ve performans öğrenmesini ölçülebilir hale getir.
- Trace/cost/fallback gözlemlenebilirliğini teknik detayda tamamla.
- Gerçek veriden önce deterministic fixture/eval ile doğrula.

### Faz 3 — Plan + Instagram + Reels

- Carousel/Caption/Hashtag DNA'yı çalışan prompt ve UI akışına bağla.
- Rakip sinyallerini seçilmiş fırsatlara dönüştür.
- Aylık planı gerçek dossier kartlarıyla yeniden tasarla.
- Site doğrulama, staleness ve riskleri görünür yap.
- Meta external blocker'larında manuel/import fallback'lerini tamamla.
- Bu yüzeylerin tamamını screen-by-screen spec'teki yeni layout/state/interaction contract'ına
  taşı; eski Instagram/YouTube dashboard bileşenlerini yeni shell içine aynen yapıştırma.

### Faz 4 — Unified Library + Learning + Obsidian

- Boards/ContentItem/analysis altyapısını tek kütüphanede birleştir.
- İlham capture ve structural analysis akışını tamamla.
- Learn UI ve NotebookLM/manual transcript girişlerini tamamla.
- Obsidian GitHub/local export'u uçtan uca doğrula.
- Zihin haritası, atomik not, task/content idea ve review akışlarını bağla.
- Toolbox, hafıza, ayarlar, sistem ve maliyet utility yüzeylerini de yeni tasarım sistemiyle
  tamamla; redesign kabulü bütün görünür ekranlar taşınmadan PASS olamaz.

### Faz 5 — Gerçek entegrasyonlar ve kalibrasyon

- Credential/izin uygunsa gerçek X publish'i güvenli insan onayıyla tamamla.
- Meta/engagement performans sync'ini kalibre et.
- İçerik seçim ve kalite metriklerini gerçek sonuçlarla değerlendir.
- Kullanılmayan legacy UI'ı compatibility kanıtından sonra temizle/demote et.

## UYGULAMA DİSİPLİNİ

- Araştırmadan sonra kodla; yalnız araştırma döngüsünde kalma.
- Büyük bang rewrite yapma. Her faz çalışan, testli ve geri alınabilir dikey dilim olsun.
- Mevcut service/model varsa reuse et; duplicate abstraction oluşturma.
- Yeni contract'lar Zod/typed schema ile tanımlansın.
- Mutation route'ları auth/CSRF/cost/idempotency sınırına sahip olsun.
- Her davranış değişikliğinde test ekle veya güncelle.
- Hata durumunu empty state gibi gösterme.
- Testi skip ederek yeşile dönme; gerçek nedeni düzelt.
- Prod deploy/push, credential değişimi veya production DB push için kullanıcı izni olmadan
  işlem yapma.
- Commit/push/PR ancak kullanıcı isterse yapılır.

Claude Code subagent desteği varsa bağımsız araştırma ve denetim işlerinde kullanabilirsin:

- UX/bilgi mimarisi,
- agent/memory/data mapping,
- Instagram/Reels/competitor intelligence,
- Learn/Obsidian,
- security/testing.

Fakat nihai kararları tek ana agent birleştirsin. Aynı dosyada eşzamanlı çakışan edit yaptırma.

## ZORUNLU KABUL KRİTERLERİ

### Ürün ve UX

- Ana navigasyonda yalnız `Bugün / Plan / Kütüphane` görünür; Toolbox hızlı utility olarak
  erişilebilir.
- Kullanıcı uygulamayı açtıktan sonra 10 saniye içinde ne yapacağını anlar.
- Hazır X içeriği ilk viewport'ta görünür.
- `ready` içerik zorunlu kozmetik edit olmadan insan onayıyla paylaşım akışına girebilir.
- Ana kartta kaynak, “neden bugün?” ve güven durumu görünür.
- Agent/model/worker/maliyet ana yüzeyi işgal etmez.
- 320, 390, 768, 1280 ve 1440px'te taşma/çakışma yok.
- Klavye ve ekran okuyucu ile ana akış tamamlanabilir; console error 0.

### İçerik kalitesi

- Bilinen kötü taslak fixture'ları `ready` olamaz.
- Yasak CTA, yabancı token sızıntısı, kaynakta olmayan iddia ve persona ihlali deterministik
  veya güvenilir gate ile yakalanır.
- Taslak kaynağa, hesap hafızasına ve güncel sinyale provenance ile bağlıdır.
- Kalite yalnız tek bir viral skor olarak sunulmaz.
- Gerçek publish performansı ve edit davranışı gelecekteki retrieval/seçimi etkiler.

### Instagram/Reels

- Kullanıcı carousel serilerini ve DNA'sını görebilir/düzeltebilir.
- Caption/hashtag/visual düzen provenance ve confidence ile hesap bazlıdır.
- Aylık planda ham teknik key yerine üretime hazır dossier görünür.
- Araç adlı dossier geçerli site kanıtı olmadan `ready` olamaz.
- Her dossier hook, script, scene/screen planı, caption, hashtag, CTA, kaynak ve risk taşır.

### Kütüphane ve öğrenme

- X/IG/YT/web/manual içerik tek kütüphanede aranabilir ve board'lara kaydedilebilir.
- Kaydedilen rakip içerik “neden çalışıyor / nasıl uyarlanır / ne kopyalanmamalı” analizi alır.
- YouTube URL veya sağlanan transcript/NotebookLM metni kaynaklı Learn Pack'e dönüşür.
- Hazır pack Obsidian'a otomatik aktarılır veya açık, tekrar denenebilir bir hata gösterir.
- Atomik not, MOC/zihin haritası, görev, içerik fikri ve review kaydı oluşur.

### Güvenlik ve operasyon

- Public deploy kişisel veriyi auth'suz açmaz.
- Same-origin kontrol authentication olarak sunulmaz.
- Health durumu failed backlog/staleness/çıktı üretimini hesaba katar.
- External içerik prompt talimatı olamaz.
- SSRF, XSS, secret, upload ve duplicate publish sınırları testlidir.

## HER FAZDA DOĞRULAMA

En az:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

İlgili değişikliklerde hedefli unit/integration testleri ve Playwright/browser E2E çalıştır.
Browser doğrulamasında desktop + mobile, loading/empty/error/success ve klavye akışını kontrol
et. Görsel değişikliklerde screenshot kanıtı üret.

Canlı LLM veya üçüncü taraf çağrısı maliyetli olacaksa önce budget/cost gate'i doğrula; küçük
smoke dışında harcama yapma. External izin/credential yoksa kod ve fixture testini tamamla,
durumu `BLOCKED-EXTERNAL` yaz; mock'u gerçek başarı gibi sunma.

## DURUM VE FINAL RAPOR FORMATI

Her çalışma sonunda `docs/cemos-rebuild/IMPLEMENTATION-STATE.md` şu alanları taşısın:

- tamamlanan faz ve acceptance item'ları,
- değişen dosyalar,
- çalışan testler ve sonuçları,
- browser kanıtları,
- DB/data migration durumu,
- external blocker'lar,
- açık riskler,
- bir sonraki kesin iş,
- tekrar edilmemesi gereken başarısız denemeler.

Final yanıtında kısa ve kanıtlı rapor ver:

1. Kullanıcının bugün yaşayabildiği yeni deneyim.
2. Tamamlanan vizyon maddeleri: PASS/PARTIAL/BLOCKED-EXTERNAL.
3. Değişen ana dosyalar ve mimari kararlar.
4. Test/build/browser sonuçları.
5. Veri/credential/deploy gerektiren kullanıcı aksiyonları.
6. Kalan sonraki faz.

Doğrulanmayan hiçbir şeyi tamamlandı sayma. Yalnız belge yazdıysan “ürün tamamlandı” deme.
Bir faz kabul kriterlerini geçmeden sonraki fazın tamamlandığını iddia etme.

## BAŞLA

Önce repo durumunu ve talimat dosyalarını oku. Ardından baseline testlerini, canlı deploy
incelemesini, veri/servis/ekran envanterini ve gerekli resmi araştırmayı paralel ve güvenli
biçimde yürüt. Bulguları blueprint'e dönüştür. Sonra Faz 1'i gerçekten uygula ve kabul
testlerinden geçir. Kullanıcıdan rutin onay bekleyerek yalnız plan aşamasında durma.
