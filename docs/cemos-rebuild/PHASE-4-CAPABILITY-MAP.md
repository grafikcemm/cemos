# PHASE 4 — CAPABILITY MAP (kabiliyet dağıtımı + orphan denetimi)

> Durum: 2026-07-19 · ADR-040 (Phase 4A: Capability Distribution + Information
> Density) + ADR-041 (Phase 4B: Unified Library — kanonik save/capture/board
> sözleşmesi + araştırma köprüsü) + ADR-042 (Phase 4C: Learn intake → grounded
> Pack → atomik not/zihin haritası/görev/içerik fikri/review; §5). Bu belge kodun GERÇEK kabiliyet envanteridir — paralel/ikinci bir
> registry DEĞİL. Tek doğruluk kaynağı `src/components/nav/navConfig.ts`
> (sınıflandırma + erişim yolu) + `src/components/shell/screenRegistry.tsx`
> (ekran → bileşen). Bu harita onları ÖZETLER; onlarla çelişirse KOD kazanır.
>
> Amaç (kabul kriteri): "Her çalışan kullanıcı özelliğinin en az bir açık, testli
> erişim yolu vardır." Aşağıdaki denetim bunu doğrular.

## 1. Erişim yolu modeli (navConfig sınıfları)

Her canlı ekran TAM BİR sınıfa aittir (drift-guard: `navConfig.areas.test.ts`):

| Sınıf | Erişim yolu | ADR-040 öncesi | ADR-040 sonrası |
|---|---|---|---|
| **Birincil alan** (3) | Sidebar alan satırı | ✓ görünür | ✓ + aktif alan sidebar'da alt hedeflerini AÇAR |
| **Alt-sekme** (alan içi) | Workspace `SubNav` | yalnız gövde şeridinde | ✓ + sidebar'da aktif alan altında da |
| **REDESIGNED-ADVANCED** (5) | Fırsatlar + Cmd+K | **rail'de YOKtu** (gizli) | ✓ sidebar **"Araştırma"** grubunda keşfedilebilir |
| **Utility** (Toolbox) | Sidebar (Araçlar) | ✓ | ✓ "Araçlar" başlığı altında |
| **Profil yüzeyi** (5) | Sidebar Profil menüsü | ✓ (menü arkasında) | ✓ + "Şimdi" özeti Sistem'e derin-link |

## 2. Kabiliyet envanteri

Sütunlar: kabiliyet · canonical ekran (screenRegistry id) · gerçek veri kaynağı ·
erişim (4A sonrası) · 4A öncesi görünürlük sorunu · yeni yerleşim.

### Bugün (birincil alan · id `morning`)

| Kabiliyet | Ekran/bileşen | Veri kaynağı | Erişim | Önceki sorun | Yeni yerleşim |
|---|---|---|---|---|---|
| X karar kuyruğu (NEXT UP, inline edit, onay) | `MorningDashboardTab`→`ReviewQueue` | `/api/growth/daily-queue*`, `/api/queue` | Sidebar Bugün | — (ana yüzey) | değişmedi; ilk viewport korunur |
| Operatör hazırlık kapısı | `OperatorReadinessGate` | `/api/health` (canonical) | Bugün | — | değişmedi |
| Fırsat→taslak aktarımı | `OpportunityHandoffBand` | `/api/opportunities/handoff` | Bugün | — | değişmedi |
| Haber/Repo/YouTube sinyalleri | `NewsHighlights`/`RepoHighlights`/`YouTubeHighlights` | `/api/news-pool`, `/api/growth/*` | Bugün (katlanır) | — | değişmedi |
| Günlük özet | `DigestSection` | `/api/daily-digest` | Bugün (katlanır) | — | değişmedi |
| **Günün özeti (yeni)** | `SidebarNowModule` | `/api/health` contracts (reuse) | Sidebar (Profil üstü) | özet yoktu | **yeni — Şimdi modülü** |

### Plan (birincil alan · alt-sekmeler)

| Kabiliyet | Ekran | Veri kaynağı | Erişim | Önceki sorun | Yeni yerleşim |
|---|---|---|---|---|---|
| Aylık yayın takvimi + slot yerleşimi | `plan-takvim`/`TakvimTab` | `/api/reels/plan`, `/api/queue`, `/api/reels/dossier` | Plan→Takvim (sidebar alt-nav + subnav) | ay hücreleri yalnız nokta | **hücreler gerçek içerik (ADR-040)** |
| Aylık plan builder (preview→apply→activate) | `PlanBuilder` (Takvim drawer) | `/api/reels/plan/preview|apply|lifecycle` | Takvim "Reels planı" | — | değişmedi |
| Slot ops (taşı/atla/geri al) | `SlotOpsBar` | `/api/reels/plan/slot/[id]/*` | Slot drawer | — | değişmedi |
| Plan sağlığı şeridi | `PlanHealthStrip` | `/api/health` `instagramPlanning` | Takvim | — | değişmedi |
| Editoryal fırsatlar | `plan-firsatlar`/`FirsatlarTab` | `/api/opportunities/*`, `/api/growth/mine` | Plan→Fırsatlar | subnav-only | + sidebar alt-nav |
| Seri DNA (carousel/reel) + gözlenen-vs-onaylı | `plan-seriler`/`SerilerTab` | `/api/series`, `/api/instagram/dna-observation*` | Plan→Seriler | subnav-only; legacy `instagram` alias | + sidebar alt-nav |

### Kütüphane (birincil alan · alt-sekmeler)

| Kabiliyet | Ekran | Veri kaynağı | Erişim | Önceki sorun | Yeni yerleşim |
|---|---|---|---|---|---|
| Birleşik arama (viral/prompt/pattern/keyword) | `lib-tumu`/`LibTumuTab` | `/api/library/search`, `/api/content*`, `/api/growth/pattern-library` | Kütüphane→Tümü | subnav-only; 4 legacy alias | + sidebar alt-nav |
| İlham + rakip analiz + panolar | `lib-ilham`/`LibIlhamTab` (+`ilham/`) | `/api/inspiration*`, `/api/boards*`, `/api/content/outliers` | Kütüphane→İlham | subnav-only | + sidebar alt-nav |
| **Öğrenme** (gelen kutusu/işleniyor/hazır/tekrar) | `lib-ogrenme`/`LibOgrenmeTab` (+`learn/*`) | `/api/learn/*` (sources/jobs/packs/review) | Kütüphane→Öğrenme | subnav-only; `learn-dashboard` alias; **giriş belirsizdi** | + sidebar alt-nav (§D görünürlük) |

### Araştırma (REDESIGNED-ADVANCED · 5) — **ADR-040 ana kazanımı**

| Kabiliyet | Ekran | Veri kaynağı | Erişim | Önceki sorun | Yeni yerleşim |
|---|---|---|---|---|---|
| Haber havuzu | `news-pool`/`RadarTab` | `/api/news`, `/api/news-pool*` | Cmd+K/Fırsatlar → **+ sidebar Araştırma** | rail'de YOKtu | **sidebar Araştırma grubu** |
| YouTube fırsat motoru | `youtube`/`YouTubeTab` | `/api/growth/*`, YouTube servisleri | " | " | " |
| Viral Radar | `flow-radar`/`ViralRadarScreen` | `/api/growth/flow-radar*` | " | " | " |
| Keşif motoru | `discovery-engine`/`DiscoveryEngineTab` | `/api/growth/discover`, `/api/content/sync` | " | " | " |
| X hesabı kaynakları | `source-intelligence`/`SourceIntelScreen` | `/api/growth/source-intelligence*` | " | " | " |

### Araçlar + Profil

| Kabiliyet | Ekran | Veri kaynağı | Erişim | Yeni yerleşim |
|---|---|---|---|---|
| Toolbox (araç kataloğu) | `toolbox`/`ToolboxTab` | `/api/content*` (AI araç listesi) | Sidebar Araçlar | "Araçlar" başlığı |
| CemOS'un bildikleri (hafıza) | `profile-memory`/`ProfileMemoryTab` | `/api/memory/*` | Profil menüsü | değişmedi |
| Entegrasyonlar | `profile-integrations`/`ProfileIntegrationsTab` | `/api/integrations*` | Profil menüsü | değişmedi |
| Sistem sağlığı | `system`/`SystemTab` | `/api/health`, `/api/eval/*`, `/api/costs` | Profil menüsü + **Şimdi→Sistem** | **dashboard grid (ADR-040)** |
| Maliyet | `costs`/`CostsTab` | `/api/costs` | Profil menüsü | değişmedi |
| Ayarlar | `settings`/`SettingsTab` | `/api/settings` | Profil menüsü | değişmedi |

## 3. Orphan denetimi (kabul: hiçbir çalışan kabiliyet erişimsiz)

`screenRegistry.tsx`'teki HER `case` bir erişim yoluna sahip:

- 3 birincil host + 6 alt-sekme → sidebar alan + subnav + (4A) sidebar alt-nav
- 5 advanced → (4A) sidebar Araştırma grubu **+** Cmd+K **+** Fırsatlar
- toolbox → sidebar Araçlar
- 5 profil yüzeyi → Profil menüsü (+ Şimdi/Sistem link, deep-link `plan-takvim`)
- `default` → `morning` (shell asla boş render etmez; `AppShell` bilinmeyen id'yi morning'e düşürür)

**ABSORBED/legacy id'ler** (`daily-queue`, `viral-library`, `keyword-library`,
`prompt-library`, `pattern-library`, `learn-dashboard`, `instagram`, `flow`,
`sources` …) `TAB_ALIASES` ile canlı evlerine normalize edilir — ayrı `case`
YOK, orphan DEĞİL. **Phase 4D (ADR-043): 10 runtime-DARK ABSORBED component FİZİKSEL
SİLİNDİ** (grep 0 importer — DailyQueue/Keyword/Prompt/Pattern/Learn/FlowRadar/
SourceIntelligence/ViralLibrary tab + orphan FlowList/TweetCard); eski id'ler
`TAB_ALIASES`→`normalizeTabId`→AppShell guard 3-katmanıyla canonical ekrana çözülmeye
DEVAM eder; ViralLibrary savedTweets localStorage→DB drenajı AppShell bootstrap'a taşındı
(idempotent). InstagramTab + CompetitorRadarSection + ReelsDossierSection re-home bekliyor
(canonical ev yok → KORUNDU).

**Sonuç: orphan YOK.** Cmd+K (`allNavigableTabs`) tüm sınıfları listeler; e2e
`nav.ts` helper'ı her sınıf için gerçek yol test eder.

## 4. Phase 4 temeli — Learn / Obsidian / Boards (yeniden İCAT ETME)

Kodda ZATEN mevcut (duplicate model/pipeline kurma — §D):

| Alan | Mevcut kod | Durum |
|---|---|---|
| Learn intake/pipeline | `src/lib/learning/{learnService,pipeline,scheduling,prompts}` + `/api/learn/*` | çalışır backend; UI kısmi |
| Transcript | `learning/supadata.ts` (+fallback), `learning/gemini.ts` | Supadata fallback SHIPPED (memory) |
| Pack/review | `learning/reviewService.ts`, `components/learn/{LearnPackView,LearnProcessingView,LearnReviewView}` | çekirdek var; UI bütünlüğü 4C |
| Obsidian export | `learning/{obsidian,packExport,obsidianManifest,localVault,githubVault,exportService}.ts` + `/api/learn/packs/[id]/{obsidian,export}` + `LearnExportAttempt` | **4D (ADR-043): deterministik v2 bundle + tipli durum makinesi + sertleştirilmiş kanallar + kalıcı audit + gate'li auto-export ✅; canlı vault/GitHub yazımı BLOCKED-EXTERNAL** |
| Boards/ContentItem | `LibIlhamTab`, `/api/boards*`, `/api/content*`, outlier | 3C/3D'de büyük ölçüde teslim |
| Öğrenme girişi | `lib-ogrenme`/`LibOgrenmeTab` | **4A: sidebar Kütüphane alt-nav'da görünür kılındı** |

4A yalnız GÖRÜNÜRLÜK sağlar (Öğrenme sidebar'da) — backend genişletmesi 4B+.

## 5. Phase 4B/C/D turnkey haritası

- **4B — Unified Library + capture/search/board bütünlüğü ✅ TAMAMLANDI (ADR-041;
  2026-07-19).** TEK kanonik save-to-board sözleşmesi (`src/lib/boards/saveToBoard.ts`
  — idempotent, scope fail-closed, advisory-lock + `BoardItem @@unique([boardId,
  contentItemId])` P2002-backstop) + araştırma→ContentItem köprüsü
  (`src/lib/boards/saveFromSource.ts` — client `{kind,id}`, sunucu yetkili satırı
  `fromX` normalizer'la yeniden yükler) + unified `POST /api/library/save` +
  `SaveToBoardButton` (portal menü) + `IlhamContextRail` + Tümü satır/drawer save +
  5 araştırma ekranı ortak save. `/api/library/search` toplu `savedBoards` (N+1'siz)
  + kararlı sayfalama + `capped`. Model DUPLİKE EDİLMEDİ (ContentItem/Board/BoardItem
  + normalizer/ingestContent REUSE). Tek additive migration (BoardItem unique index).
- **4C — Learn intake → grounded Pack → atomik not/zihin haritası/görev/içerik
  fikri/review ✅ TAMAMLANDI (ADR-042; 2026-07-19).** Kritik açık kapatıldı:
  notes/graph/tasks artık PASSTHROUGH DEĞİL (gerçek üretim) + `content_ideas` aşaması;
  pipeline v2 (`PIPELINE_VERSION`/`PROMPT_VERSION` v1→v2; v1 pack'ler okunur, reprocess
  yok; `artifact.stages` çift-ücret koruması). v2 artifact zarfı (`src/lib/learning/artifact.ts`,
  `LearnPack.notesJson` — yeni tablo YOK; parseArtifact v2|legacy|invalid; graphToMermaid
  deterministik+escape'li). Üç açık kaynak türü (`SourceIntake`: youtube/manual_transcript/
  notebooklm_summary — içerik SHA-256 idempotent; provider/basis/verified SUNUCU-set).
  Basis-farkı: `summary_supported` grounding + basis-farkında prompt/QA → NotebookLM
  iddiaları asla video-doğrulanmış görünmez. Kanonik status read-model (`src/lib/learning/status.ts`
  `deriveLearnState`). Review idempotency (tek additive migration `20260719140000`;
  `reviewService.grade` atomik `$transaction`+idempotent). UI: LearnPackView 7 sekme +
  provenance + LearnProcessingView resume + LibOgrenmeTab üç açık mod. Altyapı yeniden
  İCAT EDİLMEDİ (~%90 hazırdı).
- **4D — Obsidian export production contract + tipli durum makinesi + ABSORBED legacy
  fiziksel emekliliği ✅ TAMAMLANDI (ADR-043; 2026-07-19).** Deterministik + basis-farkında
  v2 bundle (MOC/atomik not/paylaşımlı çok-pack kavram/Mermaid MOC/görev/fikir/kart/QA;
  now() gömülmez; NotebookLM=summary framing; sahte timestamp yok; manifest hash). Tipli
  ChannelResult (9 durum; secret/token/tam-path YOK). Sertleştirilmiş yerel (realpath +
  symlink/junction guard + atomic temp+rename + managed conflict) + GitHub (read-only
  preflight + unchanged-skip + errorClass haritası + partial≠success) yazıcılar.
  `LearnExportAttempt` + additive migration (composite = manifest idempotency). Gate'li
  auto-export (`OBSIDIAN_AUTO_EXPORT`; aksi örtük dış yazma yok). Export paneli + `/export`
  API (POST auth+Zod+idempotency; GET not-ready→409). 10 runtime-DARK legacy component
  silindi + savedTweets drenajı AppShell'e taşındı (alias/legacy sembol KORUNDU).
  **Canlı vault/GitHub yazımı BLOCKED-EXTERNAL** (env/target/onay yok) — kod+test+hermetik
  doğrulandı, gerçek yazma yok.

Dış bağımlılıklar (4A dışı, değişmedi): canlı AI üretimi (rotation +
`INSTAGRAM_GENERATION_*`), own-account Composio binding, Tier-2 render, X API
ödemesi, Neon parola rotasyonu.
