# Meta (Instagram) Kurulum Rehberi — CemOS Faz D

Bu rehber, CemOS'un Instagram **yorumlarını** çekip Türkçe'ye çevirebilmesi ve yanıt taslakları üretebilmesi için gereken Meta Graph API erişimini **geliştirici modunda** (App Review GEREKMEZ — yalnız kendi hesabın) kurar.

> **Felsefe:** CemOS hiçbir şeyi senin yerine GÖNDERMEZ. Sadece yorumları okur, çevirir, taslak hazırlar. Sen kopyalar, Instagram'dan kendin gönderirsin. Yazma izni istemiyoruz.

> **Süre:** ~20-30 dk. Token 60 gün geçerli; CemOS uygulama içinden tek tıkla yeniler (redeploy gerekmez).

---

## Ön Koşul

- Bir Instagram hesabı (yorumlarını yöneteceğin hesap — @grafikcem).
- Bir Facebook hesabı (Meta geliştirici paneli için).

---

## Adım 1 — Instagram'ı Professional (İşletme/Creator) yap

1. Instagram uygulaması → **Ayarlar → Hesap türü ve araçlar → Profesyonel hesaba geç**.
2. **İşletme** (Business) veya **Creator** seç. (İkisi de yorum API'sini destekler.)
3. Bir kategori seç, tamamla.

## Adım 2 — Facebook Sayfası oluştur ve Instagram'ı bağla

Instagram Graph API, IG hesabına **bir Facebook Sayfası üzerinden** erişir. Sayfa görünmez bir köprüdür; içerik paylaşman gerekmez.

1. [facebook.com/pages/create](https://facebook.com/pages/create) → basit bir Sayfa oluştur (örn. "Grafikcem").
2. Instagram uygulaması → **Ayarlar → Hesap → Bağlı hesaplar / Sayfa bağla** → bu Facebook Sayfasını bağla.
   - Alternatif: Facebook Sayfası → **Ayarlar → Bağlı hesaplar → Instagram** → bağla.

## Adım 3 — Meta geliştirici uygulaması oluştur

1. [developers.facebook.com](https://developers.facebook.com) → giriş yap → **My Apps → Create App**.
2. Uygulama türü: **Business**.
3. İsim ver (örn. "CemOS"), oluştur.

## Adım 4 — Use case ekle

> Meta paneli artık "Add Product" yerine **use case** modeli kullanıyor.

Uygulama paneli (Dashboard) → **Add use cases**:

- **"Manage messaging & content on Instagram"** use case'ini ekle ve customize et.
  Bu TEK use case, CemOS'un ihtiyacı olan tüm izinleri kapsar:
  `instagram_basic` + `instagram_manage_comments` + `instagram_manage_messages`.
  Ayrı bir "Messenger" ürünü/use case'i GEREKMEZ.
- Dashboard'daki diğer maddelere (Marketing API, Audience Network, Business
  verification, App Review, "publish your app") DOKUNMA — bunlar public yayın
  içindir; dev modda kendi hesabın için gerekmez. App **Unpublished** kalabilir.

## Adım 5 — Kendi hesabını uygulamaya rol olarak ekle (Dev Mode)

Geliştirici modunda uygulama yalnızca **rol verilmiş** hesaplara erişir — bu yüzden **App Review GEREKMEZ**.

1. Uygulama paneli → **App Roles → Roles → Add People**.
2. Kendini **Administrator** (veya Tester) olarak ekle, Facebook hesabınla onayla.

## Adım 6 — İzinleri ve ilk token'ı al (Graph API Explorer)

1. Uygulama paneli → **Tools → Graph API Explorer**.
2. Sağ üstte **uygulamanı** seç.
3. **Permissions** alanına şu izinleri ekle:
   - `instagram_basic`
   - `instagram_manage_comments`
   - `instagram_manage_messages` (Faz E / DM için — şimdiden ekle)
   - `pages_show_list`
   - `pages_read_engagement`
4. **Generate Access Token** → Facebook'la onayla. Bu **kısa ömürlü** (~1-2 saat) bir token verir. Bir sonraki adımda 60 güne çevireceğiz.

## Adım 7 — Kısa token'ı uzun ömürlü (60 gün) token'a çevir

Bir terminalde (`APP_ID`, `APP_SECRET`, `KISA_TOKEN` yerlerini doldur):

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=KISA_TOKEN"
```

> `APP_SECRET`: Uygulama paneli → **Settings → Basic → App Secret** (Show).

Yanıttaki `access_token` değeri senin **60 günlük** token'ın — bunu `META_ACCESS_TOKEN` olarak kullan. (`expires_in` saniyedir; ~5.184.000 = 60 gün.)

## Adım 8 — Instagram User ID ve Page ID bul

```bash
# Sayfalarını ve bağlı IG hesabını getir (UZUN_TOKEN = Adım 7'deki 60 günlük token):
curl -s "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=UZUN_TOKEN"
```

Yanıtta:
- `id` → Facebook **Page ID** (`META_PAGE_ID`).
- `instagram_business_account.id` → Instagram **User ID** (`META_IG_USER_ID`).

## Adım 9 — Ortam değişkenlerini gir

`.env.local` (lokal) **ve** Vercel → Project → **Settings → Environment Variables** (prod) altına ekle:

```bash
META_APP_ID="123..."             # Settings → Basic → App ID
META_APP_SECRET="abc..."         # Settings → Basic → App Secret
META_IG_USER_ID="178..."         # Adım 8
META_PAGE_ID="101..."            # Adım 8
META_ACCESS_TOKEN="EAAG..."      # Adım 7 (60 günlük)
# Opsiyonel:
META_GRAPH_VERSION="v21.0"       # varsayılan v21.0; Graph sürümü değişirse güncelle
IG_MONTHLY_BUDGET_USD="1.5"      # aylık IG LLM tavanı (varsayılan 1.5)
```

> Vercel'e ekledikten sonra bir kez yeniden deploy et (env runtime'a girsin). İlk token DB'ye Adım 10'da girer; **sonraki yenilemeler redeploy gerektirmez** (CemOS token'ı `IntegrationCredential` tablosunda saklar).

## Adım 10 — Doğrula

1. CemOS → **Instagram → Yorumlar** sekmesi. "Kurulum gerekli" yerine sekme açılır.
2. **Sync** butonuna bas → son gönderilerin yorumları çekilir, Türkçe'ye çevrilir, önceliklendirilir.
3. Üstte **token sağlık** bandı: "Token N gün geçerli".

---

## Token Yenileme (60 günde bir)

Token süresi dolmadan önce CemOS uyarır (**<10 gün sarı**, **<3 gün kırmızı** bant). Yenilemek için:

- **Instagram sekmesi → "Token Yenile"** butonu. Tek tık; yeni 60 günlük token DB'ye yazılır. **Redeploy gerekmez.**

> Token **tamamen** süresi dolarsa yenileme çalışmaz (Meta kuralı) — bu durumda Adım 6-7'yi tekrarlayıp yeni `META_ACCESS_TOKEN`'ı Vercel env'e gir. Bu yüzden uyarı 10 gün önceden başlar.

---

## Sorun Giderme

| Belirti | Neden / Çözüm |
|---|---|
| Sekmede "Kurulum gerekli" | `META_IG_USER_ID` / `META_APP_ID` / `META_APP_SECRET` veya token eksik. Adım 9. |
| Sync boş dönüyor | Facebook Sayfası ↔ Instagram bağlantısı kopmuş olabilir (Adım 2). `pages_show_list` izni eksik olabilir (Adım 6). |
| `(#190) access token expired` | Token süresi dolmuş → "Token Yenile"; dolduysa Adım 6-7. |
| `(#10) permission` hatası | İzinlerden biri eksik (Adım 6) veya hesabın app rolünde değil (Adım 5). |
| Yorum sayısı az | API yalnızca son gönderilerin yorumlarını çeker; silinen yorumlar atlanır (normal). |

---

İlgili: [CEMOS.md](CEMOS.md) (vizyon). Faz E (DM + istatistikler) bu token'ın `instagram_manage_messages` iznini kullanır — bu yüzden Adım 6'da şimdiden ekledik.
