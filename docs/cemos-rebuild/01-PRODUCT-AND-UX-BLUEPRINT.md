# 01 — Product & UX Blueprint

> CemOS'un 3-görevli ürün mimarisi, günlük akış, provenance haritası ve aksiyon hiyerarşisi. Kaynak: master prompt vizyonu + tasarım araştırması + mevcut kod.

## 1. Ürün tek cümlede

CemOS, Ali Cem'in her sabah açıp **hazır içeriği görüp kısa kontrolle onaylayıp paylaştığı**, planını yaptığı ve bilgisini biriktirdiği kişisel içerik OS'u. Dashboard değil — **karar aracı**.

## 2. Üç görev (ana nav)

| Görev | Kullanıcı sorusu | Ne yapar |
|---|---|---|
| **Bugün** | "Bugün ne paylaşayım?" | Hazır X içeriği karar kuyruğu; kaynak+neden+güven gör, onayla/paylaş |
| **Plan** | "Sırada ne var, ne üreteceğim?" | Takvim (yayın planı) · Fırsatlar (seçilmiş trend/rakip) · Seriler (carousel/reels DNA) |
| **Kütüphane** | "Ne biliyorum, neyden ilham aldım?" | Tümü (birleşik arama) · İlham (rakip analizi/boards) · Öğrenme (YouTube/NotebookLM→bilgi) |

+ **Toolbox** (hızlı utility, ana nav yanında) + **Profil** (CemOS'un bildikleri, Entegrasyonlar, Sistem, Maliyet, Ayarlar).

## 3. "10 saniye" hedefi

Ali Cem uygulamayı açtığında ilk viewport'ta görür: **tarih + "N içerik hazır" + sıradaki içeriğin kendisi** (metin, kaynak, neden bugün, güven). Ne yapacağını okumaya gerek kalmadan anlar: oku → onayla/düzenle → paylaş. Sistem/agent/model/maliyet ilk viewport'ta YOK.

## 4. Günlük birincil akış (≤3 adım)

```
1. Aç → Bugün: "2 içerik hazır", sıradaki kart (NEXT UP) önde
2. Oku → Neden bugün? + kaynak + güven çipi + sinyaller; gerekiyorsa Düzenle
3. Karar → readiness=ready ise **"X'te aç"** (intent); needs_edit ise düzenle; blocked ise neden
   → X'te açıldıktan sonra kart `publish_prepared` → geri dönünce **"Paylaşıldı olarak işaretle"**
   → sonraki karta geç (J), kuyruk boşalınca "Bugünlük bitti ✓"
```
*Mevcut ürün durumu (X API ödemesi onaylanmadı, ADR-017): ready kartın birincil CTA'sı **"X'te aç"**. "Onayla ve yayınla" yalnız gerçek X API adapter'ı bağlı+ödeme onaylıyken görünür (şu an yok). İnsan onayı her yolda zorunlu; CemOS'ta otomatik yayın YOKTUR — intent açmak yayınlandı sayılmaz, kullanıcı "Paylaşıldı olarak işaretle" ile doğrular.

## 5. Provenance haritası — "Neden bugün?" ve doğrulama nereden gelir

`whyToday.ts` (pure) QueueItem provenance'ından türetir (Faz 1 şema değişikliği yok):

| Alan | Kaynak | Not |
|---|---|---|
| Neden bugün? | `NewsItem` (title/source/publishedAt/buzzScore) VEYA `SourcePost` (mined viral örnek) | mining-mode taslakta jenerik olabilir → additive kolon Faz 2 adayı |
| Kaynaklar | `NewsItem.url`+source / `SourcePost` handle+url / `WebsiteVerification` | link + doğrulama tarihi |
| Doğrulama durumu | `WebsiteVerification` varsa `verified`/`partially_verified`; yalnız provenance varsa `source_available`; yoksa `unverified`; expiry geçmişse `stale` | **kaynak varlığı ≠ fact-check**; `SourcePost.scannedAt` iddia doğrulama tarihi DEĞİL (ADR-012) |
| Sinyaller | `QueueItem.scores` (hookStrength/turkishNaturalness/novelty/personaMatch/risk/leaks) | tek "viral puan" YOK — ayrık |
| Alternatif hook'lar | `candidatesJson` | drawer |
| Originality | 7g near-dup (`isNearDuplicate`) | drawer |
| Audit izi | `GenerationRun` + pipeline trace | drawer, teknik detay |
| Model/maliyet | `UsageLog` | drawer, en altta katlanmış |

## 6. Readiness ↔ aksiyon hiyerarşisi (Bugün kartı)

| readiness | Kart ana yüz | Birincil aksiyon | İkincil |
|---|---|---|---|
| `ready` | yeşil "hazır" çipi | **X'te aç** (intent) → prepared → **Paylaşıldı olarak işaretle** | Düzenle · Kaydet · Görsel üret |
| `needs_edit` | kehribar "düzenleme gerekli" + Türkçe nedenler | **Düzenle** (publish düzenlenene dek kilitli) | X'te aç · Kaydet |
| `blocked` | kırmızı neden (güvenlik/doğruluk/kaynaksız iddia) | (publish gizli) neden + kaynak | Düzenle |

## 7. Plan görevi akışı

- **Fırsatlar:** arka plan motorları (haber buzz, YouTube fırsat, viral radar, keşif, rakip radarı) editoryal SEÇİLMİŞ birkaç fırsat sunar (deterministik: buzz×uyum×tazelik). Her fırsat → "İçerik üret" (Bugün'e taslak) veya "Ham araştırmaya in" (advanced ekran) veya "Plana ekle".
- **Takvim:** X/IG/Reels yayın planı (Schedule + ReelPlan); ay=yoğunluk, hafta=önizleme; reels dossier detayı buradan açılır.
- **Seriler:** carousel/reels seri DNA'sı (kapak/hook formülü, slide arketipleri, caption/hashtag düzeni, tekrar yasakları, performans); operatör düzeltir (provenance + onay).

## 8. Kütüphane görevi akışı

- **Tümü:** viral/keyword/prompt/pattern birleşik arama (tür filtresi); X/IG/YT/web/manuel içerik tek yerde.
- **İlham:** kaydedilen rakip içerik → yapısal analiz ("neden çalışıyor / nasıl uyarlanır / ne kopyalanmamalı" + 3 özgün fikir); boards.
- **Öğrenme:** YouTube URL / transcript / NotebookLM metni → Learn Pack (özet, atomik not, kavram, zihin haritası, görev, içerik fikri, tekrar); Inbox/Öğreniliyor/Hazır/Bugünkü tekrar; Obsidian export.

## 9. Erişim + güvenlik akışı

- İlk erişim → `/giris` (tek parola); başarılı → 30g cookie. app-level auth (same-origin ≠ authentication; ADR-013). Cron `/api/cron/*` CRON_SECRET ile ayrı.
- Blocked-external durumları (X ödeme onayı, Meta izni, OpenRouter kredisi) açık Türkçe + tek recovery; sessiz no-op YOK.

## 10. Başarı kriterleri (ürün)

Ana nav yalnız Bugün/Plan/Kütüphane; 10sn'de anlaşılır; hazır içerik ilk viewport'ta; ready içerik zorunlu kozmetik edit olmadan onaya girer; kart'ta kaynak+neden+güven; agent/model/maliyet ana yüzü işgal etmez; 320-1440 taşma yok; klavye+okuyucu ile ana akış; console error 0.
