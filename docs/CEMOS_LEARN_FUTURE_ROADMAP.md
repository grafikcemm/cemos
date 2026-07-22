# CemOS Learn — Future Roadmap (v2+)

MVP = dikey dilim: URL → grounded pack (özet + kavram + flashcard + quiz + QA) →
review → mastery → due. Aşağıdakiler bilinçli ertelendi.

## v2 — Pack derinliği
- **Concept graph kenarları** (`LearnConceptEdge` tablosu + ilişki tipleri) ve hafif
  SVG/force görselleştirme. Pipeline `graph` aşaması şu an passthrough; stage'i aç,
  `PIPELINE_VERSION` bump.
- **Yapılandırılmış notlar ağacı** (ana fikir / destek / tanım / örnek / yöntem / uygulama
  adımları / tartışmalı iddia) — `notes` aşaması passthrough'tan çıkar, `LearnPack.notesJson`
  zenginleşir.
- **Uygulama görevleri** (`tasks` aşaması) — bugün/bu hafta/gözlem/deney görevleri.

## v2 — Entegrasyonlar (kullanıcı-onaylı, otomatik yazma YOK)
- `LearnTransferSuggestion` tablosu + `integration_suggestions` aşaması.
- Adapter'lar: News AI (`ContentOpportunity`), Knowledge Base (`ToolboxResource`/`PromptTemplate`),
  Feed The Goat (snapshot read-only → write API gelince). `POST /api/learn/transfer/[id]/approve`
  tek outbound yazma yolu, same-origin guard + explicit onay.

## v2 — Öğrenme kalitesi
- Performansa dayalı soru çeşitlendirme (aynı kavramı farklı formatla test).
- Lapse-temelli yoğun tekrar; FSRS'e geçiş değerlendirmesi (ladder yeterli olmazsa).
- Düşük güvenli içerik için kullanıcı düzeltmesi → sonraki üretime feedback.

## Kapsam dışı (gerekçesi prompt §12)
Mobil app, Chrome extension, playlist toplu işleme, otomatik YouTube geçmişi,
sosyal özellikler, public marketplace, gelişmiş gamification, abonelik, gerçek zamanlı
ortak çalışma, otomatik video indirme.

## Çok-kullanıcıya geçiş (auth gelince)
`LearnSource.userId` zaten mevcut (nullable). Adımlar: auth ekle → `userId` backfill →
repo sorgularına `userId` filtresi → (Supabase'e geçilirse) RLS. Non-destructive.
