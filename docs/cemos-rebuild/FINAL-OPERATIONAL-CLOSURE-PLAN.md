# CemOS — FINAL OPERATIONAL CLOSURE PLAN (REVİZE v2)

**Tarih:** 2026-07-22 · **Yazar:** Planlama oturumu (Fable), uygulayıcı: Opus
**Durum:** REVİZE v2 — operatör geri bildirimi işlendi; hiçbir kod/DB/env/deploy değişikliği yapılmadı
**Kanıt tabanı:** 7 paralel salt-okunur repo denetimi + Vercel runtime log analizi + canlı smoke + docs çelişki taraması (2026-07-22) + operatör düzeltmeleri (Neon/Supabase resmî fiyat-plan gerçekleri)

---

## 0. v1'den Değişen Kararlar

| # | v1 kararı | v2 kararı | Neden |
|---|---|---|---|
| 1 | Birincil DB kararı: Neon Launch (~$19/ay sabit varsayımı) | **Koşullu karar ağacı: önce Neon Free'i ölçülü kurtar** (7 günlük CU-saat ölçümü → eşik aşılırsa Launch maliyet ölçümü → ancak ölçüm sürdürülemezliği kanıtlarsa Supabase adayı) | Ödeme kararı erken; Free 100 CU-saat/ay, Launch kullanım-bazlı (~$15/ay tipik), "kota tükendi" henüz hipotez |
| 2 | Supabase free "günlük yedek" varsayımı | **Düzeltildi: Supabase Free'de otomatik backup ve PITR YOK.** Seçilirse ayrı günlük şifreli logical backup + off-site + restore drill ZORUNLU | Yanlış olguydu; geçmiş DB kazası (2026-07-17) bu riski kritik yapar |
| 3 | Yazar primary'sini hemen DeepSeek'e geçir | **Önce shadow benchmark, eşik geçilirse promotion.** DeepSeek V4 Pro = "önde gelen fiyat/performans adayı", kesin yeni primary DEĞİL | Golden testten önce production primary değişmez; JSON güvenilirliği kanıtsızdı |
| 4 | OpenRouter gizlilik sözleşmesi yoktu | **Eklendi:** `data_collection:"deny"`, mümkünse `zdr:true`, `require_parameters:true`, görev-bazlı `max_price`, ≤2 kontrollü fallback, fail-closed data-policy | Kişisel içerik/hafıza verisi training-enabled endpoint'e gidemez |
| 5 | "18 ekran authenticated audit" | **15 navigable yüzey + 3 absorbed/alias route geriye-uyum testi** — tüm belgelerde tek terminoloji | IA 18→15 kararıyla çelişiyordu |
| 6 | "DB kapalıyken 5xx=0" | **Ayrıştırıldı:** beklenmeyen 500=0; bilinen DB hatası = yapılandırılmış `503 db_unavailable`, bounded + circuit-breaker'lı | Çelişkili kabul kriteriydi |
| 7 | Her WP ayrı branch+PR | **1 hotfix PR + 1-2 closure PR; atomik commit disiplini korunur; deploy yalnız 3 kontrollü kapıda** | 10 PR/10 deploy kapanışı gereksiz yavaşlatır |
| 8 | Meta izni (OP-4) final yolunda | **Meta = optional fallback.** Composio canlı sync doğrulanırsa final kapısı için zorunlu değil | Operatör yükü azaltma |
| 9 | Env aksiyonları koşulsuz istendi | **Önce Production+Preview'da VAR/YOK doğrulaması (değer asla okunmaz/yazdırılmaz); yalnız gerçekten eksikse iste** | Kullanıcıdan mevcut credential tekrar istenmez |
| 10 | "24s/48s" kısaltmaları | **"24 saat / 48 saat / 15 saniye"** açık yazım | Belirsizlik |
| 11 | Executive verdict "kod hatası değil" mutlak ifadesi | **Yumuşatıldı:** ana tetikleyici altyapısal; ama 500 fırtınası + dürüst degradasyon eksikliği uygulama dayanıklılık kusuru | 118×500 üretmek app-side savunma eksiğidir |
| 12 | WP-02 yalnız select/aggregate daraltması | **Polling kökten event-driven'a:** periyodik DB health polling kaldırılır; circuit breaker + exponential backoff; tek health sonucu uygulama geneline yayılır | 5 dk poll ↔ Neon 5 dk autosuspend çakışması compute'u sürekli uyanık tutar |
| 13 | Opus promptu "ilk iş: WP-00 kodu" | **Opus ilk işi doğrulama:** plan oku → git/PR/prod SHA/env VAR-YOK/Neon durumu yeniden doğrula → truth delta yaz → sonra ilk güvenli pakete başla | Başlangıç gerçekleri değişmiş olabilir |

---

## 1. Executive Verdict

### CemOS bugün hangi seviyede?

**Kod tabanı: güçlü ve büyük ölçüde dürüst bir release candidate.** 115 API route, 80 Prisma modeli, 18 route (15 hedef navigable yüzey + 3 absorbed alias), 238 hermetik unit test dosyası, 20 hermetik Playwright spec, çift-katmanlı fail-closed DB test koruması, perimeter auth (Vercel OIDC canlı doğrulandı), tek ücretli AI yolu (`generateJsonGated` + rezervasyon ledger'ı), intent-only X publish (ADR-025/011 gereği dürüst).

**Production: veri katmanı erişilemez ve uygulama buna dayanıklı değil.** Son 48 saat: **118×HTTP 500 / 67×200**; 500'lerin tamamı DB-bağımlı route'lar (`/api/costs` 62 ile başta). **Ana tetikleyici altyapısal:** Neon compute'u erişilemez (`PrismaClientInitializationError`, 2026-07-22 17:14'te dahi). **Ancak** 500 fırtınası, retry çoğalması ve dürüst degradasyon eksikliği **uygulama dayanıklılık kusurlarıdır**: DB kapalıyken doğru davranış yapılandırılmış 503 + tek global bant + bounded istek olurdu. İkisi ayrı ayrı kapatılır.

**Sürüm ayrımı:** Prod = `main@45875ad` (`dpl_8WmeP7Ms`, READY). Yerel `fix/prod-audit-egress-security@98a94fa` **5 commit önde, push edilmemiş**. CI main'de yeşil.

### Neden final değil?

1. DB erişilemez → 15 hedef yüzeyin çoğu veri gösteremiyor.
2. Uygulama DB kesintisini 500 fırtınası olarak yüzeye vuruyor (dayanıklılık kusuru).
3. Beş kritik düzeltme prod'a gitmemiş.
4. Hiçbir kritik yolculuğun canlı kanıtı yok; canlı LLM çağrıları `OPENROUTER_KEY_ROTATED_AT` boşsa kod tarafından bilinçli bastırılıyor (env VAR/YOK durumu Opus tarafından doğrulanacak).
5. `integrations` route'u `has(env)` → `status:"connected"` üretiyor (configured/verified conflation, tek nokta: `src/app/api/integrations/route.ts:114-145`).

### En kısa kritik yol

**WP-00 (hotfix PR: 5 commit) → WP-01 (DB-down dürüst degradasyon + circuit breaker) → WP-02 (event-driven health + egress) → OP-1 (Neon konsol salt-okunur teşhis) → Neon Free 7 günlük ölçüm → koşullu DB kararı → OP-2 (kredi + gerekiyorsa rotasyon damgası) → WP-06 shadow benchmark → WP-10 canlı sertifikasyon.**

### En büyük üç risk

1. **DB kararının ölçümsüz verilmesi** — v2 bunu koşullu ağaca bağlar; ölçüm öncesi ödeme/migrasyon yok.
2. **Çift hesap switcher'ı** (Zustand `activeChannel` ↔ `useAccounts.accountId`) — hesaplar arası veri sızması mimari olarak mümkün; bugüne dek disiplinle engellenmiş.
3. **Maliyet zamanlaması:** `claude-sonnet-5` intro fiyatı 2026-08-31'de bitiyor (+%50). Yazar primary'si bugün Sonnet-5; benchmark eşiği geçilirse swap bunu çözer, geçilmezse prompt/context optimizasyonu gerekir.

---

## 2. Kanıt ve Gerçeklik Tablosu

| Yetkinlik | Hedef | Mevcut durum | Kanıt | Eksik | Severity | Root cause | Sınıf |
|---|---|---|---|---|---|---|---|
| Bugün ekranı gerçek taslak | Her sabah 2 hesap için hazır taslaklar | Cron'lar tanımlı+testli; prod'da DB yok → boş/500 | `generate-morning/route.ts`, CronRun; Vercel 500 logları | Canlı cron tick + DB | CRITICAL | Neon erişilemez + kredi | BLOCKED-EXTERNAL |
| DB-down dayanıklılığı | Yapılandırılmış 503 + tek bant | 500 fırtınası; degradasyon sinyali API'den gelmiyor | 48 saat log: 118×500 | WP-01 tamamı | CRITICAL | Uygulama dayanıklılık kusuru | CODE DEFECT |
| Auth | Parolasız, fail-closed | ÇALIŞIYOR (canlı: /giris OIDC sunuyor, prod boot ediyor) | Canlı smoke; `proxy.ts:29-64` | Allowlist dışı deneme kanıtı | — | — | LIVE ✅ |
| Perimeter guard | Tüm route'lar korumalı | Proxy tüm non-static yolları kapsıyor; yalnız `/giris`, `/api/auth/*`, `/api/cron/*` açık; cron'lar `CRON_SECRET` self-guard | `proxy.ts:21-27,66-69`; cron 401 testleri | — ("8 GET guard" önceki çerçevesi YANLIŞTI) | — | — | HERMETIC+LIVE ✅ |
| X publish | Dürüst intent-only | ADR-025/011 uygulanmış: `PublishAttempt(prepared)` + intent URL | `queue/[id]/prepare-intent/route.ts` | Canlı UI kanıtı (J1) | LOW | X API kalıcı bloklu — intent-only FINAL ürün kararı | HERMETIC |
| UI durumları | loading/empty/error/blocked her yüzeyde | 17/18 GOOD (İlham, Toolbox, fake-$0 fixleri YEREL branch'te); RadarTab PARTIAL | UX denetimi | RadarTab çocuk state'leri; `InspirationGrid` boş kopyası; fixler prod'da değil | MEDIUM | 5 commit push edilmemiş | HERMETIC |
| Hesap ayrımı | Persona/queue/hafıza karışmaz | DB-backed yollar doğru; Zustand düz diziler `channel` filtresine emanet; İKİ bağımsız switcher | `xagent.ts:117-168,255-345` | Tek switcher kaynağı + scoped selector + test | HIGH | Mimari borç (legacy store) | CODE DEFECT (latent) |
| Configured≠verified | Ayrı gösterim | Backend ayrımı VAR (`liveness`, ledger-bazlı); UI-facing `status` `has(env)`'den "connected" | `integrations/route.ts:114-145,237-242` | `status`'u liveness'a bağlamak | MEDIUM | Tek noktada conflation | CODE DEFECT |
| Bütçe/ekonomi | Rezervasyonsuz ücretli çağrı yok | `generateJsonGated` tek yol; embeddings fail-closed; advisory-lock rezervasyon | `generateGated.ts:62-197` | Canlı golden run ($) + gizlilik sözleşmesi (§7) | LOW→MEDIUM | Kredi + provider-privacy alanları eksik | BLOCKED-EXTERNAL + CODE |
| Model routing | Ucuz-yeterli varsayılan, gerçek escalation | Yazar primary Sonnet-5; judge gpt-5.4-mini doğru; **escalation SAHTE** (premiumCreative = yazarla aynı) | `presets.ts`, `model-config.ts` | Shadow benchmark + koşullu promotion + gerçek escalation | MEDIUM | Katalog kararı + benchmark yok | CODE (policy) |
| DB compute/egress | Compute uyanıklığı minimal | 1 poller (5 dakika + hidden-pause) — **Neon 5 dakikalık autosuspend ile çakışıp compute'u sürekli uyanık tutabilir**; contracts 15 saniyelik TTL memo var; plan-health fan-out her poll'da; `/api/costs` ay-bazlı tam satır | `SystemHealthProvider.tsx:45,104-126`; commit 10414ef notu | Event-driven'a geçiş (WP-02) + aggregate + 7 sınırsız findMany | HIGH | Polling mimarisi | CODE |
| Test hermetikliği | Prod DB'ye sıfır test erişimi | E2E+itest çift-katman fail-closed; unit config'te global dummy `DATABASE_URL` YOK | `e2eEnv.ts:43-53`, `guard.ts:33-44`; `vitest.config.ts:8` | Global setupFile | MEDIUM | Yapısal kilit eksik | CODE |
| E2E CI | retries=0, CI'da koşar | `retries: 1`; Playwright hiçbir workflow'da yok | `playwright.config.ts:25` | CI job + retries=0 + warmup | MEDIUM | Bağlanmamış | CODE |
| Hafıza→çıktı etkisi | Ölçülebilir etki | Okuma/consolidation unit-testli; etki izi YOK | Test taksonomi denetimi | Provenance chip + önce/sonra harness (J2) | HIGH | Kanıt tasarlanmamış | BLOCKED-EXTERNAL + CODE |
| Instagram sync | Canlı read-only doğrulama | Composio MCP read-only allowlist (7 GET tool, fail-closed) + Meta business_discovery fallback (optional) | `mcpClient.ts:325-365` | Canlı sync (J3) | MEDIUM | Operatör bağlama onayı | BLOCKED-EXTERNAL |
| Obsidian export | Seçilen gerçek hedefte idempotent | 3 kanal implement (ZIP/local/GitHub); `LearnExportAttempt`+manifestHash idempotency; canlı koşulmamış | `exportService.ts:32,89` | Hedef SEÇİMİ (operatör) + canlı export (J8) | MEDIUM | Hedef seçilmedi | BLOCKED-EXTERNAL + ÜRÜN KARARI |
| Cron gözlemlenebilirlik | Son koşu/sonuç görünür | CronRun modeli var; Sistem ekranı kartları zayıf | `CronRun` (:462) | Sistem'e cron kartları | MEDIUM | UI eksik | CODE |
| Worker | Prod bağımlılığı netliği | Worker YALNIZ self-host alternatifi; serverless prod hiçbir şey onu çağırmıyor | `worker.ts:26-64` | Docs netleştirme | LOW | Yanlış beklenti | ÜRÜN KARARI |
| Docs tutarlılığı | Tek gerçek | Guard sayısı driftı (98→84→82), BUG-05 çifte durum, RELEASE-GATE migration çelişkisi | Docs denetimi | Reconciliation | LOW | Bakım | CODE (docs) |

---

## 3. Kullanıcı İşi ve Ürün İlkeleri

### Günlük döngü (hedef: ilk anlamlı taslak <2 dakika, toplam <20 dakika)
1. **Aç → Bugün.** Her iki hesap (@grafikcem, @maskulenkod) için sabah cron'unun ürettiği taslaklar, readiness rozetleriyle (`ready/needs_edit/blocked`) hazır.
2. **Oku → düzelt → X'te aç.** Taslak kartında: kaynak, "neden bugün" (haber bağı), uygulanan hafıza kuralları (provenance chip — WP-09). Bugün ekranından X intent'e **≤3 etkileşim**. Dönüşte "paylaşıldı" işaretle → `PublishAttempt` kapanır.
3. **10 saniyelik sistem bakışı.** Degradasyon varsa tek global bant; yoksa sıfır teknik gürültü.

### Haftalık döngü
- Plan·Takvim: haftanın Reels/carousel slotları; dossier onayları; Production Pack indirme.
- İlham: yakalanan rakip içeriklerin analiz kartları → beğenilenler pattern olarak kütüphaneye.
- Hafıza: önerilen kurallar gözden geçir → onayla/reddet; onaylı kural sonraki üretimi görünür etkiler.

### Aylık döngü
- Aylık Reels planı (assembler 60/25/15) → site doğrulamaları → dossier üretimi.
- Maliyet muhasebesi: UsageLog ay özeti + model dağılımı + bütçe tavanı gözden geçirme + **Neon CU-saat projeksiyonu**.
- Öğren→Obsidian: ay içinde işlenen kaynakların export audit'i.

### İlk 10 dakika (bir hafta açılmamış olsa bile)
Açılış → Bugün en güncel taslakları gösterir (cron'lar çalışmaya devam etmiştir); "kaçırdıkların" yığını YOK — bugünün işi + Plan'da onay bekleyenler rozeti. Sistem sağlıksızsa tek dürüst bant: "Veritabanı erişilemez — son başarılı veri: X saat önce" (last-known-good gösterimi, boş ekran değil, ekran başına hata yağmuru değil).

### Ayrışma (CemOS'un gerçek avantajı)
(1) Onaylı hafıza kurallarının çıktıya ölçülebilir etkisi, (2) intent-dürüstlüğü + PublishAttempt kalıcılığı, (3) her ücretli çağrının rezervasyon+ledger izi + veri-gizliliği sözleşmeli routing.

---

## 4. Nihai Bilgi Mimarisi

Mevcut IA (3 birincil alan + Araştırma + Toolbox + Profil) DOĞRU omurga. Hedef: **15 navigable production yüzeyi + 3 absorbed/alias route** (Keşif→Fırsatlar, Maliyet→Sistem, Entegrasyonlar→Ayarlar). Yeni yüzey YOK; yoğunluk bağlamsal modüllerle. IA değişiklikleri **önce preview kanıtıyla** doğrulanır ve operasyonel kapanışı geciktirmez (WP-05, redesign değil taşıma).

| Yüzey | Amaç / verilecek karar | Değişiklik | Durumlar |
|---|---|---|---|
| **Bugün** | "Bugün ne paylaşıyorum?" | +"neden bugün" haber bağı, hafıza chip'leri, mini plan-özeti (modül; sidebar öğesi EKLENMEZ) | 4 durum tam |
| **Plan·Takvim / Fırsatlar / Seriler** | Ne çıkacak, hangi site, seri DNA | Fırsatlar'a Keşif modül olarak katlanır (alias) | Tam |
| **Kütüphane·Tümü / İlham / Öğrenme** | Bul, ilham al, öğren | İlham boş-board kopyası verify | Tam/verify |
| **Araştırma (host):** Haberler, YouTube, Viral Radar, X Kaynakları | Sinyal tarama | Keşif tab'ı kalkar (alias); RadarTab host hata sınırı | RadarTab verify |
| **Toolbox** | Araç bul/favorile | Korunur | Tam |
| **Profil·Hafıza** | Kural onayı/geri alma | +"etki izi" kolonu | Tam |
| **Profil·Ayarlar** (+Entegrasyonlar absorbed) | Provider config + doğrulama TEK yerde | Tri-state rozet: Yapılandırıldı/Doğrulandı/Bilinmiyor + Engelli | Tam |
| **Profil·Sistem** (+Maliyet absorbed) | Sağlık + cron + maliyet | Maliyet sekmesi + 4 cron sağlık kartı | Tam |

Mekanizma: `TAB_ALIASES` (mevcut `instagram→plan-seriler` örüntüsü); ekran bileşenleri silinmez; `verify:acceptance` nav↔registry paritesi 15+3'e güncellenir; command palette ve deep-link'ler absorbed route'ları yeni eve yönlendirir (geriye-uyum testi zorunlu). Desktop yoğunluk: 1280'de üç kolon Bugün, 1024'te iki kolon; hiçbir viewport'ta yatay taşma.

---

## 5. Ekran Bazlı UX Kapanış Planı

UX denetimi mevcut 18 yüzeyin 17'sini durum-yönetiminde GOOD buldu; bu bölüm yalnız **delta** listeler:

| Ekran | Korunacak | Değişecek | Gerçek veri gereksinimi | Kabul kriteri |
|---|---|---|---|---|
| Bugün | Kart yapısı, readiness rozetleri | +"neden bugün", +hafıza chip'leri, +paylaşıldı-işaretle görünürlüğü | Canlı cron çıktısı, ≥1 gerçek taslak/hesap | Sabah 09:00'da iki hesapta gerçek taslak; DB-down'da last-known-good bandı, 500 yok |
| RadarTab (Haberler) | SubNav yapısı | Host'a hata sınırı; çocukların 4 durumu verify | NewsItem + fetchedAt görünür | Haber kartında yaş damgası; boş kaynak → EmptyState |
| İlham | Akış | `InspirationGrid` sıfır-öğe kopyası verify/ekle | ≥1 gerçek capture | Boş board çıplak grid göstermez |
| CostsTab→Sistem sekmesi | Dürüst hata (yerel fix) | Sistem'e taşınır; ay özeti aggregate endpoint'ten | UsageLog gerçek satırları | API hatasında $0 asla; "veri X dakika önce" damgası |
| Entegrasyonlar→Ayarlar | Liveness verisi | Tri-state rozet; `status` liveness-gated | Ledger kayıtları | Key-var-ama-bozuk provider "Doğrulandı" GÖSTERMEZ |
| Sistem | Health kartları | +4 cron kartı (CronRun) | CronRun satırları | Cron başarısızlığı 24 saat içinde görünür |
| Diğer yüzeyler | Tamamı | — | DB canlı | Mevcut 4-durum davranışı prod'da regresyonsuz |

---

## 6. AI ve Agentic Mimari

**İlke: en küçük etkili orkestrasyon. Yeni "agent" YOK; mevcut rol zinciri korunur, üç düzeltme + bir sözleşme alır.**

- **Roller (korunur):** cheapWriter (batch/extract) → creativeWriter (taslak) → viralJudge (karşı-aile) → qualityJudge → finalEditor. Tetikleyiciler: cron pipeline, manuel üretim, learn sweep. Registry config-driven; writer≠judge aile kuralı boot'ta zorlanıyor — korunur.
- **Düzeltme 1 — sahte escalation:** gerçek escalation preset (`anthropic/claude-opus-4.8`, repo tablosunda $5/$25), default-OFF, yalnız judge-altı-eşik + operatör onayı.
- **Düzeltme 2 — hafıza etkisi:** taslağa `appliedMemoryFactIds` provenance'ı (QueueItem Json meta, additive, migration YOK), UI chip, eval harness'ta kural-açık/kapalı karşılaştırma.
- **Düzeltme 3 — benchmark-önce-promotion:** primary model değişikliği yalnız shadow benchmark eşiğiyle (§7).
- **Sözleşme — gizlilik/routing (§7):** tüm `generateJsonGated` çağrılarına provider-privacy alanları.
- **Hafıza disiplini (korunur):** öneri≠onay, provenance+kapsam+hesap, supersede, geri alma.
- **Observability:** PipelineTrace + UsageLog + EvalRun mevcut; cron kartlarıyla (WP-08) yüzeye çıkar.

---

## 7. Model Fiyat/Performans Planı

### 7a. Katalog gerçekleri (canlı doğrulanmış, 2026-07; repo `MODEL_PRICING` 2026-07-20 damgalı, birebir tutuyor)

| Görev | Model | In/Out $/M | Statü |
|---|---|---|---|
| Yazar (mevcut primary — DEĞİŞMEZ, benchmark'a dek) | `anthropic/claude-sonnet-5` | 2.00/10.00 (**2026-08-31'e dek intro**; sonra 3/15) | production |
| Yazar adayı (önde gelen fiyat/performans) | `deepseek/deepseek-v4-pro` | 0.435/0.87 | **benchmark adayı** — JSON/schema güvenilirliği KANITLANMAMIŞ, test edilecek |
| Yazar adayı 2 | `google/gemini-3.5-flash` | 1.50/9.00 | benchmark adayı (karşı-aile fallback rolü korunur) |
| Judge | `openai/gpt-5.4-mini` | 0.75/4.50 | KORUNUR (karşı-aile kuralına tek uygun ucuz seçenek) |
| Ucuz batch/extract | `deepseek/deepseek-v4-flash` / `gemini-3.1-flash-lite` | 0.09/0.18 · 0.25/1.50 | korunur |
| Gerçek escalation (YENİ, default-off) | `anthropic/claude-opus-4.8` | 5/25 | judge-altı-eşik + onay |
| Embeddings | yerel deterministik (arama) + `text-embedding-3-small` 0.02/M (vector-memory, gated) | | değişmez |

**Ekonomi projeksiyonu (bilgilendirme, karar değil):** taslak koşusu (6k/2k yazar + 3k/1k judge): Sonnet-5 $0.0388 → DeepSeek-v4-pro geçerse $0.0111 (~%71). 2 hesap × 5 taslak/gün: ~$3.35/ay → ~$0.97/ay.

### 7b. Shadow benchmark → koşullu promotion (WP-06 sırası)

1. Production primary DEĞİŞMEDEN kalır.
2. Temsilî golden sette (hesap başına ≥5 taslak girdisi) DeepSeek V4 Pro + Gemini Flash sınıfı aday + mevcut Sonnet-5 karşılaştırılır: aynı girdiler, aynı schema, aynı judge rubric, benzer reasoning budget.
3. Ölçülen: schema/JSON başarı oranı, retry oranı, latency, gerçek maliyet, persona uyumu, hook, kaynak doğruluğu, edit distance, tekrar/kalıp sızıntısı, **Türkçe kalitesi**.
4. Ucuz model yalnız kabul eşiğini geçerse primary'ye terfi eder; geçemezse Sonnet-5 kalır ve maliyet için prompt/context optimizasyonu yapılır.
5. Model değişikliği tek satırlık rollback'e sahiptir. Premium escalation default-off kalır.

### 7c. OpenRouter gizlilik ve routing sözleşmesi (ZORUNLU)

`generateJsonGated` (ve embeddings) istek gövdesine:

- `provider.data_collection: "deny"` — her ücretli çağrıda.
- Uygun endpoint varsa `provider.zdr: true` (zero-data-retention).
- `provider.require_parameters: true` (JSON/schema parametrelerini desteklemeyen provider'a düşmeyi engeller).
- Görev-bazlı `max_price` (preset başına; katalog fiyatının ~1.5×'i tavan).
- Kontrollü `allow_fallbacks`; fallback zinciri **≤2** ve hepsi kataloglu.
- UsageLog'a ek alanlar: gerçekleşen provider, model, actual cost, latency, schema-retry sayısı.
- **Hafıza, Instagram veya kişisel içerik verisi training-enabled endpoint'e GİDEMEZ.** Data-policy filtresi nedeniyle model kullanılamıyorsa: **fail-closed** (çağrı yapılmaz, `blocked-policy` olarak loglanır) veya açıkça onaylanmış güvenli fallback. Sessizce daha pahalı veya veri toplayan provider'a düşmek YASAK.
- `verify:ai-economics`'e assertion: data_collection alanı tüm preset'lerde mevcut; fallback ≤2; escalation≠writer-primary.

---

## 8. DB ve Altyapı Kararı — Koşullu Karar Ağacı

### 8a. Resmî plan gerçekleri (v2'de düzeltilmiş)

- **Neon Free:** proje başına aylık **100 CU-saat**; restore penceresi ~6 saat/1 GB değişiklik; autosuspend 5 dakika (bağlantıyla uyanır — kota bitmediyse).
- **Neon Launch:** sabit $19 DEĞİL; **kullanım bazlı, resmî tipik örnek ~$15/ay**; yapılandırılabilir restore penceresi **7 güne kadar** (2026-07-17 kazasında PITR kanıtlanmış değer).
- **Supabase Free:** **otomatik backup ve PITR YOK.** Geçmiş kaza göz önünde: Supabase Free'ye geçiş backup açısından otomatik iyileşme DEĞİLDİR.

### 8b. Suspension teşhisi — HİPOTEZ, kanıt değil

Suspension çok günlük ve kalıcı; normal autosuspend bağlantıyla uyanırdı. **"Free compute kotası tükendi" şu an en olası hipotezdir; kesin neden yalnız Neon Console'dan salt-okunur teşhisle doğrulanır (OP-1).** Plan, neden görülmeden kesin hüküm vermez.

### 8c. Ölçülen kod-tarafı compute/egress sürücüleri

(1) 5 dakikalık health poll ↔ Neon 5 dakikalık autosuspend çakışması → açık sekme compute'u sürekli uyanık tutar; (2) health çağrısı başına ~10-12 sorgu + plan-health fan-out (15 saniyelik memo tek-tab 5 dakika kadansında etkisiz); (3) `/api/costs` ay-bazlı tam-satır findMany; (4) 7 sınırsız findMany; (5) learn+daily cron yazma hacmi.

### 8d. Karar ağacı (SIRALI — ölçüm öncesi ödeme/migrasyon YOK)

1. **OP-1:** Neon Console'dan suspension'ın kesin nedenini salt-okunur doğrula.
2. **WP-00:** Beş düzeltmeyi + **WP-01** DB-down dürüstlüğünü ship et.
3. **WP-02:** Egress/compute kapanışını uygula (event-driven health, aşağıda).
4. Neon kotası resetlendiğinde veya compute açıldığında **Free üzerinde 7 günlük ölçüm**: günlük CU-saat, wake-up sayısı, storage, egress.
5. **Kal-kriteri:** aylık projeksiyon **<80 CU-saat** VE storage/egress limitlerinin **<%80'i** → **Neon Free'de kal.**
6. Eşik aşılırsa: önce **Neon Launch gerçek tahmini maliyetini ölç** (kullanım-bazlı; tipik ~$15/ay) → Supabase migration maliyeti + operasyon riskiyle karşılaştır.
7. **Supabase yalnız** ölçüm Neon Free'in sürdürülemez olduğunu gösterirse adaydır.
8. Supabase Free seçilirse ZORUNLU: ayrı **günlük şifreli logical backup + off-site saklama + restore drill** (otomatik backup yok).
9. Neon Launch, **PITR (7 gün) + sıfır migration riski** istendiğinde ücretli güvenlik seçeneği olarak her zaman açık.

Ek: RELEASE-GATE'in beklettiği **Neon parola rotasyonu** OP-1 seansında yapılır. Migration disiplini değişmez: additive-only, `safe-migrate-deploy`, SQL inceleme, prod-URL asla shadow.

---

## 9. Entegrasyon Kapanış Matrisi

**Kural: her credential/env aksiyonundan önce Production + Preview ortamında VAR/YOK doğrulaması yapılır (değer asla okunmaz/yazdırılmaz). Yalnız gerçekten eksik olanlar operatörden istenir.**

| Provider | Configured | Connectivity | Live read | Live write | Blocker / Aksiyon |
|---|---|---|---|---|---|
| Neon | ✅ | ❌ ERİŞİLEMEZ | ❌ | ❌ | **OP-1: konsol teşhisi (salt-okunur) + parola rotasyonu**; karar §8d ağacına göre |
| Vercel (host+OIDC) | ✅ | ✅ CANLI | ✅ | ✅ (session) | — |
| OpenRouter | ✅ | ✅ (catalog probe) | üretim bastırılmış olabilir | n/a | **OP-2: kredi; `OPENROUTER_KEY_ROTATED_AT` yalnız VAR/YOK kontrolü eksik gösterirse istenir** |
| Composio IG | ✅ | tanımlı (Connect SEARCH) | ❌ koşulmadı | yok (read-only) | OP-3: ACTIVE onayı → J3 |
| Meta Graph | ✅ (dev-mode) | kısmi | business_discovery geçmişte canlı | ❌ | **OPTIONAL FALLBACK** — Composio çalışırsa final kapısında ZORUNLU DEĞİL |
| SocialData | ✅ | ✅ (deep probe) | ✅ (bütçeli) | n/a | — |
| X publish | intent-only | n/a | n/a | intent | **intent-only FINAL ürün kararı** |
| Obsidian | ✅ kod (3 kanal) | ❌ | ❌ | ❌ | **OP-5: operatör HEDEF SEÇER** — GitHub otomatik export (önerilen production hedefi) / ZIP manuel fallback / local yalnız yerel runtime. Token yalnız GitHub seçilirse ve VAR/YOK eksikse istenir |
| YouTube/Supadata/Gemini | ✅ | zincir tanımlı | kısmen (Supadata geçmişte canlı) | n/a | Supadata ~100/ay kota takibi |
| fal.ai | ✅ | ledger-bazlı | ❌ | ❌ | ayrı bütçe; golden run'da 1 görsel |
| Tier-2 render | ❌ | — | — | — | BLOCKED-PRODUCT-DECISION (Production Pack yeterli) |

---

## 10. Opus Uygulama İş Paketleri

**Teslimat topolojisi (v2):** İş paketleri **atomik commit** olarak kalır; her commit bağımsız geri alınabilir. PR yapısı:

- **PR-A (hotfix):** WP-00 — mevcut 5 commit. Deploy kapısı 1: acil dürüstlük/güvenlik hotfix'i.
- **PR-B (resilience+egress closure):** WP-01 + WP-02 (+ WP-04 sığarsa). Deploy kapısı 2: DB dayanıklılık kapanışı.
- **PR-C (closure):** WP-05..09 mantıklı commit dizisi. Deploy kapısı 3: final release candidate.
- Preview verification her anlamlı pakette; production deploy YALNIZ 3 kontrollü kapıda. 10 ayrı PR/deploy YOK.

### WP-00 — Prod parity (hotfix PR-A)
**Önkoşul: branch'in hâlâ `fix/prod-audit-egress-security@98a94fa` durumunda olduğunu yeniden doğrula** (`git status/log`, dirty tree kontrolü). Push → PR (main) → temiz-bağlam review (code-reviewer + security-reviewer paralel) → merge → deploy (operatör onayı) → smoke (/giris 307, korumalı 401, error log temiz). Rollback: Vercel promote-previous. Bağımlılık: yok.

### WP-01 — DB-down dürüst degradasyon + circuit breaker (PR-B)
**Amaç:** DB erişilemezken beklenmeyen 500 değil; yapılandırılmış `503 {ok:false, reason:"db_unavailable"}` + tek global bant + bounded istek.
Kapsam: `isDbUnavailableError` sınıflandırıcısı; API ortak error path'ine bağlama; **circuit breaker + exponential backoff** (breaker açıkken tekrar eden route çağrıları bastırılır; UI aynı hata için sonsuz retry üretmez); `SystemHealthProvider`'a `dbUnavailable` sinyali — **tek health sonucu uygulama geneline yayılır** (15 yüzey ayrı ayrı istek fırtınası ATAMAZ); AppShell bandı + last-known-good zaman damgası; health endpoint DB-down'da **200 + degraded contract** döner (503 döngüsü yaratmaz).
Kabul: prod DB çalışırken normal iş akışlarında 5xx=0; DB-down sertifikasyonunda beklenmeyen 500=0, beklenen 503'ler sınıflandırılmış VE bounded (breaker-açıkken dakikada ≤N istek, N spec'te sabitlenir); tek global bant, ekran başına hata yağmuru yok. Bağımlılık: WP-00.

### WP-02 — Event-driven health + compute/egress kapanışı (PR-B)
**Amaç:** Compute uyanıklığının kökünü kes; 5 dakikalık periyodik poll ↔ Neon 5 dakikalık autosuspend çakışmasını bitir.
Kapsam: (a) **Periyodik DB health polling KALDIRILIR** → event-driven: ilk page load, window focus, manuel yenileme, mutation-sonrası revalidation; periyodik kontrol kalacaksa **≥15-30 dakika** ve hidden'da tamamen durur; (b) DB-unavailable'da WP-01 breaker devrede; (c) health endpoint pahalı fan-out ÇALIŞTIRMAZ — plan-health dossier fan-out yalnız `?deep=true`'da; deep health yalnız manuel veya düşük frekanslı operasyon kontrolünde; (d) `/api/costs` ay görünümü `groupBy/aggregate`'e; (e) 7 sınırsız findMany'ye `select`+`take` (costs:96, feed-the-goat:71, source-intelligence:46, settings:13, pattern-library:19, series:17, accountRepo:6/evalTestRepo:37); (f) vitest global setupFile: dummy `DATABASE_URL` + prod-host assertion.
Kabul: normal açık sekme için **günlük DB wake-up sayısı** hedefi (≤8/gün; event-driven olduğundan kullanım-orantılı), health kaynaklı sorgu sayısı ≤4/çağrı, **aylık CU-saat projeksiyonu** hesaplanabilir (ölçüm aracı: basit sayaç/log), breaker-açıkken istek sayısı bounded. Bağımlılık: WP-01.

### WP-03 — DB kararının uygulanması (OPERATÖR-GATED, §8d ağacı)
Free'de 7 günlük ölçüm → kal-kriteri değerlendirmesi → gerekirse Launch maliyet ölçümü → ancak kanıtla Supabase runbook (dump→restore→`migrate deploy`→satır mutabakatı→URL swap→eski Neon 7 gün read-only rollback + **günlük şifreli logical backup zorunluluğu**). Kabul: `/api/health` canlı yeşil; 15 yüzey veri gösteriyor. Bağımlılık: OP-1 + WP-02 (ölçüm ancak egress fixlerinden sonra anlamlı).

### WP-04 — Hesap ayrımı sertleştirme (PR-B veya PR-C)
`activeChannel` tek gerçek kaynak; `useAccounts.accountId` ondan türetilir; `useXAgentStore`'a kanal-scoped selector'lar — **red-line semboller ve localStorage key DEĞİŞMEZ**; tüketiciler selector'a geçirilir; desync unit + e2e (J10 hermetik yarısı). Kabul: ham `queueItems` okuyan filtresiz tüketici kalmaz (grep-doğrulanabilir); hesap değiştirince hiçbir stale/önceki-hesap verisi görünmez. Bağımlılık: WP-00.

### WP-05 — Configured≠verified + IA konsolidasyonu (PR-C)
(a) `integrations/route.ts` `status`'u liveness/lastVerifiedAt-gated tri-state'e; (b) UI rozetleri; (c) IA: 15 navigable + 3 absorbed (`TAB_ALIASES`), ekran bileşeni silinmez; (d) `verify:acceptance` 15+3 paritesi; (e) command palette + deep-link geriye-uyum; (f) RadarTab host hata sınırı + İlham grid boş kopyası; (g) **preview kanıtı** (screenshot) merge öncesi. Kabul: Ayarlar/Sistem provider durumu TEK kaynaktan; çelişen gösterim imkânsız; 3 absorbed route doğru yeni eve yönleniyor. Bağımlılık: WP-00.

### WP-06 — Model ekonomisi: benchmark → koşullu promotion (PR-C + canlı kısmı OP-2 sonrası)
§7b sırası aynen: primary değişmeden shadow benchmark → eşik geçilirse tek-satır promotion (rollback tek satır) → gerçek escalation preset (default-off) → §7c gizlilik/routing alanları `generateJsonGated`'e → `verify:ai-economics` güncellemesi (data_collection assertion, fallback ≤2, escalation≠writer). Kabul: benchmark raporu (10 metrik) dosyalanmış; promotion YALNIZ eşik kanıtıyla; UsageLog yeni alanları yazıyor. Bağımlılık: WP-00; canlı kısmı OP-2.

### WP-07 — E2E CI + retries=0 (PR-C)
Playwright workflow (PR+main, shard'lı); cold-compile flake'ine warmup navigasyonu; `retries: 0`. Retry artırarak gizleme YASAK. Kabul: CI'da 20 spec × retries=0, 3 ardışık koşuda stabil. Bağımlılık: WP-00.

### WP-08 — Cron/worker gözlemlenebilirliği (PR-C)
Sistem ekranına 4 cron kartı (CronRun: son koşu/sonuç/süre/sonraki); worker'ın prod'da gereksizliği docs+UI'da net ("self-host opsiyonel"). Kabul: başarısız cron 24 saat içinde Sistem'de görünür. Bağımlılık: WP-05.

### WP-09 — Hafıza etkisi kanıtlanabilir (PR-C; J2 altyapısı)
`appliedMemoryFactIds` (QueueItem Json meta, additive, migration YOK); Bugün chip'i; Profil·Hafıza "etki izi"; eval harness kural-açık/kapalı modu (hermetik mock + canlı golden örneği). Kabul: onaylı kural → sonraki taslakta chip + izlenebilir fark. Bağımlılık: WP-00; canlı kısmı OP-1+OP-2.

### WP-10 — Canlı sertifikasyon + docs mutabakatı (FINAL kapısı)
J1-J10 canlı koşum + kanıt (`docs/cemos-rebuild/LIVE-CERTIFICATION-*.md`; `shots/`a DOKUNULMAZ); **15 yüzey authenticated audit + 3 absorbed route yönlendirme testi** (console error=0, 1024/1280/1440/1920 overflow=0, empty/loading/error/stale/blocked durumları); docs çelişki düzeltmeleri (guard 98→82 tek gerçek, BUG-05 tek durum, RELEASE-GATE migration adımı). Kabul: §13 Final tanımı tüm maddeleri kanıt linkli. Bağımlılık: WP-01..09 + OP'ler.

**Yolculuk→paket eşlemesi:** J1(X intent)→WP-00+10 · J2(hafıza)→WP-09 · J3(Composio)→OP-3+WP-10 · J4(ilham)→WP-10 · J5(fırsat→dossier→Pack)→WP-10 · J6(haber→"neden bugün")→WP-05/09+10 · J7(learn)→WP-10 · J8(Obsidian, SEÇİLEN hedef)→OP-5+WP-10 · J9(toolbox)→WP-10 · J10(hesap ayrımı)→WP-04+10. Her yolculukta: önkoşul, fixture-dışı veri, happy/error/stale path, güvenlik, persistence+UI+log kanıtı.

---

## 11. Test ve Certification Matrisi

| Kapı | Araç | Eşik | Sınıf |
|---|---|---|---|
| typecheck / lint / build | tsc, eslint, next build | 0 hata | hermetik |
| catalog | `verify:catalog` | tüm preset slug'ları canlı mevcut | CANLI (ücretsiz) |
| acceptance | `verify:acceptance` | nav↔registry parite (**15 navigable + 3 absorbed**), cron path'leri | hermetik |
| ai-economics | `verify:ai-economics` | aile ayrımı + fiyat damgası + escalation≠writer + **data_collection + fallback ≤2** | hermetik |
| unit | vitest | tümü PASS + global dummy-DB setupFile aktif | hermetik (yapısal) |
| integration DB | itest ×5 | ephemeral postgres, çift kapı | hermetik |
| e2e | Playwright CI | 20 spec, **retries=0**, 3 ardışık stabil | hermetik |
| prod SHA proof | Vercel API | deploy SHA = merge SHA | canlı |
| 500 taraması | Vercel logs 48 saat | **beklenmeyen 500 = 0**; beklenen 503 `db_unavailable` sınıflandırılmış + bounded | canlı |
| 15+3 audit | authenticated tarama | 15 yüzey: console error=0, overflow=0 @1024/1280/1440/1920, 5 durum sınıfı; 3 absorbed route doğru yönlenme; command palette + deep-link uyumu | canlı |
| cron | CronRun + Sistem UI | 4 cron son-24-saat başarılı | canlı |
| compute ölçümü | wake-up sayacı + Neon konsol | günlük wake-up hedef içinde; **7 günlük CU-saat projeksiyonu <80 CU-saat/ay** (kal-kriteri) | canlı |
| bütçe mutabakatı | UsageLog vs rezervasyon | açık rezervasyon=0; settle=ledger; yeni provider/latency/retry alanları dolu | canlı |
| model benchmark | golden set raporu | 10 metrik; promotion yalnız eşik kanıtıyla; maliyet karşılaştırması dosyalı | canlı |
| 10 canlı yolculuk | LIVE-CERTIFICATION | J1-J10 kanıt linkli | canlı |

**İçerik kalite seti (golden):** hesap başına ≥5 taslak (×2 hesap), ≥3 carousel, ≥3 Reels dossier, ≥2 gerçek haber bağlı üretim, ≥1 rakip analizi, ≥1 hafıza-kuralı önce/sonra çifti. **15 boyut:** persona uyumu, hook gücü, özgünlük, kaynak doğruluğu, iddia güvenliği, okunabilirlik, emoji disiplini, hashtag kalitesi, thread yapısı, kalıp sızıntısı, edit-mesafesi, platform uyumu, CTA, viral potansiyel (leading indicator: judge skoru + edit-mesafesi + paylaşım oranı; garanti dili YASAK), üretilebilirlik + **Türkçe kalitesi** (benchmark'ta ayrıca). **Feedback loop:** paylaşılan taslaklar ↔ SocialData own-engagement sync → EvalRun geri beslemesi; kalibrasyon ≥20 örnek altında "yetersiz örnek" etiketi taşır.

---

## 12. Operatör Aksiyonları (azaltılmış; önce VAR/YOK doğrulaması)

**Kural:** Opus her aksiyondan önce ilgili env'in Production+Preview'da VAR/YOK durumunu doğrular (değer okunmaz/yazdırılmaz); mevcut olanlar listeden düşer.

| ID | Aksiyon | Koşul |
|---|---|---|
| OP-1 | Neon Console: suspension nedenini salt-okunur teşhis + parola rotasyonu | Koşulsuz (tek zorunlu başlangıç aksiyonu) |
| OP-2 | OpenRouter kredi; `OPENROUTER_KEY_ROTATED_AT` | Damga YALNIZ VAR/YOK kontrolü eksik gösterirse istenir |
| OP-3 | Composio Instagram bağlantısı ACTIVE onayı | J3 öncesi |
| OP-4 | ~~Meta kalıcı token~~ → **OPTIONAL** | Yalnız Composio canlı sync BAŞARISIZSA gündeme gelir |
| OP-5 | **Obsidian hedef SEÇİMİ:** GitHub otomatik export (önerilen) / ZIP manuel fallback / local (yalnız yerel runtime) | Token yalnız GitHub seçilir VE eksikse istenir |
| OP-6 | Deploy onayları (3 kapı: hotfix, resilience, final RC) + golden run USD tavanı (~$1 önerilir) + DB karar ağacı onay noktaları | İlgili kapılarda |
| — | X direct publish: aksiyon YOK — intent-only FINAL ürün kararı | — |

---

## 13. Final Tanımı

CemOS'a ancak şunların TÜMÜ kanıt linkiyle sağlandığında "final ve günlük kullanıma hazır" denir:

1. Bugün iki hesapta gerçek, readiness-rozetli taslak gösteriyor (canlı cron çıktısı).
2. **Uygulama açılışından ilk anlamlı taslağa ulaşma süresi ölçülü ve <2 dakika.**
3. **Bugün ekranından X intent'e ≤3 etkileşim.**
4. Hesap değiştirme sonrası **hiçbir stale/önceki hesap verisi görünmüyor** (J10 canlı).
5. X intent akışı dürüst ve `PublishAttempt` kalıcı (J1).
6. Composio IG sync canlı read-only veriyle doğrulanmış (J3; Meta yalnız optional fallback).
7. Reels: gerçek site doğrulaması → dossier → Production Pack ZIP+SRT (J5).
8. Haber → taslak bağı "neden bugün" ile görünür (J6).
9. Learn → **seçilen gerçek Obsidian hedefinde** idempotent export kanıtlı (J7+J8).
10. Onaylı hafıza kuralının sonraki taslağa etkisi chip + fark ile kanıtlı (J2).
11. Production loglarında (48 saat) **beklenmeyen 500 = 0**; beklenen 503'ler sınıflandırılmış ve bounded; **DB-down'da tek global açıklama, ekran başına hata yağmuru yok.**
12. Provider durumları Ayarlar/Sistem boyunca **tek kaynaktan** (tri-state; sahte $0 yok).
13. 4 cron'un sağlığı Sistem'de gözlemlenebilir; başarısızlık 24 saat içinde görünür.
14. **Golden kalite setinde ucuz-model promotion sonucu + maliyet karşılaştırması dosyalı.**
15. **7 günlük Neon CU-saat projeksiyonu ölçülmüş ve DB kararı bu ölçüme dayanıyor.**
16. Dış bağımlılıklar `BLOCKED-EXTERNAL` olarak dürüstçe etiketli.
17. Kullanıcı hiçbir günlük akış için teknik müdahale yapmıyor.

---

## 14. Opus Uygulama Başlangıç Promptu (v2, tek parça)

> Aşağıdaki metin, uygulama oturumunu başlatacak Opus'a verilecek prompttur.

---

CemOS repo'sunda (`C:\Users\alice\.gemini\antigravity\scratch\grafikcem_cemos`) uygulayıcısın. Otoritatif plan: `docs/cemos-rebuild/FINAL-OPERATIONAL-CLOSURE-PLAN.md` (REVİZE v2) — önce TAMAMINI oku. Çelişkide plan dosyası kazanır.

**İLK GÖREVİN KOD YAZMAK DEĞİL.** Sırayla:
1. Planın tamamını oku.
2. Şunları salt-okunur YENİDEN DOĞRULA: git branch/HEAD/dirty-tree (`fix/prod-audit-egress-security@98a94fa` bekleniyor), açık PR'lar, production deployment SHA (45875ad bekleniyor), Vercel Production+Preview env'lerinin VAR/YOK durumu (değerleri asla okuma/yazdırma), Neon erişim durumu (runtime loglardan).
3. Planın başlangıç gerçekleri değişmişse `docs/cemos-rebuild/IMPLEMENTATION-STATE.md`'ye "truth delta" bölümü yaz.
4. Sonra onay gerektirmeyen ilk güvenli iş paketine başla (WP-00 hazırlığı: PR-A).

**Plan referans gerçekleri (2026-07-22):** Prod = `main@45875ad` (dpl_8WmeP7Ms), OIDC canlı. Yerel branch 5 commit önde. Neon erişilemez; 48 saatte 118×500 (hepsi DB-route). Auth perimeter-proxy'de (`src/proxy.ts`) — route-içi guard gerekmiyor. X publish intent-only FINAL. Playwright `retries:1` ve CI dışı. Unit config'te global dummy-DB yok.

**Teslimat topolojisi:** Atomik commit'ler; PR-A (hotfix: WP-00) → PR-B (resilience+egress: WP-01, WP-02, mümkünse WP-04) → PR-C (closure: WP-05..09). Production deploy YALNIZ 3 kontrollü kapıda (hotfix / DB-dayanıklılık / final RC). **Her WP için ayrı PR AÇMA.** Preview verification her anlamlı pakette.

**YASAKLAR:**
- Her WP için ayrı PR açmak.
- Shadow benchmark tamamlanıp eşik kanıtlanmadan model primary'sini değiştirmek.
- 7 günlük CU-saat ölçümü yapılmadan Neon Launch veya Supabase kararı vermek/önermek.
- Production DB'ye shadow/diff/test amacıyla dokunmak; `migrate reset`; destructive `db push`; prod URL'i shadow olarak kullanmak.
- Kullanıcıdan mevcut credential'ı tekrar istemek (önce VAR/YOK doğrula).
- `useXAgentStore`/`useCemOsStore`/`"xagent-store"`/`XAgentApp.tsx`/`src/store/xagent.ts`/HTTP User-Agent kimliklerini yeniden adlandırmak; `shots/`a dokunmak.
- Secret loglamak; ham Prisma/provider hatası sızdırmak; test skip/retry-artırma/assertion-gevşetme; fixture sonucunu canlı kanıt diye sunmak; rezervasyonsuz ücretli çağrı; data-policy filtresi yüzünden sessizce veri-toplayan provider'a düşmek.

**DB hata semantiği:** beklenmeyen 500=0; bilinen DB hatası = yapılandırılmış `503 db_unavailable` + circuit breaker + bounded istek; health DB-down'da 200+degraded döner. "DB kapalıyken tüm 5xx=0" diye çelişkili kriter kullanma.

**Test kapıları (her paket sonunda):** typecheck+lint+unit+build; ilgiliyse `verify:catalog`/`verify:acceptance`/`verify:ai-economics`; WP-07 sonrası e2e retries=0 CI'da. "Yeşil" yalnız komut çıktısıyla; başarısızlık verbatim.

**Durup kullanıcı onayı isteyeceğin yerler (SADECE):** 3 deploy kapısı; OP-1 sonrası DB karar ağacı dallanmaları (ödeme/migrasyon); OP-2 kredi; golden run USD tavanı; Obsidian hedef seçimi; herhangi bir migration SQL'i. Diğer teknik kararları planla ver, gerekçesiyle kaydet, ilerle.

**Canlı doğrulama:** Her paketin production doğrulaması gerçek prod'da (log, SHA, ekran). Hermetik yeşil canlı kanıt sayılmaz. WP-10'da J1-J10 LIVE-CERTIFICATION dosyalarına kanıt linkli; §13'ün 17 maddesi tamamlanmadan "final" ilan edilmez. Next.js 16.2.6 — Next kararından önce `node_modules/next/dist/docs/` ilgili belgeyi oku.

**Rapor yazma; kanıtlanmış işi tamamla.** Paket bitir → kapıları koş → kanıtı dosyala → sıradakine geç.

---
*Plan sonu (REVİZE v2). Bu belge salt planlama çıktısıdır; hiçbir kod, DB, env, git, deploy değişikliği yapılmamıştır.*
