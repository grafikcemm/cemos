# POST-RELEASE-BACKLOG — CemOS

> Bu programın (Release Completion: 5B→5C→5D) kapsamı DIŞINDA kalan "güzel olur"
> maddeleri. Current release'e EKLENMEZ; her biri kısa gerekçeyle burada bekler.
> Kaynak: 5B kararları (ADR-045) + keşif denetimleri.

## Ürün / UI

- **Learn→draft için per-fikir hedef hesap seçici.** Şu an "Taslağa dönüştür" aktif
  kanalı (grafikcem/maskulenkod) hedefler. Gerekçe: çoğu durumda aktif kanal doğru;
  ayrı seçici ek UI yükü. Backlog: fikir kartında hesap dropdown'u.
- **Instagram content_idea → Instagram üretimi (Learn).** 5B-B yalnız X taslağını
  bağladı. Learn paketlerindeki `format:carousel|reel` fikirleri için Seriler/Takvim
  handoff'u eklenebilir (İlham'ın mevcut sözleşmesini izleyerek). Gerekçe: X döngüsü
  önce; IG üretim kapıları (ADR-036) ayrı.
- **Idea modeli (X) için liste yüzeyi.** `/api/ideas` GET'in UI tüketicisi yok;
  `create-draft` route'u programatik/MCP kalıyor. Operatör manuel X-fikir defteri
  isterse: Kütüphane alt-görünümü (yeni top-level DEĞİL). Gerekçe: 5B'de gerçek kaynak
  Learn content_ideas oldu; ayrı Idea-list yeni yüzey = re-home değil.
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

- Orphaned `/api/growth/training-center` GET route (5B-A değeri knowledgeReadModel'e
  taştı → route artık tüketicisiz). 5D: sil VEYA operatör data-table'ı için wire.
- `POST /api/ideas/[id]/create-draft` UI tüketicisi yok (programatik/MCP). 5D: dead-code
  denetimi keep/wire/delete kararı verir.
