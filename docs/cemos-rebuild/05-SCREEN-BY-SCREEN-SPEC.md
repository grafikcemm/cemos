# 05 — Screen-by-Screen Spec (bağlayıcı, SPEC-PENDING YOK)

> **⚠ ADR-020 (2026-07-15):** CemOS **desktop-only + tek tema dark editorial**. Aşağıdaki **"Mobil wireframe" satırları TARİHSEL tasarım kaydıdır — implementasyon zorunluluğu DEĞİL** (mobil = best-effort). Desktop kabul: birincil 1280/1440/1920, min 1024, 1024–1920 taşma yok. Renkler dark (bkz. ADR-020 / `06`). İçerik genişliği: reading 960 / standard 1080 / wide 1280 (Bugün/Profil=standard; Takvim/Kütüphane/advanced=wide).
>
> BÜTÜN kullanıcı-erişilebilir yüzeyler tam kesinlikte. Tasarım sistemi: `06-DESIGN-SYSTEM-SPEC.md` (dark editorial, terracotta, Inter, desktop genişlik varyantları, 5+1 durum). Sınıflandırma: `04-COMPLETE-UI-REDESIGN-PLAN.md`. Her ekran aynı template.

**Template alanları:** Amaç · Yeni ev/eski karşılık · Desktop wireframe · Mobil wireframe · İçerik sırası · Birincil/ikincil eylemler · Component ağacı · Veri kaynakları · Durumlar (loading/empty/error/success/stale/blocked-external) · Klavye · Responsive · Kabul kriterleri.

---

## BÖLÜM A — Shell & Navigasyon

### A1. App Shell [sınıf: CORE]
- **Amaç:** Tüm ekranları saran çerçeve: sidebar + topbar + workspace + mobil bottom-nav.
- **Yeni ev / eski karşılık:** `AppShell.tsx` (mevcut, yeniden). `XAgentApp.tsx`→`AppShell` zinciri korunur (legacy invariant).
- **Desktop wireframe:**
```
┌────────────┬───────────────────────────────────────────────┐
│ CemOS      │ [breadcrumb]        [⌘K ara]        [● sağlık] │ ← topbar 52px
│            ├───────────────────────────────────────────────┤
│ Bugün      │                                               │
│ Plan       │        workspace (rounded panel, #FFF)        │
│ Kütüphane  │        içerik max-width 960px, ortalı         │
│            │                                               │
│ Toolbox    │                                               │
│ ┄┄┄┄┄┄┄┄┄  │                                               │
│ [@grafik▾] │                                               │
│ [Profil ▾] │                                               │
└────────────┴───────────────────────────────────────────────┘
```
- **Mobil wireframe:** workspace full-bleed; topbar sadeleşir (breadcrumb + sağlık nokta); altta bottom-nav (A4).
- **İçerik sırası:** sidebar (marka/nav/toolbox/hesap/profil) → topbar → workspace(renderScreen).
- **Birincil/ikincil eylemler:** nav seçimi (birincil); Cmd+K (global); sağlık drawer (ikincil).
- **Component ağacı:** `AppShell` → `Sidebar`(A2) + `TopStrip`(A3) + `<main>`(renderScreen) + `MobileNav`(A4) + `CommandPalette`(A5) + `ProfileMenu`(A6).
- **Veri kaynakları:** `useXAgentStore` (activeTab/activeChannel), `useSystemStatus` (sağlık).
- **Durumlar:** loading = ilk paint skeleton shell; empty = N/A (shell hep dolu); error = global ErrorBoundary sayfası; success = normal; stale = topbar sağlık göstergesi; blocked-external = giriş kapısı öncesi `/giris` (proxy).
- **Klavye:** Cmd/Ctrl+K palette; Tab sidebar→topbar→içerik; sidebar okları.
- **Responsive:** ≤640 sidebar gizlenir → bottom-nav; workspace full-bleed; page-x 16px.
- **Kabul:** 3 birincil nav + Toolbox + Profil; agent/model/maliyet shell'de yok; 320-1440 taşma 0; console error 0; `xagent-store` anahtarı değişmemiş.

### A2. Sidebar [sınıf: CORE]
- **Amaç:** 3 göreve indirgenmiş birincil navigasyon.
- **Yeni ev / eski karşılık:** `Sidebar.tsx` (mevcut ~16-item dolu-nav → 3 alan). Eski gruplar (ÜRETİM/KEŞİF/HAFIZA/SİSTEM) kalkar.
- **Desktop wireframe:**
```
┌──────────────┐
│ ◆ CemOS      │  marka
│              │
│ ☀ Bugün      │  aktif = accent-tint zemin + 2px accent sol-bar
│ ▤ Plan       │
│ ▦ Kütüphane  │
│              │
│ ⚙ Toolbox    │  utility (ayrı, küçük)
│ ┄┄┄┄┄┄┄┄┄┄┄  │
│ @grafikcem ▾ │  hesap seçici
│ ◐ Profil   ▾ │  → ProfileMenu (A6)
│ [« Daralt]   │
└──────────────┘
```
- **Mobil wireframe:** görünmez (bottom-nav'a devreder).
- **İçerik sırası:** marka → 3 alan → Toolbox → hesap seçici → Profil → daralt.
- **Birincil/ikincil eylemler:** alan seç (birincil); Toolbox/Profil (ikincil); daralt (gizle, icon-rail'e DÜŞMEZ — 06 §7).
- **Component ağacı:** `Sidebar` → nav item'ları (lucide ikon + etiket), `AccountSelector`, `ProfileMenuTrigger`, collapse toggle. testid `sidebar-tab-{id}`.
- **Veri kaynakları:** `navConfig.PRIMARY_AREAS` (3), `UTILITY_TABS` (toolbox), `PROFILE_TABS`; `activeChannel`.
- **Durumlar:** loading = statik (nav config); empty/error/stale/blocked-external = N/A (nav her zaman var).
- **Klavye:** Tab sırası alan→toolbox→hesap→profil; Enter seç; aktif `aria-current`.
- **Responsive:** ≤640 gizli; 232px açık / gizli.
- **Kabul (ADR-040 revize):** 3 TOP-LEVEL alan + hiyerarşik "Araştırma" grubu + aktif-alan alt-nav + "Şimdi" özeti + Toolbox + Profil; legacy motor adları artık sidebar'da keşfedilebilir (Fırsatlar/Cmd+K'da da kalır); aktif durum accent ikon; sidebar 1024/1920'de boş ray gibi görünmez.

### A3. Topbar (TopStrip) [sınıf: CORE]
- **Amaç:** breadcrumb + global arama + yalnız-müdahale-gereken sağlık.
- **Yeni ev / eski karşılık:** `TopStrip.tsx` (mevcut, yeniden). Sağlık göstergesi ADR-014'e göre daralır.
- **Desktop wireframe:** `[Alan / Alt-görünüm]      [⌘K ara...]      [● durum]`
- **Mobil wireframe:** `[Alt-görünüm]   [●]` (arama Cmd+K'ya, ikonla).
- **İçerik sırası:** breadcrumb (sol) → arama (orta) → sağlık (sağ).
- **Birincil/ikincil eylemler:** arama/Cmd+K (birincil); sağlık drawer aç (ikincil, yalnız problem varsa dikkat çeker).
- **Component ağacı:** `TopStrip` → breadcrumb, `SearchInput`(⌘K hint, `cemos:open-palette` event), `SystemStatusButton`→`Drawer`.
- **Veri kaynakları:** `navConfig` (etiket), `useSystemStatus` (3-katman özet; ADR-014).
- **Durumlar:** loading = sağlık nötr nokta; empty = N/A; error = sağlık kırmızı + drawer; success = yeşil sessiz; **stale** = kehribar nokta + "veri N saat önce"; blocked-external = sağlık drawer'da dış blocker satırı.
- **Klavye:** Cmd/Ctrl+K arama; Enter drawer; Esc kapat.
- **Responsive:** ≤640 arama metni gizli, ikon kalır.
- **Kabul:** sağlık yalnız müdahale-gereken durumu öne çıkarır; "kuyruk bitti" ≠ kırmızı; arama global palette açar.

### A4. Mobile Bottom Nav [sınıf: CORE]
- **Amaç:** mobilde 3 görev + Profil tek elle.
- **Yeni ev / eski karşılık:** `MobileNav.tsx` (mevcut 5-buton → 3+1).
- **Mobil wireframe:** `[☀ Bugün] [▤ Plan] [▦ Kütüphane] [◐ Profil]`
- **İçerik sırası:** 4 buton eşit; aktif accent.
- **Birincil/ikincil eylemler:** alan geç (birincil); aktif alana re-tap → alt-görünüm sheet (Plan/Kütüphane).
- **Component ağacı:** `MobileNav` → 4 buton (`bottomnav-{id}`), re-tap `Sheet` (`sheet-tab-{id}`). Toolbox: Profil sheet veya Cmd+K'dan.
- **Veri kaydı:** `navConfig` + `activeTab`.
- **Durumlar:** loading/empty/error/stale = N/A; success = normal; blocked-external = giriş öncesi yok.
- **Klavye:** dokunma birincil; focus ring; sheet focus-trap.
- **Responsive:** yalnız ≤640; `env(safe-area-inset-bottom)`.
- **Kabul:** 3 alan+Profil; re-tap sheet; **publish gibi geri-alınamaz aksiyon swipe-to-dismiss DEĞİL** (06 §10).

### A5. Command Palette (Cmd/Ctrl+K) [sınıf: CORE]
- **Amaç:** global aksiyon yüzeyi — nav + oluştur + ara + "sor".
- **Yeni ev / eski karşılık:** `CommandPalette.tsx` (mevcut nav-only → global). `commands.ts` registry (YENİ).
- **Desktop wireframe:**
```
┌─────────────────────────────────────┐
│ 🔍 komut / ara...                    │
├─────────────────────────────────────┤
│ SON KULLANILANLAR                    │
│   Bugün · Plan/Fırsatlar             │
│ GİT                                  │
│   Bugün · Plan · Kütüphane · Toolbox │
│ OLUŞTUR                              │
│   + Kaynak ekle  + Plan slotu        │
│ ARA (Kütüphane)                      │
│   "…" sonuçları                      │
│ CEMOS'A SOR   (ayrı grup)            │
│   › "…" (Faz 1: yakında)             │
└─────────────────────────────────────┘
```
- **Mobil wireframe:** tam-ekran overlay; aynı gruplar; alt sabit input.
- **İçerik sırası:** input → Son → Git → Oluştur → Ara → Sor (ayrı grup).
- **Birincil/ikincil eylemler:** komut çalıştır (Enter); grup gezinme (↑↓).
- **Component ağacı:** `CommandPalette` → input, gruplu liste (`commands.ts`: `{id,label,group,keywords,run}`), boş grup gizlenir.
- **Veri kaynakları:** `allNavigableTabs()`, Kütüphane arama API, aksiyon handler'ları. "Sor" Faz 1 stub.
- **Durumlar:** loading = arama debounce skeleton; empty = "sonuç yok"; error = arama hatası satırı; success = sonuçlar; stale = N/A; blocked-external = "Sor" yakında rozeti.
- **Klavye:** Cmd/Ctrl+K aç; ↑↓ gezin; Enter çalıştır; Esc kapat; subsequence fuzzy (Türkçe normalize).
- **Responsive:** overlay her ekran; mobilde tam-ekran.
- **Kabul:** nav+oluştur+ara+ayrı "Sor" grubu; Türkçe normalize; klavye tam; boş grup gizli.

### A6. Profil Menüsü [sınıf: CORE]
- **Amaç:** utility/system yüzeylerini ana navdan çıkarıp tek menüde toplamak.
- **Yeni ev / eski karşılık:** `ProfileMenu.tsx` (YENİ). costs/system/settings ana navdan buraya.
- **Desktop wireframe:**
```
┌──────────────────────────┐
│ CemOS'un bildikleri       │
│ Entegrasyonlar            │
│ Sistem                    │
│ Maliyet                   │
│ Ayarlar                   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│ Çıkış                     │
└──────────────────────────┘
```
- **Mobil wireframe:** Profil bottom-nav → tam sheet, aynı liste.
- **İçerik sırası:** 5 yüzey → çıkış.
- **Birincil/ikincil eylemler:** yüzey aç (birincil); çıkış (ikincil, onaylı).
- **Component ağacı:** `ProfileMenu` → menü item'ları → ilgili ekran; `api/auth/logout`.
- **Veri kaynakları:** `PROFILE_TABS`; auth session.
- **Durumlar:** loading/empty/error/stale = N/A; success = normal; blocked-external = Entegrasyonlar'da rozet.
- **Klavye:** aç/gezin/Enter/Esc; çıkış onay diyaloğu.
- **Kabul:** costs/system/settings ana navda YOK; buradan erişilir; çıkış cookie temizler.

### A7. Giriş (`/giris`) [sınıf: CORE / STATE:access-gate]
- **Amaç:** tek-operatör erişim kapısı (P0). Parola YOK — "Sign in with Vercel" (OIDC, ADR-049).
- **Yeni ev / eski karşılık:** `src/app/giris/page.tsx`. Öncesi: parola formu (ADR-013/017, emekli).
- **Desktop wireframe:**
```
            ◆ CemOS
     ┌────────────────────────┐
     │ Yetkili Vercel hesabın  │
     │ ile giriş yap.          │
     │ [ ▲ Vercel ile giriş ]  │
     │ (hata: uyarı)           │
     └────────────────────────┘
```
- **Mobil wireframe:** aynı, ortalı, tam genişlik buton.
- **İçerik sırası:** marka → açıklama → (hata mesajı) → "Vercel ile giriş yap" butonu.
- **Birincil/ikincil eylemler:** Vercel ile giriş (birincil, tek; `<a>` → `/api/auth/authorize`).
- **Component ağacı:** saf server-component (JS'siz) → `/api/auth/authorize` (PKCE+state+nonce) → Vercel consent → `/api/auth/callback`.
- **Veri kaynakları:** `NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` (authorize URL), `AUTH_ALLOWED_VERCEL_USERS` (callback allow-list, fail-closed), `SESSION_SECRET` (cookie imza). Vercel access/refresh token'ları saklanmaz.
- **Durumlar:** loading = N/A (statik link); empty = ilk hal; error = `?e=` (`forbidden` = yetkili değil, `denied` = iptal, `oauth`/`state`/`nonce` = tekrar dene); success = callback → redirect `next`; **blocked-external** = `?e=config` (prod env eksik → "yapılandırılmamış", fail-closed).
- **Klavye:** butona Tab/Enter.
- **Responsive:** her boyutta ortalı.
- **Kabul:** geçerli cookie olmadan `/` erişilemez; allow-list dışı Vercel hesabı reddedilir (`?e=forbidden`); `next` open-redirect korumalı; secret değeri asla ekranda/logda.

---

## BÖLÜM B — Bugün (birincil ürün)

### B1. Bugün — Karar Kuyruğu [sınıf: CORE]
- **Amaç:** hazır X içeriğini görüp kısa kontrolle onaylayıp paylaşmak. Dashboard değil, karar kuyruğu.
- **Yeni ev / eski karşılık:** `MorningDashboardTab.tsx`+`ReviewQueue.tsx` (yeniden). `daily-queue` ABSORBED (tam kuyruk buraya, list/kanban toggle "Tüm kuyruk").
- **Desktop wireframe (960px):**
```
15 Temmuz · 2 içerik hazır          [grafikcem ▾]
┌──────────────────────────────────────────────┐
│ SIRADAKİ                          [hazır ●]   │
│ @grafikcem · X · mega                         │
│                                               │
│ "Bir görselin AI mi gerçek mi olduğunu 5      │
│  dakikada test ediyorum: …"          (Newsreader gövde)
│  [görsel önizleme]                            │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│ Neden bugün? TinEye C2PA haberi · 3s önce     │
│ ◐ Kısmen doğrulandı (2s önce)   [Detay ›]     │
│ kanca 88 · doğallık 92 · özgünlük 75 · risk 14│
│                                               │
│ [Düzenle]                        [X'te aç]    │
│  (X'te açtıktan sonra → [Paylaşıldı olarak işaretle])│
└──────────────────────────────────────────────┘
KUYRUK (0/2 incelendi)                [Tüm kuyruk ▾]
○ @maskulenkod · "Sorumluluk 5 gerçek…" [düzenleme gerekli]
```
- **Mobil wireframe (390px):** tarih+sayı → tek SIRADAKİ kart (tam metin) → kuyruk satırları → bottom-nav. CTA thumb-erişilebilir altta.
- **İçerik sırası:** tarih+"N hazır"+hesap filtresi → SIRADAKİ kart (B2) → sessiz kuyruk satırları → (opsiyonel) "Tüm kuyruk" list/kanban → "Tepki vermeye değer" (katlı) → Günlük Özet (katlı).
- **Birincil/ikincil eylemler:** Onayla-ve-yayınla/X'te aç (birincil, readiness'e göre); Düzenle; sonraki (J); atla.
- **Component ağacı:** `MorningDashboardTab` → `MorningHeroStats`, `OperatorReadinessGate`(sessiz), `ReviewQueue`→`DraftReviewCard`(B2)+`QueueRow[]`, katlı highlights, `DigestSection`.
- **Veri kaynakları:** kuyruk GET endpoint (payload'a `readiness`,`readinessNotes`,`whyToday`,`sources`,`verification`,`confidence` eklenir — 1C teyit), `useDailyQueueData()`.
- **Durumlar:** loading = skeleton kart; **empty** = "Bugünlük hazır içerik yok" + "Üret" (operator-scan); error = ErrorState + retry; success = kart+kuyruk; **stale** = kart üstünde "sinyaller N saat eski" kehribar; blocked-external = üretim OpenRouter kredisi yoksa açık neden.
- **Klavye:** A kaydet · E düzenle (textarea focus) · J atla/sonraki · K "paylaşıldı" (yalnız SIRADAKİ kart; yazarken bastırılır; tek-el audit).
- **Responsive:** 960 tek kolon; ≤640 full-bleed; kuyruk satırları taşmaz.
- **Kabul:** ilk viewport'ta tarih+"N hazır"+SIRADAKİ kart; kaynak+neden+güven kartta; agent/model/maliyet ana yüzde yok; "kuyruk bitti" → "Bugünlük bitti ✓" (sağlıksız değil); klavये tek-el.

### B2. Taslak Kartı (DraftReviewCard) [sınıf: CORE]
- **Amaç:** tek taslağı readiness sözleşmesiyle karara bağlamak; zorunlu kozmetik edit-gate KALDIRILIR.
- **Yeni ev / eski karşılık:** `DraftReviewCard.tsx` (yeniden; UI edit-gate `:115/:166/:398` silinir).
- **Kart ana yüz içeriği:** hesap+platform+mod chip → readiness çipi (hazır/düzenleme gerekli/engelli) → metin (düzenlenebilir textarea, Newsreader) → medya → **Neden bugün?** satırı → **kaynak + 5-durumlu doğrulama çipi (kart ve drawer BİREBİR aynı; ADR-017.5)** → sinyal chip'leri (ayrık, tek "viral puan" YOK) → char sayısı → aksiyonlar.
- **Readiness → aksiyon (ADR-008 + ADR-017.3 — X API ödemesi onaylanmadı, mevcut ürün durumu):**
  - `ready` (yeşil) → birincil CTA **"X'te aç"** (intent). **"Onayla ve yayınla" GÖSTERİLMEZ** (yalnız gerçek API adapter bağlıyken koşullu varyant — mevcut durumda yok). Düzenleme ZORUNLU DEĞİL.
  - `needs_edit` (kehribar + Türkçe nedenler) → **Düzenle**; publish düzenlenene dek kilitli.
  - `blocked` (kırmızı + neden) → publish gizli; neden+kaynak.
- **Publish state akışı (ADR-011 + ADR-017.3):** `ready → (X'te aç) → publish_prepared → (kullanıcı geri döner) "Paylaşıldı olarak işaretle" → manual_published`. "X'te aç" intent penceresi açar + `PublishAttempt(prepared)` yazar; **PublishLog/PublishedPost/`manual_published` YAZILMAZ**. Kart `publish_prepared` durumunda "X'te aç" yerine **"Paylaşıldı olarak işaretle"** + "Vazgeç" gösterir. Manuel onay → transaction: `manual_published` + PublishLog + PublishedPost.
- **Birincil/ikincil eylemler:** ready → "X'te aç" (birincil); prepared → "Paylaşıldı olarak işaretle" (birincil); Düzenle·Kaydet·Kopyala·Görsel üret·Detay (ikincil).
- **Component ağacı:** `DraftReviewCard` → header chips, `textarea`, `SignalRow`(ayrık chip), `VerificationChip`(5 durum, drawer ile ortak kaynak), `WhyTodayLine`, action bar (`data-readiness` + `data-publish-state` attr); Detay→`Drawer`(B3).
- **Veri kaynakları:** QueueItem (`content`/`editedContent`/`scores`/`lintReport`/`candidatesJson`/provenance), `readinessService` (yayın anında `editedContent ?? content` re-run), `whyToday.ts` (kart+drawer aynı `verification` alanını okur), `PublishAttempt`.
- **Durumlar:** loading = skeleton; empty = N/A (kart hep dolu); error = kaydet/işaretle hata toast; success = "Paylaşıldı olarak işaretle" → kuyruktan çıkar; **stale** = doğrulama `stale` çipi; **blocked-external** = CemOS içinden doğrudan yayın (X API) ödeme onayı bekliyor → kart yalnız "X'te aç" (intent) sunar, "doğrudan yayın: ödeme onayı bekliyor" sessiz notu (Entegrasyonlar linkli).
- **Klavye:** A/E/J/K; textarea içinde kısayol bastırılır.
- **Responsive:** 960/390 tek kolon; textarea min-yükseklik; char sayısı sağ; CTA mobilde thumb-erişilebilir.
- **Kabul:** ready taslak zorunlu kozmetik edit olmadan **"X'te aç"** akışına girer; needs_edit publish'i kilitler; blocked publish gizler; 6 kötü-taslak fixture'ı ready değil; `data-readiness` E2E'de okunur; **intent açmak PublishLog/PublishedPost/`manual_published` YARATMAZ — yalnız `PublishAttempt(prepared)`**; "Paylaşıldı olarak işaretle" olmadan performans ledger'ı yazılmaz; **kart doğrulama çipi drawer ile aynı QueueItem için birebir eşleşir** (E2E kontrol).

### B3. Taslak Detay Drawer [sınıf: CORE]
- **Amaç:** kaynak/sinyal/audit'i kuyruk canlıyken göstermek (non-modal, progressive disclosure).
- **Yeni ev / eski karşılık:** `Drawer`/`DetailPanel` (mevcut primitive; içerik YENİ).
- **Desktop wireframe:** sağdan drawer, liste arkada canlı:
```
                    ┌──────────────────────────┐
                    │ Taslak detayı        [×] │
                    │ Kaynaklar                │
                    │  • TinEye C2PA · ✓ 2s    │
                    │    [kaynağı gör ›]        │
                    │ Doğrulama: Kısmen         │
                    │  doğrulandı (partially)   │
                    │  2 iddiadan 1'i bağımsız  │
                    │  kaynakla eşleşti         │
                    │ Sinyaller (ayrık)         │
                    │  kanca 88 · doğallık 92…  │
                    │ Alternatif hook'lar       │
                    │  › "…" › "…"              │
                    │ Özgünlük: 7g benzersiz    │
                    │ Hesap/seri uyumu          │
                    │ › Gerekçeyi göster        │
                    │   (audit izi, model/₺)    │
                    └──────────────────────────┘
```
- **Mobil wireframe:** alttan tam-yükseklik sheet; aynı sıra; explicit close.
- **İçerik sırası:** kaynaklar+doğrulama tarihi → sinyaller → alternatif hook'lar → originality → hesap/seri uyumu → (katlı) audit izi + model/maliyet.
- **Birincil/ikincil eylemler:** kaynağa git (hover-preview); "Gerekçeyi göster" (progressive); alternatif hook uygula.
- **Component ağacı:** `Drawer`→`DetailPanel` bölümleri; `SignalRow`; audit `<details>`.
- **Veri kaynakları:** `WebsiteVerification`/`NewsItem`/`SourcePost`, `candidatesJson`, `isNearDuplicate`, `GenerationRun`, `UsageLog`.
- **Durumlar:** loading = bölüm skeleton; empty = "kaynak yok → source_available/unverified"; error = bölüm hata; success = dolu; **stale** = doğrulama stale + re-verify öner; blocked-external = "benzer eski içerik" vector-memory Faz 2 → Faz 1 recent-published fallback notu.
- **Klavye:** Esc kapat; focus-trap; Tab bölümler; "Gerekçeyi göster" Enter.
- **Responsive:** desktop sağ drawer / mobil alt sheet.
- **Kabul:** kaynak varlığı fact-check gibi sunulmaz (5 durum ayrık; "kaynak mevcut"=`source_available` ≠ "iddia doğrulandı"=`verified`); **kart ve drawer aynı QueueItem için birebir aynı `verification` durumunu gösterir** (tek kaynak `whyToday.verification`; E2E kontrol); 5 durum kart/drawer/API sözleşmesinde eşleşir; model/maliyet en altta teknik detay; non-modal (kuyruk canlı); klavye tam.

---

## BÖLÜM C — Plan

Ana ekran = SubNav (Takvim · Fırsatlar · Seriler). Alt-görünüm store'da `activeTab` (`plan-takvim`/`plan-firsatlar`/`plan-seriler`).

### C1. Plan / Takvim [sınıf: CORE (yeni)]
- **Amaç:** X/IG/Reels yayın planı — ay=yoğunluk, hafta=önizleme; reels dossier detayı buradan.
- **Yeni ev / eski karşılık:** `src/components/plan/TakvimTab.tsx` (YENİ). `instagram/reels` (ReelsDossierSection) içeriği dossier detayı olarak buraya.
- **Desktop wireframe (geniş, overflow-x:auto):**
```
Plan  [Takvim] Fırsatlar  Seriler          [Ay ▾] [+ Slot]
┌ Tem 2026 ────────────────────────────────────────────┐
│ Pzt  Sal  Çar  Per  Cum  Cmt  Paz                     │
│  ·    ●    ·    ●●   ·    ·    ·   ← ay: yoğunluk (nokta)│
│ 14   15   16   17   18   19   20                       │
└───────────────────────────────────────────────────────┘
[Hafta] görünümü: her slot metin önizleme + kanal + saat
```
- **Mobil wireframe:** ay = dikey liste (gün + nokta sayısı); slot tap → detay sheet.
- **İçerik sırası:** SubNav → görünüm toggle (Ay/Hafta) + kanal filtresi → takvim grid → slot detay (drawer: dossier).
- **Birincil/ikincil eylemler:** slot aç/dossier gör (birincil); + Slot ekle; sürükle-yeniden planla (hafta); kanal filtresi.
- **Component ağacı:** `TakvimTab` → `SubNav`, `FilterBar`(kanal), `TimelineLane`/takvim grid, slot→`Drawer`(dossier: konu/site/hook/senaryo/sahne/caption/hashtag/CTA/kaynak/risk).
- **Veri kaynakları:** `Schedule`, `ReelPlan`/`ReelPlanSlot`, `ReelDossier` (`reels/dossier-generator`), `plan-assembler`.
- **Durumlar:** loading = grid skeleton; **empty** = "Bu ay planlı içerik yok" + "Fırsatlardan ekle"; error = retry; success = dolu grid; **stale** = dossier evidence expired → "yeniden doğrula" bayrağı (`staleDossierFlags`); **blocked-external** = Meta izni yoksa IG slotları "manuel/import" notu.
- **Klavye:** ok tuşları gün gezinme; Enter slot; Esc drawer.
- **Responsive:** ay grid ≤640 dikey liste; hafta overflow-x:auto.
- **Kabul (ADR-040 revize):** ay hücreleri artık yalnız nokta DEĞİL — gerçek veri varsa kompakt içerik (readiness renk noktası + konu/başlık; dossier'sız planlı slot dürüst nötr, içerik UYDURULMAZ); hafta=önizleme; cross-platform filtre (kalıcı renk-overlay YOK); araç-adlı dossier geçerli site kanıtı olmadan `ready` olamaz; stale bayrağı görünür. (Eski "ay=yalnız yoğunluk noktası, içerik önizleme yok" SUPERSEDED.)

### C2. Plan / Fırsatlar [sınıf: CORE (yeni) — advanced motorların editoryal yüzü]
- **Amaç:** arka plan motorlarını (haber buzz/YouTube/viral radar/keşif/rakip) editoryal SEÇİLMİŞ birkaç fırsata indirmek; ham 60 sonuç değil.
- **Yeni ev / eski karşılık:** `src/components/plan/FirsatlarTab.tsx` (YENİ). `instagram/radar` (CompetitorRadarSection) içeriği + advanced ekranların (news-pool/youtube/flow-radar/discovery-engine/source-intelligence) çıktı özeti.
- **Desktop wireframe (960px):**
```
Plan  Takvim  [Fırsatlar]  Seriler        [tümü ▾ filtre]
┌──────────────────────────────────────────────┐
│ 🔥 "AI görsel tespiti" · buzz 82 · 3s önce    │
│    Neden şimdi? teyit+tazelik · X/Reels uygun │
│    [İçerik üret] [Plana ekle] [Ham araştır ›] │
├──────────────────────────────────────────────┤
│ 📹 Rakip Reel outlier ×3.2 (yeterli örneklem) │
│    [Seriye ekle] [Ham araştır ›]              │
└──────────────────────────────────────────────┘
```
- **Mobil wireframe:** dikey fırsat kartları; birincil aksiyon altta.
- **İçerik sırası:** filtre → seçilmiş fırsat kartları (buzz×uyum×tazelik sıralı) → her kart: neden şimdi + platform önerisi + aksiyonlar.
- **Birincil/ikincil eylemler:** İçerik üret (Bugün'e taslak) / Seriye ekle / Plana ekle (birincil); **Ham araştır ›** → REDESIGNED-ADVANCED ekran (ikincil).
- **Component ağacı:** `FirsatlarTab` → `FilterBar`, fırsat `Card[]` (`EntityCard`), aksiyon butonları; "Ham araştır" → advanced ekran (D-bölümü/subagent).
- **Veri kaynakları:** `news/buzz`, `youtube` fırsat, `flow-radar`, `discovery-engine`, `igCompetitorService`/`outlier` — deterministik editoryal sıralama (LLM küratörlük Faz 2).
- **Durumlar:** loading = kart skeleton; **empty** = "Bugün öne çıkan fırsat yok" + "Ham araştırmayı aç"; error = motor hata satırı (biri düşse diğerleri görünür); success = seçilmiş kartlar; **stale** = "sinyaller N saat eski"; blocked-external = Meta/kredi yoksa ilgili motor "veri sınırlı" notu.
- **Klavye:** Tab kartlar; Enter birincil aksiyon.
- **Responsive:** 960 tek kolon kart; ≤640 full-bleed.
- **Kabul:** ham 60 sonuç değil seçilmiş birkaç; her fırsat "neden şimdi"+platform; "Ham araştır" advanced ekranı açar; outlier küçük örneklemde `insufficient` etiketi (aşırı çarpan gösterme).

### C3. Plan / Seriler [sınıf: CORE (yeni)]
- **Amaç:** carousel/reels seri DNA'sını görmek/düzeltmek — kapak/hook formülü, slide arketipleri, caption/hashtag düzeni, tekrar yasakları, performans.
- **Yeni ev / eski karşılık:** `src/components/plan/SerilerTab.tsx` (YENİ). `SeriesDnaSection` (Settings'ten) buraya; `instagram` ABSORBED varsayılan girişi.
- **Desktop wireframe (960px):**
```
Plan  Takvim  Fırsatlar  [Seriler]          [+ Seri]
┌ "Pratik Tasarım İpuçları" ───────────────────┐
│ Amaç · kitle · 8 slide · kapak formülü        │
│ Slide arketipleri: hook→problem→3 ipucu→CTA   │
│ Caption formülü · Hashtag grupları            │
│ Tekrar yasakları: [konu1] [konu2]             │
│ Performans: son 4 bölüm eng. ▁▃▂▅             │
│ [DNA'yı düzenle]                              │
└───────────────────────────────────────────────┘
```
- **Mobil wireframe:** seri kartları dikey; DNA düzenle → tam sheet.
- **İçerik sırası:** seri listesi → seçili seri DNA (amaç/format/kapak/arketip/görsel/caption/hashtag/tekrar-yasak/performans/düzeltmeler) → düzenle.
- **Birincil/ikincil eylemler:** DNA'yı düzenle (birincil, provenance+onay); + Seri; bölüm geçmişi.
- **Component ağacı:** `SerilerTab` → seri `Card[]`, DNA panel, düzenle→onay kuyruğu (provenance göster; insan onayı olmadan kimlik kuralı kalıcılaşmaz).
- **Veri kaynakları:** `SeriesProfile`, `CaptionDna`, `HashtagDna`, `VisualStyleProfile`, `dnaDistillService` (provenance `operator` korunur).
- **Durumlar:** loading = skeleton; **empty** = "Henüz seri yok" + "Seri oluştur / geçmişten DNA çıkar"; error = retry; success = dolu; **stale** = DNA kanıtı eski → "yeniden damıt" öner; blocked-external = Meta izni yoksa "manuel örnek gir".
- **Klavye:** Tab seri; Enter DNA; düzenlemede kaydet.
- **Responsive:** 960 kart; ≤640 full-bleed; performans sparkline overflow yok.
- **Kabul:** kullanıcı seri DNA'sını görüp düzeltir; caption/hashtag/görsel provenance+confidence hesap-bazlı; DNA değişimi insan onayı olmadan kalıcılaşmaz; tekrar yasakları görünür.

---

## BÖLÜM D — Kütüphane

Ana ekran = SubNav (Tümü · İlham · Öğrenme). Alt-görünüm `activeTab` (`lib-tumu`/`lib-ilham`/`lib-ogrenme`).

### D1. Kütüphane / Tümü [sınıf: CORE (yeni) — 4 kütüphane ABSORBED]
- **Amaç:** viral/keyword/prompt/pattern içeriğinin birleşik aramalı yüzeyi; X/IG/YT/web/manuel tek yerde.
- **Yeni ev / eski karşılık:** `src/components/library/LibTumuTab.tsx` (YENİ). ABSORBED: `viral-library`,`keyword-library`,`prompt-library`,`pattern-library`.
- **Desktop wireframe (960px):**
```
Kütüphane  [Tümü] İlham  Öğrenme
[🔍 ara...]  [tür: hepsi ▾] [platform ▾] [gelişmiş filtre]
┌──────────────────────────────────────────────┐
│ [pattern] "hook: sayı+iddia" · support 12 · ✓ │
│ [prompt]  "carousel kapak" formülü            │
│ [keyword] "AI tespit" · 8 kullanım            │
│ [viral]   @rakip tweet · kaydedildi           │
└──────────────────────────────────────────────┘
```
- **Mobil wireframe:** arama üstte sabit; sonuç kartları dikey; tür filtresi chip.
- **İçerik sırası:** arama + tür/platform/gelişmiş filtre → birleşik sonuç listesi (tür rozeti) → item → detay.
- **Birincil/ikincil eylemler:** ara (birincil); item aç (İlham analizi/kullan); filtrele; kaydet.
- **Component ağacı:** `LibTumuTab` → `SearchInput`, `FilterBar`(tür/platform/gelişmiş), sonuç `Table`/`Card[]` (tür rozeti), item→`Drawer`.
- **Veri kaynakları:** `ViralPattern`/`SavedViralTweet`/`KeywordEntry`/`PromptTemplate`/`PromptFormula` + `ContentItem`; birleşik arama API.
- **Durumlar:** loading = skeleton satır; **empty** = "Kütüphanede sonuç yok" + "Kaynak ekle"; error = retry; success = liste; **stale** = pattern `validatedAt` eski → soluk; blocked-external = N/A.
- **Klavye:** `/` arama focus; ↑↓ sonuç; Enter aç.
- **Responsive:** 960 tablo → ≤640 kart; geniş tablo overflow-x:auto.
- **Kabul:** 4 kütüphane tek aramada; tür filtresi (keyword/prompt/pattern/viral); niş filtreler gelişmiş panelde; item detayı İlham analizine bağlanır.
- **4B UYGULANDI (ADR-041, 2026-07-19):** içerik satırı → drawer → kanonik **panoya kaydet** (`SaveToBoardButton` portal menü: hızlı kaydet + pano seç/oluştur; idempotent — zaten-kayıtlıda dürüst "Zaten kayıtlı"; satırda "Kayıtlı" rozeti); non-content (prompt/pattern/anahtar/viral) dürüst "panoya kaydedilmez — kanonik içerik içindir" notu; `/api/library/search` görünen sayfaya `savedBoards` üyeliğini TEK toplu sorguyla iliştirir (N+1 yok) + kararlı sayfalama (createdAt-desc+id) + `capped`; stale-response guard (yavaş yanıt yeniyi ezmez). TEK sözleşme `POST /api/library/save` (Tümü + 5 araştırma ekranı paylaşır).

### D2. Kütüphane / İlham [sınıf: CORE (yeni)]
- **Amaç:** kaydedilen rakip içeriğin yapısal analizi ("neden çalışıyor / nasıl uyarlanır / ne kopyalanmamalı" + 3 özgün fikir); boards.
- **Yeni ev / eski karşılık:** `src/components/library/LibIlhamTab.tsx` (YENİ). `viral-library` analizi + Boards.
- **Desktop wireframe (960px):**
```
Kütüphane  Tümü  [İlham]  Öğrenme        [+ Kaydet ▾]
┌ Board: "Reels hook'ları" ────────────────────┐
│ ▸ @rakip Reel · ×3.2 outlier                  │
│   İlk 3sn hook · vaat · tempo · CTA           │
│   ✓ Neden çalışıyor · ↻ Nasıl uyarlanır       │
│   ✗ Kopyalama · 💡 3 özgün fikir              │
└───────────────────────────────────────────────┘
Girdi: URL · screenshot · video · not · radardan Kaydet
```
- **Mobil wireframe:** board listesi → item → analiz sheet (progressive).
- **İçerik sırası:** boards → kaydedilen item → yapısal analiz (hook/vaat/yapı/görsel/CTA/neden/confidence/uyarlama/kopyalanmayacak/3 fikir).
- **Birincil/ikincil eylemler:** Kaydet (URL/screenshot/video/not) (birincil); analiz gör; board'a taşı; "içerik fikri kullan"→Bugün/Plan.
- **Component ağacı:** `LibIlhamTab` → board `Card[]`, item→`Drawer`(analiz, progressive), capture giriş formu.
- **Veri kaynakları:** `Board`/`BoardSection`/`BoardItem`, `ContentItem`, `Idea`/`IdeaSource`, `Creator`/`outlier`. (Faz 4 capture derinleşir.)
- **Durumlar:** loading = skeleton; **empty** = "İlham kütüphanen boş" + "İlk içeriği kaydet"; error = retry; success = boards; **stale** = analiz eski kaynak; **blocked-external** = mobil share/extension "yakında" (API contract açık).
- **Klavye:** Kaydet kısayolu; Tab board/item; Enter analiz.
- **Responsive:** 960 board grid → ≤640 tek kolon.
- **Kabul:** X/IG/YT/web/manuel kaydedilir + board'a; her kayıt "neden çalışıyor/nasıl uyarlanır/ne kopyalanmamalı" analizi; copyright/PII/policy sınırı; yapı çıkarımı (metin kopyalama değil).
- **4B UYGULANDI (ADR-041, 2026-07-19):** geniş ekranda (≥1200px) ana grid + bağlamsal sağ **rail** (`IlhamContextRail` — aktif pano + kayıt/pano/analiz sayaçları + son analizler + hızlı yakalama; YALNIZ gerçek workspace verisi, sahte KPI yok; `.ilham-workspace` grid ile ≤1200px'de rail ana akışın altına düşer). Capture akışı account-scoped + atomik ContentItem+BoardItem (mevcut `captureInspiration` sözleşmesi; DB unique index dedup backstop'u paylaşır). Araştırma ekranlarından (Haberler/YouTube/Viral Radar/Keşif/X Kaynakları) değerli sonuç aynı `POST /api/library/save` sözleşmesiyle panoya taşınır.

### D3. Kütüphane / Öğrenme [sınıf: CORE (yeni) — learn-dashboard ABSORBED]
- **Amaç:** YouTube/transcript/NotebookLM → kaynaklı Learn Pack (özet/atomik not/kavram/zihin haritası/görev/içerik fikri/tekrar); sakin Inbox→Hazır akışı.
- **Yeni ev / eski karşılık:** `src/components/library/LibOgrenmeTab.tsx` (YENİ). `learn-dashboard` ABSORBED (env gate `NEXT_PUBLIC_LEARN_ENABLED` korunur).
- **Desktop wireframe (960px):**
```
Kütüphane  Tümü  İlham  [Öğrenme]      [+ Kaynak ekle]
[Inbox 3] [Öğreniliyor 2] [Hazır bilgi] [Bugünkü tekrar 4]
┌ Inbox ───────────────────────────────────────┐
│ ▸ YouTube: "AI workflow" · işleniyor ▓▓▁      │
│ ▸ NotebookLM özeti · hazır → [Pack'i aç]      │
└───────────────────────────────────────────────┘
```
- **Mobil wireframe:** durum sekmeleri chip; kaynak kartları dikey; pack → tam sheet.
- **İçerik sırası:** durum sekmeleri (Inbox/Öğreniliyor/Hazır/Bugünkü tekrar) → kaynak kartları → Learn Pack detay (özet/exec/atomik not/kavram/Mermaid MOC/görev/içerik fikri/tekrar/Obsidian export).
- **Birincil/ikincil eylemler:** Kaynak ekle (YouTube URL/transcript/NotebookLM) (birincil); Pack'i aç; Obsidian'a aktar; bugünkü tekrarı yap.
- **Component ağacı:** `LibOgrenmeTab` → durum `SubNav`, kaynak `Card[]` (job ilerleme), Pack→`Drawer`; review kartları.
- **Veri kaynakları:** `LearnSource`/`LearnTranscript`/`LearnChunk`/`LearnPack`/`LearnConcept`/`LearnItem`/`LearnProcessingJob`/`LearnReviewSchedule`; `obsidian`/`githubVault`; `srs`.
- **Durumlar:** loading = job ilerleme skeleton; **empty** = "Öğrenme kaynağın yok" + "YouTube URL ekle"; **error** = kaynak başına anlaşılır sebep + tek-eylem recovery (retry); success = Pack hazır; **stale** = tekrar zamanı geçmiş; **blocked-external** = Obsidian GitHub token yoksa "export yapılandırılmadı" (env NAME) + retry; transcript sağlayıcı düşerse manuel transcript girişi.
- **✅ Phase 4C (ADR-042; 2026-07-19):** kaynak ekleme üç AÇIK mod (YouTube URL / Manuel transkript / NotebookLM özeti — NotebookLM "doğrulanmış transkript değildir"; provider/basis sunucu-set). Durum = kanonik `deriveLearnState` (inbox/processing/transcript_required/budget_blocked/needs_review/ready/failed — tek read-model). Processing mount'ta GET (reload-resume) + gerçek notes/graph/tasks/**content_ideas** aşamaları (artık passthrough değil) + budget/transcript ayrı. Pack 7 sekme (Genel/Atomik notlar/Kavramlar/Zihin haritası[erişilebilir ilişkisel görünüm + Mermaid `<details>`]/Uygula[görev+içerik fikri, kopyala, otomatik terfi yok]/Kartlar-Quiz/Kaynak); provenance chip zaman damgası YALNIZ timed provider'da (manuel/NotebookLM "kaynak/özet #idx"); NotebookLM summary-basis kalıcı uyarı + `summary_supported` grounding; not-ready pack Obsidian/hazır-bilgi eylemlerini gizler. Review server-side idempotent (idempotencyKey + atomik `$transaction`). v1 pack'ler okunur (legacy, hasArtifact=false); pipeline v2, reprocess yok.
- **✅ Phase 4D (ADR-043; 2026-07-19):** Learn Pack export artık tek "Obsidian'a aktar" butonu değil → **export paneli** (`LearnExportPanel`): üç kanal AYRI (ZIP indir / Yerel vault / GitHub vault) + configured/unconfigured (yalnız env NAME) + kanal başına son sonuç (succeeded/already_current/partial/conflict/failed + sayılar + errorClass) + retry. ZIP "yerel/GitHub sync DEĞİL" açıkça etiketli; "başarılı" yalnız gerçek yazma/already_current. Bundle deterministik + basis-farkında (now() gömülmez; NotebookLM=summary framing, sahte timestamp yok; MOC/atomik not/paylaşımlı kavram/Mermaid MOC/görev/fikir/kart/QA-provenance; managed frontmatter; manifest hash). Not-ready pack export KAPALI (sunucu da direct route'ta 409). Auto-export `OBSIDIAN_AUTO_EXPORT` gate'li (aksi örtük dış yazma yok). Her deneme `LearnExportAttempt`'e kaydedilir (idempotent). `/api/integrations` Obsidian yerel+GitHub ayrı (Vercel fs kalıcı değil / Obsidian Git çeker). **Canlı vault/GitHub yazımı BLOCKED-EXTERNAL** (env/target/onay yok).
- **Klavye:** Kaynak ekle kısayolu; tekrar kartında değerlendirme tuşları; Tab/Enter.
- **Responsive:** 960 → ≤640; Mermaid harita overflow-x:auto/zoom.
- **Kabul:** YouTube URL/transcript/NotebookLM → kaynaklı Pack; atomik not+MOC+görev+içerik fikri+review oluşur; Obsidian'a otomatik aktarım VEYA açık tekrar-denenebilir hata (sessiz no-op YOK); ham URL/40-kart borç hissi yok (sakin akış).

---

## BÖLÜM E–H — Gelişmiş / Toolbox / Profil / Durum

> Aşağıdaki 16 yüzey birleştirme sırasında BÖLÜM E (gelişmiş araştırma ×5) · F (Toolbox) · G (Profil ×5) · H (Genel Durum ×5) olarak yeniden harflendirildi; ekran id'leri ve testid'ler sabit. Çapraz referanslar (A6/A7 shell, G1–G5 profil, H2–H5 durum) buna göre çözülür.

│ Haber Havuzu            [Haberler] · [Repo]   (SubNav)     │
│ 34 Türkçe · 5 kullanıldı · 3 çevriliyor  (sessiz metrik)   │
│ [Sırala:Çok konuşulan▾][Kategori▾][Durum▾] [ara] [Yenile][İşle]│ FilterBar
│ ┌── ÖNE ÇIKAN ─────────────────────────────────────────┐  │
│ │ 🔥 <en yüksek buzz haber>   ·62· KAYNAK·ÇOKLU  oku→   │  │
│ └──────────────────────────────────────────────────────┘  │
│ GÜNDEM                                          34 haber   │
│ ─ başlık… ·48· TechCrunch⛨ TEYİTLİ 2s  oku│üret:grafikcem│…│
│ ─ başlık… ·40· HN 5s               oku│üret… │okundu       │
│                              ‹ 01 / 03 ›                    │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** SubNav yatay kaydırılır; öne çıkan tam-genişlik; liste satırı 2-kat sar (başlık üstte, meta+aksiyon altta); "üret" hesap butonları alt sıraya iner; bottom-nav Plan aktif.
- **İçerik sırası:** breadcrumb → SubNav (Haberler/Repo) → sessiz metrik → FilterBar → (Haberler) öne çıkan sinyal → GÜNDEM yoğun liste + sayfalama; (Repo) arama → trend repo yoğun kartları.
- **Birincil / ikincil eylemler:** **birincil = "İçerik üret" (@grafikcem/@maskulenkod → Bugün taslağı)**; ikincil = kaynağı oku (dış link), okundu toggle, "İşle" (operatör toplu çeviri+analiz), Repo'da "Hook kopyala".
- **Component ağacı:** `PageScaffold`→`PageHeader`(compact, breadcrumb slot)→`SubNav`(`newspool-subnav-{news|repo}`) → `FilterBar`(`Select`×3+`SearchInput`+`Button`) → `FeaturedSignal`(Card quiet) → liste (`Table` yoğun satır veya band; satır `newsrow-{id}`, `Badge`/`StatusBadge` doğrulama, buzz chip) → `Pagination`; Repo alt-görünüm `EntityCard` grid → `overflow-x:auto` konteyner.
- **Veri kaynakları:** `GET /api/news-pool?sort&status&category&compact` · `PATCH /api/news-pool/:id` (isRead/isUsed) · `POST /api/news-pool/:id/generate-draft` (account) · `POST /api/news-pool/process` (toplu çeviri+analiz, 5-tur deadline) · `GET /api/repo-radar`. Prisma: `NewsItem`, `NewsSource`, `RepoRadarItem`, `WebsiteVerification`. Doğrulama rozeti ADR-012: `single_source` skor<70'te gizlenir; "TEYİTLİ" yalnız çoklu/editoryal.
- **Durumlar:** loading = 8 satır skeleton band; empty = "Filtreye uygun Türkçe haber yok" + (çevriliyor varsa) "İşle" aksiyonu; error = `ErrorState` "Haberler yüklenemedi" + Yeniden dene; success = öne çıkan + liste; **stale** = üst sağ sessiz çip "gündem N saat önce tazelendi" (buzz tazelik penceresi aşılınca kehribar nokta, error değil); **blocked-external** = Repo alt-görünümde `GITHUB_TOKEN` yoksa/rate-limit'te "GitHub sınırı — repo radarı geçici sınırlı, N dk sonra" satırı (haber akışı etkilenmez).
- **Klavye:** SubNav ←/→; liste Tab; Enter = kaynağı aç; `g`+`u` üret odağı; `İşle` erişilebilir; okundu toggle Space.
- **Responsive:** 960→390: FilterBar sarar; liste satırı 2-kat; öne çıkan tek kolon; Repo grid `auto-fill minmax(300px)`→tek kolon; yatay taşma 0.
- **Kabul kriterleri:** (1) SubNav `news`/`repo` `radarView`'e persist; (2) taslak üretimi yalnız `processingStatus="analyzed"` haberde görünür; (3) doğrulama rozeti ADR-012 kuralına uyar (single_source<70 gizli); (4) 320-1440 taşma 0, dekoratif renk yok (tek accent + status); (5) "İşle" toplu işleme kalan-sayaç gösterir, hata toast'ı verbatim.

### E2. YouTube Fırsat Motoru (gelişmiş) [sınıf: REDESIGNED-ADVANCED]
- **Amaç:** Rakip kanalların outlier videolarını yüzeye çıkarıp prodüksiyon briefi üreten YouTube fırsat araştırması.
- **Yeni ev / eski karşılık:** id `youtube`; nav-dışı (Plan/Fırsatlar + Cmd+K). Eski: `YouTubeTab` (feed/channels SubNav + brief Drawer). Yeniden kurulur; brief Drawer + `PipelineTraceDrawer` korunur.
- **Desktop wireframe:**
```
← Fırsatlar   Plan / Fırsatlar / YouTube · ham araştırma
┌──────────────────────────────────────────────────────────┐
│ YouTube Fırsat Motoru                         [Sync]      │
│ [Fırsat Akışı ·23] · [Kanallar ·8]   (SubNav)             │
│ akış 23 · sıcak(≥3×) 4 · izlenme  (sessiz satır metrik)   │
│ FİLTRE [kategori▾][shorts▾][min skor] [Filtrele]  Akış|Pano│
│ ▭ thumb  <başlık tek satır>   3.2×🔥  1.2k/gün [Brief Üret][Yoksay]│
│ ▭ thumb  <başlık>             1.8×↗   400/gün  [Brief Üret][Yoksay]│
└──────────────────────────────────────────────────────────┘
   Drawer(sağ): Prodüksiyon Briefi — Başlıklar│Metin│Çekim+Edit│Fark
```
- **Mobil wireframe (390px):** Sync ikon-buton; SubNav kaydırılır; satır thumb solda 64px, başlık+skor sağ blok altına; Pano tek-kolon kaydırma; Brief Drawer tam-ekran sheet (4 sekme yatay kaydırma), status butonları alt yapışkan.
- **İçerik sırası:** breadcrumb → başlık+Sync → SubNav → sessiz metrik → FilterBar + Akış/Pano toggle → (feed) outlier satırları / (Pano) tier kolonları / (channels) izlenen + önerilen kanallar.
- **Birincil / ikincil eylemler:** **birincil = "Brief Üret"** (→ prodüksiyon Drawer); ikincil = Sync, Yoksay (yerel gizle), kanal önerisi "Onayla", brief status (Beğendim/Düzenledim/Çektim/Vazgeç), kopyala.
- **Component ağacı:** `PageScaffold`→`PageHeader`→`SubNav`(`yt-subnav-{feed|channels}`) → sessiz `MetricGrid` (inline, hero DEĞİL) → `FilterBar` → `Table` yoğun satır (`ytrow-{videoId}`, `mqdefault.jpg` thumb, tier chip status-token) **veya** `KanbanBoard` (kolon: Sıcak≥3× / Yükselen 1.5–3× / Normal, tone=status) → `Drawer`(`BriefDetail`, sekmeler `titles|script|shoot|diff`, `Textarea` düzenlenebilir metin, `PipelineTraceDrawer subjectType="yt_video"`).
- **Veri kaynakları:** `GET /api/youtube/videos?category&minScore&shorts` (`configured` bayrağı) · `GET /api/youtube/channels` (competitors+suggestions) · `POST /api/youtube/channels` (approve) · `POST /api/youtube/sync` (channelsSynced/videosUpserted/quotaUnitsUsed) · `POST /api/youtube/briefs` (videoId; `warnings:["transcript_unavailable"]`) · `GET/PATCH /api/youtube/briefs/:id` (status/editedScript). Prisma: `YtVideo`,`YtChannel`,`YtBrief`. Env: `YOUTUBE_API_KEY`.
- **Durumlar:** loading = 5 satır skeleton band; empty = "Henüz fırsat yok" + "Sync çalıştır"; error = `ErrorState` + Yeniden dene; success = outlier akışı/pano; **stale** = kanal `lastSyncedAt` eski → başlık altı "son sync N saat önce" sessiz çip; **blocked-external** = `configured=false` (`YOUTUBE_API_KEY` yok) → tam-ekran `EmptyState` "YouTube API yapılandırılmamış · Entegrasyonlar → YouTube" (motor anahtarsız boş kalır, hata vermez).
- **Klavye:** SubNav ←/→; satır Tab; Enter = Brief Üret; Drawer sekmeleri ←/→; Esc kapat + focus dönüşü; kopyala butonları erişilebilir.
- **Responsive:** 960→390: metrik satır sarar; feed satırı sar; Pano kolonları yatay kaydırma (`overflow-x:auto`); Drawer→sheet; brief sekmeleri kaydırılır.
- **Kabul kriterleri:** (1) `configured=false` blocked-external tam ekran, konsol hatası 0; (2) transcript yoksa Drawer'da kehribar uyarı + brief yine üretilir; (3) Pano tier eşikleri 3× / 1.5× tam; (4) Sync sonrası akış otomatik tazelenir, kota-birim gösterilir; (5) tek accent + status token, hero-number yok.

### E3. Viral Radar (gelişmiş) [sınıf: REDESIGNED-ADVANCED]
- **Amaç:** İzlenen X kaynaklarından gelen viral adayları puanlayıp karar aksiyonu (tweet/quote/reply/ignore) belirlemek ve 3-varyantlı taslak + eleştirmen ile üretime bağlamak.
- **Yeni ev / eski karşılık:** id `flow-radar`; nav-dışı (Plan/Fırsatlar + Cmd+K; deep-link `/dashboard/flow-radar` seed). Eski: `FlowRadarTab` — **en yoğun redesign**: 8-kutu KPI şeridi + 2 el-yapımı modal + ham `<select>` + çok-renk → sessiz metrik + `Drawer` + `FilterBar` + tek accent/status.
- **Desktop wireframe:**
```
← Fırsatlar   Plan / Fırsatlar / Viral Radar · ham araştırma
┌──────────────────────────────────────────────────────────┐
│ Viral Radar                                   [Yenile]    │
│ Tara → Puanla → Karar Ver → Üret     (ince künye şeridi)  │
│ aday 42 · yüksek fırsat 9 · yüksek risk 3 · ort %58 (sessiz)│
│ [Hesap▾][Aksiyon▾][Risk▾][Durum:Yeni▾][Sırala▾][min──] [ara]│ FilterBar
│ ┌ @kaynak → @grafikcem            [TWEET]  fırsat 82│risk 20 ┐│
│ │ <içerik metni>   ♥ 120 🔁 30              Öneri: … şablon  ││
│ │ [Detay][Desen Yap][İncelendi][Yoksay]   [Tweet][Alıntı][Yanıt] Üret││
│ └───────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
   Drawer: 3 varyant (Güvenli/Güçlü/Cesur) + eleştirmen skorları + Kuyruğa At
```
- **Mobil wireframe (390px):** künye şeridi sarar; metrik satır 2-sıra; FilterBar akordeon "Filtreler" ; aday kartları tek kolon; üret butonları alt sıra; taslak Drawer tam-ekran sheet, varyantlar dikey; 280-karakter sayacı sabit alt.
- **İçerik sırası:** breadcrumb → başlık+Yenile → pipeline künyesi → sessiz metrik → FilterBar → aday kartları (kaynak→hedef, aksiyon rozeti, fırsat/risk, metin, metrikler, önerilen şablonlar, karar+üret butonları).
- **Birincil / ikincil eylemler:** **birincil = üretim (Tweet/Alıntı/Yanıt Üret → taslak Drawer → "Kuyruğa At" → Bugün)**; ikincil = Detay (Drawer), Desen Yap (pattern kaydet), İncelendi, Yoksay, taslak feedback (Onayla/Reddet → eğitim örneği).
- **Component ağacı:** `PageScaffold`→`PageHeader`→pipeline künye şeridi → sessiz `MetricGrid`(inline) → `FilterBar` → aday listesi (`Card` yoğun; `candrow-{id}`; `StatusBadge` aksiyon status-token; `ScoreBars` fırsat/risk) → `DetailPanel`(aday detayı: gerekçe + pattern) → `Drawer`(taslak üretici: 3 varyant kartı `Textarea`+`ScoreBars`[persona/hook/risk]+rewrite; feedback butonları; "Kuyruğa At").
- **Veri kaynakları:** `GET /api/growth/flow-radar?account&action&risk&status&minOpportunity&sort&search` (candidates+summary) · `POST /api/growth/flow-radar/source-posts/:id/{ignore,mark-reviewed,save-pattern,send-to-queue}` · `POST /api/growth/generate-drafts` (accountHandle/actionType/sourcePostId → 3 açı safe/strong/edgy + critic) · `POST /api/growth/feedback` (approved/rejected/edited, saveTrainingExample). Prisma: `SourcePost`,`GeneratedDraft`,`FeedbackEvent`,`ViralPattern`.
- **Durumlar:** loading = "Adaylar zenginleştiriliyor" skeleton kartlar (spinner<500ms/skeleton>500ms); empty = "Henüz Viral Radar adayı yok — Kaynak taramasından beslenir"; error = kırmızı `ErrorState` + Yeniden dene (summary=null → sahte 0 yerine "–" placeholder); success = aday kartları; **stale** = `SourcePost.scannedAt` eski → kart üstü "taranma N saat önce" sessiz çip (ADR-012: tarama tarihi ≠ doğrulama); **blocked-external** = OpenRouter kredi/402 → taslak Drawer'ında "Üretim engelli: OpenRouter kredisi — Entegrasyonlar" tek-recovery satırı (radar listesi çalışır).
- **Klavye:** FilterBar Tab; kart Tab; Enter=Detay; `t/q/r` üret kısayolu (odaktaki kart); Drawer içi varyant Tab, Esc kapat+focus dönüşü, 280 sınırı aşımında uyarı.
- **Responsive:** 960→390: metrik 2-sıra; FilterBar akordeon; kart tek kolon; Drawer sheet; varyantlar dikey; taşma 0.
- **Kabul kriterleri:** (1) hero KPI kutuları KALKMIŞ, metrikler sessiz satır; (2) modallar `Drawer`/`DetailPanel` (arka liste canlı); (3) taslak feedback eğitim örneğine yazılır, düzenlenmişse `edited`'e döner; (4) tek accent + status (blue/danger dekoratif yok); (5) "Kuyruğa At" başarısı Bugün'de görünür, hata toast verbatim.

### E4. Keşif Motoru (gelişmiş) [sınıf: REDESIGNED-ADVANCED]
- **Amaç:** Çok-kaynaklı keşif → çok-ajanlı müzakere konseyi → viral pattern madenciliği → persona-sadık taslak üretimi (3 aşamalı boru hattı).
- **Yeni ev / eski karşılık:** id `discovery-engine`; nav-dışı (Plan/Fırsatlar + Cmd+K). Eski: `DiscoveryEngineTab`. Yeniden kurulur; split-faz çağrı modeli (Vercel timeout-güvenli) + `OutlierHighlights` korunur; verdict renkleri → status token.
- **Desktop wireframe:**
```
← Fırsatlar   Plan / Fırsatlar / Keşif Motoru · ham araştırma
┌──────────────────────────────────────────────────────────┐
│ Keşif Motoru   · 3 aşamalı boru hattı · @grafikcem        │
│ [ Keşfet + Müzakere + Üret ]  [ Sadece Müzakere ]         │
│ ┌ 1 Keşif ✓ ┊ 2 Müzakere ⟳ ┊ 3 Üretim ○ ┐  (ince stepper) │
│ Keşif:   kaydedildi 24 · ön-filtre 12 · [x·reddit·rss]    │
│ Müzakere Konseyi (hook·persona·risk·novelty)              │
│  ● strong 82  x     <gerekçe tek satır>                   │
│  ● maybe 61   reddit <gerekçe>                            │
│ Üretim:  8 / 10 taslak · 2 bloklandı · "Günlük Kuyruk"da  │
│ Öne Çıkanlar:  12×  <içerik>   ort 400 → 4.8k             │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** iki çalıştır butonu tam-genişlik dikey; stepper 3 satır dikey; keşif/müzakere/üretim blokları tek kolon; verdict satırları sarar; Öne Çıkanlar tek kolon.
- **İçerik sırası:** breadcrumb → başlık+meta → (blocked ise eksik-anahtar kartı) → çalıştır butonları → faz stepper → Keşif sonucu → Müzakere Konseyi verdict listesi → Üretim özeti → Öne Çıkanlar (outlier).
- **Birincil / ikincil eylemler:** **birincil = "Keşfet + Müzakere + Üret"** (3 sıralı POST); ikincil = "Sadece Müzakere"; sonuç Öne Çıkanlar linkleri (dış kaynak).
- **Component ağacı:** `PageScaffold`→`PageHeader`(meta) → preflight `Card`(quiet, eksik anahtar) → aksiyon `Button`×2 → faz `stepper` şeridi (`step-{discover|mine|generate}` durum status-token) → sonuç `Card`'ları: Keşif (platform dağılımı çipleri) · Müzakere (`verdict-row` status-dot + sourceType + rationale) · Üretim (sayaç + "Günlük Kuyruk" yönlendirme) → `OutlierHighlights`(yoğun satır; veri yoksa gizli).
- **Veri kaynakları:** `GET /api/health` (preflight: `openrouter.ok`/`socialdata.ok`) · `POST /api/growth/discover` · `POST /api/growth/mine?limit` · `POST /api/growth/generate-daily` (created/target/blocked/reason/dailyMax/todayDrafts) · `GET /api/content/outliers?limit=10`. Prisma: `SourcePost`,`ContentItem`,`OutlierScore`,`GenerationRun`. Env: `OPENROUTER_API_KEY`,`SOCIALDATA_API_KEY`.
- **Durumlar:** loading = faz stepper "running" + kısmi sonuç yoksa 3-satır skeleton (ekran asla boş); empty = "Keşif boru hattı bekliyor" + "Boru hattını çalıştır"; error = faz-bazlı "X aşaması başarısız: <mesaj>. Tamamlananların sonucu korundu" (tamamlanan fazlar ekranda kalır); success = 3 sonuç kartı; **stale** = son `GenerationRun` eski → "son çalıştırma N gün önce" sessiz çip; **blocked-external** = eksik `OPENROUTER_API_KEY`/`SOCIALDATA_API_KEY` → üst kart "Keşif Motoru için eksik yapılandırma" + env NAME'leri (değer YOK) + çalıştır pasif; ayrıca `generate-daily` `reason="daily_target_met"` → "Bugünkü hedef dolu (N/M), kota yarın 06:00" (blocker değil, bilgi).
- **Klavye:** çalıştır butonları Tab/Enter; sonuç linkleri Tab; faz stepper salt-görsel (aria-live "X aşaması tamamlandı").
- **Responsive:** 960→390: butonlar dikey; stepper dikey; metrik gridleri tek kolon; verdict satır sarar; taşma 0.
- **Kabul kriterleri:** (1) split-faz: tek çağrı Vercel timeout'una takılmaz, bir faz düşse öncekiler korunur; (2) eksik anahtar → blocked-external, çalıştır pasif, env değeri asla gösterilmez; (3) verdict renkleri status token (strong=ok/maybe=warn/weak=error), dekoratif değil; (4) `daily_target_met` bilgi mesajı hata gibi kırmızı DEĞİL; (5) Öne Çıkanlar verisi yoksa bölüm hiç render olmaz (teknik jargon yok).

### E5. X Hesabı Kaynakları (gelişmiş) [sınıf: REDESIGNED-ADVANCED]
- **Amaç:** İzlenen X hesaplarını (kaynak) ekle/düzenle/arşivle, taranan gönderileri ve fırsat/risk skorlarını hesap-bazlı yönet; skor önizleme ile alt-skorları incele.
- **Yeni ev / eski karşılık:** id `source-intelligence`; nav-dışı (Plan/Fırsatlar + Cmd+K; deep-link `/dashboard/source-intelligence`). Eski: `SourceIntelligenceTab`. Yeniden kurulur: StatCard KPI tile'ları → sessiz metrik; 3 el-yapımı modal → `Drawer`; **devre dışı "Tara"/"Flow'a Gönder" placeholder'ları KALDIRILIR veya gerçek uca bağlanır** (Sprint 9 stub'ı bitmeli — aşağıda flag).
- **Desktop wireframe:**
```
← Fırsatlar   Plan / Fırsatlar / X Kaynakları · ham araştırma
┌──────────────────────────────────────────────────────────┐
│ X Hesabı Kaynakları · 8 kaynak · ort %58 · en iyi @x [Yenile]│
│ aktif 6 · taranan 214 · yüksek fırsat 12 · yüksek risk 3 (sessiz)│
│ [Hesap▾][Durum▾][Tür▾][Aksiyon▾][Risk▾][Sırala▾] [ara]    │ FilterBar
│ ┌ İZLENEN KAYNAKLAR 8  [+ Yeni]┐┌ FIRSAT HAVUZU 40 gönderi ┐│
│ │ @kaynak  AKTİF                ││ @kaynak → @grafikcem TWEET││
│ │  hedef@grafikcem·TWEET·≥10♥   ││  fırsat 82│risk 20        ││
│ │  [Durdur][Kriter]             ││  <metin 2 satır>  ♥🔁👁    ││
│ │ …                             ││  [Skor Detayı][Detay]     ││
│ └───────── 320px ──────────────┘└──────── 1fr ─────────────┘│
└──────────────────────────────────────────────────────────┘
   Drawer: gönderi + 7 alt-skor (relevance/freshness/audience/risk…) + gerekçe
```
- **Mobil wireframe (390px):** split-pane tek kolona iner — önce Kaynaklar (katlanabilir), sonra Fırsat Havuzu; FilterBar akordeon; kaynak/gönderi kartları tek kolon; Kriter/Yeni Kaynak/Skor Detayı → tam-ekran sheet.
- **İçerik sırası:** breadcrumb → başlık+meta+Yenile → sessiz metrik → FilterBar → split: sol kaynak listesi (+Yeni) / sağ fırsat havuzu (gönderi + skorlar + aksiyon).
- **Birincil / ikincil eylemler:** **birincil = "Skor Detayı" (7 alt-skor önizleme Drawer)**; ikincil = Yeni Kaynak / Kriter (eşik düzenle) / Durdur-Başlat / Arşivle; gönderi Detay.
- **Component ağacı:** `PageScaffold`→`PageHeader`(meta) → sessiz `MetricGrid`(inline; StatCard KPI değil) → `FilterBar` → 2-panel grid (`≥1024px 320px+1fr`, ≤1024 tek kolon): sol `Card`(kaynak satırları `source-row-{id}`, `StatusBadge` aktif/pasif) + `Drawer`(Yeni/Kriter formu: `Select` mode ALL/TWEET/QUOTE/REPLY + `Input` eşik like/RT + Arşivle); sağ `Card`(gönderi satırları `srcpost-{id}`, fırsat/risk `StatusBadge`) + `DetailPanel`(skor önizleme `ScoreBars`×7 + gerekçe + güven).
- **Veri kaynakları:** `GET /api/growth/source-intelligence?…` (sources+sourcePosts+summary) · `POST /api/sources` (ekle) · `PATCH /api/sources/:id` (toggle/kriter) · `DELETE /api/sources/:id` (arşiv) · `POST /api/growth/source-intelligence/source-posts/:id/score` (7 alt-skor + suggestedAccounts + confidence). Prisma: `Source`,`SourcePost`. Kaynak tarama SocialData'ya bağlı (`SOCIALDATA_API_KEY`).
- **Durumlar:** loading = sağ panel 4×skeleton; empty = kaynak yoksa "Henüz kaynak eklenmedi" + "Yeni Kaynak"; gönderi yoksa "Henüz taranmış kaynak post yok"; error = `ErrorState` "Fırsatlar yüklenemedi" + Yeniden dene; success = split liste; **stale** = `SourcePost.scannedAt` eski → gönderi üstü "taranma DD.MM" sessiz (ADR-012); **blocked-external** = SocialData 402/kredi → "Tarama engelli: SocialData — Entegrasyonlar" (mevcut liste okunur).
- **Klavye:** FilterBar Tab; kaynak/gönderi Tab; Enter=Skor Detayı; Drawer form Tab, Esc kapat+focus dönüşü; Arşivle onay diyaloğu.
- **Responsive:** 1024→390: split→tek kolon (kaynak katlanır); FilterBar akordeon; modaller sheet; iç listeler `max-height`+scroll yerine sayfa akışı; taşma 0.
- **Kabul kriterleri:** (1) tüm modallar `Drawer`/`DetailPanel`, arka liste canlı; (2) **devre dışı "Tara"/"Flow'a Gönder" placeholder'ları kaldırılmış veya gerçek uca bağlanmış** (cursor:not-allowed stub kalmaz); (3) StatCard KPI tile'ları sessiz metriğe indirgenmiş; (4) 7 alt-skor `ScoreBars` tek accent+status; (5) kaynak CRUD (ekle/kriter/arşiv) çalışır, toast verbatim, arşiv onaylı.

---

## BÖLÜM F — Toolbox [UTILITY]

### F1. Toolbox [sınıf: UTILITY]
- **Amaç:** İçerik üretimini besleyen araç/kaynak kütüphanesi — gruba göre seç, alt-kategoride filtrele, favori topla, hesaplara fikir kuyruğu kur.
- **Yeni ev / eski karşılık:** id `toolbox`; **ana nav yanında utility** (sidebar'da Bugün/Plan/Kütüphane altında ayrı, küçük — `06` §7). Eski: `ToolboxTab` (folder-row + SubNav subcat + favoriler + arama overlay). Kompozisyon korunur, token/renk açık editorial'e flip; `ai-rankings` alias'ı buraya çözülür.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ Toolbox · 283 araç · 14 favori          (compact header)  │
│ [ Tüm araçlarda ara… ]                        [Yenile]    │
│ ┌AI┐ ┌Tasarım┐ ┌Üretkenlik┐ ┌Video┐ ┌★ Favoriler┐  (folder-row)│
│ [Tümü ·120][Eğitim ·40][LLM ·30][Örnek ·25]  (SubNav subcat)│
│ ┌ araç ★ ┐┌ araç ★ ┐┌ araç ★ ┐┌ araç ★ ┐   (kart grid)     │
│ │ ad     ││ ad     ││ ad     ││ ad     │                   │
│ │ açıklama│ favicon││ [üret:grafikcem][maskulenkod]│        │
│ └────────┘└────────┘└────────┘└────────┘                   │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** arama+Yenile tek satır; folder-row yatay kaydırma; SubNav kaydırma; kart grid tek/çift kolon (`minmax(240px)`); üret butonları kart altına iner; Profil/Cmd+K'dan da erişilir.
- **İçerik sırası:** compact başlık (toplam+favori) → arama+Yenile → folder-row (bucket'lar + Favoriler) → SubNav subcat (çok-kategorili bucket'ta) → araç kart grid.
- **Birincil / ikincil eylemler:** **birincil = "İçerik fikri üret" (@grafikcem/@maskulenkod → Günlük Kuyruk)**; ikincil = favori yıldız toggle, arama, "Yenile" (bağlantı canlılık kontrolü), aracı dış linkte aç.
- **Component ağacı:** `PageScaffold`→`PageHeader`(compact) → arama `Input`+`Button` → `ToolboxFolderRow`(`folder-{key}`) → `SubNav`(subcat) → grid `ToolboxToolCard`(`tool-{id}`: favicon, ad, açıklama, favori `IconButton`, üret butonları); arama = düz overlay grid.
- **Veri kaynakları:** `GET /api/toolbox?counts=1` (bucket sayıları+total+favoritesCount) · `GET /api/toolbox?bucket&limit` · `GET /api/toolbox?favorite=true` · `GET /api/toolbox?search` · `POST /api/toolbox/:id/favorite` (optimistic) · `POST /api/toolbox/:id/generate-idea` (account; blocked=kalite/bütçe) · `POST /api/toolbox/refresh` (alive/dead link kontrolü). Prisma: `Tool`; `TOOLBOX_BUCKETS`.
- **Durumlar:** loading = skeleton kart grid (counts gelene dek folder-row skeleton); empty = bucket boş "Bu grupta araç yok" / favori boş "Henüz favori yok — yıldıza dokun" / arama boş "Eşleşen araç yok"; error = `ErrorState` "Grup yüklenemedi" + Yeniden dene (bucket-bazlı); success = kart grid; **stale** = `Tool.lastCheckedAt` eski/ölü link → kartta sessiz "bağlantı kontrol edilmedi" rozeti, "Yenile" önerisi; **blocked-external** = fikir üretimi OpenRouter kredi/bütçe kapısına takılırsa toast "Engellendi: kalite/bütçe filtresi" (liste çalışır) — N/A tam-ekran blocker yok.
- **Klavye:** arama `/` odak; folder-row ←/→; SubNav ←/→; kart Tab; Enter=aç; `f`=favori toggle (odak); üret butonları erişilebilir.
- **Responsive:** 960→390: folder-row + SubNav yatay kaydırma; grid `auto-fill minmax(240px)`→tek/çift; taşma 0.
- **Kabul kriterleri:** (1) counts önden, bucket satırları talep-üzerine yüklenir; (2) favori toggle optimistic + sunucu doğrulama, favori sayacı canlı; (3) "Yenile" alive/dead sonucu toast'ta; (4) fikir üretimi doğru hesaba kuyruk ekler; (5) açık editorial token, mor/turuncu dekoratif yok.

---

## BÖLÜM G — Profil Yüzeyleri [PROFILE]

### G1. CemOS'un bildikleri [sınıf: PROFILE]
- **Amaç:** Geri bildirimden damıtılan hafıza kurallarını sakin, düzenlenebilir, kaynaklı tek yüzeyde göster — onay/ret/rollback + operatör "beni tanısın" kural ekleme.
- **Yeni ev / eski karşılık:** id `profile-memory`; **Profil menüsü 1. madde** (`A6`). Eski: `MemoryProposalsSection` — Settings gömülüsünden bağımsız Profil ekranına terfi; kompozisyon korunur, tam-sayfa PageScaffold'a alınır.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ CemOS'un bildikleri                                       │
│ Geri bildirimlerinden damıtılan kurallar — onaylanmadan   │
│ taslakları etkilemez.                          [Yenile]   │
│ ┌ + Kural ekle  [@grafikcem▾][tercih▾][ "kuralını yaz…" ] ┐│
│ BEKLEYEN ÖNERİLER                                          │
│  ○ @grafikcem·tercih·kanıt:3   "Emoji kullanma…" [Onayla][Reddet]│
│  ○ global·yazım kuralı·⚠çelişiyor "…"           [Onayla][Reddet]│
│ AKTİF KURALLAR                                             │
│  · @grafikcem  "kısa vurucu cümleler"           [Geri al] │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** kural-ekle satırı sarar (select'ler üst, input tam-genişlik, buton alt); öneri kartları tek kolon, aksiyon butonları alt sıra; aktif kurallar liste; Profil sheet'ten açılır.
- **İçerik sırası:** başlık+açıklama+Yenile → "Kural ekle" bootstrap satırı → BEKLEYEN ÖNERİLER (approve/reject) → AKTİF KURALLAR (supersede olanlarda rollback).
- **Birincil / ikincil eylemler:** **birincil = öneri "Onayla"**; ikincil = "Reddet", "Kural Ekle" (yazan=onaylayan, anında aktif), aktif kural "Geri al" (yalnız supersede eden).
- **Component ağacı:** `PageScaffold`→`PageHeader` → `SectionHeader`(HAFIZA) → bootstrap satırı (`Select` hesap + `Select` tip[tercih/öğrenilmiş/yazım kuralı] + `Input` + `Button`) → öneri listesi (`proposal-{id}`: `Badge` hesap/tip/kanıt/çelişki + statement + `Button`×2) → AKTİF KURALLAR (`fact-{id}` + rollback `IconButton`).
- **Veri kaynakları:** `GET /api/memory/proposals` (proposals+active) · `POST /api/memory/proposals` (action: add|approve|reject|rollback). Prisma: `MemoryFact` (provenance, evidenceCount≥3, supersedesId, confidence). Provenance gate + supersede/rollback (FINAL-MEMORY-SPEC §6.3).
- **Durumlar:** loading = "Hafıza önerileri yükleniyor" compact; empty = bekleyen yoksa "Bekleyen öneri yok — haftalık damıtma (Pzt 18:00 cron) önerince görünür"; error = `ErrorState` "Hafıza önerileri alınamadı" + Yeniden dene; success = öneri + aktif listeler; **stale** = son damıtma eski → başlık altı "son damıtma N gün önce" sessiz çip; **blocked-external** = N/A — sebep: yalnız iç DB + kullanıcı girişi, dış credential yok.
- **Klavye:** kural input Enter=ekle; öneri Tab; Onayla/Reddet erişilebilir; rollback Enter; `maxLength=300`.
- **Responsive:** 960→390: bootstrap sarar; öneri/aktif tek kolon; taşma 0.
- **Kabul kriterleri:** (1) onaylanmamış öneri taslakları ETKİLEMEZ (yazı: "onaylanmadan taslakları etkilemez"); (2) çelişen öneri "mevcut kuralla çelişiyor" rozeti; (3) elle eklenen kural anında aktif; (4) supersede eden aktif kuralda rollback var; (5) sakin editorial, tek accent, hero-number yok.

### G2. Entegrasyonlar [sınıf: PROFILE]
- **Amaç:** Her sağlayıcının credential/izin durumunu tek panelde göster (yalnız env NAME + bağlı/eksik/engelli) ve tek-recovery yönlendirmesi ver.
- **Yeni ev / eski karşılık:** id `profile-integrations`; **Profil menüsü 2. madde** (`A6`). Eski: dağınık — Settings "Bağlantı & Sağlık" kartları + `DiscoveryEngineTab` preflight + `YouTubeTab` configured gate. Tek yüzeye toplanır (YENİ ekran). Sağlık `healthService` + `integrationCredentialRepo`'dan okunur.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ Entegrasyonlar · sağlayıcı bağlantı & izin durumu [Yenile]│
│ ● OpenRouter (LLM)     bağlı      OPENROUTER_API_KEY       │
│ ● SocialData (X okuma) bağlı      SOCIALDATA_API_KEY       │
│ ● Neon (veritabanı)    bağlı      DATABASE_URL             │
│ ▲ Meta / Instagram     izin eksik META_ACCESS_TOKEN +      │
│                        business_discovery scope [İzni tamamla]│
│ ✕ CemOS içinden doğrudan yayın (X API)  ENGELLİ — ödeme     │
│    onayı bekliyor · %50 link ~$16-26/ay · $0.20/link'li post│
│    [Maliyet senaryosu ›] [Onay ver]                        │
│ ● YouTube              bağlı      YOUTUBE_API_KEY          │
│ ○ Obsidian (GitHub)    opsiyonel  OBSIDIAN_GITHUB_REPO/TOKEN│
│ ○ Gemini/Fal           opsiyonel  GEMINI_API_KEY · FAL_KEY │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** her sağlayıcı tam-genişlik satır → durum ikonu + ad üstte, env NAME + recovery altta; Profil sheet'ten açılır.
- **İçerik sırası:** başlık+Yenile → çekirdek (OpenRouter/SocialData/Neon) → sosyal (Meta/X API/YouTube) → opsiyonel (Obsidian/Gemini/Fal) — her satır: durum + env NAME (değer YOK) + gerekiyorsa tek recovery.
- **Birincil / ikincil eylemler:** **birincil = eksik/engelli olanın tek recovery'si** (X API "Onay ver" → maliyet onay akışı; Meta "İzni tamamla"); ikincil = Yenile (canlı probe), env NAME kopyala (ad, değer değil).
- **Component ağacı:** `PageScaffold`→`PageHeader` → sağlayıcı satır listesi (`integration-row-{provider}`: `StatusBadge`[ok/warn/error/muted] + ad + env NAME `code` + recovery `Button`). Tek accent + semantik status.
- **Veri kaynakları:** `GET /api/health` (openrouter/socialdata/database/worker + `META_ACCESS_TOKEN` probe) · `GET /api/integrations` (varsa; `integrationCredentialRepo` AES-GCM `CREDENTIAL_ENC_KEY` ile şifreli DB kayıtlarının **varlık/geçerlilik** durumu — asla değer). Env NAME'leri: `OPENROUTER_API_KEY`,`SOCIALDATA_API_KEY`,`DATABASE_URL`,`META_ACCESS_TOKEN`/`META_APP_ID`/`META_APP_SECRET`/`META_IG_USER_ID`/`META_PAGE_ID`,`YOUTUBE_API_KEY`,`OBSIDIAN_GITHUB_REPO`/`OBSIDIAN_GITHUB_TOKEN`,`GEMINI_API_KEY`,`SUPADATA_API_KEY`,`FAL_KEY`,`CREDENTIAL_ENC_KEY`. X API paylaşım env'leri (OAuth2 PKCE) adapter CONTRACT'ında; onaya kadar tanımlı DEĞİL.
- **Durumlar:** loading = satır skeleton; empty = N/A — sebep: sağlayıcı listesi sabit, her zaman dolu; error = `ErrorState` "Durum alınamadı" + Yeniden dene; success = renkli status satırları; **stale** = son probe eski → "durum N dk önce" sessiz çip (deep probe timeout'a takılmaz — hafif kontrol); **blocked-external** = **CemOS içinden doğrudan yayın (X API) = ENGELLİ (ADR-015/017: yeni geliştiriciye free tier yok, pay-per-use ödeme gerekir — senaryo: %0 link $2.25–3.60 / %50 $16.13–25.80 / %100 $30–48 aylık + okuma/media/retry, fiyat Developer Console'dan doğrulanır; Ali Cem ödeme onayı ALINMADI)** → net Türkçe neden + "Maliyet senaryosu" + tek "Onay ver" recovery; Meta izin eksikse (`instagram_basic`/`business_discovery` scope yok) "İzni tamamla".
- **Klavye:** satır Tab; recovery `Button` Enter; env NAME kopyala erişilebilir (değer yok).
- **Responsive:** 960→390: satırlar sarar (ad üst / env+recovery alt); taşma 0.
- **Kabul kriterleri:** (1) **hiçbir yerde secret DEĞERİ yok — yalnız env NAME**; (2) X API açıkça BLOCKED-EXTERNAL + maliyet nedeni + tek recovery; (3) durum renkleri semantik status token; (4) Meta izin-eksik ile bağlı ayrışır; (5) deep/canlı probe paneli "Bilinmiyor"a düşürmez (hafif kontrol), Yenile canlı tazeler.

### G3. Sistem [sınıf: PROFILE]
- **Amaç:** Dağınık sağlık sinyalini ADR-014'ün 3 katmanında topla: (1) altyapı (2) pipeline tazeliği (3) bugünkü hazırlık — "kuyruk bitti" ≠ sağlıksız.
- **Yeni ev / eski karşılık:** id `system`; **Profil menüsü 3. madde** (`A6`). Eski: `SystemTab` (worker/cron + haber pipeline + preset harcama). 3-katman ADR-014'e göre yeniden düzenlenir; zaten hero-kutusu/chart yok — sessiz `StatCell` + düz `PanelSection` korunur.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ Sistem Sağlığı · 3 katman                       [Yenile]  │
│ bugün maliyet $0.42 · worker Çalışıyor · golden %92 · kabul %58│ (sessiz StatCell sırası)
│ ── 1 · ALTYAPI ────────────────────────────────────────   │
│  ● Worker/Cron  Vercel cron · son tick 12:40  ✓ cron auth │
│  ● Neon · OpenRouter · SocialData   bağlı                 │
│ ── 2 · PIPELINE TAZELİĞİ ──────────────────────────────    │
│  ● Haber: Sağlıklı  ham 4 · hatalı 0 · çeviri24s 30 · analiz 30│
│  ● Keşif son çalıştırma 6s önce · outlier tazeliği ok     │
│ ── 3 · BUGÜNKÜ HAZIRLIK ───────────────────────────────    │
│  ● 2 içerik hazır · 0 karar bekliyor · "kuyruk bitti" ≠ sorun│
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** StatCell sırası 2×2 grid; 3 katman dikey `PanelSection`; satırlar sarar; Profil sheet'ten açılır.
- **İçerik sırası:** başlık+Yenile → sessiz özet StatCell sırası → Katman 1 Altyapı → Katman 2 Pipeline tazeliği → Katman 3 Bugünkü hazırlık.
- **Birincil / ikincil eylemler:** **birincil = "Yenile"** (salt-okuma panel); ikincil = müdahale-gereken satırdan ilgili yüzeye derin link (ör. haber backlog → Haber Havuzu; eksik anahtar → Entegrasyonlar).
- **Component ağacı:** `PageScaffold`→`PageHeader`(compact) → sessiz `StatCell` sırası (inline, hero DEĞİL) → `Card`(default) → 3× `PanelSection` (`StatusDot` status-token + yoğun satırlar; `--border-faint` ayraç). Chart/recharts YOK.
- **Veri kaynakları:** `GET /api/health` (worker.mode/inferredStatus/lastTickAt/recommendation, cronAuth.ok/message, newsPipeline.status/rawBacklog/failedBacklog/translatedLast24h/analyzedLast24h) · `GET /api/costs` (today.totalUsd) · `GET /api/eval/kpis` (goldenPassPct/acceptanceRate) · bugünkü hazırlık: `operatorReadinessService` / readiness ucu (hazır içerik + karar-bekleyen). Salt-okuma; yeni backend yok.
- **Durumlar:** loading = StatCell + panel skeleton; empty = N/A — sebep: panel sinyal toplar, boş kalmaz (uç düşse "veri yok" satırı); error = tüm uçlar düşerse `ErrorState` "Sistem uçlarına ulaşılamadı" + Yeniden dene; success = 3 katman dolu; **stale** = `worker.inferredStatus="stale"` → "Bayat" rozeti + son tick zamanı (kehribar, error değil) / pipeline eski → "veri N saat önce"; **blocked-external** = credential eksik satırı Katman 1'de "eksik: <ENV_NAME> → Entegrasyonlar" (değer yok).
- **Klavye:** Yenile Tab/Enter; derin-link satırları Tab/Enter; aria-live durum değişiminde.
- **Responsive:** 960→390: StatCell 2×2; panel satırları sarar; taşma 0.
- **Kabul kriterleri:** (1) 3 katman ADR-014 (altyapı/pipeline tazeliği/bugünkü hazırlık) ayrık; (2) "kuyruk tamamlandı" YEŞİL/nötr, kırmızı DEĞİL; (3) hero-number kutusu yok, dekoratif chart yok; (4) `deep=true` KULLANILMAZ (canlı probe timeout riski); (5) her düşen uç bloğu "veri yok" der, pane ölmez.

### G4. Maliyet [sınıf: PROFILE]
- **Amaç:** Sağlayıcı kalemleri + aylık bütçe + kalite KPI'ları + günlük trend — küçük satır-içi metriklerle, hero-kutusu ve dekoratif chart olmadan.
- **Yeni ev / eski karşılık:** id `costs`; **Profil menüsü 4. madde** (`A6`). Eski: `CostsTab` — 5 hero `MetricCard` + recharts `AreaChart` **kalkar**; sessiz metrik sırası + line-items `Table` + ince fonksiyonel sparkline'a indirgenir. `QuietStat` kalite şeridi korunur.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ Maliyet Takibi · sağlayıcı kalemleri, bütçe, trend [Yenile]│
│ bütçe %42 · bugün $0.42 · ay $4.18/$10 · OR bugün $0.31 · limit 88/150 (sessiz satır)│
│ SocialData bugün 88 tweet·$0.02 · kabul %58 (12 karar) · medyan edit 0.34 (kuzey yıldızı) · golden %92│
│ AYLIK BÜTÇE  ▓▓▓▓▓░░░░░  $4.18 / $10                       │
│ SAĞLAYICI KALEMLERİ (bu ay)             overflow-x:auto    │
│  SocialData   88 tweet × $0.0002        $0.0176           │
│  OpenRouter   amaç/model kırılımı       $4.16             │
│   ↳ draft · 120 çağrı                   $2.10             │
│   ↳ preset:writer-sonnet · 90 çağrı     $1.80             │
│ TREND (30g)  ▁▂▃▂▄▅▃▂  (ince tek-seri accent sparkline)   │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** sessiz metrik sırası sarar (2-sıra); kalite şeridi sarar; bütçe bandı tam-genişlik; kalem tablosu `overflow-x:auto`; sparkline tam-genişlik ince.
- **İçerik sırası:** başlık+Yenile → sessiz metrik sırası (bütçe%/bugün/ay/OR/limit) → kalite KPI QuietStat şeridi → aylık bütçe bandı → sağlayıcı kalemleri tablosu → 30g trend sparkline.
- **Birincil / ikincil eylemler:** **birincil = "Yenile"** (salt-okuma); ikincil = kalem satırı genişlet (amaç/model/preset kırılımı zaten satırlı).
- **Component ağacı:** `PageScaffold`→`PageHeader`(compact) → sessiz `MetricGrid`(inline) → `QuietStat` kalite şeridi (Card quiet) → bütçe bandı (ince div, budgetTone status) → `Table<LineRow>`(compact, `overflow-x:auto`) → `ChartContainer` ince **tek-seri** sparkline (accent stroke, gradient/dot/çoklu-renk YOK — fonksiyonel). recharts AreaChart KALDIRILIR.
- **Veri kaynakları:** `GET /api/costs` (today/month/dailySeries/lineItems{socialData, openRouter.byPurpose/byModel/byPreset}/limits) · `GET /api/eval/kpis` (fail-soft: acceptanceRate, medianEditDistance=kuzey yıldızı, goldenPassPct, decidedCount/editSampleCount/goldenScored). Prisma: `UsageLog`. Env limit: `MONTHLY_AI_BUDGET_USD`,`SOCIALDATA_DAILY_TWEET_BUDGET`.
- **Durumlar:** loading = metrik + kalem skeleton; empty = kalem yoksa "Henüz kalem verisi yok — sağlayıcı çağrıları başlayınca listelenir" / trend yoksa "Henüz maliyet verisi yok"; error = `ErrorState` "Maliyet verisi yüklenemedi" + Yeniden dene; success = metrik+bütçe+tablo+sparkline; **stale** = `dailySeries` son gün eski → "veri N saat önce" sessiz; kalite `kpis=null` → "veri yok" (dev tile'a dönüşmez); **blocked-external** = bütçe dolduğunda "bütçe %100 — taramalar/üretimler otomatik duraklatıldı" bilgi satırı (dış ödeme değil, iç kota).
- **Klavye:** Yenile Tab/Enter; tablo satırları Tab; sparkline salt-görsel (aria-label "30 günlük toplam trend").
- **Responsive:** 960→390: metrik sarar; tablo `overflow-x:auto`; sparkline tam-genişlik; taşma 0.
- **Kabul kriterleri:** (1) **hero-number `MetricCard` kutusu YOK** — hepsi sessiz satır-içi metrik; (2) **dekoratif recharts AreaChart KALDIRILMIŞ** — yerinde tek-seri fonksiyonel sparkline (gradient/dot yok); (3) kalite `kpis` fail-soft, "veri yok" dev-tile'a dönüşmez; (4) kalem tablosu `overflow-x:auto`, taşma 0; (5) budgetTone semantik status (>%80 error, >%60 warn).

### G5. Ayarlar [sınıf: PROFILE]
- **Amaç:** Model tercihleri + hesap otomasyon planları + operatör modu tek panelde; gömülü embed'ler ilgili yüzeylere dağıtılmış.
- **Yeni ev / eski karşılık:** id `settings`; **Profil menüsü 5. madde** (`A6`). Eski: `SettingsTab` (DURUM/MALIYET/MODEL/OTOMASYON + embed'ler). **Embed'ler taşınır:** `MemoryProposalsSection`→G1, `SeriesDnaSection`→Plan/Seriler, `LearningStatusCard`→Kütüphane/Öğrenme + G3, DURUM/MALIYET blokları→G3/G4. Kalan: MODEL + OTOMASYON + Operatör Modu. `alert()`→`Toast`.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│ Ayarlar · model, otomasyon, operatör  [Operatör Modu][Durdur][Yenile]│
│ worker Aktif · profil Operator Quality  (sessiz meta)     │
│ ── MODEL ──────────────────────────────────────────────   │
│  Aktif profil: [Operator Quality]  (dev ise: uyarı+geç)   │
│  Writer: <model>  Judge: <model>  Final: <model>          │
│  Son üretim: writer/judge/final · fallback? Hayır         │
│ ── OTOMASYON (hesap bazlı) ────────────────────────────    │
│  @grafikcem  [Otomasyon ●]  sıklık│maks│sessiz-saat│onay  │
│  @maskulenkod[Otomasyon ○]  …                             │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** operatör/durdur butonları başlık altına; MODEL satırları dikey; her hesap kartı dikey (toggle üstte, `Select`'ler tek kolon); onay toggle tam-genişlik; Profil sheet'ten açılır.
- **İçerik sırası:** başlık+aksiyonlar+sessiz meta → worker-pasif uyarı bandı (varsa) → MODEL (aktif profil + dev-uyarı + rol modelleri + son üretim metadata) → OTOMASYON (hesap başına: otomasyon toggle, tarama sıklığı, günlük maks, sessiz saat başlangıç/bitiş, paylaşım-öncesi onay).
- **Birincil / ikincil eylemler:** **birincil = "Operatör Modu" başlat / "Durdur"**; ikincil = model profili "Operator Quality'e geç" (env.local yazar), hesap otomasyon toggle + plan `Select`'leri, "Yenile".
- **Component ağacı:** `PageScaffold`→`PageHeader`(compact, aksiyon `Button`'lar, sessiz meta) → worker banner `Card`(quiet) → düz `Section`'lar (`--border-faint` ayraç): MODEL (`SettingRow` + `Badge` profil + dev uyarı `Card` + rol `code` + son-üretim satırları) · OTOMASYON (hesap `Toggle` + `Select`×4 + onay `Toggle`). Bildirim `alert()` yerine `useToast`.
- **Veri kaynakları:** `GET /api/settings` (accounts+models+modelProfile+freeOverridesIgnored+lastUsedMetadata) · `POST /api/settings` (accountId + schedule alanları) · `POST /api/settings/operator-mode` (start/stop) · `POST /api/settings/model-profile` (operator_quality). Prisma: `Account`,`Schedule`. Env: `MODEL_PROFILE`,`ENABLE_FREE_MODELS`,`ENABLE_PREMIUM_MODEL` (NAME).
- **Durumlar:** loading = "Ayarlar yükleniyor" compact; empty = hesap yoksa "Hesap bulunamadı"; error = uç düşerse ilgili blok sessiz düşer (health/costs G3/G4'te); success = MODEL+OTOMASYON dolu; **stale** = worker `stale` → meta "Eski tick" kehribar; **blocked-external** = model profili `dev`/free → "Düşük Kalite Modu" kehribar uyarı + "Operator Quality'e geç" (iç yapılandırma, dış ödeme değil).
- **Klavye:** aksiyon butonları Tab/Enter; `Toggle` Space; `Select` klavye; operatör başlat/durdur onay; toast aria-live.
- **Responsive:** 960→390: aksiyonlar sarar; MODEL/OTOMASYON dikey; hesap kartı tek kolon; taşma 0.
- **Kabul kriterleri:** (1) MemoryProposals/SeriesDna/LearningStatus/DURUM/MALIYET embed'leri KALKMIŞ (G1/Plan-Seriler/Öğrenme/G3/G4'e taşınmış); (2) `alert()` yerine `Toast`; (3) operatör modu start/stop + model-profil geçişi çalışır (env.local); (4) hesap planları (sessiz saat/cadence/onay) kaydolur; (5) tek accent, hero-number yok.

---

## BÖLÜM H — Genel Durum Ekranları [STATE]

### H1. Onboarding / İlk kurulum [sınıf: STATE]
- **Amaç:** İlk açılışta (veri yok, entegrasyon eksik) operatörü ilk üretime kadar ≤3 adımda yönlendir.
- **Yeni ev / eski karşılık:** id `state:onboarding`; `/giris` (A7) sonrası ilk `Bugün` boş-hali üzerine biner. Eski: yok (app-level onboarding YOK). YENİ.
- **Desktop wireframe:**
```
┌──────────────────────────────────────────────────────────┐
│            ◆ CemOS'a hoş geldin, Ali Cem                  │
│   Üç adımda ilk hazır içeriğine ulaş:                     │
│   ① Entegrasyonları bağla   OpenRouter · SocialData  [Aç] │
│   ② İlk keşfi çalıştır       Keşif Motoru boru hattı  [Çalıştır]│
│   ③ Bugün'de onayla         hazır içerik karar kuyruğu [Git]│
│   (tamamlananlar ✓ ile işaretlenir)                       │
└──────────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** 3 adım dikey kart; her adım tam-genişlik CTA; bottom-nav Bugün aktif; tamamlanınca adım daralır.
- **İçerik sırası:** karşılama → adım 1 (entegrasyon) → adım 2 (ilk keşif) → adım 3 (Bugün'e git); durum ilerledikçe ✓.
- **Birincil / ikincil eylemler:** **birincil = sıradaki tamamlanmamış adımın tek CTA'sı**; ikincil = "şimdilik atla" (Bugün boş-haline düşer).
- **Component ağacı:** `PageScaffold`→ hoşgeldin `Card`(feature) → 3× adım satırı (`onboard-step-{n}`: durum ikonu + başlık + tek `Button`). Sonraki adım vurgulanır, tamamlanan sönük.
- **Veri kaynakları:** `GET /api/health` (entegrasyon durumu → adım 1 done?), `GET /api/costs`/queue sayısı (ilk üretim → adım 2/3 done?). Türetilmiş durum (kalıcı onboarding flag'i yok — koşullardan hesaplanır).
- **Durumlar:** loading = adım skeleton; empty = **bu ekranın kendisi Bugün'ün empty-onboarding hali**; error = adım kontrolü düşerse "durum alınamadı, yine de başla" + adımlar aktif; success = 3 adım ✓ → otomatik Bugün'e düşer; stale = N/A — sebep: türetilmiş anlık durum; **blocked-external** = adım 1'de eksik `OPENROUTER_API_KEY`/`SOCIALDATA_API_KEY` → adım "Entegrasyonlar"a yönlendirir (değer yok).
- **Klavye:** sıradaki CTA otomatik odak; Tab adımlar; Enter çalıştır; Esc = atla.
- **Responsive:** her boyutta ortalı; ≤640 dikey kart; taşma 0.
- **Kabul kriterleri:** (1) yalnız gerçekten boş/kurulmamış durumda görünür; (2) adımlar koşuldan türetilir (sahte flag yok); (3) her adım tek net CTA; (4) tamamlanınca Bugün'e devreder; (5) ≤3 adım, birincil görev ≤3 tık.

### H2. Empty state (desen) [sınıf: STATE]
- **Amaç:** Veri-yok durumunu error'dan görsel olarak ayrı, tek opsiyonel aksiyonla sun (`06` §9).
- **Yeni ev / eski karşılık:** `EmptyState` primitive (mevcut, token flip). Her veri yüzeyinde çağrılır (haber/toolbox/fırsat/kaynak…).
- **Desktop wireframe:**
```
         [ ikon (nötr) ]
         Başlık — ne yok
         Açıklama — neden boş + ne yapılır (1-2 cümle)
         [ Tek opsiyonel aksiyon ]   ← yalnız anlamlıysa
```
- **Mobil wireframe (390px):** ortalı dikey; ikon+başlık+açıklama+CTA tam-genişlik; alan içinde ortalanır.
- **İçerik sırası:** ikon → başlık → açıklama → (opsiyonel) tek aksiyon.
- **Birincil / ikincil eylemler:** en fazla **bir** aksiyon (ör. "Haberleri İşle", "Sync çalıştır", "Yeni Kaynak"); çoğu empty aksiyon-suz.
- **Component ağacı:** `EmptyState`(`icon`,`title`,`description`,`action?`,`compact?`); genelde `Card`(quiet) içinde. Nötr ton — accent yalnız CTA'da.
- **Veri kaynakları:** N/A (sunum primitive'i); host ekranın "0 sonuç" dalı.
- **Durumlar:** loading = host skeleton gösterir (empty değil); empty = bu desen; error = **ASLA empty ile karışmaz** — `ErrorState` (H3) ayrı; success = host içerik; stale = host stale çipi (empty değil); blocked-external = host blocked deseni (H5), empty değil.
- **Klavye:** varsa CTA odaklanabilir; salt-metin okunur.
- **Responsive:** her boyut ortalı; `compact` dar alanlarda.
- **Kabul kriterleri:** (1) empty ≠ error görseli; (2) en fazla 1 aksiyon; (3) açıklama "neden boş + ne yapılır" içerir; (4) nötr ikon, accent yalnız CTA; (5) filtre-boş ("eşleşme yok") ile veri-boş ("henüz yok") ayrı metin.

### H3. Error state (desen) [sınıf: STATE]
- **Amaç:** Yükleme/işlem hatasını kalıcı, retry'lı, sebebi belli göster — geçici toast'la kaybolan hata YASAK.
- **Yeni ev / eski karşılık:** `ErrorState` primitive (mevcut, token flip). Hata ≠ boş (item 5) — `NewsPoolTab`'da zaten ayrı `loadFailed` dalı örnek.
- **Desktop wireframe:**
```
         [ ikon (status-error nötr) ]
         Başlık — ne başarısız oldu
         Açıklama — kısa sebep + "sürerse Sistem durumu"
         [ Yeniden dene ]
```
- **Mobil wireframe (390px):** ortalı dikey; başlık+açıklama+retry tam-genişlik.
- **İçerik sırası:** ikon → başlık → açıklama (sebep) → "Yeniden dene".
- **Birincil / ikincil eylemler:** **birincil = "Yeniden dene"** (`onRetry`); ikincil = derin-link "Sistem durumu" (G3) sorun sürerse.
- **Component ağacı:** `ErrorState`(`title`,`description`,`onRetry`); host `loadFailed` state'i ayrı tutar (empty'den bağımsız). `--status-error` ton, ölçülü (glow yok).
- **Veri kaynakları:** N/A; host fetch reject/`!success` dalı. Sunucu mesajı verbatim gösterilir (`06` core: hata gizleme yok).
- **Durumlar:** loading = host skeleton; empty = H2 (ayrı); error = bu desen; success = host içerik; stale = ayrı (H4 — eskimiş veri hata DEĞİL); blocked-external = ayrı (H5 — dış engel hata gibi kırmızı-panik DEĞİL, tek recovery).
- **Klavye:** retry otomatik odak; Enter tekrar dener.
- **Responsive:** her boyut ortalı; taşma 0.
- **Kabul kriterleri:** (1) hata kalıcı (toast'la kaybolmaz); (2) retry her zaman var; (3) sebep gösterilir (verbatim sunucu mesajı uygunsa); (4) empty/stale/blocked ile karışmaz; (5) `summary=null` gibi hallerde sahte 0 yerine placeholder.

### H4. Stale state (desen) [sınıf: STATE]
- **Amaç:** Verinin eskidiğini sessiz göster (göreli zaman) — AI eskiyen veriden ürettiği için kritik ama error DEĞİL (`06` §9).
- **Yeni ev / eski karşılık:** stale çipi/rozeti deseni (YENİ primitive katkısı — `StatusBadge` tone `stale`/kehribar + göreli zaman util `timeAgo`). Topbar sağlık (A3) ve her veri yüzeyinde.
- **Desktop wireframe:**
```
 … başlık             [ ◔ veri 3 saat önce tazelendi ]  ← sessiz kehribar çip
   (içerik normal render olur, sadece tazelik işareti)
```
- **Mobil wireframe (390px):** çip başlık altına iner; nokta+göreli zaman; içerik normal.
- **İçerik sırası:** normal içerik + üst/yan sessiz stale çipi (göreli zaman).
- **Birincil / ikincil eylemler:** ikincil = "Yenile/Tazele" (host'un mevcut aksiyonu); stale kendi başına bloklamaz.
- **Component ağacı:** `StatusBadge`(tone `warn`/kehribar, `◔`) + `timeAgo(publishedAt|scannedAt|lastSyncedAt|lastTickAt)`; topbar'da `SystemStatusButton` kehribar nokta. accent DEĞİL — kehribar `--status-warn`.
- **Veri kaynakları:** host zaman alanları (`fetchedAt`,`scannedAt`,`lastSyncedAt`,`dailySeries` son gün, `worker.lastTickAt`,`GenerationRun` zamanı). Eşik host'a göre (haber buzz penceresi, sync SLA).
- **Durumlar:** loading = host skeleton; empty = H2; error = H3; success = taze içerik (stale çipi yok); **stale = bu desen** (içerik + sessiz zaman); blocked-external = H5.
- **Klavye:** çip salt-görsel (aria-label "veri N saat önce"); Yenile erişilebilir.
- **Responsive:** çip her boyutta; ≤640 başlık altına.
- **Kabul kriterleri:** (1) stale sessiz (kehribar), kırmızı/error DEĞİL; (2) göreli zaman gösterir; (3) içerik yine render olur (bloklamaz); (4) ADR-012: tarama/fetch zamanı ≠ doğrulama; (5) topbar yalnız stale/problem varsa dikkat çeker ("kuyruk bitti" ≠ stale).

### H5. Blocked-external (desen) [sınıf: STATE]
- **Amaç:** Dış credential/izin/ödeme engelini net Türkçe neden + **tek** recovery ile göster; sessiz no-op YASAK (`01` §9, ADR-015).
- **Yeni ev / eski karşılık:** blocked-external deseni (YENİ). Örnekler: X API ödeme onayı (ADR-015), Meta izni, `YOUTUBE_API_KEY`/`OPENROUTER_API_KEY`/`SOCIALDATA_API_KEY` eksik. Entegrasyonlar (G2) satırı + host ekranda tam-blok kartı.
- **Desktop wireframe:**
```
 ┌──────────────────────────────────────────────────────┐
 │ ✕  <Servis> şu an kullanılamıyor                      │
 │    Neden: <net Türkçe — ör. "CemOS içinden doğrudan    │
 │    yayın (X API) ödeme onayı bekliyor. %50 link        │
 │    ~$16-26/ay. Onaysız başlamaz.">                    │
 │    Gereken env: X_CLIENT_ID / X_CLIENT_SECRET (NAME)  │
 │    [ Maliyet senaryosu › ]                            │
 │    [ Tek recovery: Onay ver / İzni tamamla / Ayarla ] │
 └──────────────────────────────────────────────────────┘
```
- **Mobil wireframe (390px):** tam-genişlik kart; ikon+başlık üst, neden+env NAME orta, tek CTA alt yapışkan-erişilebilir.
- **İçerik sırası:** durum ikonu → "<servis> kullanılamıyor" → net Türkçe neden → gereken env NAME (değer YOK) → tek recovery CTA.
- **Birincil / ikincil eylemler:** **birincil = tek recovery** (X: "Onay ver" → maliyet onayı; Meta: "İzni tamamla"; anahtar eksik: "Entegrasyonlar"a git). İkincil YOK — tek yol.
- **Component ağacı:** `Card`(quiet, `--status-error`/warn kenar) veya tam-ekran `EmptyState` (ör. YouTube `configured=false`); `StatusBadge` + env NAME `code` + tek `Button`. Panik-kırmızı değil, sakin ama net.
- **Veri kaynakları:** `GET /api/health` (probe), G2 entegrasyon durumu; ADR-015 X API maliyet metni; Meta scope (`instagram_basic`/`business_discovery`). Env NAME'leri gösterilir, **değer asla**.
- **Durumlar:** loading = host skeleton; empty = H2 (dış engel değil); error = H3 (geçici hata, dış-engel değil); success = servis bağlı (blok yok); stale = H4; **blocked-external = bu desen**.
- **Klavye:** recovery CTA otomatik odak; Enter; env NAME kopyala (değer yok).
- **Responsive:** her boyut; ≤640 tam-genişlik, CTA thumb-erişilebilir alt.
- **Kabul kriterleri:** (1) net Türkçe neden (jargon değil); (2) **tek** recovery yolu; (3) sessiz no-op YOK — engel her zaman görünür; (4) X API = BLOCKED-EXTERNAL + maliyet nedeni (ADR-015), onaysız gerçek publish başlamaz; (5) yalnız env NAME, secret değeri asla ekranda/logda.

## Bugün karar kartı — referans + düzeltilmiş sözleşme (ADR-021, Faz 1C-e)

> Uygulanan hâl (`DraftReviewCard` + `DraftDetailDrawer` + `ThreadSegmentEditor`). Referans ADR-021: kontrollü ivory/peach açık-ada karar kartları koyu kanvasta.

- **Ton = readiness** (`data-readiness`): **ready → ivory `InverseCard`** · **needs_edit → peach `PeachCard`** · **blocked → koyu hata-tint `Surface`** · published → sönük koyu + yeşil "Paylaşıldı". Kuyruk satırları koyu + readiness noktası.
- **Kart kompozisyonu:** üst satır ("Sıradaki" + @hesap + X·format + readiness rozeti) → "Neden bugün?" satırı (5-durum doğrulama çipi + tazelik) → (needs_edit/blocked) Türkçe neden listesi → içerik (okunur blok; tıkla→düzenle textarea) → aksiyonlar.
- **Yayın sözleşmesi (bağlayıcı):** **ready** → birincil **intent-only "X'te aç"** (ADR-017; pencere açmak yayın DEĞİL) + ikincil Düzenle/Kaydet/Kopyala/Görsel üret/Detay + **"Paylaşıldı"** (manuel onay). **needs_edit** → birincil **"Düzenle"**; X'te aç/Paylaşıldı YOK; nedenler görünür. **blocked** → intent/publish YOK; engelleyen neden görünür. **"Onayla ve yayınla" ve "AI çıktısını değiştirmeden yayınlayamazsın" YOK** (kozmetik edit-gate kaldırıldı). A/E/J/K.
- **Detay drawer** (koyu side panel 420px): Neden bugün (doğrulama + reason), Kaynak (`scannedAt` = **"tarandı"**, fact-check DEĞİL; kaynak mevcut ≠ iddia doğrulandı), ayrışık kalite sinyalleri (tek viral skor YOK), readiness nedenleri, üretim izi (model/açı/pattern **katlanmış**). Kart ile **AYNI** hesaplanmış sonuç.
- **Thread segment editörü** (desktop): segment kartları (numara + textarea + char/280) — ekle/böl(imleçte)/birleştir(üstteki)/sırala(↑↓)/sil; kaydet → `serializeThreadSegments` → PATCH `threadSegments`. Yapısal segment = readiness'in thread doğrulaması ("1/" metni kanıt DEĞİL).
- **Durumlar:** loading = skeleton; empty = "Bugün için taslak yok" + Üret; error = graceful ErrorState (**canlı DB threadSegments migration'ı beklerken bu gösteriliyor** — USER-DB-ACTION, ADR-021); success = kart tonu readiness.
- **Kabul:** (1) ton=readiness + `data-readiness`; (2) needs_edit/blocked yayınlanamaz; (3) intent-only (PublishedPost yaratmaz); (4) kart/drawer aynı doğrulama; (5) 1280/1440 taşma yok; (6) A/E/J/K. E2E: `bugun-queue.spec.ts` (hermetik route-mock).
