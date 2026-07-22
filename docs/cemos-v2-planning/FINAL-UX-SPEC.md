# CemOS V2 — Final UX Spec

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) D1 + [research/01-product-simplification.md](./research/01-product-simplification.md) + [research/_repo-baseline.md](./research/_repo-baseline.md) §1-2.
> **Sahiplik:** kök neden #1 — *Odak yok*. Tez: **"One surface, one number, one action."**
> Tüm UI Türkçe. Tasarım sistemi: mevcut soft-premium lavanta (#b8a8f0) + şeftali, Inter — DEĞİŞMEZ. Tarih: 2026-07-08.

---

## 1. Nihai navigasyon (16 → 5 grup)

```
Bugün        → morning (tek günlük hedef; daily-queue = drill-down)
Radar        → flow-radar · discovery-engine · source-intelligence · viral-library · news-pool (alt-sekmeler)
Kütüphane    → keyword-library · prompt-library · pattern-library (alt-sekmeler)
Youtube      → youtube (+ learn-dashboard flag'li)
Araçlar      → toolbox · costs · settings
(V1) Instagram → tek alan ekranı: Rakip Radarı | Reels Dosyaları (alt-sekme; C6 kararı)
```

**Zorunlu mekanik kurallar:**
- Hiçbir tab id SİLİNMEZ. Demote edilen her id `TAB_ALIASES`'ta canlı ekrana map'lenir; ekran `screenRegistry`'de kayıtlı kalır. **Alias başına regression testi.**
- `NAV_GROUPS` + `PRIMARY_AREAS` (navConfig.ts) senkron güncellenir; senkron testi mevcut (`navConfig.test.ts`) — genişletilir.
- `daily-queue`: top-level'dan çıkar → Bugün içinden "Tümünü/skorları gör" linki; route (`/dashboard/daily-queue`) + alias korunur.
- Immutable semboller: `useXAgentStore`/`useCemOsStore`, `"xagent-store"`, `XAgentApp.tsx`, `cemos-ui-collapsed` — dokunulmaz (CI grep guard).

**Faz:** MVP = nav DEĞİŞMEZ (yalnız Bugün içi reorder). V1 = konsolidasyon. V2 = unified inbox + pixelspor.

## 2. Bugün ekranı — wireframe IA (MVP; `MorningDashboardTab` refine, rebuild değil)

```
┌─ Bugün ────────────────────────────────────────────────┐
│ 1 SAYAÇ: "3 taslak seni bekliyor"                       │ ← MorningHeroStats yerine tek satır
│   (grafikcem 2 · maskulenkod 1)          [● sağlıklı]   │ ← OperatorReadinessGate = tek tik;
│                                                          │   YALNIZ sorun varken genişler (Linear tiering)
├──────────────────────────────────────────────────────────┤
│ 2 REVIEW QUEUE (fold üstü — eylem)                       │
│   ┌ NEXT UP · @grafikcem ─────────────────────────────┐  │
│   │ <taslak metni — inline düzenlenebilir>            │  │
│   │ alt-sinyaller: kanca 78 · ses 85 · risk 12 · leak 0│ │ ← skorlar HER ZAMAN ayrışık (asla tek sayı)
│   │ [Düzenle→Yayınla] [Kopyala] [X'te aç] [⋯]          │  │ ← tek primary + overflow
│   └───────────────────────────────────────────────────┘  │
│   ●●○○○ 2/5 onaylandı · Tümünü/skorları gör →            │ ← daily-queue drill-down
├──────────────────────────────────────────────────────────┤
│ 3 TEPKİ VERMEYE DEĞER (~3 öğe)              [▸ katlanmış]│ ← haber/viral/YT highlights
├──────────────────────────────────────────────────────────┤
│ 4 Digest / bento                            [▸ katlanmış]│
└──────────────────────────────────────────────────────────┘
   Kuyruk boşken: "Bugünlük bitti ✓" (+ yarın saati)
   (V1) Instagram lane: IgReplyDraft/IgDmDraft → aynı DraftReviewCard + risk rozeti, drafts-only
```

**Sıralama gerekçesi:** eylem > sinyal > arşiv. Vanity stat + sağlık bloğu Tier-3 → Tier-1 alanından çıkar (rapor 01 §3.2).

## 3. Günlük X akışı (primary task, ≤2 adım)

1. **Aç** → Bugün, NEXT-UP kartı odakta.
2. **Kart**: inline edit (tek tuş; edit-gate'i karşılar — gate KALIR, kalite kök nedenine hizmet eder; neden devre dışı olduğu görünür: "düzenle → yayınla") → Kopyala/X'te aç → sonraki kart otomatik odak.
3. Ret: neden seçimi mevcut feedback tipleri (not_my_tone/hook_weak/too_ai/…) — tek dokunuş chip'ler.

**Klavye (V1):** `Cmd/Ctrl-K` komut çubuğu · `A` onayla · `E` düzenle · `J/K` sonraki/önceki. `prefers-reduced-motion` uyumlu.

## 4. Durum tasarımı (her günlük yüzey — MVP zorunluluğu)

| Durum | Kural |
|---|---|
| Loading | Skeleton (mevcut bileşen) |
| Empty | Anlamlı boş durum + tek CTA ("Bugünlük taslak üret") |
| **Error** | **AYRI blok** — neden (Türkçe, teknik olmayan) + "Yeniden dene". **Empty'ye ASLA katlanmaz** (baseline §2 açığı; `ReviewQueue` retry pattern'i yeniden kullan) |
| Success | Toast + ilerleme çubuğu güncellenir; kuyruk biterse "Bugünlük bitti ✓" |

Arıza senaryosu metni: teknik hata asla ham gösterilmez → "Taslaklar şu an üretilemiyor, tekrar denendi. Sorun sürerse Ayarlar → Sistem durumu." (arka planda fallback + log).

## 5. Bildirim / kesinti politikası (Linear consequence-tiering)

| Tier | İçerik | Davranış |
|---|---|---|
| Interrupt | worker down, bütçe aşımı, cron `!ok` | Readiness gate genişler (kırmızı), Bugün'ün 1. sırasında |
| Ambient | yeni taslak hazır, sync bitti | sayaç günceller, kesinti yok |
| Digest | maliyet özeti, eval KPI, sync detayı | CostsTab + katlanmış digest'te |

**Sağlıklı-durum kesintisi = 0** (ölçülür).

## 6. Mobil / responsive

- Tek breakpoint 640px KORUNUR; queue-first düzen 320/375/640/1440'ta doğrulanır (Playwright).
- Kartlar tek kolon stack; buton satırı primary+overflow'a düşer; drawer + hamburger mevcut davranış.
- Dokunma hedefleri ≥44px; inline edit mobilde tam genişlik textarea.

## 7. V1 yüzeyleri (kısa spec)

- **Radar (birleşim):** mevcut `SubNav` pattern'i ile 5 alt-sekme; her alt-sekmenin kendi filter bar'ı kalır; ortak "kuyruğa gönder" eylemi.
- **Kütüphane (birleşim):** 3 alt-sekme; `KeywordLibraryTab`'ın statik JSON'u değişmez.
- **Instagram alanı:** Rakip Radarı (watchlist + outlier feed + swipe-file board) | Reels Dosyaları (dossier listesi; her araç adının yanında yeşil "doğrulandı · <tarih>" rozeti — verifier kanıtına bağlı, `not_ready` gri). Dört durum tasarımı zorunlu.
- **Seri DNA editörü:** Ayarlar alt-sekmesi; form (WHY/STRUCTURE/VISUAL/CAPTION/QUALITY grupları) + gold-example paneli + learned-rules onay paneli (asla otomatik uygulanmaz) + "5 gönderiden başlat".

## 8. Ölçülebilir UX başarı kriterleri

| Metrik | Hedef | Ölçüm |
|---|---|---|
| Time-to-First-Approve | <60 sn | client timing, açılış→ilk onay |
| Screens-touched (primary task) | 1 | activeTab değişim sayısı |
| Clicks-to-publish | ≤3 | kart→edit→kopyala |
| Healthy-state interruption | 0 | readiness genişleme sayacı |
| daily-queue'suz onay oranı | artan | feedback kaynağı alanı |
| "Bugünlük bitti" görülme oranı | artan | event |

## 9. Kabul kriterleri

- [ ] Bugün: ReviewQueue fold üstü; sayaç tek satır; readiness sağlıklıyken tek tik, yalnız sorunda genişler.
- [ ] Primary task ≤2 adım — 320/375/640/1440 click-path audit.
- [ ] Her günlük yüzeyde 4 durum ayrı; error ≠ empty (test edilir).
- [ ] `daily-queue` drill-down erişilebilir; route+alias sağlam; alias başına regression testi yeşil.
- [ ] Immutable sembol grep-guard CI'da.
- [ ] (V1) IG lane DraftReviewCard ile render, hiçbir send API çağrısı yok (assert).
- [ ] (V1) Klavye yolu çalışır + reduced-motion.
- [ ] Vitest (~994) + `next build` + Playwright smoke yeşil.
