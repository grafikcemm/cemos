# 08 — PHASE 3 PLAN (Instagram İçerik Zekâsı, dilimli)

> Durum tarihi: 2026-07-17. Phase 2E kapanış durumu: production contract
> complete, live activation BLOCKED-EXTERNAL (ADR-034). Bu plan mevcut kodu
> YENİDEN İCAT ETMEZ — her dilim mevcut karşılığın üstüne additive gider.
> **Bu oturumda yalnız Phase 3A uygulanır.**

## Mevcut zemin (yeniden yazılmaz)

| Alan | Mevcut karşılık |
|---|---|
| IG read köprüsü | `bridgeSyncService` + `ComposioInstagramReadProvider`/`metaGraphInstagramReadProvider` + `selectInstagramReadProvider` (ADR-032: read-only, bounded, fail-closed handle, explicit connected_account_id, no silent fallback) |
| Binding | `AccountPlatformBinding` (unique accountId+platform+provider; bridgeSync upsert eder) |
| Own-account veri | `IgMedia`/`IgComment`/`IgInsightSnapshot` (+ `ContentItem` köprüsü `fromIgMedia`) |
| DNA damıtma | `dnaDistillService` (deterministik, LLM'siz; operator-owned CaptionDna'yı EZMEZ) |
| Seri sözleşmesi | `SeriesProfile` + `seriesService` (`buildCarouselPrompt`, few-shot ≤5) + `PUT /api/series` (version+promptVersion bump = insan onayı) |
| Prompt grounding | `memory/retrieval.buildIdentityMemoryContext` (voice → facts → DNA özeti) |
| Rakip izleme | `IgWatchAccount` + `igCompetitorService` (business_discovery, scraping yok) |
| Reels | `ReelDossier` (4-aşama, evidence gate) + `ReelPlan` assembler |

## Phase 3A — Own-account Instagram read bridge + gözlenen DNA (BU OTURUM)

Hedef: bağlı hesabın GERÇEK içeriklerinden caption/hashtag/format yapısını
deterministik gözlemle; insan onayı olmadan hiçbir gözlem identity/DNA kuralına
dönüşmez.

Dilimler:
1. **DB güvenlik korkuluğu** (olay sonrası ön-koşul): `urlSafety` guard +
   guard'lı `db:push` + `safe-migrate-deploy` + DB-SAFETY.md. ✅
2. **Composio binding + hesap kapsamı**: env isim-durumu raporu; ID/handle
   yoksa BLOCKED-EXTERNAL (kod/UI/hermetic test yine tamamlanır). Binding
   çözümleme sözleşmesi: tam 1 connected binding → single-IG contract;
   0 → config_required; >1 → fail-closed `multi_binding_blocked` (multi-account
   şeması Phase 3 sonrası migration konusu; bu oturumda spekülatif redesign yok).
3. **`instagramDnaObservationService`** (saf/deterministik/LLM'siz, ÜCRETSİZ):
   kaynak = bağlı hesabın IgMedia corpus'u (≤100 benzersiz, mediaId+içerik-hash
   dedup, boş caption hariç; hashtag bloğu gövde istatistiğinden ayrık).
   Çıktı: evidenceCount, dateRange, mediaType/hook dağılımı, uzunluk
   min/max/median, paragraf düzeni, emoji oranı/politikası, CTA-bitiş dağılımı,
   hashtag count-range/placement/casing/core/rotating, sample sufficiency,
   performans kanıt durumu (insight yoksa `unavailable`; like/comment tek başına
   virallik kanıtı DEĞİL), kaynak sayaçları, warnings. Yeni tablo YOK —
   hesaplanan read model.
4. **Governance + apply API**: `GET /api/instagram/dna-observation` +
   `POST /api/instagram/dna-observation/apply` (guard + 256KB + Zod;
   selected-fields-only; expectedVersion → stale'de 409, değerler zaten
   uygulanmışsa idempotent no-op; yetersiz kanıt → 422; provenance=operator;
   CaptionDna hedefi hesap-geneli, SeriesProfile.hashtagDnaJson seri override).
   `dnaDistillService`'in operator-owned koruması aynen kalır.
5. **Seriler UI**: mevcut Plan→Seriler yüzeyi genişler (yeni ekran YOK):
   "Onaylı DNA" vs "Instagram'da gözlenen" ayrımı, kaynak/sync tazeliği,
   dağılımlar, fark önizleme, alan-bazlı seçim drawer'ı, tüm durumlar (no
   binding / config missing / no media / insufficient / partial / stale /
   ready / conflict).
6. **Generation grounding**: üretim YALNIZ onaylı DNA okur (retrieval +
   buildCarouselPrompt mevcut davranış) — precedence + izolasyon testlerle
   sabitlenir; gözlem prompt'a sızmaz.
7. Testler + full gate + ADR-035.

DB: yeni migration GEREKMİYOR (gözlem read model; apply mevcut kolonlara yazar).

Kapanış sınıflandırması: Composio ID/handle mevcut değilse
"Phase 3A production contract tamamlandı; live Instagram activation
BLOCKED-EXTERNAL."

## Phase 3B — İnsan onaylı DNA → gerçek carousel/Reels üretimi ✅ KAPANDI (ADR-036; 2026-07-18)

Sınıflandırma: **production contract complete / live generation activation
BLOCKED-EXTERNAL** (rotation + INSTAGRAM_GENERATION_* env'leri yok — sıfır
canlı çağrı). Teslim: ayrı ürün kapısı, buildCarouselPrompt'lu strict carousel
generator, sertleştirilmiş atomik Reels motoru (dinamik VOICE, yarım dossier
imkânsız), üç-durum editoryal readiness, optimistic-concurrency edit + advisory-
lock idempotent onay + seriesKey'li TrainingExample döngüsü, Seriler/Takvim
üretim-review UI'ı, slot-attach sözleşmesi. Yeni migration YOK. Detay: ADR-036 +
IMPLEMENTATION-STATE.

## Phase 3C — Rakip/ilham kütüphanesi + yapısal analiz ✅ KAPANDI (ADR-037; 2026-07-18)

Sınıflandırma: **production contract complete / canlı AI uyarlaması
BLOCKED-EXTERNAL** (rotation + INSTAGRAM_GENERATION_* yok — sıfır OpenRouter).
Meta business_discovery KANITLA ÇALIŞIYOR çıktı (env mevcut; prod cron
2026-07-18 06:39Z sync'i; direktifteki "Meta yok" varsayımı yanlıştı — ADR-037).
Teslim:
account-scoped ATOMİK ilham capture (canonical IG URL, advisory-lock idempotency,
orphan'sız tek transaction, manuel metrik `operator_observed` provenance),
ÜCRETSİZ saf deterministik `analyzeInspirationStructure` (versioned zarf kalıcı;
"neden çalıştı" yalnız provider kanıtıyla), iki-aşamalı güncel-baseline outlier +
dürüst insufficient=null + `config_required` watchlist durumu, sertleştirilmiş
`reverseEngineerToIdea` (ADR-036 kapısı + runtime Zod + 24s idempotency),
Kütüphane→İlham Inspiration Intelligence UI (yeni nav YOK). Yeni migration YOK.
Detay: ADR-037 + IMPLEMENTATION-STATE.

## Phase 3D — Doğrulanmış site/araç → production-grade dossier ✅ KAPANDI (ADR-038; 2026-07-18)

Sınıflandırma: **production contract complete / canlı AI dossier üretimi
BLOCKED-EXTERNAL** (rotation + INSTAGRAM_GENERATION_* yok; production'da
ReelDossier=0 → canlı re-verification mutasyonu koşulmadı — hermetic kanıt).
Teslim: typed-failure + fail-closed-persistence verifier (yalnız bellekteki
kanıt named-tool'u ready yapamaz; computeReadiness verificationId ister),
append-only WebsiteVerification snapshot defteri + 24h reuse / force-refresh
ayrımı, guarded `POST /api/reels/dossier/[id]/verify` re-verify lifecycle'ı
(server-side URL, LLM'siz, advisory-lock + in-tx concurrency; başarısızlık eski
kanıtı silmez, bounded/redacted trace), tek-kaynak `computeDossierProductionState`
read model'i (6 katman; production_ready = kanıt+creative+onay+seri+tek slot;
"bağlandı" ≠ "yayına hazır"), versioned alternatif zinciri (≤4 aktif, bağımsız
doğrulama, non-destructive archive, sessiz promotion yok — yeni-dossier prefill
ADR-036 kapılı), Takvim attach sözleşmesi (mevcut-dossier seçimi, provenance
seri eşleşmesi, tek-aktif-slot guard'ı, açık detach), DossierProductionPanel UI
(dürüst unknown/451 kuralı; Tier-2 EKLENMEDİ — unknown kalır). Yeni migration
YOK. Detay: ADR-038 + IMPLEMENTATION-STATE.

## Phase 3E — Aylık Reels planı + takvim yerleşimi + uçtan uca sağlık

- `ReelPlan` assembler → Takvim yerleşimi; plan-sağlık kontratı (staleness,
  repetition histogram) health sistemine bağlanır; e2e kalite koşusu.

## Sıralama gerekçesi

3A gözlem temelini kurar (veri → yapı); 3B üretimi bu onaylı yapıya bağlar;
3C dış sinyali aynı ContentItem omurgasına ekler; 3D/3E üretim çıktısını
planlama/takvime taşır. Her faz ayrı oturum + ayrı onay; "Phase 3 bitti"
iddiası ancak 3E kapanınca.
