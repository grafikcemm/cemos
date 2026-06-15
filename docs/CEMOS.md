# CemOS — Kişisel Üretim Motoru

## 1. CemOS nedir

CemOS, XAgent'tan evrilen kişisel üretim işletim sistemidir. XAgent tek platforma (X) odaklı bir içerik motoruydu; CemOS aynı çekirdeği (kaynak keşfi → LLM konseyi → taslak → manuel yayın → öğrenme) çok platformlu bir mimariye taşır: X, Haber zekâsı, YouTube (Faz C), Instagram (Faz D/E).

## 2. Platform grupları

Nav, platform gruplarına ayrılmıştır (`src/components/nav/navConfig.ts` tek doğruluk kaynağı):

| Grup | İçerik |
|---|---|
| **Bugün** (direkt) | Sabah panosu — günün operasyonu |
| **X** | Keşif Motoru, Günlük Kuyruk, Viral Radar, Kaynaklar, Kaynak Zekası, Pattern Kütüphanesi |
| **Haber** | Haber Havuzu, İçerik Radarı, Repo Radarı, AI Sıralama, Toolbox, Prompt Kütüphanesi, Kütüphane |
| **Sistem** | Maliyetler, Ayarlar, Haftalık Öğrenme Raporu, Eğitim Merkezi |
| **Instagram** | `hidden: true` — Faz D açar |
| **YouTube** | `hidden: true` — Faz C açar |

## 3. Çekirdek ilkeler

- **Manuel yayın felsefesi:** Hiçbir platforma API yazma çağrısı yok. Sistem okur, analiz eder, taslak üretir; gönderme kararı ve eylemi her zaman insandadır.
- **Bütçe disiplini:** Tüm LLM çağrıları `generateJson({role})` üzerinden; her amaç `UsageLog.meta.purpose` yazar. `usageService.getMonthlySpendByPurpose(prefix)` purpose-bazlı aylık tavan gate'lerinin temelidir (örn. `"yt_"` → tüm YouTube harcaması).
- **Additive-only DB:** Şema değişiklikleri ekleme + default'lu olur; `prisma db push` prod'da güvenli kalır.
- **Vercel Hobby 2-cron limiti:** Yeni cron girdisi asla eklenmez; yeni sync işleri mevcut daily/learn cron'una deadline'lı stage olarak girer.
- **Tüm UI Türkçe.**

## 4. Veri modeli — platform attribution

`Account`, `UsageLog`, `FeedbackEvent`, `PublishLog` modellerinde `platform String @default("x")` alanı vardır. Bu alan maliyet, geri bildirim ve yayın kayıtlarının hangi platforma ait olduğunu işaretler; Faz F'nin platformlar-arası öğrenme çekirdeği bu etikete dayanır.

## 5. Faz haritası

- **B (bu faz):** Rebrand + nav grupları + platform alanları + bütçe helper'ı ✅
- **C:** YouTube Fırsat Motoru — 21 rakip kanal, outlier skoru, tam Türkçe prodüksiyon briefi
- **D:** Instagram yorumları — Meta kurulum rehberi, çeviri/niyet sınıflandırma, çift dilli yanıt taslakları
- **E:** Instagram DM + günlük istatistik snapshot'ı
- **F:** Öğrenme çekirdeği v2 — platformlar-arası birleşik öğrenme, platform-özel engagement formülleri
- **G:** Subagent ağacı standardizasyonu — config-driven council + pipeline izi

## 6. İsimlendirme sözleşmesi

Marka her yerde **CemOS**; kod içi legacy semboller bilinçli korunur:

| Legacy | Neden korunur |
|---|---|
| `useXAgentStore` | 13+ tüketici; `export const useCemOsStore = useXAgentStore` alias'ı var — yeni kod alias'ı kullanabilir |
| localStorage `"xagent-store"` | Rename = tüm kullanıcı UI state'inin kaybı; kullanıcıya görünmez |
| `XAgentApp.tsx`, `src/store/xagent.ts` | Dosya adı değişikliği kazançsız churn |
| HTTP User-Agent kimlikleri (`grafikcem-xagent/1.0` vb.) | Dış servislere karşı fonksiyonel tanımlayıcı |
