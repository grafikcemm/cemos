# later.md — Sprint 1 sırasında bulunan, kapsam DIŞI bırakılan işler

> FIRST-SPRINT §4 gereği: yeni fikir kodlanmaz, buraya not düşülür.

## Dalga 2+ model migration
- ~68 raw `generateJson` çağrısı duruyor (growth-engine draft-generator/scorer AI yolu,
  voiceProfileService, learn/youtube/instagram servisleri). Dalga 1 yalnız
  writer/judge/news-extract'ı taşıdı.
- Eval standı (`generateDrafts`) hâlâ growth-engine motorunu kullanıyor — Sprint 2
  eval-parity işinde tek motora bağlanmalı.
- `openrouter.ts getFallbackModels` içindeki legacy (gemini-2.5/gpt-4o) zincirleri eski
  env-override kurulumları için duruyor; dalga 2 sonrası temizlenebilir.

## Veri/şema (migration gerektirir — Sprint 1'de yasaktı)
- ViralPattern'a kalıcı `embeddingJson` kolonu: şu an pattern embedding'i sorgu-anında
  üretilip process-içi cache'leniyor (item 14 fix'i). Kalıcı kolon embed maliyetini
  tamamen sıfırlar.
- FeedbackEvent'e ayrı `editDistance` kolonu: şu an `reason` JSON merge'ünde yaşıyor
  (geriye uyumlu ama sorgulanabilir kolon daha temiz).

## Kalite motoru
- Off-persona tespiti deterministik fallback'te ilkesel olarak zayıf (keyword'süz
  off-persona yakalanamıyor) — batched karşı-aile judge (V1) çözer; golden set
  bad-direct setinden bu arketip çıkarıldı, generation testlerindeki
  `personamatch >= 60` kapısı kapsıyor.
- `TURKISH_NATURALNESS_MIN = 55` sabiti ilk gerçek hafta verisiyle kalibre edilmeli.
- CostsTab preset-bazlı harcama dökümü (FINAL-OPENROUTER-ROUTING kabul maddesi,
  görünüm işi) — UsageLog.meta.preset alanı Wave 1'den beri yazılıyor, UI bekliyor.

## Bugün yüzeyi (V1 UX)
- Klavye kısayolları A/E/J/K + Cmd/Ctrl-K komut çubuğu (FINAL-UX-SPEC, V1).
- `/api/settings/operator-readiness` lokalde yavaş (Neon pool baskısı altında timeout
  → sayaç "durum alınamadı" gösteriyor). Endpoint'in sorgu sayısı azaltılabilir /
  cache'lenebilir.
- "Tepki vermeye değer" içindeki üç highlight bileşeninin iç limitleri (5/3/3) spec'in
  "~3 öğe" hedefine indirilebilir; şimdilik bölüm varsayılan katlanmış.

## Operasyonel
- `account-profiles.ts` silme: Sprint 2, eval-parity sonrası (9 tüketici kaldı).
- Neon connection pool: lokal dev + script'ler aynı anda çalışınca pool timeout
  görülüyor; script'lere tek-bağlantı datasource/pgbouncer düşünülebilir.
- CI pipeline yok — `typecheck`/`test`/`eval:run` gate'leri şimdilik lokal disiplin.
