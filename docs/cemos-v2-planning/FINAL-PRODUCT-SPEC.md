# CemOS V2 — Final Product Spec

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) (kilitli kararlar D1-D7) + [research/_repo-baseline.md](./research/_repo-baseline.md).
> **Kuzey yıldızı:** CemOS her gün açılan sistem değil, çünkü (1) **Odak yok**, (2) **Taslak kalitesi** yetersiz. V2'nin tek varlık sebebi bu ikisini çözmek.
> Tarih: 2026-07-08.

---

## 1. Ürün tanımı

**CemOS**, Ali Cem'in (tek operatör) günlük içerik üretim işletim sistemi:
- **Okur** (haber, X kaynakları, YouTube, rakipler), **analiz eder** (skorlar, fırsatlar), **taslak üretir** (X tweet, IG caption/carousel, Reels dosyası).
- **Yayınlamaz.** Yayın kararı ve eylemi her zaman insandadır (manual-publish invariant — güvenlik özelliği).
- 2 X hesabı: **@grafikcem + @maskulenkod** (pixelspor = sonraki faz). UI tamamen **Türkçe**.
- Tek operatör: workspace/kullanıcı yönetimi/enterprise mimarisi YOK.

**Başarı tanımı (ürün seviyesi):** Ali Cem her sabah CemOS'u açar, <5 dakikada 2 hesabın taslaklarını inceler-düzenler-paylaşır ve "Bugünlük bitti ✓" görür. Düzenlemeler kozmetiktir, yeniden yazım değildir.

## 2. İlkeler (değişmezler)

1. **"One surface, one number, one action."** Bugün = tek günlük hedef. "N taslak seni bekliyor" = tek sayı. Onayla/kopyala = tek eylem.
2. **Additive-only DB.** Destructive migration yasak; `db:push` disiplini sürer.
3. **Legacy semboller dokunulmaz:** `useXAgentStore`/`useCemOsStore`, `"xagent-store"`, `XAgentApp.tsx`, `src/store/xagent.ts`, HTTP User-Agent kimlikleri.
4. **Skor asla kesinlik değil.** "Viral olabilir" tek sayı olarak ASLA gösterilmez; her zaman açıklanabilir alt-sinyallerle birlikte (FINAL-EVALUATION-SPEC).
5. **LLM çıktısı doğrulamanın yerine geçmez.** Site var mı / açılıyor mu → HTTP+browser kanıtı; fact-check → kaynak provenance + insan.
6. **Merkezi model yönetimi.** Dağınık hardcoded slug yok; preset katmanı (`presets.ts`) + mevcut rol registry'si. Preview/floating model asla primary olamaz.
7. **`generateJsonGated` tek giriş kapısı.** Her LLM harcaması gate'li + loglu (en çok mutabık kalınan tek aksiyon — 6/9 rapor).
8. **Deterministik-önce.** LLM yalnızca gerçek muhakeme gereken yerde; tazelik/dedup/leak/lint/pillar-denge/edit-distance saf kod.

## 3. Kapsam — MVP / V1 / V2

### MVP (Sprint 1, ≤2 hafta) — yalnız odak + kalite
- **Bugün queue-first**: ReviewQueue en üstte; istatistikler tek satır sayaç; sağlık göstergesi yalnız sorunda açılır; "Bugünlük bitti ✓" bitiş durumu; feed/kütüphane ekranlarına ayrı error state.
- **X motoru birleştirme (Low)**: tek hesap kimliği (`accounts.ts`), Sprint scorer alt-sinyalleri `QueueItem.scores`'a, leak gate bloklayıcı (`needs_edit`), deterministik Türkçe klişe/CTA lint.
- **Model katalog tazeleme + 9 preset** (sıcak yollar: writer/judge/news-extract) + bu yolların gate migration'ı + Anthropic prompt-cache.
- **Sinyal kabloları**: edit-distance hesaplama (FeedbackEvent'ten, bedava), pattern-embedding bug fix (`vector-memory.ts:304`), FeedbackEvent→retrieval, VoiceProfile'ı prompt builder'a bağlama.
- **Plumbing**: idempotency key (generate-morning, discovery), startup secret assertion, `typecheck` script.
- **MVP'de OLMAYAN**: yeni tablo (sıfır migration), yeni ekran, yeni agent, rakip istihbaratı, tam memory, Reels, aylık plan.

### V1
- Nav konsolidasyonu 16→5 grup (Bugün · Radar · Kütüphane · Youtube · Araçlar) + klavye inceleme + IG lane (DraftReviewCard reuse).
- Memory foundation: `MemoryFact` + Caption/Hashtag DNA + onay kuyruğu + voice constitution + embedding upgrade adayı (A/B sonrası).
- Tam 14 alt-skor + karşı-aile judge + council birleşimi + performans atıfı + kalibrasyon cron.
- Rakip watchlist + business_discovery sync + swipe-file + tek Instagram alan ekranı (alt-sekmeler: Rakip Radarı / Reels).
- Website verifier (HTTP tier) + Reels Dossier + `SeriesProfile` (ilk seri: Best AI Tools) + carousel üretici.
- Aylık planlayıcı (önce dosya listesi, sonra ay grid'i). Kalan ~72 raw `generateJson` çağrısının gate migration'ı.

### V2
- Performans öğrenmesi ileri seviye (pairwise/bandit), pgvector (eşik: ~50k vektör veya p95>150ms), otomatik model benchmark + escalation (flag'li), gelişmiş multimodal, kontrollü yayın entegrasyonu (opt-in, API scheduling), pixelspor onboarding, content-gap engine, render-tier GA, unified review inbox.

**Tam yerleşim tablosu:** RESEARCH-SYNTHESIS §5 — tek otorite; spec'ler arası çelişkide o tablo kazanır.

## 4. Ürün yüzeyleri (özet — detay FINAL-UX-SPEC)

| Yüzey | Rol | Faz |
|---|---|---|
| **Bugün** | TEK günlük hedef: sayaç + sağlık tik + ReviewQueue + "tepki vermeye değer" (sınırlı ~3) + katlanmış digest | MVP refine |
| Günlük Kuyruk | Bugün'ün drill-down'ı (tam skorlar/kanban) | V1 demote |
| Radar | 4 Twitter intel ekranının birleşimi — girdi yüzeyi, hedef değil | V1 merge |
| Kütüphane | 3 kütüphanenin birleşimi (alt-sekme) | V1 merge |
| Youtube | Mevcut, olgun | KEEP |
| Instagram | Bugün'de lane + tek alan ekranı (Rakip Radarı / Reels alt-sekme) | V1 |
| Araçlar | toolbox/costs/settings — günlük yoldan uzak; eval+health KPI'ları CostsTab'de | KEEP demote |

## 5. İçerik motorları (özet — detay FINAL-CONTENT-ENGINE-SPEC)

- **News**: olduğu gibi KEEP; LLM çağrıları gate'lenir.
- **X**: TEK birleşik 16-aşamalı pipeline, LIVE `draft-pipeline` omurga; Sprint'ten scorer + leak-detector absorbe; Sprint kopyaları eval-parity sonrası emekli.
- **YouTube**: KEEP (rakip motoru + brief, IG rakip motorunun şablonu).
- **IG rakip**: yalnız policy-safe (business_discovery + operatör manuel capture); scraping asla.
- **Reels/verifier**: HTTP+browser kanıtı otoriter; LLM yalnız kanıt özetler; kanıtsız araç adı → `not_ready`.
- **Carousel/Series DNA**: `SeriesProfile` + VoiceProfile bağlama; ≤5 çeşitli few-shot; PRELUDE edit-diff öğrenmesi (operatör onaylı).

## 6. Maliyet zarfı

Doğrulanmış katalogla (2026-07-08): normal ay **~$9-10** (varsayılan `MONTHLY_AI_BUDGET_USD=$10` içinde), düşük ~$3-5, yoğun ~$22 (bütçe artırımı gerektirir). Premium (sonnet-5) yalnız writer + top-3 final-judge; her şey ucuz katmanda. Detay: FINAL-OPENROUTER-ROUTING §funnel.

## 7. Ölçülebilir ürün KPI'ları

| KPI | Hedef | Kaynak |
|---|---|---|
| Günlük aktif kullanım (aç + eylem) | her gün | gerçek kuzey yıldızı |
| Time-to-First-Approve | <60 sn | rapor 01 |
| Primary task için ekran sayısı | 1 (Bugün'den çıkmadan) | rapor 01 |
| Median edit-distance (taslak→yayın) | düşen trend | rapor 07/09 — "taslaklar benim gibi" vekili |
| Acceptance rate | yükselen trend | FeedbackEvent |
| Aylık AI maliyeti | ≤ bütçe, %100 loglu | UsageLog |
| Sağlıklı-durum kesintisi | 0 | readiness gate |

## 8. Riskler (ürün seviyesi)

RESEARCH-SYNTHESIS §6'daki top-5 geçerli: katalog drift · sprint-1 scope creep · motor birleştirme regresyonu · false learning · verifier staleness+SSRF. Ek ürün riski: **V1 yüzey enflasyonu** — IG/Reels/planner üç ayrı ekran olursa odak tezi ölür → C6 kararı (tek Instagram alanı, alt-sekme) bağlayıcı.

## 9. Kabul (ürün seviyesi — senaryo testleri)

1. **Bugün ritüeli:** operatör açar → 2 hesabın hazır taslaklarını görür → kaynak kontrol eder → düzenler → ret nedeni seçebilir → onaylar/kopyalar → <5 dk'da "Bugünlük bitti ✓".
2. **Site Reels'i (V1):** sistem aracı bulur → HTTP/browser ile açıldığını + signup/free-tier durumunu doğrular → Reels Dossier üretir → daha önce tanıtılmadığını `pastTopics`/repetition kontrolünden geçirir → caption+hashtag üretir → kanıtsız araç `not_ready` kalır.
3. **Hafıza (V1):** operatör "fazla kurumsal" diye 3 içeriği reddeder → sistem proposed preference üretir → TEK retle kalıcı kural OLUŞMAZ (≥3 gözlem eşiği) → operatör onaylarsa kural aktifleşir, rollback mümkün.
4. **Arıza:** OpenRouter primary düşer → fallback zinciri devreye girer → job idempotency key sayesinde iki kez yazılmaz → maliyet UsageLog'a işlenir → kullanıcıya teknik olmayan Türkçe hata gösterilir.
