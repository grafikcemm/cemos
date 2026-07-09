# 19 — Durum ve Kalan İş Mutabakatı (Sprint 9 sonrası)

> Tarih: 2026-07-09. Bu belge FINAL-ROADMAP'in 5-sprint planı ile gerçek uygulamayı
> (Sprint 1-9) mutabık kılar. Ayrıntılı kalan-iş defteri: [later.md](./later.md).
> Çelişkide RESEARCH-SYNTHESIS §5 kazanır.

## 1. Plan vs gerçek

FINAL-ROADMAP 5 sprint tanımladı; uygulama yeniden sıralanıp Sprint 8'e (UI
yüzeyleri) ve Sprint 9'a (kalan-iş kapatma) uzadı. Eşleme:

| Roadmap | Gerçekleşme |
|---|---|
| S1 Bugün + Tek Motor | Sprint 1-2 (eval-parity dahil) |
| S2 Nav + Presets + Memory temeli | Sprint 2-3 |
| S3 Series + IG + Verifier | Sprint 4 |
| S4 Reels Dossier + Eval V1 | Sprint 5 + 7 |
| S5 Aylık Plan + IG Alanı | Sprint 6 + 8 |
| (plan dışı) | Sprint 9: öğrenme döngüsü + CI + kalıcı kolonlar + db push |

## 2. Sprint 9'da kapananlar

- **Neon şema senkron** (P0): Sprint 3-8'in bekleyen tüm additive tabloları push
  edildi; `prisma migrate diff` boş. [USER] db-push blocker'ları kapandı.
- **Performans→hafıza öğrenme döngüsü** (P1): `PublishedPost` →
  `PerformanceSnapshot` (engagement sync, verdict-öncesi) →
  `patternPromotionService` (iki-kapı lessonGate + marka vetosu, learn cron
  Pazartesi). İki bağımsız-inceleme düzeltmesi: orta-band snapshot + yalnız
  karar-verilmiş taslaklarla reject-rate.
- **CI**: lint/typecheck/test/build GitHub Actions gate'i.
- **Kalıcı kolonlar** (P3 no-spend): `FeedbackEvent.editDistance` (kuzey-yıldızı
  sorgulanabilir), `ViralPattern.embeddingJson/embeddingHash` (+ boyut koruması:
  local-fallback sorguda kalıcı vektör kullanılmaz — sessiz-0 önlendi).
- Test: 1147 → 1162 (hepsi yeşil); typecheck/lint/build temiz.

## 3. Kalan — neden bekliyor

| İş | Kapı |
|---|---|
| Batched 14-skor judge entegrasyonu (EVAL14_ENABLED) | Canlı LLM doğrulaması (harcama onayı) + kaynak-metadata threading |
| Legacy emeklilik (draft-generator/critic, scorer/leak absorbe, council→judge) | Modüller CANLI route'lara bağlı (FlowRadar generate-drafts, DailyQueue rescore); önce route repoint + **eval parity canlı koşusu** |
| eval:run --all (4 legacy vaka kararı) | Gerçek OpenRouter harcaması (onay) |
| Embedding A/B (qwen3 vs 3-small) | Kredi koşusu + golden set |
| κ kalibrasyon cron | İnsan-etiketli judge/human çifti birikimi (veri-kapılı) |
| CaptionDna/HashtagDna damıtma servisi | PublishLog birikimi; kod dalga-2 memory işi |
| Verifier Tier-2 (Playwright render) | Ayrı go/no-go spike (C10) |
| UI dalgası: Sistem gözlem ekranı, Cmd-K + A/E/J/K, ay grid, IG alan cilası, Bugün ~3-öğe | Kullanıcı kararı: **en son** |
| [USER] Meta token canlı smoke; Vercel Deployment Protection + secrets | Operasyonel |

## 4. Notlar

- Windows: `next dev` Prisma engine DLL kilidi → `prisma generate` EPERM
  (dev server'ı durdur ya da `next build --webpack`). Linux/Vercel etkilenmez.
- Gerçek pattern promosyonu kod olarak hazır ama **veri birikimi** ister:
  yayın → snapshot → ≥3 destek + anlamlılık. İlk haftalarda no-op normaldir.
