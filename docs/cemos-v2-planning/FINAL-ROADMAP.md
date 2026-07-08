# CemOS V2 — Final Roadmap

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) §4-6 (kilitli) + tüm FINAL-* spec'ler. Sprint 1 sözleşmesi: [FIRST-SPRINT.md](./FIRST-SPRINT.md). Tarih: 2026-07-08.

---

## 1. Fazlar × kök nedenler

| Faz | Hedef | Kök neden bağlantısı |
|---|---|---|
| **MVP (Sprint 1)** | Her gün açılan sade sistem: Bugün ritüeli + yayına-hazır taslaklar | Odak (#1) + Kalite (#2) doğrudan |
| **V1 (Sprint 2-5)** | Odak kalıcılaşır (nav 16→5), kalite ölçülür ve öğrenir (memory/eval/DNA), IG+Reels üretim hattı açılır | #1 kalıcı, #2 derinleşir |
| **V2** | Kanıt-eşikli ileri özellikler (pgvector, bandit, escalation, API-scheduling opt-in, pixelspor) | ölçüm kanıtı olmadan girilmez |

**Master yerleşim tablosu:** RESEARCH-SYNTHESIS §5 — tek otorite. (Tekrarlanmıyor; çelişkide o kazanır.)

## 2. Sprint dizisi (≤2 hafta/sprint)

### Sprint 1 — "Bugün + Tek Motor" → sözleşme: [FIRST-SPRINT.md](./FIRST-SPRINT.md)
Odak + kalite. Sıfır migration, sıfır yeni ekran, sıfır yeni agent.

### Sprint 2 — "Nav + Presets tamamlanır + Memory temeli"
| Alan | İçerik |
|---|---|
| Amaç | Odak kalıcılaşır; model yönetimi tamamlanır; memory yazma disiplini kurulur |
| Kullanıcı değeri | 5-grup nav, tek Kütüphane, tek Radar; taslaklar geçmiş edit'lerden öğrenmeye başlar |
| Scope | Nav konsolidasyonu (alias'lı) + klavye inceleme; kalan `generateJson` migration dalgaları (Sprint growth-engine önce); `MemoryFact` + Caption/Hashtag DNA + onay kuyruğu + voice-constitution.md; embedding A/B (qwen3 vs 3-small, golden set) |
| Out | IG/Reels/planner; tam 14 skor |
| DB | `MemoryFact`, `CaptionDna`, `HashtagDna` (additive push) |
| Dependencies | Sprint 1 preset katmanı + eval golden set |
| Acceptance | alias regression yeşil; raw `generateJson` sayacı 0'a iner; tek-ret-kural-olmaz testi; rollback çalışır |
| Rollback | nav config revert (alias'lar sayesinde state kaybı yok); yeni tablolar kullanılmadan durur |
| Demo | Operatör 3 içeriği "fazla kurumsal" reddeder → proposed preference görünür → onaylar → sonraki taslaklar değişir |

### Sprint 3 — "Series DNA + IG Watchlist + Verifier HTTP"
| Alan | İçerik |
|---|---|
| Amaç | Kalite serileşir; ilk policy-safe rakip verisi; doğrulama altyapısı |
| Scope | `SeriesProfile` + Seri DNA editörü (Best AI Tools) + VoiceProfile micro-style kolonları + carousel prompt; `IgWatchAccount` + business_discovery sync (06:00 cron'a katlanır) + outlier; `verifyWebsite()` HTTP tier + SSRF suite |
| Out | render tier, Reels dossier, IG ekranı (feed API'de birikir) |
| DB | `SeriesProfile`, `IgWatchAccount`, `WebsiteVerification` |
| Acceptance | SSRF suite yeşil (metadata/private/redirect); Bard→Gemini redirect regression testi; carousel taslağı ≤hafif düzenlemeyle "benim" onayı |
| Rollback | cron fold-in flag'le kapanır; tablolar atıl kalır |
| Demo | Watchlist'e 5 hesap ekle → ertesi gün outlier feed'i (API'den) |

### Sprint 4 — "Reels Dossier + Eval V1"
| Alan | İçerik |
|---|---|
| Amaç | Üretime-hazır Reels; kalite ölçümü tam kapasite |
| Scope | `reelDossierFor()` + ReelDossier + dossier liste UI; tam 14 alt-skor + council→judge birleşimi + PerformanceSnapshot atıfı + kalibrasyon cron + KPI'lar CostsTab'e; IG lane Bugün'e (DraftReviewCard) |
| Out | ay grid'i, render tier GA |
| DB | `ReelDossier` |
| Acceptance | kanıtsız araç `not_ready`; tek-outlier-promotion-yok + clickbait-veto testleri; κ raporu üretilir |
| Demo | "site Reels'i" senaryosu uçtan uca (FINAL-PRODUCT-SPEC §9.2) |

### Sprint 5 — "Aylık Plan + Instagram Alanı + Drift"
| Alan | İçerik |
|---|---|
| Amaç | Aylık editoryal döngü + tek IG yüzeyi |
| Scope | `ReelPlan(+Slot)` + deterministik assembler + ay grid UI; Instagram alan ekranı (Rakip Radarı | Reels alt-sekme, C6); swipe-file capture; ses-drift alarmı + `AiModelSnapshot` katalog drift kontrolü; render tier spike (go/no-go) |
| DB | `ReelPlan`, `ReelPlanSlot` |
| Acceptance | pillar 3-5 + 60/25/15 ± tolerans; repetition histogram uyarısı; IG ekranında 4 durum (error ≠ empty) |
| Demo | Ay planı: her araçta yeşil "doğrulandı" rozeti |

## 3. Paralel workstream'ler (6)

**Kural: shared contract'lar inmeden paralel başlamaz.** Contract seti = `presets.ts` tipleri + `QueueItem.scores` alt-skor sözlüğü (FINAL-EVALUATION-SPEC §2 adları) + purpose-prefix enum'u + `TAB_ALIASES` disiplini + `VerificationEvidence` Zod şeması. Bunlar Sprint 1-2'de iner; workstream'ler Sprint 2 sonundan itibaren paralelleşebilir.

| WS | Branch/worktree | Kapsam | Dokunur | DOKUNMAZ | Ön koşul | Migration | Merge sırası | DoD |
|---|---|---|---|---|---|---|---|---|
| **A UX-Simplification** | `feature/ux-bugun-first` | Bugün reorder → nav konsolidasyonu → klavye → IG lane | `components/tabs/Morning*`, `components/morning/*`, `navConfig.ts`, `Sidebar.tsx`, `screenRegistry.tsx`, `globals.css` | store anahtarları, `XAgentApp.tsx` adı, API routes, motor kodu | yok (bağımsız) | yok | herhangi | TTFA<60s ölçülür; alias testleri; 4-durum testleri |
| **B Model-Router-Presets** | `feature/model-presets` | `presets.ts` + katalog map + gate migration dalgaları + cache | `lib/ai/{presets,model-config,generateGated,openrouter}.ts`, çağrı siteleri (dalga dalga) | prompt İÇERİKLERİ (D'nin alanı), UI | yok — **İLK inmesi gereken** | yok | **1.** (D ve F ondan sonra) | startup lint; writer≠judge testi; dalga modül testleri |
| **C Memory-Foundation** | `feature/memory-foundation` | MemoryFact/DNA/onay kuyruğu/constitution/embedding A/B | `lib/growth-engine/vector-memory.ts`, yeni `lib/memory/*`, schema (additive) | draft-pipeline omurgası (D), presets iç yapısı | B (memory preset'i) | MemoryFact+DNA | 3. (F-atıf öncesi) | poisoning + tek-ret testleri; `memory_` bütçe |
| **D X-Content-Pipeline** | `feature/x-engine-unify` | kimlik birleştirme, scorer/leak absorbe, TR lint, originality/near-dup (V1) | `lib/services/draftService.ts`, `lib/ai/{draft-pipeline,prompts,grounding}.ts`, `lib/growth-engine/{scorer,leak-detector}.ts` | navConfig/UI (A), presets iç yapısı (B) | B contract'ları | yok (scores JSON'a) | 2. | eval parity yeşil; Sprint dosyaları emekliliğe hazır |
| **E Instagram-Intelligence** | `feature/ig-intel` | watchlist, sync, capture, IG ekranı, Reels dossier/verifier | `lib/instagram/competitor/*`, `lib/verify/*`, `lib/reels/*`, yeni tab bileşenleri | draft omurgası, memory iç yapısı | B + A'nın nav iskeleti + `VerificationEvidence` contract'ı | IgWatchAccount, WebsiteVerification, ReelDossier, ReelPlan | **son (5.)** | policy testleri (no-scrape, PII yok); SSRF suite |
| **F Evaluation-Observability** | `feature/eval-loop` | 14 skor, judge birleşimi, atıf, kalibrasyon, KPI, health | `lib/agents/council*`, judge aşaması, `EvalTest` harness, CostsTab | writer prompt'ları (D ile koordineli) | B + D omurga + C (atıf için) | ViralPattern additive kolonlar | 4. | κ raporu; false-learning testleri; trace≡ledger mutabakatı |

Ortak DOKUNMAZ listesi (hepsi): `useXAgentStore`/`useCemOsStore`, `"xagent-store"`, `XAgentApp.tsx`, `src/store/xagent.ts`, HTTP User-Agent kimlikleri, destructive migration.

## 4. Program riskleri + taşınan `unverified`

RESEARCH-SYNTHESIS §6'nın top-5'i geçerli (katalog drift · scope creep · birleştirme regresyonu · false learning · verifier staleness+SSRF) + konsolide `unverified` listesi oradan taşınır. Roadmap-özel ek risk: **workstream E'nin erken başlaması** (contract'sız IG/Reels = çöp iş) — merge sırası bağlayıcı.
