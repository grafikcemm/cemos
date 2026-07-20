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
- **Silent-degrade gözlemlenebilirliği (BUG-05).** Configured-ama-broken Fal/YouTube/
  business_discovery/Supadata/Obsidian sağlık sinyali üretmiyor (hata yalnız `CronRun.result`);
  Composio `AccountPlatformBinding.lastErrorClass` surface EDİYOR. Genelleştir: `/api/integrations`
  veya `/api/health` per-sağlayıcı last-run/last-error. Blocker-gated (hepsi şu an unconfigured);
  yeni observability subsystem RC-dışıydı.
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
