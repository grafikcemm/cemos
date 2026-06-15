# 🚀 Operator Mode Kullanım Kılavuzu & Production Runbook

Operator Mode, uygulamanın büyük SaaS karmaşıklığından arındırılarak sadece 2 ana hesap için günlük hızlı içerik operasyonuna odaklanmasını sağlayan özel bir çalışma modudur.

## Target İki Hesap
- `@grafikcem`
- `@maskulenkod`

---

## 📅 1. Günlük Kullanım Akışı (Tahmini Süre: 5-10 Dakika)

Kullanıcının günlük rutini son derece basit ve hatasız tasarlanmıştır:

1. **Uygulamayı Açın:** Tarayıcınızdan `/` veya `/dashboard/daily-queue` sayfasını açın.
2. **Sistem Hazırlık Panosunu Kontrol Edin:** 
   - Sayfanın üstündeki panoda **3/3 taslağın hazır** olduğunu doğrulayın.
   - Profil bilgisinin **"Profil: Operator Quality"** (veya Premium) göründüğünden emin olun. Hiçbir zaman "Dev/Free" görünmemelidir.
3. **Taslağı İnceleyin & Düzenleyin:**
   - 3 hesap için bugünün taze taslaklarını listede görün.
   - Her taslağa tıklayarak sağ tarafta düzenleme çekmecesini açın. İhtiyacınız varsa metni doğrudan düzenleyin ve **💾 Metni Kaydet** butonuna basın.
4. **Kopyala ve X'i Aç:**
   - Çekmecenin en altındaki büyük **🚀 Kopyala ve X'i Aç** butonuna basın.
   - Metin otomatik olarak panoya (clipboard) kopyalanacak, ardından yeni bir sekmede X Tweet penceresi (`https://x.com/intent/tweet`) açılacaktır.
   - *Not: Kopyalama başarısız olursa X penceresi kesinlikle açılmaz, böylece veri kaybı yaşamazsınız. Kopyalama hatası alırsanız sistem size metni seçip kopyalayabileceğiniz açık bir manuel pencere (prompt) gösterecektir.*
5. **X'te Paylaşın:** X'te açılan pencereye metni yapıştırıp gönderin.
6. **Manuel Paylaşıldı Olarak İşaretleyin:**
   - Uygulamaya geri dönün ve mor renkli **✓ Manuel Paylaşıldı** butonuna basın.
   - Taslak aktif listeden düşer, "manuel_published" durumuna geçer ve o günkü göreviniz tamamlanmış olur!

---

## ⚙️ 2. Worker Çalıştırma & Sürekli Otomasyon

Canlı ortamda taze içeriklerin her sabah otomatik taranıp hazır edilmesi için worker sürecinin sürekli çalışması gerekir.

### A. Komut Seçenekleri
- **Local Geliştirme (Tam Paket):** Web arayüzünü ve arka plandaki worker tarayıcısını aynı terminalde başlatmak için:
  ```bash
  npm run dev:operator
  ```
- **Sadece Web Arayüzü:** `npm run dev`
- **Sadece Arka Plan Worker (Önerilen Canlı Dağıtım):** Zamanlanmış paylaşımları ve taramaları sürekli çalıştırmak için ayrı bir terminalde veya PM2 gibi bir proses yöneticisiyle:
  ```bash
  npm run worker
  ```

### B. Worker Stale (Çalışmıyor) Uyarısı
- Eğer sabah uygulamaya girdiğinizde **Bugün 3/3 taslak hazır** ise ancak worker çalışmıyorsa (stale durumundaysa) sistem **Sarı (Warning)** durumuna geçer:
  > **[!IMPORTANT]**
  > *Bugünkü 3/3 taslak hazırsa paylaşım yapılabilir.* Ancak yarın sabah taslakların otomatik olarak hazır olması için worker arka planda sürekli çalışıyor olmalıdır.
- Eğer sabah taze taslaklar hazır değilse hazırlık panosundaki **⚡ Bugünkü Taslakları Üret** butonuna basarak tek tıkla DB backlog postlarından veya SocialData taramasından taze taslakları anında bootstrap edebilirsiniz.

---

## 🚦 3. Sistem Hazırlık Durumları & Çözüm Yönergeleri

Uygulamanın hazırlık panosu 3 farklı duruma göre dinamik renk ve çözüm önerisi gösterir:

1. **🚀 Yeşil (READY):** Her şey mükemmel. 3/3 taslak hazır, model kalitesi yüksek (`operator_quality` veya `premium`), worker aktif çalışıyor.
2. **⚠️ Sarı (READY_WITH_WORKER_WARNING):** 3/3 taslak hazır, paylaşım yapılabilir. Ancak worker pasif. Çözüm: Terminalde `npm run worker` çalıştırın.
3. **❌ Kırmızı (NOT READY):** Eksikler var. Panoda eksiklerin nedeni dinamik olarak listelenir:
   - *API Key Eksikse:* `OPENROUTER_API_KEY` veya `SOCIALDATA_API_KEY` kontrol edin uyarısı.
   - *Model Kalitesi Düşükse (Dev/Free):* "Taslaklar hazır ama kalite profili dev/free" uyarısı verir. Çözüm: Ayarlar sayfasından tek tıkla **⚡ Operator Quality Profiline Geç** butonuna basın.
   - *Bugün Taslak Eksikse:* **⚡ Bugünkü Taslakları Üret** butonuna basın.

---

## 🔍 4. Sistem Kalite & Son Doğrulama Komutları

Uygulamanın production-ready kalitesini ve bütünlüğünü korumak için deploy öncesi aşağıdaki 4 doğrulama komutu sırasıyla çalıştırılmalıdır:

1. **Linter Doğrulaması:** Kod standartlarının ve TypeScript güvenliğinin tam olduğunu doğrulamak için:
   ```bash
   npm run lint
   ```
2. **Birim & Entegrasyon Testleri:** Kopyalama fallback akışları, model tercihleri ve backlog tarama mantığı dahil tüm 455 testin geçtiğini doğrulamak için:
   ```bash
   npm test
   ```
3. **Üretim Derlemesi (Next.js Build):** Uygulamanın hatasız şekilde production paketine derlendiğini doğrulamak için:
   ```bash
   npm run build
   ```
4. **Smoke Readiness Test:** Sistem çekirdeğinin ve 3/3 taslakların tamamen hazır (READY) olduğunu doğrulamak için:
   ```bash
   npm run operator:check
   ```

---

## 🔒 5. Güvenlik & Secrets Koruması
- `.env.local` ve veritabanı dosyalarını (`/data/`, `/output/`, `/.playwright-cli/`) içeren hassas alanlar `.gitignore` ile korunmaktadır; git reposuna kesinlikle sızmazlar.
- Arayüz veya API endpoint'leri hiçbir zaman API anahtarlarının ham değerlerini istemciye iletmez; sadece yapılandırma durumlarını (`configured: true`) döner.
