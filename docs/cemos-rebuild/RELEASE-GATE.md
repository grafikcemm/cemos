# RELEASE GATE — CemOS (2026-07-20)

> Konsolide release-candidate onay isteği. **Bu program push/PR/deploy/canlı-yazma
> YAPMADI.** Aşağıdaki hiçbir adım operatör (Ali) açık onayı olmadan yürütülmez.
> Durum: **release candidate CODE COMPLETE** — "operational core live" ya da
> "production launched" DEĞİL (canlı sağlayıcı round-trip'leri BLOCKED-EXTERNAL).
>
> **GÜNCELLEME (Phase 5E, 2026-07-20 — Final Acceptance & Repair):** 5D RC (`7a5dac2`)
> üstüne **5 commit** (`53f30b8` feat format-aware Learn idea handoff BUG-01/02 · `538395f`
> fix(security) safeExternalHref BUG-06 · `a440310` verify:acceptance + lint 0/0 · `bd00737`
> e2e · docs). **Tam denetim (4 subagent + elle güvenlik): P0 YOK, bilinen P1 FIXED, non-blocked
> P2 FIXED.** Erişim sınırı GERÇEK oturum kapısı (§7 doc düzeltildi). Yeni `npm run verify:acceptance`
> (104/104 mutation guard'lı backstop). Gate: typecheck 0 · lint **0/0** · acceptance OK · unit
> **2188** · build 0 · tam e2e (bu koşu). Ayrıntı: `FINAL-ACCEPTANCE-MATRIX.md`. Aşağıdaki §5–§11
> operatör aksiyon listesi DEĞİŞMEDİ (Neon rotasyonu + prod env + OpenRouter kredisi + push/deploy onayı).

## 1. Branch / HEAD
- Branch: `feature/cemos-rebuild` @ **`0d54de2`** (upstream tanımsız).
- Remote: `origin https://github.com/grafikcemm/cemos.git`.
- Çalışma ağacı: yalnız `?? shots/` (kanıt; commit'lenmez).

## 2. Bu programın commit'leri (Phase 5A `da86209` üstüne 7 + bu doc commit'i)
| commit | faz |
|---|---|
| `d427196` | 5B-A memory re-home + neutralize (ADR-045) |
| `de85c1d` | 5B-B Learn content-idea → X draft (ADR-045) |
| `76435a2` | 5B-C e2e (memory neutralize + Learn→draft) |
| `70def6c` | 5B-E integration audit + news-cron honesty (ADR-045) |
| `064d651` | 5C calibration surface + reels meets-bar (ADR-046) |
| `04acd2b` | 5C docs (ADR-046) |
| `0d54de2` | 5D hardening: security redaction/fencing + dead-code (ADR-047) |

## 3. Migration durumu
- İKİ additive migration prod Neon `neondb`'ye uygulandı (guarded `safe-migrate-deploy`):
  `20260720100000_add_feedback_neutralized_at`, `20260720110000_add_queue_item_origin_key`.
- Her ikisi: statik destructive-scan clean, iki-deploy ("No pending migrations"),
  öncesi=sonrası read-only snapshot **satır kaybı YOK** (queueItems 66/accounts 2/…).
- `migrate status`: up-to-date. Pending migration YOK.

## 4. Test matrisi (RC gate — gerçek sonuçlar)
- typecheck **0** · lint **0 err / 4 pre-existing warn (YENİ 0)** · verify:catalog **OK (9 preset)**
- unit **2181** (221 dosya) · build **0** (temiz `.next`)
- e2e **158 passed / 0 failed** (tam suite; first-nav guard stabil)
- görsel: 12 REAL-DB-READONLY shot, 1024+1920 **yatay taşma 0**

## 5. Gerekli production env (operatör VAR/YOK doğrulasın — DEĞER yazılmaz)
**Zorunlu (çekirdek):** `DATABASE_URL` · `CREDENTIAL_ENC_KEY` · `CRON_SECRET` · oturum sırları
(`proxy.ts`: parola hash + HMAC anahtarı — prod'da yoksa fail-closed).
**Üretim (core hedef):** `OPENROUTER_API_KEY` (+ canlı ücretli için `OPENROUTER_KEY_ROTATED_AT`,
`AI_EVAL_SPEND_ENABLED`, `PHASE2E_LIVE_EVAL_APPROVED`, `PHASE2E_LIVE_MAX_USD`).
**Sosyal okuma:** `SOCIALDATA_API_KEY` · `META_ACCESS_TOKEN`+`META_IG_USER_ID` ·
`COMPOSIO_CONSUMER_API_KEY`+`COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID`+`_ACCOUNT_HANDLE`.
**Opsiyonel:** `OBSIDIAN_VAULT_PATH` | (`OBSIDIAN_GITHUB_REPO`+`OBSIDIAN_GITHUB_TOKEN`) ·
`YOUTUBE_API_KEY` · `GEMINI_API_KEY` · `SUPADATA_API_KEY` · `FAL_KEY`.

## 6. Secret rotasyonu (KRİTİK USER-ACTION — deploy öncesi)
- **Neon DATABASE_URL parolası**: geçmişte sızmış olabilir (residual risk). Rotasyon
  operatör kararı; rotasyon sonrası tek env güncellemesi + redeploy. **Açık blocker.**
- OpenRouter anahtarı: Phase 2C'de prefix sızdı → `OPENROUTER_KEY_ROTATED_AT` marker'ı
  bu yüzden canlı ücretli kapının önkoşulu.

## 7. Sağlayıcı durumu (canlı doğrulama = round-trip)
| Sağlayıcı | Durum |
|---|---|
| OpenRouter üretim | configured-in-code; **canlı $0** — ilk golden koşu operatör kredisi bekliyor |
| Composio IG (own-account) | BLOCKED-EXTERNAL (env yok) |
| Meta business_discovery | configured-in-code (memory canlı iddia ediyor, bu program DOĞRULAMADI) |
| Obsidian yerel/GitHub | BLOCKED-EXTERNAL (target/env yok) |
| Haber/trend cron | configured; günde-1 12:00 UTC; canlı tetiklenmedi |
| Tier-2 render worker | BLOCKED-EXTERNAL (serverless uzun-iş yok) |
| X API doğrudan yayın | BLOCKED (payment_approval_required); intent-only çalışır |

## 8. Tahmini ilk-ay maliyeti
OpenRouter aylık bütçe gate'li (varsayılan düşük) · X API (opsiyonel, açılırsa ~$2–48/ay) ·
Obsidian $0 · Meta ücretsiz tier · Composio plan · Tier-2 altyapı (açılırsa). Çekirdek
release: OpenRouter üretim + Neon + Vercel = düşük/orta.

## 9. Rollback planı
- Her entegrasyon env-gate'li + fail-soft: credential kaldır → degraded/blocked/fixture
  yoluna döner (deploy gerekmez). OpenRouter→402-degraded · Obsidian→ZIP · Meta/Composio→
  config-required · X→intent-only.
- Deploy rollback: Vercel önceki deployment'a promote. Migration additive (geri-alma
  gerekmez; kolonlar nullable, eski kod görmezden gelir).

## 10. Deploy adımları (YALNIZ operatör açık onayıyla)
1. Branch/diff son doğrulama; yalnız ilgili commit'leri push.
2. Vercel env completeness (§5) + Deployment Protection AÇIK doğrula.
3. Migration'lar zaten prod'da (§3) — deploy öncesi ek migration YOK.
4. Deploy (`cemos-woad.vercel.app`).
5. Read-only smoke: login → Bugün → Plan → Kütüphane → Profil/Entegrasyonlar → `/api/health`.
6. Production'da test verisi/yayın OLUŞTURMA.
7. Hata → §9 rollback.

## 11. Onay gereken tek konsolide aksiyon listesi (operatör)
1. **Neon parolasını rotate et** + `DATABASE_URL` güncelle (kritik güvenlik).
2. Vercel prod env'lerini tamamla (§5) + Deployment Protection AÇIK.
3. OpenRouter kredisi ekle (çekirdek üretim kilidi) → tek golden koşu doğrulaması.
4. Push/deploy onayı ver → yukarıdaki §10 sırası yürütülür.
(1–3 olmadan "operational core live" İLAN EDİLMEZ; canlı sağlayıcı yazımı bu programda YOK.)
