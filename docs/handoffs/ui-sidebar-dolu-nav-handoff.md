# Handoff: Sidebar "Dolu Nav" Reversiyonu (compact sonrası devam)

> Tarih: 2026-07-11 · Dal: `feature/ui-dark-redesign` (17 commit, PUSH YOK) · Server: 3002

## Amaç (kullanıcı isteği — kesin)

Mevcut "yalnız 5 alan" sidebar'ı İSTENMİYOR. Sidebar DOLU görünecek:
alt sayfalar sidebar'da alan başlıklarının ALTINDA listelenecek (eski düz
"magazine" nav gibi). EN ÜSTTE ise **Bugün** ve **Haber Havuzu** hiçbir
kategori başlığı OLMADAN bağımsız öğe olarak duracak.

Hedef yapı (desktop sidebar, yukarıdan aşağı):

```
Bugün            ← direkt öğe, kategori başlığı YOK (morning)
Haber Havuzu     ← direkt öğe, kategori başlığı YOK (news-pool)
[AÇIK SORU] Günlük Kuyruk — kullanıcı saymadı; varsayılan: o da en üstte
             direkt öğe (daily-queue). Alternatif: Üretim altına.
ÜRETİM           ← eyebrow grup başlığı
  Instagram
  YouTube Fırsat Motoru
KEŞİF
  Viral Radar
  Keşif Motoru
  X Hesabı Kaynakları
HAFIZA
  Viral Kütüphane
  Anahtar Kelime Kütüphanesi
  Prompt Kütüphanesi
  Pattern Kütüphanesi
  Youtube Öğrenme Kütüphanesi (yalnız NEXT_PUBLIC_LEARN_ENABLED=true)
SİSTEM
  Toolbox · Maliyetler · Sistem · Ayarlar
─────────
Hesap (@kanal seçici) + Daralt   ← dipte sabit kalır
```

## Mevcut durum (neyi değiştireceksin)

- `src/components/shell/Sidebar.tsx` — şu an YALNIZ 5 alan butonu render
  ediyor (`AreaButton`, testid `sidebar-area-{bugun|uretim|kesif|hafiza|sistem}`).
  Alt sekmeler burada YOK. Git geçmişinde dolu-nav referansı var:
  `git show 7b023f2:src/components/shell/Sidebar.tsx` (TabButton + eyebrow
  grup başlıkları + IconRail) — stil temeli olarak kullan, birebir geri alma
  (o sürümde SystemStatus/kanal footer'ı vardı, artık yok).
- `src/components/shell/WorkspaceSubNav.tsx` — workspace içi sekme şeridi.
  Sidebar dolu olunca DESKTOP'ta kaldır/gizle (çift nav olmasın). Mobilde
  zaten gizli. Dosyayı silme kararı: e2e `subnav-tab-*` testid'lerine
  bakıyor — testleri sidebar'a çevir, sonra bileşeni kaldır.
- `src/components/shell/AppShell.tsx` — WorkspaceSubNav mount'u + subItems
  hesabı burada; Sidebar'a `activeTab`/`onSelectTab` prop'larını GERİ ver
  (eski imza: activeArea/onSelectArea/activeTab/onSelectTab/activeUtility/
  onSelectUtility/collapsed/onToggleCollapse/onNavigate).
- `src/components/shell/MobileNav.tsx` — DOKUNMA (bottom nav + sheet kalıyor;
  kullanıcı yalnız desktop sidebar'ı istedi).
- `src/components/nav/navConfig.ts` — tab ID'LERİ SABİT. Yapı değişikliği:
  morning + news-pool (ve muhtemelen daily-queue) DIRECT_TABS'a taşınır;
  `bugun` alanı ya kalkar ya tek-öğeli kalır → `PRIMARY_AREAS`/`NAV_GROUPS`/
  `resolveAreaForTab`/`firstTabOfArea` + iki test dosyası
  (`navConfig.test.ts`, `navConfig.areas.test.ts`) birlikte güncellenir.
  DİKKAT: `morning` label şu an "Genel Bakış" — direkt öğe olunca "Bugün"a
  GERİ çevir (çift-Bugün sorunu kalmıyor çünkü alan başlığı olmayacak).
  news-pool label "Haberler" → kullanıcı "Haber Havuzu" dedi; label'ı
  "Haber Havuzu" yap (sayfa h1'i zaten öyle).
- Aktif stil: sessiz mor tint + 2px sol çizgi KORUNUR (eski gradient pill
  GERİ GELMEZ). Collapsed icon rail: 5 alan yerine direkt öğeler + grup
  ikonları — 7b023f2'deki IconRail kalıbını yeni yapıya uyarla.

## Kırmızı çizgiler (değişmez)

- 17 tab id + `xagent-store` + `useXAgentStore` + `XAgentApp.tsx` +
  User-Agent kimlikleri + edit-gate/manuel publish.
- Mor/turuncu token sistemi ve workspace paneli aynen.
- Push/PR/deploy yok.

## Testler (birlikte güncellenecek)

- `tests/e2e/helpers/nav.ts`: selectTab → sidebar'daki alt-sekme butonuna
  (`sidebar-tab-{id}` testid'ini geri getir); selectUtility → `sidebar-utility-{id}`.
- `tests/e2e/feature-smoke.spec.ts`: "5 alan görünür + sidebar'da alt sekme
  yok" assert'leri TERSİNE döner (alt sekmeler artık sidebar'da).
- `tests/e2e/shell-smoke.spec.ts`: collapse + Cmd-K + mobil + drawer +
  edit-gate testleri büyük ölçüde aynı; `subnav-tab-morning` referansları
  `sidebar-tab-morning`e döner.
- navConfig unit testleri yeni DIRECT_TABS/alan yapısına.

## Kapılar

`npx tsc --noEmit` + `npx vitest run` (1197) + `npm run lint` +
`npm run build` (3002 kapatıp — Prisma DLL kilidi) + `npx playwright test`
(16; kendi 3211'ini açar, 3002 KAPALIYKEN koş) + Playwright görsel:
1440+390, sidebar dolu görünüm + collapse + mobil değişmedi. Bitince 3002'yi
tekrar aç (`npm run dev -- -p 3002`, arka plan; EADDRINUSE görürsen zaten
açık demektir).

## Bilinen ortam notları

- Dev server 3002'de; build/e2e öncesi kapat (port + Prisma kilidi).
- MCP Playwright chrome profili kilitlenirse: mcp-chrome süreçlerini kapat.
- `devIndicators:false` (dev overlay kapalı) — geri açma.
- Watchlist 24/30 dolu; Meta izni gelene dek satırlar "henüz taranmadı".
```

## Continue Prompt (compact sonrası yapıştır)

```
CemOS reposunda feature/ui-dark-redesign dalındayım (17 commit, push yok).
docs/handoffs/ui-sidebar-dolu-nav-handoff.md dosyasını oku ve uygula:
sidebar'ı "dolu nav"a çevir — Bugün ve Haber Havuzu en üstte kategorisiz
direkt öğe (Günlük Kuyruk için handoff'taki AÇIK SORU'ya göre varsayılanı
uygula), Üretim/Keşif/Hafıza/Sistem grup başlıkları altında alt sayfalar
sidebar içinde listelensin; WorkspaceSubNav desktop'tan kalksın; MobileNav
ve mor/turuncu token sistemi aynen kalsın. Tab id'leri, store, edit-gate,
User-Agent kimlikleri değişmez. e2e helper + spec'leri ve navConfig
testlerini birlikte güncelle. Kapılar: tsc + vitest + lint + build + e2e
(3002'yi kapatıp koş, sonra tekrar aç) + 1440/390 Playwright görsel
doğrulama. Push yapma; bitince rapor ver ve 3002'yi açık bırak.
```
