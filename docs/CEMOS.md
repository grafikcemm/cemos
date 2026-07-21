# CemOS — Kişisel Üretim Motoru

## 1. CemOS nedir

CemOS, XAgent'tan evrilen kişisel üretim işletim sistemidir. XAgent tek platforma (X) odaklı bir içerik motoruydu; CemOS aynı çekirdeği (kaynak keşfi → LLM konseyi → taslak → manuel yayın → öğrenme) çok platformlu bir mimariye taşır: X, Haber zekâsı, YouTube (Faz C), Instagram (Faz D/E).

## 2. Bilgi mimarisi (IA — rebuild, güncel)

> NOT (2026-07-20, Phase 5E): eski "platform grupları" tablosu (X/Haber/Sistem/
> Instagram/YouTube) ARTİK GEÇERLİ DEĞİL. Güncel IA rebuild ile 3 göreve indi.
> Tek doğruluk kaynağı `src/components/nav/navConfig.ts` (`screenRegistry.tsx` render eder).

Nav = **3 birincil alan + Toolbox (utility) + Profil menüsü**:

| Grup | Ekranlar (screen id) |
|---|---|
| **Bugün** | Sabah panosu (`morning`) |
| **Plan** | Takvim (`plan-takvim`), Fırsatlar (`plan-firsatlar`), Seriler (`plan-seriler`) |
| **Kütüphane** | Tümü (`lib-tumu`), İlham (`lib-ilham`), Öğrenme (`lib-ogrenme`) |
| **Toolbox** | `toolbox` |
| **Profil** (menü) | CemOS'un bildikleri (`profile-memory`), Entegrasyonlar (`profile-integrations`), Sistem (`system`), Maliyet (`costs`), Ayarlar (`settings`) |

**Araştırma-advanced** (ana rail dışı, Fırsatlar/Cmd+K + Araştırma grubundan): `news-pool`,
`youtube`, `flow-radar`, `discovery-engine`, `source-intelligence`. Eski id'ler `TAB_ALIASES`
ile canonical eve çözülür (ör. `instagram`→`plan-seriler`, `daily-queue`→`morning`).

## 3. Çekirdek ilkeler

- **Manuel yayın felsefesi:** Hiçbir platforma API yazma çağrısı yok. Sistem okur, analiz eder, taslak üretir; gönderme kararı ve eylemi her zaman insandadır.
- **Bütçe disiplini:** Tüm LLM çağrıları `generateJson({role})` üzerinden; her amaç `UsageLog.meta.purpose` yazar. `usageService.getMonthlySpendByPurpose(prefix)` purpose-bazlı aylık tavan gate'lerinin temelidir (örn. `"yt_"` → tüm YouTube harcaması).
- **Additive-only DB:** Şema değişiklikleri ekleme + default'lu olur; `prisma db push` prod'da güvenli kalır.
- **Vercel Hobby cron limiti:** Hobby gerçekte proje başına ~100 cron'a kadar izin verir (eski "2-cron" notu yanlıştı), günde-1 sıklıkla. Sabah taslak üretimi `0 4 * * *` `/api/cron/generate-morning` cron'una ayrıldı — generation İLK çalışır, kendi `deadlineMs` bütçesinde, `try/finally` ile terminal CronRun. `/api/cron/daily` News/IG/CI'yi deadline'lı stage olarak tutar + dailyMax-guard'lı backfill generation yapar.
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

## 7. Güvenlik sınırı (SEC-02)

CemOS **tek-operatör** bir uygulamadır — User/Workspace tablosu yoktur.
Erişim sınırı şu katmanlarla sağlanır:

- **Uygulama-içi "Sign in with Vercel" (OIDC) kapısı (ADR-049, GÜNCEL; ADR-013/017 parola
  kimliğini supersede eder).** `src/proxy.ts` (Next 16 proxy, Node runtime) tüm yolları
  `SESSION_COOKIE` doğrulamasının arkasına alır — geçerli session yoksa sayfa→`/giris`,
  `/api/*`→401. Kimlik Vercel IdP'den gelir: `/api/auth/authorize` (PKCE+state+nonce) →
  Vercel consent → `/api/auth/callback` (token exchange + `/userinfo` + **allow-list
  `AUTH_ALLOWED_VERCEL_USERS`, FAIL-CLOSED**) → yalnız başarılıysa `cemos_session`
  HMAC-SHA256 imzalanır (`SESSION_SECRET`, 30g TTL; `src/lib/auth/session.ts`). Parola YOK;
  Vercel access/refresh token'ları saklanmaz. Prod'da `SESSION_SECRET` yoksa **fail-closed**.
  Allow-list route'ları: `/giris`, `/api/auth/*`, `/api/cron/*`. → Uygulama anonim
  ziyaretçiyi KENDİ İÇİNDE bloklar. **Neden uygulama-içi:** Vercel Deployment Protection
  "All Deployments" (production domain koruması) Pro/Enterprise gerektirir; Hobby'de
  production public kalır → OIDC kapısı authentication authority'dir (ADR-049).
- **Cron uçları** `CRON_SECRET` bearer ile korunur (`isCronAuthorized`, prod fail-closed).
- **Mutation uçları** `isOperatorOrCronAuthorized` ile CSRF-sınıfı korumadadır
  (same-origin / Origin-host / cron bearer). Bu **kimlik doğrulama değil**, "üçüncü
  taraf sayfa, ziyaretçi tarayıcısı üzerinden bütçemizi harcayamaz" garantisidir;
  header forge eden curl'ü bilinçli olarak bloklamaz.
- **Entegrasyon token'ları** (Meta vb.) `IntegrationCredential.value` içinde
  `CREDENTIAL_ENC_KEY` ile **AES-256-GCM** şifreli saklanır (SEC-03).

> Operasyon notu: prod'u herkese açık bir URL'de Deployment Protection olmadan
> yayınlama. Gerekirse private network / paylaşılan-gizli bir middleware kapısı
> eklenebilir (tek-operatör invariant'ını bozmadan).
