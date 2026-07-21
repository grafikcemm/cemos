# RELEASE GATE — CemOS (2026-07-20)

> **GÜNCELLEME (Operational Go-Live Preflight, 2026-07-21):** Gerçek HEAD **`0fb2baa`**
> (5F `3760d3f` üstüne non-external closure zinciri: `ca6e697` dead-routes · `ce7550d` budget-503 ·
> `ca0c579` accounting degraded-tail · `1c47b3b` redaction · `0fb2baa` docs; tam zincir
> `IMPLEMENTATION-STATE.md`). Kod DEĞİŞMEDİ; working tree = `?? shots/` + bu preflight doc bloğu
> (`M RELEASE-GATE.md`); **push/PR/deploy YOK · $0.**
> Bu blok yalnız **read-only launch preflight** — kod baştan audit EDİLMEDİ, kod DEĞİŞMEDİ.
>
> **Read-only preflight — doğrulanan launch blocker'ları:**
> - **Git:** branch `feature/cemos-rebuild` @ `0fb2baa`; upstream YOK (unpushed); remote `grafikcemm/cemos` ✓.
> - **Migration:** `prisma migrate status` (read-only) = **14 bulundu · DB up-to-date · 0 pending** ✓.
>   Bu, aşağıdaki §3'ün ESKİ "operator_setting pending" satırını GEÇERSİZ kılar — `operator_setting`
>   **ve** `ai_spend_reservation` prod Neon'a zaten uygulanmış. **Deploy'da migration adımı GEREKMEZ.**
> - **CI:** `.github/workflows/ci.yml` (lint→typecheck→test→build; secret gerekmez) +
>   `db-integration.yml` (`postgres:16` servis → `migrate deploy` sıfırdan → 14 `*.itest.ts`; localhost-guard)
>   İKİSİ de gerçek & doğru bağlı — sahte CI-READY iddiası DEĞİL. **CI-POSTGRES yalnız unpushed olduğu
>   için NOT-RUN; PUSH açar** (from-zero migrate + guard fail-closed dahil).
> - **DB guard:** `src/test/integration/guard.ts` gerçekten fail-closed (Gate-1 `DB_INTEGRATION=1`
>   opt-in + Gate-2 ephemeral-host değilse THROW) — prod URL'e karşı kanıtlı korkuluk ✓.
> - **Prod (MEVCUT CANLI deploy = ESKİ SHA, `0fb2baa` DEĞİL):** `/api/settings`+`/api/costs` → **403**
>   (unauth veri kapısı ÇALIŞIYOR) ✓ · `/api/health` → 200 (kasıtlı public probe) · `/` → 200 (SPA shell).
>   App 500 DEĞİL ⇒ çekirdek prod sırları (CREDENTIAL_ENC_KEY/oturum HMAC) prod'da MEVCUT. Deployment
>   Protection header'ı görülmedi ⇒ muhtemelen KAPALI (operatör AÇMALI). `/`→`/giris` unauth yönlendirmesi
>   yeni build'de `next start`+curl ile kanıtlı; **post-deploy smoke** teyit eder. (Not: mevcut prod
>   API'de 401 yerine **403** — semantik fark, ikisi de "reddedildi"; eski deploy.)
> - **Vercel:** linkli (`VERCEL_OIDC_TOKEN` mevcut); `vercel.json` = 4 cron ✓.
> - **P3 residualleri** (OpenRouter unparseable-200 · SocialData estimate-only/health-probe · embedding
>   full reserve/pre-gate · korunan `boards/[id]` + `news-pool/run` · public-URL log): launch-etkisi
>   yeniden değerlendirildi → **hiçbiri P1/P2'ye yükselmiyor → backlog.** Kod değişmedi → regresyon gerekmez.
>
> **Gerçek gate (bu HEAD; önceki oturum koşuları, kod değişmediği için re-run gerekmedi):** typecheck
> **0** · lint **0** · catalog OK (9 preset) · acceptance OK (**18 ekran / 82 mutation route tümü guard'lı /
> 4 cron**) · ai-economics OK · unit **2273** · build **0** · e2e **159/159** (8 shard). Migration:
> **14 additive · 0 pending.** Agent 13 · fiyatlı model 8.
>
> **Sınıflandırma: `CemOS launch-ready; şu tek konsolide operatör onayı bekleniyor`.** Düzeltilebilir
> non-external P0/P1/P2 = **0**. Kalan TÜM launch blocker'ları DIŞ operatör işlemi (§11). Yetki verilene
> kadar push/PR/deploy/canlı-çağrı YAPILMAZ. Yetki gelince aynı görevde CI → deploy → read-only smoke yürür.

> Konsolide release-candidate onay isteği. **Bu program push/PR/deploy/canlı-yazma
> YAPMADI.** Aşağıdaki hiçbir adım operatör (Ali) açık onayı olmadan yürütülmez.
> Durum: **release candidate CODE COMPLETE** — "operational core live" ya da
> "production launched" DEĞİL (canlı sağlayıcı round-trip'leri BLOCKED-EXTERNAL).
>
> **GÜNCELLEME (Pre-Launch Adversarial Certification, 2026-07-20):** Owner pass `0127213`
> üstüne **10 commit** (HEAD = doc commit'i). Yeni 8-subagent adversarial dalga. **Bilinen
> non-external P0–P1 = 0; düzeltilebilir P2 kapandı.** Kapatılan: `draftService` sahte-mock
> persist (P0/P1, D-closure ikizi) · budget **fail-CLOSED** (`BudgetSystemUnavailableError`) +
> tek-tx kritik bölüm · TÜM ücretli AI muhasebesi (transkript UNGATED→gated+log, embeddings,
> discovery, Fal/transcript Costs reconciliation) · Sistem paneli liveness + learn-cron partial +
> operator-scan-now 0-taslak dürüstlüğü · SSRF toolbox/refresh per-hop guard · redaction (provider
> body+Prisma) · **real-Postgres itest katmanı** (`*.itest.ts`+CI `postgres:16`, CI-only/SKIP-guarded)
> · **6 ölü legacy route silindi**. **RUNTIME AUTH KANITI:** `next start`+curl → proxy **401/307**
> enforce + `instrumentation` secret-yok **fail-closed 500** ⇒ güvenlik-denetiminin P0-1 ("route'lar
> auth'suz erişilebilir") iddiası **ÇÜRÜTÜLDÜ** (residual yalnız build-kıran typo idi, düzeltildi).
> TAM GATE YEŞİL: typecheck **0** · lint **0** · catalog OK · acceptance OK (**98 mutation route**) ·
> ai-economics OK · unit **2257** · build **0** (+`ƒ Proxy (Middleware)`). **YENİ migration YOK** (A+C
> zaten prod'da). Route 138→**132**, mutation 104→**98**. $0 · push/deploy YOK. Ayrıntı üst §:
> `IMPLEMENTATION-STATE.md`. §5–§11 operatör aksiyon listesi DEĞİŞMEDİ.

> **GÜNCELLEME (Phase 5E, 2026-07-20 — Final Acceptance & Repair):** 5D RC (`7a5dac2`)
> üstüne **5 commit** (`53f30b8` feat format-aware Learn idea handoff BUG-01/02 · `538395f`
> fix(security) safeExternalHref BUG-06 · `a440310` verify:acceptance + lint 0/0 · `bd00737`
> e2e · docs). **Tam denetim (4 subagent + elle güvenlik): P0 YOK, bilinen P1 FIXED, non-blocked
> P2 FIXED.** Erişim sınırı GERÇEK oturum kapısı (§7 doc düzeltildi). Yeni `npm run verify:acceptance`
> (104/104 mutation guard'lı backstop). Gate: typecheck 0 · lint **0/0** · acceptance OK · unit
> **2188** · build 0 · tam e2e (bu koşu). Ayrıntı: `FINAL-ACCEPTANCE-MATRIX.md`. Aşağıdaki §5–§11
> operatör aksiyon listesi DEĞİŞMEDİ (Neon rotasyonu + prod env + OpenRouter kredisi + push/deploy onayı).

> **GÜNCELLEME (Phase 5F, 2026-07-20 — AI Economics & Live Readiness):** 5E RC (`325bbf2`)
> üstüne 5F commit'leri: `82d9fcf` fix(ai) pricing provenance (§7 canlı katalog 2026-07-20
> RE-DOĞRULANDI, 8/8 slug EXACT) · `720bc06` fix(settings) durable model-profile (§6 **P1**
> "settings success lie" kapandı) · `cb1f184` docs(ai) AI-COST-QUALITY-MATRIX (§4, 47 call-site) ·
> `2388059` test(ai) `verify:ai-economics` (§17) · `2d404aa` feat(integrations) provider liveness
> (§13/BUG-05) · `3760d3f` refactor(cleanup) redacted logger (§15) · docs. Gate: typecheck **0** ·
> lint **0/0** · catalog OK · acceptance OK · ai-economics OK · unit **2220** · build 0 · tam e2e.
> **Additive `OperatorSetting` migration (`20260720120000`) HAZIR + statik-scan ADDITIVE ama prod'a
> UYGULANMADI** — deploy adımına bağlandı (§3). Canlı ücretli AI/round-trip YOK ($0); live benchmark
> USD tavanı bekliyor. Operatör aksiyon listesi (§11) DEĞİŞMEDİ + "OperatorSetting migration deploy'da
> uygula" eklendi. Ayrıntı: `AI-COST-QUALITY-MATRIX.md` + `IMPLEMENTATION-STATE.md`.

## 1. Branch / HEAD
- Branch: `feature/cemos-rebuild` @ **`3760d3f`+** (5F in-progress; kesin HEAD `IMPLEMENTATION-STATE.md`).
  5D RC `0d54de2` → 5E `325bbf2` → 5F commit'leri (yukarıda).
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
- İKİ additive migration (5B) prod Neon `neondb`'ye uygulandı (guarded `safe-migrate-deploy`):
  `20260720100000_add_feedback_neutralized_at`, `20260720110000_add_queue_item_origin_key`.
  Her ikisi: statik destructive-scan clean, iki-deploy ("No pending migrations"),
  öncesi=sonrası read-only snapshot **satır kaybı YOK** (queueItems 66/accounts 2/…).
- **YENİ (5F, §6): `20260720120000_add_operator_setting` — HAZIR + statik-scan ADDITIVE, prod'a
  UYGULANMADI.** Tek yeni tablo (`OperatorSetting` key/value); hiçbir mevcut tabloya ALTER/DROP/
  TRUNCATE/rename/backfill YOK. Runtime fail-open okur (tablo yoksa → env/default), yani kod bu
  migration'dan ÖNCE deploy edilebilir. Deploy adımında `npm run db:migrate` ile uygulanır (guarded).
- `migrate status`: 5B'ye kadar up-to-date; `operator_setting` **pending (deploy'da uygulanacak)**.

## 4. Test matrisi (RC gate — gerçek sonuçlar, 5F güncel)
- typecheck **0** · lint **0 err / 0 warn** · verify:catalog **OK (9 preset)** ·
  verify:acceptance **OK** · **verify:ai-economics OK** (yeni, §17)
- unit **2220** (225 dosya) · build **0** (temiz `.next`)
- e2e **tam suite** (5F kapanış koşusu — bkz. `IMPLEMENTATION-STATE.md`; first-nav guard stabil)
- görsel: 5E/5D REAL-DB-READONLY shot'lar; 5F değişimleri (model-profile durability + integration
  liveness + worker log) mantık/servis testleriyle + typecheck ile kapsandı

## 5. Gerekli production env (operatör VAR/YOK doğrulasın — DEĞER yazılmaz)
**Zorunlu (çekirdek):** `DATABASE_URL` · `CREDENTIAL_ENC_KEY` · `CRON_SECRET` · `SESSION_SECRET`
(session HMAC; `proxy.ts` prod'da yoksa fail-closed) · **"Sign in with Vercel" OIDC (ADR-049):**
`NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` + `VERCEL_APP_CLIENT_SECRET` + `AUTH_ALLOWED_VERCEL_USERS`
(allow-list boşsa kimse giremez). `ACCESS_PASSWORD_HASH` EMEKLİ (artık kullanılmaz).
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
4. **`npm run db:migrate`** (deploy sırasında) → `20260720120000_add_operator_setting` additive
   migration'ı uygula (guarded; §3). Kod fail-open, migration'dan önce/sonra deploy güvenli.
5. (Opsiyonel, fiyat/performans) Bounded live benchmark için USD tavanı belirle +
   `AI_EVAL_SPEND_ENABLED=true` + `PHASE2E_LIVE_MAX_USD` → provisional öneriler canlı doğrulanır (§8).
6. Push/deploy onayı ver → yukarıdaki §10 sırası yürütülür.
(1–4 olmadan "operational core live" İLAN EDİLMEZ; canlı sağlayıcı yazımı bu programda YOK. Live
benchmark [5] için açık USD tavanı verilmedikçe ücretli çağrı YAPILMAZ.)
