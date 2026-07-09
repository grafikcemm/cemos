# CemOS DESIGN.md — Dark Dashboard Görsel Dili

> Tarih: 2026-07-09 (Sprint 9 UI dalgası). Tek doğruluk kaynağı:
> `src/app/globals.css` token seti + `src/components/ui/` primitive'leri.
> Bu belge sistemi TANIMLAR; yeni yüzey eklerken buradan sapma.

## 1. Yön

**Soft-premium dark dashboard.** Mor-nötr near-black zemin üzerinde lavanta
birincil accent + şeftali ikincil accent. Kurumsal SaaS şablonu DEĞİL:
editöryal ritim (geniş gutter, 80px section boşluğu), yumuşak büyük köşeler,
katmanlı yumuşak gölgeler, tabular-nums metrikler.

## 2. Token sözleşmesi (globals.css `:root`)

| Katman | Token'lar |
|---|---|
| Yüzey rampası | `--bg-base #0b0b0d` → `--bg-sunken` → `--bg-surface #131316` → `--bg-elevated #1a1a1e` → `--bg-hover`; sidebar `--bg-rail #0d0d10` |
| Metin | `--text-primary #f5f5f7` / `--text-secondary #a0a0ab` / `--text-muted #6e6e78` / `--text-faint` |
| Kenarlık | beyaz-opaklık: `--border` (0.08) / `--border-strong` (0.16) / `--border-faint` (0.04) |
| Birincil accent | LAVANTA `--accent #b8a8f0`; dolgu üstünde metin `--accent-fg #100f16` (**KOYU — beyaz asla**); tint'ler `--accent-tint-05..30` |
| İkincil accent | ŞEFTALİ `--accent-2 #f0c4a8` — yalnız AI/"üret" affordance + sıcak grafik serisi |
| Semantik | `--status-ok #7fce9e` / `--status-warn #e6b566` / `--status-error #e5688a` / `--status-info #8fb8ff` |
| Chart | `--chart-1..4` (lavanta/şeftali/mavi/yeşil) + `--chart-grid/axis` |
| Radius | sm 8 / md 11 / lg 16 (kart-tablo) / xl 18 / 2xl 22 / pill |
| Tipo | Inter gövde+display, IBM Plex Mono kod; başlık ağırlığı **600 (700 yasak)**; eyebrow uppercase tracked 500 |
| Motion | `--ease-out` cubic-bezier(0.16,1,0.3,1); `.rise` giriş animasyonu; yalnız transform/opacity; `prefers-reduced-motion` global kill |
| Elevation | `--shadow-card/sm/md/lg/pop/modal` + `--highlight-top` inset; focus `--ring-focus` (a11y zorunlu) |

## 3. Sert kurallar

1. **Off-token hex YASAK.** Renk = token. Doygun accent dolgu üstü metin =
   `--accent-fg` (`#000`/`#fff` literal yazma). Mavi = `--status-info`
   (`#3b82f6`/`#1d9bf0` legacy — Sprint 9'da temizlendi).
2. **Sayfaya özel tema** yalnız kapsamlı alt-ağaç değişkenleriyle (örn.
   `.news-warm` → `--nw-*`); global token'ları ezmez.
3. Her ekran `src/components/ui/` primitive'lerinden kurulur:
   `PageScaffold`/`PageHeader`/`SectionHeader` iskelet; `Card`/`EntityCard`/
   `MetricCard`+`MetricGrid` içerik; `Table`; `Badge`/`StatusBadge`;
   `Button`/`IconButton`; `Input`/`Textarea`/`Select`/`Toggle` form;
   `EmptyState`/`ErrorState`/`Skeleton` durumlar; `Drawer`/`DetailPanel`/
   `Toast`/`Tooltip` overlay; `SubNav`/`FilterBar` navigasyon.
4. **4 durum zorunlu** her veri yüzeyinde: loading (`Skeleton`), empty
   (`EmptyState` — error'dan FARKLI), error (`ErrorState` + retry), success.
5. Metrik/skor/maliyet = `.tnum`. Kod/teknik string = `--font-mono`.
6. Mobil: 640px altında sidebar → drawer; `--space-page-x` 16px'e iner;
   320-390px yatay taşma yasak.
7. Klavye: `:focus-visible` ring her interaktifte; Cmd/Ctrl-K komut paleti
   (Sprint 9); Bugün kartlarında A/E/J/K.

## 4. Shell anatomisi

- **Sidebar** (`--bg-rail`): 5 birincil alan (Bugün/Twitter/Instagram/
  Kütüphane/Youtube, lucide ikonlu) + Araçlar utility kümesi (Toolbox/
  Maliyetler/Sistem/Ayarlar). Aktif öğe: lavanta ghost tint + accent-text.
- **TopStrip** (sticky, `--surface-overlay` blur): alan alt-sekmeleri (SubNav)
  + sistem durumu rozeti.
- **İçerik**: `--space-page-x` gutter, `--space-page-top` üst boşluk,
  kartlar arası `--stack`.

## 5. Bileşen dili

- **Kart**: `--bg-surface` + `--border` + `--radius-lg` + `--shadow-card` +
  `--card-pad`; hover'da `translateY(-2..3px)` + `--border-strong`.
- **Birincil buton**: lavanta dolgu, `--accent-fg` metin, `--radius-md`,
  rest `--glow-cyan` inset, hover `--shadow-accent`.
- **İkincil/ghost**: transparan + `--border`, hover `--bg-hover`.
- **Tehlike**: `--danger` yalnız geri-alınamaz eylemde.
- **Tablo**: başlık `--text-muted` uppercase xs tracked; satır ayırıcı
  `--border-faint`; hover `--bg-hover`; sayısal kolon `.tnum` sağa.
- **Badge**: pill, tint zemin + durum rengi metin; asla doygun dolgu.
- **Boş durum**: ikon + tek cümle + (varsa) tek eylem; "veri yok" ile "hata"
  asla aynı görünmez.

## 6. Motion

Giriş: `.rise` (0.34s ease-out, translateY 8px→0). Liste stagger ≤ 60ms/öğe.
Hover geçişleri 0.16-0.2s. Enter = ease-out, leave = ease-in. Yalnız
transform/opacity/filter. `prefers-reduced-motion: reduce` → animasyon ölür
(globals.css global kuralı — yeni animasyonlar otomatik kapsanır).
