# 06 — Design System Spec (CemOS desktop dark editorial)

> **⚠ TEMA GÜNCELLENDİ — ADR-020 (2026-07-15):** Tek tema artık **DESKTOP DARK EDITORIAL** (sıcak antrasit + terracotta). Aşağıdaki "açık editorial" palet metni TARİHSEL kayıttır; canlı değerler Faz 1B.5'te `globals.css`'e dark olarak uygulandı (bg-base `#101114`, text-primary `#F2EFE8`, accent solid `#A8481F` / text `#E4865E`). Light/dark toggle yok. Desktop-only: birincil 1280/1440/1920, min 1024, **1024–1920 yatay taşma yok**. Mobil = best-effort. Kesin palet: ADR-020 + `theme-tokens.test.ts`.
>
> Kaynak: tasarım araştırması (Linear/Notion/Typefully/Superhuman/Buffer, erişim 2026-07-15) + master prompt görsel yön + `rules/ecc/web/design-quality.md`. Token İSİMLERİ mevcut `globals.css` ile aynı kalır (30 primitive kırılmaz); DEĞERLER dark editorial'e flip edildi. **Accent = terracotta (korunur).**

## 1. Yön ve karakter

Sakin, editoryal, güvenilir, içerik-öncelikli çalışma alanı. Kırık beyaz zemin, antrasit metin, TEK kontrollü vurgu. Solo içerik üreticisinin kişisel OS'u — kurumsal SaaS değil. **Yasak (AI-slop işaretleri, araştırmayla teyitli):** mor/violet gradient (#1 tell — mevcut lavanta accent bu yüzden retire), KPI hero-number kutuları (~%90 AI dashboard'da), dekoratif chart, cam/glassmorphism, neon/cyan, floating 3D, her yerde uniform kart grid, işleve bağlı-olmayan chrome rengi.

## 2. Renk sistemi

### 2a. Yüzey rampası (açık)
| Token | Değer | Kullanım |
|---|---|---|
| `--bg-base` | `#F7F6F2` (kırık beyaz) | app zemini |
| `--bg-workspace` | `#FFFFFF` | ana içerik paneli |
| `--bg-sunken` | `#F1EFEA` | girinti/inset |
| `--bg-surface` | `#FFFFFF` | kart |
| `--bg-elevated` | `#FFFFFF` + shadow | yükseltilmiş kart/drawer |
| `--bg-hover` | `#F1EFEA` | hover |
| `--bg-rail` | `#F4F2ED` | sidebar |

### 2b. Metin (gerçek WCAG 2.1 relative-luminance — ADR-018)
| Token | Değer | Kontrast (bg-base #F7F6F2) | Kullanım |
|---|---|---|---|
| `--text-primary` | `#262220` (antrasit) | **14.8:1** AAA | gövde metin |
| `--text-secondary` | `#5A554F` | **6.82:1** AA | ikincil metin |
| `--text-muted` | `#726C64` | **4.80:1** AA | küçük normal metin (12-16px) — AA geçer |
| `--text-faint` | `#B3AEA6` | ~1.8:1 (FAIL) | **YALNIZ dekoratif/disabled** — anlam taşıyan metinde KULLANILMAZ |

> Düzeltme kaydı: eski `--text-muted #8A857D` gerçekte 3.39:1 idi (AA-altı); `#726C64`'e koyulaştırıldı. `text-faint` hiçbir okunması gereken metinde kullanılamaz.

### 2c. Accent — Terracotta/Rust (SEÇİLDİ, ADR-017) — iki-katmanlı ramp (ZORUNLU)
**Yapısal bulgu:** Hiçbir doygun accent solid-fill + koyu-metin AA'yı geçmez (WCAG matematiği). Her accent iki katman gerektirir: doygun ton (metin/link/ikon/aktif-durum) + fill (buton = beyaz metin) + soluk tint (badge/seçili satır = koyu metin).

| Token | Değer | Kullanım | Kontrast (gerçek) |
|---|---|---|---|
| `--accent` | `#A8481F` | link/aktif/ikon; buton fill | metin/bg **5.42:1** AA; +beyaz metin **5.86:1** AA |
| `--accent-hover` | `#8F3A16` | hover | — |
| `--accent-fg` | `#FFFFFF` | accent-fill üstü metin | fill'de **5.86:1** AA |
| `--accent-text` | `#A8481F` | link metni bg üstü | **5.42:1** AA |
| `--accent-tint` | `#F3E4DC` (soluk) | badge/seçili satır zemini | +koyu metin **12.9:1** AAA |
| `--accent-tint-strong` | `#E9CFC2` | aktif nav zemini | +koyu metin AA |

**Belgelenmiş alternatif (kullanılmıyor) — Editorial Indigo `#3D4F9E`** (metin 6.9:1): ramp isimleri aynı → gerekirse tek dosyada değer swap. Terracotta ADR-017 ile donduruldu.

> `--accent-2` (eski turuncu `#ff5538`): ismi `--accent`'e alias'lanır (component kırılmaz), Faz 4'te emekli. Tek-accent disiplini.

### 2d. Semantik + chart (gerçek WCAG)
**Not: status token'ları iki bağlamda — (a) nokta/kenar/ikon (metin değil, kontrast muaf), (b) chip metni (kendi tint zemininde ≥4.5:1 ZORUNLU).**
| Rol | Nokta/ikon | Chip metni | Chip zemini | Chip kontrast |
|---|---|---|---|---|
| ok | `--status-ok #2E7D52` | `#256B44` | `#E4F0E9` | **5.50:1** AA |
| warn | `--status-warn #B4740E` | `#8A5A08` | `#F6ECD9` | **5.05:1** AA |
| error | `--status-error #B3261E` | `#B3261E` | `#F6E2E1` | **5.33:1** AA |
| info | `--accent` | `--accent` | `--accent-tint` | 12.9:1 |
| `--chart-1..4` | accent + nötr griler; **dekoratif çoklu-renk YOK** | | | |

Renk = token; off-token hex YASAK. Accent yalnız işlevsel chrome'da (aktif nav, link, birincil CTA fill, focus ring) — asla dekoratif. **Faz 1A `theme-tokens.test.ts` bu metin/zemin çiftlerinin gerçek kontrast oranını (≥4.5:1) otomatik doğrular.**

## 3. Tipografi

- **Sans:** Inter (mevcut; gövde + başlık + UI). **Serif (uzun-form gövde):** Newsreader (haber-okuma için tasarlı) — taslak metni, article/Learn gövdesi, uzun kaynak alıntıları. İki aile sınırı (perf.md).
- **Türkçe glyph:** i/İ/ı/I dotted-dotless — Inter + Newsreader Latin Extended taşır; **lock öncesi her weight'in Google Fonts "Language support"u doğrulanacak** (araştırma açık maddesi).
- Ölçek: `--text-2xs 11` / `xs 12` / `sm 13` / `base 15` / `md 16` / `lg 18` / `xl 22` / `2xl 28` / `display 36` / `display-xl 48`. **Uzun-form gövde ≥16px (17px önerilir), line-height 1.5-1.65, ölçü 45-85 karakter.**
- Başlık weight **600 (700 YASAK)**; `<strong>` 500. `.tnum` metrikler için.
- 900-1000px content genişliği: ham gövde metni tam genişliğe uzamaz — metin kolonu iç padding'le 45-85 karakter ölçüde tutulur (araştırma çelişki notu; base 17px + kolon padding).

## 4. Layout + spacing

- `--content-max: 960px` — birincil okunabilir içerik genişliği. Kartlar/kuyruk bu genişlikte ortalanır.
- Spacing skalası `--space-1..16` (4px tabanı); `--space-page-x 32px` (≤640px 16px); `--card-pad 24px`; `--stack 20px`; `--space-section 48px`.
- Grid: shell = sidebar (232px labelled) + workspace (rounded panel, ≤640 full-bleed). İçerik tek-kolon 960px; Plan/Takvim + advanced ekranlar geniş tablo/grid için `overflow-x:auto` konteynerde.

## 5. Radius / shadow / elevation

- Radius: `sm 8 / md 11 / lg 14 / xl 18 / pill 9999`.
- Shadow (açık temada ince): `--shadow-sm 0 1px 2px rgba(20,18,16,.06)`, `--shadow-card 0 1px 3px rgba(20,18,16,.08)`, `--shadow-pop 0 4px 16px rgba(20,18,16,.12)`, `--shadow-drawer 0 8px 40px rgba(20,18,16,.16)`. Neon/glow YOK.
- Border: `--border 1px solid #E6E3DC`; `--border-strong #D8D4CC`.

## 6. Bileşen sözleşmeleri (primitive → yeni sistem)

30 mevcut primitive (`src/components/ui/`) token-swap ile taşınır; kompozisyon değişenler işaretli.

| Primitive | Değişim |
|---|---|
| PageScaffold | `--content-max: 960px` uygular; ana içerik ortalı tek kolon |
| PageHeader/SectionHeader | editorial: küçük eyebrow + 22-28px başlık; manşet-vari büyük tipografi YOK |
| Card/EntityCard/MetricCard | açık yüzey + ince shadow; **MetricCard KPI-kutusu değil** — küçük satır-içi metrik, hero-number yasak |
| Button/IconButton | primary = accent fill + beyaz metin; secondary = border + accent metin; 40px kontrol, radius md |
| Badge/StatusBadge | soluk accent-tint + koyu metin (AA); semantik durumlar status token |
| Table/Kanban | ince border satırlar; zebra yok; yoğunluk Plan/advanced'de |
| Drawer/DetailPanel | non-modal (liste arkada canlı); progressive disclosure ("gerekçeyi göster") |
| Toast/Tooltip | ince shadow-pop; accent yalnız aksiyon |
| EmptyState/ErrorState/Skeleton | 5 durum (§9); skeleton >500ms, spinner <500ms |
| SubNav/FilterBar | Plan/Kütüphane alt-nav; tab-benzeri, aktif = accent alt-çizgi/tint |
| TimelineLane | Plan/Takvim yayın planı; density-only ay görünümü |
| ScoreBars/ChartContainer | accent + nötr; dekoratif çoklu-renk yok |
| CommandPalette | global aksiyon yüzeyi (§8) — nav + oluştur + ara + ayrı "Sor" grubu |

## 7. Navigasyon

- **Sidebar:** tam etiketli ~244px, 3 **TOP-LEVEL** alan (Bugün/Plan/Kütüphane) + "Araştırma" grubu + Toolbox (Araçlar) + "Şimdi" özeti + Profil tetikleyici (alt). Utility/settings birincil rail'de DEĞİL. **ADR-040:** icon-rail collapse hâlâ yok; ama "Araştırma" (eski motor adları) sidebar'da hiyerarşik + katlanabilir + masaüstünde keşfedilebilir (rail dışında saklı DEĞİL); aktif alan alt hedeflerini sidebar'da açar. Aktif = nötr grafit zemin (`bg-elevated`) + terracotta ikon vurgusu (ADR-021).
- **Alt-nav (Plan/Kütüphane):** hem workspace `SubNav` strip HEM sidebar'da (aktif alan altında) — Plan: Takvim·Fırsatlar·Seriler; Kütüphane: Tümü·İlham·Öğrenme.
- **"Şimdi" özeti (ADR-040):** Profil üstünde, YALNIZ canonical health (tek fetch reuse; sahte sayı yok): yayına hazır/karar bekleyen/aktif plan/sistem sinyali.
- **Topbar:** sticky 52px; breadcrumb + Cmd+K arama + sağlık göstergesi (yalnız müdahale-gereken; ADR-014).
- **Profil menüsü:** CemOS'un bildikleri · Entegrasyonlar · Sistem · Maliyet · Ayarlar · Çıkış.

## 8. Command palette (Cmd/Ctrl+K)

Global: nav (3 görev + alt-görünüm + advanced), oluştur (yeni taslak/plan slotu/kaynak ekle), ara (Kütüphane geneli), **ayrı "CemOS'a sor" grubu** (Notion Cmd+K vs Cmd+Shift+K ayrımı — sor navigasyonla aynı ranked liste içinde yarışmaz; Faz 1'de stub/"yakında", gerçek asistan Faz 2). Boş palette'te "Son kullanılanlar"; boş grup başlıkları gizlenir; subsequence fuzzy; nested alt-menüde breadcrumb.

## 9. Beş durum (her veri yüzeyi)

loading (skeleton >500ms) · empty (başlık + açıklama + tek opsiyonel aksiyon; error'dan görsel ayrı) · error (retry) · **stale** (sessiz gösterge + göreli zaman; error değil — AI'ın eskiyen veriden ürettiği için kritik) · success. + **blocked-external** (dış credential/izin/ödeme engeli; açık Türkçe neden + tek recovery).

## 10. Focus / klavye / motion / responsive

- **Focus:** `:focus-visible` her zaman accent ring (`--ring-focus 0 0 0 3px var(--accent-tint-strong)`); görünür, her interaktif element.
- **Klavye:** ana akış tam klavye; A/E/J/K tek-el erişilebilir (araştırma: Superhuman iki-el eleştirisi — audit). Drawer/sheet: focus trap + return + explicit close.
- **Motion:** yalnız transform/opacity/filter; `--ease-out cubic-bezier(0.16,1,0.3,1)`; enter ease-out / leave ease-in; `prefers-reduced-motion` global kill (zorunlu). Bounce/elastic YASAK (AI-slop).
- **Responsive (DESKTOP-ONLY, ADR-020):** birincil **1280/1440/1920**, minimum graceful **1024**; **1024–1920 yatay taşma YOK**; geniş içerik `overflow-x:auto`. İçerik genişliği varyantları: reading 960 / standard 1080 / wide 1280 (shell ekran-bazlı; hiçbir ekran 1920'ye yayılmaz). **Mobil = best-effort compatibility** (MobileNav + ≤640 responsive kod korunur ama kabul kriteri değil; 390 screenshot alınmaz). _Tarihsel:_ eski ≤640 bottom-nav + non-dismissible mobil publish notu tasarım kaydı olarak kalır, implementasyon zorunluluğu değildir.

## 11. Hardcoded-koyu → token stratejisi

Faz 1A: `src/components` genelinde literal hex/rgba grep (`#0`,`#1`,`#2`,`rgba(2[0-9]`,`bg-\[#`) → token. `theme-tokens.test.ts` BANNED listesi koyu-dönem literalleriyle (`#151515`,`#8b5cf6`,`#ff5538`) güncellenir (regresyon koruması yön değiştirir). Her primitive açık temada WCAG AA kontrast + focus ring görünürlük geçişinden geçer; screenshot kanıtı.

## 12. Açık maddeler
- ~~Accent kullanıcı onayı~~ → **KAPANDI: Terracotta `#A8481F` seçildi (ADR-017).**
- ~~Kontrast el-hesabı~~ → **KAPANDI: gerçek WCAG 2.1 relative-luminance ile yeniden hesaplandı (ADR-018); §2b/2c/2d tablolar gerçek oranları taşır; Faz 1A token testi otomatik doğrular.**
- Türkçe glyph per-weight doğrulama (Inter/Newsreader Google Fonts specimen) — Faz 1A font entegrasyonunda.

## 13. Referans hizalama (ADR-021, 2026-07-15) — bağlayıcı ekleme

> Kullanıcı-sağlanan desktop dashboard referansı (bkz. DECISIONS ADR-021). Aşağıdakiler §1-11'i **somutlaştırır** (dark editorial korunur). Kaynak-of-truth = ADR-021.

- **Kontrollü açık-ada token'ları (globals.css :root + @theme mirror):** `--inverse-surface #f2ece1` · `--inverse-surface-2 #e8dfd0` · `--inverse-text #221f1a` · `--inverse-muted #635c51` · `--inverse-border #dbd1bf` · `--peach-surface #f6dcc6` · `--peach-surface-2 #f0cdb0` · `--peach-text #5a3315` · `--peach-muted #6f4d2f` · `--peach-border #e7bf9d`. Gerçek WCAG (`theme-tokens.test`): ada üstü koyu metin ≥4.5:1, adalar relLum>0.5 (dark-kilit istisnası). `--sidebar-w 244`.
- **`Surface` primitive** (`components/ui/Surface.tsx`): `tone="inverse|peach|blocked|default"`; ton renkleri kök'e `--sf-fg/--sf-muted/--sf-sunken/--sf-border` olarak basılır → çocuklar tonu bilmeden token tüketir. `InverseCard`/`PeachCard` sarmalayıcı. Hardcoded hex YOK. **Kural:** açık ada YALNIZ karar/karşılaştırma odağı (ready kart=ivory, needs_edit=peach); kuyruk/ikincil koyu; sayfa light'a çevrilmez.
- **Sidebar:** logo → **hesap bağlam kartı** (`sidebar-account`: avatar + @handle + "Aktif hesap" + `account-switcher`) → Bugün/Plan/Kütüphane. **Aktif nav = nötr grafit dolgu** (`bg-elevated`, `text-primary`); terracotta yalnız ikon vurgusu (`accent-text`) — satır boyanmaz. Genişlik `--sidebar-w`.
- **SubNav = segmented pill rail:** koyu gömük rail (`bg-sunken`, radius-pill) + aktif kapsül (`bg-elevated` + hafif gölge); terracotta yalnız aktif ayrıntı. İkon opsiyonel.
- **PageHeader `size="hero"`** (~28px, açıklama başlık altında) = referans workspace başlığı. AppShell Plan/Kütüphane host'larında: **hero başlık → segmented subnav → gövde** (host `bare`, çift başlık yok). TopStrip slim kalır (breadcrumb ikincil + arama + sağlık sağ üstte).
