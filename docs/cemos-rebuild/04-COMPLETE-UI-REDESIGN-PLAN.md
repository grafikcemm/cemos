# 04 — Complete UI Redesign Plan (bağlayıcı ekran sınıflandırması)

> Kural (ADR-006): Kullanıcı-erişilebilir HİÇBİR ekran legacy kompozisyonla kalamaz — hepsi yeni tasarım sistemine geçer.
>
> **İki sınıflı LEGACY KADER kuralı yalnız legacy içerik/araştırma ekranlarına aittir:** Her legacy içerik/araştırma ekranı ya **ABSORBED** (kullanıcı erişiminden çıkar, id yeni eve alias'lanır) ya **REDESIGNED-ADVANCED** (araştırma detayı olarak kalır, tam yeniden tasarlanır). Bu iki sınıf arasında üçüncü bir "ara / minimum-uyum" legacy-kader sınıfı YOKTUR.
>
> **KEEP-REDESIGNED bir legacy-kader sınıfı DEĞİLDİR** — utility/profil ekranlarının (Toolbox, Sistem, Maliyet, Ayarlar, CemOS'un bildikleri, Entegrasyonlar) **kapsam etiketidir**: bunlar demote edilecek legacy-içerik değil; yeri değişen + zaten tam yeniden tasarlanan araçlar. Yani "iki sınıf, üçüncüsü yok" kuralı utility/profil'e uygulanmaz; onlar ayrı kategoridir ve yine de yeni tasarıma geçer.
>
> Her mevcut işlevin yeni sistemde karşılığı veya kaldırılma gerekçesi §3'te.

## 1. Mevcut ekran/tab envanteri (17 tab + alt-görünümler + utility)

Kaynak: `src/components/nav/navConfig.ts`, `src/components/shell/screenRegistry.tsx`. Alt-görünümler `screenRegistry`'de değil, ekran-içi local state / SubNav ile.

| # | Tab id | Etiket (TR) | Component | Alt-görünüm |
|---|---|---|---|---|
| 1 | `morning` | Bugün | MorningDashboardTab | — |
| 2 | `news-pool` | Haber Havuzu | RadarTab | SubNav `news`/`repo` → NewsPoolTab / RepoRadarTab |
| 3 | `daily-queue` | Günlük Kuyruk | DailyQueueTab | List / Pano (kanban) toggle |
| 4 | `instagram` | Instagram | InstagramTab | sub `radar`/`reels` → CompetitorRadarSection / ReelsDossierSection |
| 5 | `youtube` | YouTube Fırsat Motoru | YouTubeTab | — |
| 6 | `flow-radar` | Viral Radar | FlowRadarTab | — |
| 7 | `discovery-engine` | Keşif Motoru | DiscoveryEngineTab | — |
| 8 | `source-intelligence` | X Hesabı Kaynakları | SourceIntelligenceTab | — |
| 9 | `viral-library` | Viral Kütüphane | ViralLibraryTab | — |
| 10 | `keyword-library` | Anahtar Kelime Kütüphanesi | KeywordLibraryTab | — |
| 11 | `prompt-library` | Prompt Kütüphanesi | PromptKutuphanesiTab | — |
| 12 | `pattern-library` | Pattern Kütüphanesi | PatternLibraryTab | — |
| 13 | `learn-dashboard` | Youtube Öğrenme Kütüphanesi | LearnDashboardTab | env-gated (`NEXT_PUBLIC_LEARN_ENABLED`) |
| 14 | `toolbox` | Toolbox | ToolboxTab | folder-row + SubNav strip |
| 15 | `costs` | Maliyetler | CostsTab | — |
| 16 | `system` | Sistem | SystemTab | — |
| 17 | `settings` | Ayarlar | SettingsTab | DURUM/MALIYET/MODEL/OTOMASYON + embeds |

Deep-link route'ları (`src/app/dashboard/*`): `daily-queue`, `flow-radar`, `pattern-library`, `source-intelligence`.

## 2. Sınıflandırma + yeni ev haritası

### Legacy içerik ekranları — ABSORBED (7)
| Tab id | Yeni ev | Nasıl |
|---|---|---|
| `daily-queue` | **Bugün** | Tam kuyruk (list/kanban) Bugün içinde "Tüm kuyruk" genişlemesi olur; tekil karar akışı Bugün ana yüzü |
| `instagram` | **Plan** (bölünür) | `radar`→Plan/Fırsatlar, `reels`→Plan/Takvim, seri DNA→Plan/Seriler |
| `viral-library` | **Kütüphane/Tümü** + İlham | Aramalı birleşik kütüphane + kaydedilmiş viral içerik analizi İlham'da |
| `keyword-library` | **Kütüphane/Tümü** | Birleşik aramada tür filtresi "anahtar kelime" |
| `prompt-library` | **Kütüphane/Tümü** | Birleşik aramada tür filtresi "prompt" |
| `pattern-library` | **Kütüphane/Tümü** | Birleşik aramada tür filtresi "pattern" |
| `learn-dashboard` | **Kütüphane/Öğrenme** | Inbox/Öğreniliyor/Hazır/Bugünkü tekrar akışı (env gate korunur) |

### Legacy araştırma ekranları — REDESIGNED-ADVANCED (5)
Nav-dışı; Plan/Fırsatlar kartlarından "ham araştırmaya in" + Cmd+K ile açılır. Shell içinde yeni primitive'lerle **tam yeniden tasarlanır** (05 spec'te her biri).
| Tab id | Yeni rol |
|---|---|
| `news-pool` | Haber araştırma detayı (news + repo alt-görünümleri korunur) → Fırsatlar'ı besler |
| `youtube` | YouTube fırsat araştırma detayı → Fırsatlar'ı besler |
| `flow-radar` | Viral radar araştırma detayı → Fırsatlar'ı besler. **DİKKAT (05 denetimi):** yalnız liste değil — tam üretim döngüsü içeriyor: 3-varyant taslak (güvenli/güçlü/cesur) + eleştirmen alt-skorları + feedback→eğitim-örneği. 05 E3'te first-class Drawer akışı olarak spec'lendi; "Fırsatlar radar'ı özetler" bunu az temsil eder. |
| `discovery-engine` | Keşif motoru araştırma detayı → Fırsatlar'ı besler. Çok-ajanlı "Müzakere Konseyi" (hook·persona·risk·novelty) ayrı yetenek olarak korunur (05 E4). |
| `source-intelligence` | X hesap kaynakları araştırma detayı → Fırsatlar/Seriler'i besler. **Ölü buton flag'i:** Sprint-9 devre-dışı "Tara"/"Flow'a Gönder" placeholder'ları — 05 E5 kabul kriteri: "wire veya kaldır". |

### Utility/profil ekranları — KEEP-REDESIGNED (4 + embeds)
Legacy-content değil; yerleşim + kompozisyon değişir, tam yeniden tasarlanır.
| Tab id | Yeni ev |
|---|---|
| `toolbox` | **Toolbox** (ana nav yanında hızlı utility; korunur) |
| `costs` | **Profil/Maliyet** |
| `system` | **Profil/Sistem** (3 katman sağlık) |
| `settings` | **Profil/Ayarlar** — embeds dağıtılır: MemoryProposalsSection→Profil/CemOS'un bildikleri, SeriesDnaSection→Plan/Seriler, LearningStatusCard→Kütüphane/Öğrenme + Profil/Sistem, MODEL/OTOMASYON→Profil/Ayarlar |

## 3. Niş-işlev envanteri (ABSORBED ekranlarda kaybolabilecekler)

Her satır: korunur mu / nasıl. Kayıp varsa DECISIONS'a gerekçe.
| Kaynak ekran | Niş işlev | Karar |
|---|---|---|
| daily-queue | List/Pano (kanban) yoğunluk toggle | **Korunur** — Bugün "Tüm kuyruk" görünümünde list/kanban toggle |
| daily-queue | Günün operasyon paneli (0/N incelendi) | **Korunur** — Bugün üst özet |
| instagram/radar | Rakip radarı yoğun satırlar + outlier çarpanı | **Korunur** — Plan/Fırsatlar (küçük-örneklem `insufficient` etiketi + master prompt "aşırı çarpan" düzeltmesi uygulanır) |
| instagram/reels | Reels dossier 4-aşama + evidence gate | **Korunur** — Plan/Takvim dossier detayı |
| viral-library | Kaydedilen viral tweet analizi | **Korunur** — Kütüphane/İlham |
| keyword-library | Anahtar kelime özel filtreleri | **Korunur** — Kütüphane/Tümü tür-filtresi; özel filtreler advanced filter panelinde |
| prompt-library | Prompt formülleri (PromptFormula) | **Korunur** — Kütüphane/Tümü "prompt" türü |
| pattern-library | ViralPattern validatedAt/support | **Korunur** — Kütüphane/Tümü "pattern" türü + İlham analizi |
| learn-dashboard | SRS review kuyruğu | **Korunur** — Kütüphane/Öğrenme "Bugünkü kısa tekrar" |
| settings | Operator Mode start/stop | **Korunur** — Profil/Ayarlar veya Bugün readiness gate |
| settings | Bağlantı & Sağlık kartları | **Taşınır** — Profil/Sistem (3 katman) |

**Kayıp/kaldırılan işlev:** yok — hepsi taşınıyor. (Master promptun "ham 60 sonuç yerine seçilmiş fırsat" yönü bir kaldırma değil, sunum değişikliği: ham liste advanced ekranda kalır, Fırsatlar seçilmiş gösterir.)

## 4. Alias haritası vs v9 migration haritası (AYRI)

### 4a. `TAB_ALIASES` (normalizeTabId — deep link + referans çözümü)
Mevcut alias'lar korunur (`flow→flow-radar`, `queue→daily-queue`, `sources→source-intelligence`, `library→viral-library`, `patterns→pattern-library`, `prompt-kutuphanesi→prompt-library`, `content-radar→news-pool`, `repo-radar→news-pool`, `content-intel→discovery-engine`, `ai-rankings→toolbox`, `weekly-learning-report→morning`, `training-center→morning`).
Yeni eklenenler (ABSORBED eski id → yeni ev):
```
daily-queue        → bugun (morning)      [ABSORBED]
viral-library      → lib-tumu             [ABSORBED]
keyword-library    → lib-tumu             [ABSORBED]
prompt-library     → lib-tumu             [ABSORBED]
pattern-library    → lib-tumu             [ABSORBED]
learn-dashboard    → lib-ogrenme          [ABSORBED]
instagram          → plan-seriler         [ABSORBED, varsayılan giriş]
```
**REDESIGNED-ADVANCED id'ler ALIAS'LANMAZ** — `news-pool`, `youtube`, `flow-radar`, `discovery-engine`, `source-intelligence` `normalizeTabId`'de kendileri kalır; advanced ekran olarak doğrudan açılır. Deep-link route'ları (`/dashboard/flow-radar`, `/dashboard/source-intelligence`) advanced ekranı seed'ler; `/dashboard/daily-queue`→Bugün, `/dashboard/pattern-library`→Kütüphane/Tümü.

### 4b. Store v9 migration (`migrations.ts` — persist edilmiş `activeTab` yeniden yazımı)
YALNIZ ABSORBED değerler yeni ana ekrana taşınır (kullanıcı açılışta doğru yerde olsun):
```
daily-queue     → morning
viral-library   → lib-tumu
keyword-library → lib-tumu
prompt-library  → lib-tumu
pattern-library → lib-tumu
learn-dashboard → lib-ogrenme
instagram       → plan-seriler
```
Advanced id'ler (`news-pool`/`youtube`/`flow-radar`/`discovery-engine`/`source-intelligence`) v9'da **DEĞİŞMEZ** — persist edilmişse advanced ekranı açar. `costs`/`system`/`settings`/`toolbox` değişmez (utility/profil). `"xagent-store"` anahtarı DEĞİŞMEZ. `radarView` migrasyonu korunur.

> Fark: alias = her yerde çözüm (deep link, eski referans); migration = tek seferlik persist-değer yeniden yazımı. Advanced id alias'lanmaz VE migrate edilmez → hem doğrudan açılır hem persist edilmişse kaybolmaz.

## 5. Yeni ekran envanteri (05 spec'te tam spec)

Yeni host + yüzeyler: `morning` (yeniden), `plan-takvim`, `plan-firsatlar`, `plan-seriler`, `lib-tumu`, `lib-ilham`, `lib-ogrenme`, `toolbox` (yeniden), Profil: `profile-memory` (CemOS'un bildikleri), `profile-integrations` (Entegrasyonlar), `system`, `costs`, `settings` (yeniden), Giriş (`/giris`), 5 advanced (yeniden), + shell/sidebar/topbar/mobilenav/cmdk + onboarding/empty/error/stale/blocked-external durum ekranları.

Legacy `screenRegistry` kayıtları: 17 ekran registry'de kalır (ABSORBED'ler alias hedefine yönlenir, advanced'ler doğrudan; hiçbir component silinmez — Faz 4'te compatibility kanıtıyla emeklilik).
