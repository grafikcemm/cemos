# CemOS Learn — Kararlar + Risk Register

## Mimari kararlar (ve gerekçeleri)

| Karar | Seçim | Neden |
|---|---|---|
| Veri katmanı | **Prisma + Neon** (Supabase değil) | Repo gerçeği; prompt'un Supabase/RLS varsayımı yanlıştı. Additive Prisma modelleri. |
| Auth / izolasyon | **Tek kullanıcı, RLS yok** | CemOS'ta auth yok. `LearnSource.userId?` ileri-uyum kolonu → çok-kullanıcı non-destructive backfill. |
| AI sağlayıcı | **OpenRouter** mevcut katman | `generateJson({role})` + 6-rollü routing yeniden kullanıldı; Anthropic SDK eklenmedi. |
| Agent | **Traced pipeline stage** (`createPipelineTrace`) | Repo'da `AGENT.md` yok; "agent" = Zod-doğrulu stage + PipelineTrace. |
| Background | **Hibrit: client advance + learn cron sweep** | Vercel 2-cron limiti. Yeni slot yok; canlı ilerleme + sekme kapansa da biten pack. |
| Şema doğrulama | **Her stage'e Zod + repair** | openrouter LLM çıktısını doğrulamıyordu (boşluk kapatıldı). |
| QA | **Deterministik grounding kapısı** (LLM judge değil) | chunkIdx menzil/halüsinasyon kontrolü daha güvenilir + ücretsiz. |
| Spaced repetition | **In-house ladder+ease** (FSRS lib yok) | Tek kullanıcı; saf test edilebilir matematik; bağımlılık yükü yok. |
| Transkript | **youtubei.js (zaman-kodlu) + timedtext fallback + manuel** | Mevcut dep; timestamp korunur (grounding şart). |
| Transkript yok | **Sert dur + manuel yapıştır** | Grounding-first ilke; asla ungrounded içerik. |
| MVP kapsam | **Dikey dilim** (özet+kavram+kart+quiz+QA+review+mastery) | graph/notlar/görevler/transfer v2'ye; en küçük uçtan-uca değer zinciri. |
| Cache | `LearnPack @@unique([sourceId, pipelineVersion])` | Aynı video+versiyon yeniden işlenmez (spend yok). |
| Feature flag | `LEARN_ENABLED` + `NEXT_PUBLIC_LEARN_ENABLED` | Dark merge; kapalıyken mevcut sistemler etkilenmez. |

## Risk register

| Risk | Olasılık | Etki | Önlem / fallback |
|---|---|---|---|
| youtubei.js (unofficial) kırılır | orta | orta | timedtext fallback + manuel transkript; fetch ASLA throw etmez (null) |
| Transkript yok (caption yok/yaş-kısıtlı) | orta | orta | validate'te sert dur + net hata + manuel yapıştırma |
| Hallucination (videoda olmayan iddia) | orta | yüksek | chunkIdx grounding zorunlu + deterministik QA kapısı + groundingType etiketi |
| Yanlış timestamp | düşük | orta | QA range kontrolü → flag + coverage düşürür |
| Uzun video maliyeti / 300s aşımı | orta | orta | map-reduce + kısmi persist + `LEARN_MONTHLY_BUDGET_USD` gate (429) |
| İki worker aynı job (cron+client) | düşük | orta | `heartbeatAt` lease; sweep yalnız bayat job'ı alır |
| Duplicate kayıt | düşük | düşük | `@@unique` (source/chunk/pack/job) + replace-key'li yazımlar |
| RLS yok → veri izolasyonu | — | düşük (tek kullanıcı) | `userId?` ileri-uyum; auth gelince backfill |
| Schema validation sürekli fail | düşük | orta | repair pass + sınırlı retry → job `failed` (currentStage korunur, manuel retry) |
| Vendor lock-in (OpenRouter) | düşük | düşük | mevcut routing soyutlaması; rol bazlı model override env'leri |
| Feed The Goat geri-yazma yok | — | düşük | transfer v2 stub; FTG snapshot read-only (kapsam dışı işaretli) |

## Açıkça kapsam dışı (v2)
Concept graph kenarları + görsel graph, notlar ağacı derinliği, uygulama görevleri,
News AI / Feed The Goat / Knowledge Base transfer adapter'ları (kullanıcı-onaylı).
Detay: `CEMOS_LEARN_FUTURE_ROADMAP.md`.
