# POST-RELEASE-BACKLOG — CemOS

> Bu programın (Release Completion: 5B→5C→5D) kapsamı DIŞINDA kalan "güzel olur"
> maddeleri. Current release'e EKLENMEZ; her biri kısa gerekçeyle burada bekler.
> Kaynak: 5B kararları (ADR-045) + keşif denetimleri.

## Ürün / UI

- **Learn→draft için per-fikir hedef hesap seçici.** Şu an "Taslağa dönüştür" aktif
  kanalı (grafikcem/maskulenkod) hedefler. Gerekçe: çoğu durumda aktif kanal doğru;
  ayrı seçici ek UI yükü. Backlog: fikir kartında hesap dropdown'u.
- ~~**Instagram content_idea → Instagram üretimi (Learn).**~~ **DONE (Phase 5E, BUG-01,
  `53f30b8`+`bd00737`):** `format:carousel`→Seriler, `format:reel`→Takvim kanonik
  OpportunityHandoff'u (sourceKind="learn"); Instagram fikri ARTIK X tweet taslağına
  AKMAZ (İlham sözleşmesi izlendi). IG ÜRETİM kapıları (ADR-036) hâlâ ayrı — handoff
  yalnız fikri doğru yüzeye taşır, üretim orada operatör kararı.
- **Idea modeli (X) için liste yüzeyi.** **RESOLVED-DOC (Phase 5E §8C-b, BUG-03):** `Idea`
  + `IdeaSource` İlham "Fikre dönüştür" akışında yazılır ama UI ekranı okumaz — YALNIZ
  `/api/mcp:74 ideaRepo.list` okur → **bilinçli programatik/MCP sözleşmesi** (yeni top-level
  Idea dashboard'u AÇILMAZ). Kalan P3-polish: İlham drawer'ı Idea'yı üretip handoff'ta
  kullanmıyor (contentItemId ile gidiyor) → üretilen Idea'yı da handoff'a bağlamak veya
  toast'ı "MCP'ye kaydedildi" diye dürüstleştirmek. Operatör X-fikir defteri isterse:
  Kütüphane alt-görünümü (yeni yüzey değil).
- **`weekly-learning-report` alias hedefi.** Şu an → `morning`; öğrenme geçmişi artık
  Profil/Hafıza'da. İstenirse → `profile-memory` (training-center gibi). Düşük öncelik.
- **Training-center filtreli data-table.** Eski `/api/growth/training-center` GET'in
  tam filtre/arama tablosu 5B'de MERGE lehine benimsenmedi (özet + neutralize daha
  yüksek değer). Operatör tam denetim tablosu isterse geri getirilebilir (Postgres
  case-insensitive arama düzeltmesiyle — mevcut route yorumu SQLite varsayıyor).

## Otomasyon / altyapı

- **Haber cron intra-day (Pro).** Kod tick idempotent + deadline-bounded; Vercel Hobby
  günde-1 sınırı yüzünden 12:00 UTC. Pro'da 3-6 saatlik schedule "en güncel" tazeliğini
  artırır. Operatör plan kararı.
- **Tier-2 render worker deploy.** Ağır reels/carousel render için ayrı sürekli runtime
  (Railway/Fly/VM + `npm run worker`). BLOCKED-EXTERNAL (altyapı maliyeti); intent/export
  fallback bundan bağımsız çalışır.
- **X API doğrudan yayın adapteri.** Ödeme + credential geldiğinde `xApiAdapter` gerçek
  publish'e açılır (şu an sabit `payment_approval_required`). Intent-only tam yeterli.

## Teknik borç (5D dead-code geçişinde ele alınacak — çözülmezse backlog)

- Orphaned `/api/growth/training-center` GET route — **5D'de SİLİNDİ** (değer 5B-A'da
  knowledgeReadModel'e taşınmıştı; import-graph 0 tüketici).
- `POST /api/ideas/[id]/create-draft` — 5B-B'de originKey idempotency ile sertleşti;
  programatik/MCP kalıyor (UI-wired değil). Aşağıdaki 5D-deferred listede.

## 5D-deferred dead-code temizliği (kanıt-temelli DELETE-safe; RC churn riskinden ertelendi)

Release-readiness denetimi (import-graph, 0 canlı tüketici) bunları DELETE-safe işaretledi
ama RC ortasında toplu silmek churn riskli — hepsi operator-guarded + zararsız. Post-release
tek `refactor(cleanup)` sweep'inde silinir (her biri kendi route.test + route-guards girişiyle):
- Legacy top-level üretim route'ları: `/api/{benchmark,scan,generate,flow,drafts}`.
- Süperseded kuyruk/growth route'ları: `/api/queue/[id]/{approve,reject,schedule,regenerate,mark-published}`,
  `/api/growth/feedback`, `/api/growth/pattern-library/[id]/{adjust-score,increment-usage}`.
- Programatik-only (UI yok): `/api/ideas` GET + `/api/ideas/[id]/create-draft`, `/api/content/search`,
  `/api/{voice-profiles,published-posts,source-posts,prompt-library,competitors}`,
  `/api/growth/vector-memory/*` (dışarıdan çağrılmıyorsa).
- `workerService.ts` 8 `console.log` → yapılandırılmış logger (LOW).

## Güvenlik residualleri (5D — dürüst, kapatılmadı)

- **SSRF DNS-rebinding TOCTOU** (`ssrfGuard.ts`): `assertSafeUrl` `dns.lookup` doğrular ama
  `fetch` bağımsız yeniden çözer (IP-pin yok). Serverless'te düşük pratik şiddet; düzeltme =
  custom dispatcher/Agent ile doğrulanmış IP'yi pinle.
- **postcss (Next transitif) moderate**: build-zamanı CSS-stringify XSS; bu uygulamanın
  runtime'ında güvenilmeyen CSS stringify edilmediğinden istismar edilemez. Düzeltme = kırıcı
  Next bump (test döngüsü ister) → RC dışı.
- **Neon parola rotasyonu** (KRİTİK USER-ACTION): geçmişte parola sızmış olabilir; rotasyon
  operatör kararı, mevcut bağlantıyı kırabilir → deploy kapısında açık blocker.

## Phase 5E — Final Acceptance sonrası (yeni/güncellenmiş)

- **Dead-route sweep (verified DELETE-safe).** Subagent A+B cross-check ile 0-consumer
  doğrulanan ölü route'lar (route+test+catalog birlikte silinir, ayrı `refactor(cleanup)`):
  `/api/{generate,scan,benchmark,drafts,flow}` (POST) · `/api/news` POST · `/api/content/search` ·
  süperseded `/api/queue/[id]/{approve,reject,schedule,regenerate,mark-published}` (Bugün akışı
  `daily-queue` PATCH kullanır) · test-only `/api/growth/vector-memory/*` + `pattern-library/[id]/
  {increment-usage,adjust-score}` · `/api/{voice-profiles,published-posts,youtube/discover,
  integrations/feed-the-goat/snapshot}`. **KORU:** `/api/mcp` (dış), `/api/ideas`+`create-draft`
  (MCP), cron'lar. RC-ortası toplu silme churn-riskli + B bir false-positive üretti (BUG-07) →
  her silme ayrı doğrulanmalı. **Ayrıca 2 dangling client→route:** `scripts/seed-ai-rankings.ts`
  →`/api/ai-rankings` (legacy seed, runtime değil). Hiçbiri P0–P2 değil (guard'lı, akış kırmıyor).
- ~~**Silent-degrade gözlemlenebilirliği (BUG-05).**~~ **DONE (Phase 5F §13, `2d404aa`):**
  `/api/integrations` artık `providerLivenessService` ile per-sağlayıcı liveness taşır —
  `UsageLog` (openrouter/socialdata/fal: son başarı vs son hata + errorClass) + `LearnExportAttempt`
  (obsidian). Son çağrısı BAŞARISIZ configured sağlayıcı artık yeşil "yapılandırıldı" DEĞİL
  (degraded + errorClass); hiç çağrılmamış = "yapılandırıldı · doğrulanmadı" (healthy DEĞİL);
  canlı `/api/health` probe'u mevcutken güncel durumda kazanır. `generateJsonGated` başarısız
  UsageLog satırına `errorClass` de yazar. Yeni subsystem YOK; secret/token/path/gövde YOK; fail-soft.
  Kalan: gerçek canlı 402/expired-token round-trip'i doğrulama (BLOCKED-EXTERNAL, credential bekliyor).
- **Learn→handoff/draft per-fikir hedef hesap seçici.** Şu an aktif kanal (server var-yok doğrular,
  fail-closed). Fikir kartına hesap dropdown'u (ADR-036 ayrı) — düşük öncelik.
- **`coverage/**` eslint-ignore.** Doğru kalıcı fix (generated coverage'ı ignore) config-protection
  hook'la BLOKE ("config weakening"). 5E'de generated `coverage/` silinerek lint 0/0 yapıldı ama
  `test:coverage` sonrası 3 "unused eslint-disable" uyarısı tekrar oluşur. Operatör hook'u geçici
  kapatıp `coverage/**` ekleyebilir VEYA vitest coverage reporter'ını lintlenmeyen çıktıya alabilir.
- **IG Yorumlar/DM kümesi + Idea telemetri (BUG-04, dormant).** `IgComment/IgReplyDraft/
  IgConversation/IgMessage/IgDmDraft` (+`instagramService` unwired) Faz D/E için built+tested ama
  route/UI bağlı DEĞİL; `ScanRun`/`GenerationRun` write-only telemetri (retention prune yok);
  `KeywordEntry`/`PromptFormula`/`AiModelSnapshot` seed-only. Model DROP = destructive (DB-safety
  yasağı) → silinMEZ; Faz D/E'de wire edilir veya bilinçli dormant kalır. Retention/prune eklenebilir.

## AI ekonomisi (Phase 5F ertelenen — evidence/altyapı bekliyor)

- **Bütçe TOCTOU (§10) — scoped P2, dürüst tehdit modeli.** `getBudgetStatus` oku → sağlayıcı çağır
  → `recordOpenRouter` yaz arasında atomik reservation YOK: eşzamanlı iki `essential` çağrı ikisi de
  bütçeyi uygun görüp aşabilir. **Pratik maruziyet düşük:** overshoot ≈ (eşzamanlı çağrı × tek-çağrı
  maliyeti); tek-çağrı ~$0.01–0.05, tek-operatör + günde-1 cron = düşük eşzamanlılık → ~%birkaç
  overshoot. **Telafi kontrolleri:** OpenRouter prepaid kredi (hard stop), provider key limit
  (`getOpenRouterKeyStatus.limitRemainingUsd`), pacing (`monthProgress`), reserve (`AI_MONTHLY_RESERVE_USD`).
  **Neden şimdi yapılmadı:** doğru fix = her LLM çağrısına reservation-insert (latency + yeni tablo +
  §6'da kaçınılan test-DB-blast-radius); düşük maruziyet bunu haklı çıkarmıyor. **Scoped fix:** additive
  `AiSpendReservation` (reserve estimated → çağrı → actual settle → unused release → stale expiry;
  idempotency key + budget class + purpose/model audit); `getBudgetStatus` açık reservation'ları sayar.
  "Yarım reservation sistemi" eklenmedi (task talimatı).
- **SSRF DNS-rebind TOCTOU (§10A) — scoped P3.** `ssrfGuard` güçlü (şema-allowlist + credential-block +
  tüm A/AAAA private/loopback/link-local/**metadata** + IPv4-mapped-v6 + redirect auto-follow YOK). Tek
  residual: `assertSafeUrl` host'u resolve+doğrular, ama fetch host'u YENİDEN resolve eder → DNS'i
  kontrol eden saldırgan check'te public, fetch'te private IP döndürebilir. Serverless'te düşük şiddet
  (metadata IP zaten bloklu). **Robust fix:** `assertSafeUrl` doğrulanmış IP'yi döndürsün + caller undici
  `Agent`/`dispatcher` ile fetch'i O IP'ye pinlesin (SNI/Host = hostname), rebind mock resolver'la testli.
  "Yarım çözüm ekleme" talimatı gereği rushed IP-pin EKLENMEDİ; dürüst P3 residual.
- **Model routing birleştirme (§5) — provisional.** Preset (9, model'i pinler + MODEL_PROFILE'ı yok sayar)
  ve role (6, profile-aware) iki paralel yol; aynı "judge" işi yola göre farklı model/fiyat (preset
  gpt-5.4-mini vs role gemini). Tek `ResolvedAiRoute` çözümleyici (compatibility wrapper, rewrite DEĞİL)
  her ikisini tek fiyat/budget/family sözleşmesine bağlar. **Benchmark kanıtı bekliyor** — model değişimi
  gerektirir, §8 olmadan yapılmaz.
- **Fiyat/performans live benchmark (§8) — BLOCKED (ödeme onayı).** Dry-run (ücretsiz) = `verify:ai-economics`
  (katalog/capability/fiyat/fixture-contract). Bounded live benchmark: rotasyonlu key + prepaid kredi +
  `AI_EVAL_SPEND_ENABLED=true` + açık USD tavanı gerekir (operatör §19). Yoksa "en iyi model budur" DENMEZ —
  yalnız provisional öneri.
- **Adaptif fiyat/performans routing (§9) — §8'e bağlı.** Tier 0 deterministik (parse/normalize/dedup) →
  Tier 1 ucuz extraction → Tier 2 dengeli → Tier 3 premium yalnız kalite-barı-kaçırma/yüksek-risk/açık
  premium profil. Judge `risk_based` modu (`getJudgeMode`) zaten var; daha fazla siteye genişlet. Benchmark
  olmadan model eşlemesi sabitlenMEZ.
- **Prompt/cache/token optimizasyonu (§11).** Katalog prompt-caching'in ~%60–80 tasarruf sağladığını not
  ediyor; writer/strategist anthropic `cache_control` breakpoint bunu zaten kullanıyor. Diğer preset'lere
  (stable system/brand context) cache genişletme + memory-retrieval token bütçesi + kaynak-başı extraction
  idempotency cache — kaliteyi (kaynak/provenance/safety prompt) düşürmeden. Ölçülü lever, bug değil.
- **Costs UI genişletme (§12).** Mevcut Profil/Maliyet yüzeyi (yeni ekran YOK): cost-per-accepted-output,
  fallback/escalation sayısı, en pahalı purpose grupları, pricing-snapshot tarihi + stale uyarısı, pacing %.
  `verify:ai-economics` + `MODEL_PRICING_VERIFIED_AT` verisi mevcut; UI surface RC-dışı, düşük risk.
- **Fiyat-drift periyodik kontrolü (§7).** `MODEL_PRICING` katalog-doğrulanmış committed fallback
  (`MODEL_PRICING_VERIFIED_AT`). Runtime her istekte katalog fetch etmemeli; periyodik/manuel refresh +
  timestamp + stale bayrağı + drift alarmı (WebFetch ile katalog erişilebilir; runtime fetch değil).
- **`growth-engine/draft-generator` statik-canned fallback.** Başarısız growth draft'ı deterministik
  hesap DEĞİL, sabit pazarlama metni döndürür (matrix §6'da flag'li). Heuristik türetime çevir veya
  "örnek/placeholder" olarak dürüst etiketle.
