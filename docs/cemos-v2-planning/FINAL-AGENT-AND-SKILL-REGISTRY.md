# CemOS V2 — Final Agent & Skill Registry

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) D2/D3 + C7 + [FINAL-OPENROUTER-ROUTING.md](./FINAL-OPENROUTER-ROUTING.md).
> **Felsefe:** Yeni agent framework YOK. "Agent" = mevcut/planlı TS modülü. "Skill" = 25-görev→preset matrisi — ayrı bir skill registry dosyası/DB'si YOKTUR; görevler registry'nin kendisidir. MVP agent platformuna dönüşmez. Tarih: 2026-07-08.

---

## 1. Nihai agent envanteri

Ortak kurallar (hepsi): tool izni = yok/read-only (**yayın/yazma aracı ASLA** — manual-publish); kaynak sıkıştırma ≤900 karakter; few-shot ≤5 çeşitli örnek; untrusted veri her zaman `<<<KAYNAK_VERI>>>` çitli; tüm LLM çağrıları `generateJsonGated` + preset + purpose.

| Agent | Modül | Girdi → Çıktı | Preset(ler) | İnsan onayı | Faz |
|---|---|---|---|---|---|
| **Account Router** | `src/lib/agents/router.ts` `routeItem` | dış içerik → `{best, fits[], usedLlm}` | fast-extract | hayır (fail-open; guard: aynı taslak 2 hesaba asla) | KEEP (MVP) |
| **Unified Draft Pipeline** | `src/lib/ai/draft-pipeline.ts` (omurga) + `grounding.ts` + `prompts.ts` + absorbe edilen `scorer.ts`/`leak-detector.ts` | kaynak+hesap → skorlu QueueItem taslağı | writer (yazım) + final-judge (skor) | **evet** — edit-gate + manuel yayın | UNIFY (MVP) |
| **Batched Opposing Judge** | judge aşaması (draft-pipeline içinde) — V1'de council'ı absorbe eder (C7: hook/persona/risk/novelty → alt-skor #8/#5/#12-veto/#6) | aday taslaklar (top-3) → 14 alt-skor + leak listesi | final-judge (gpt-5.5, karşı aile) | hayır (çıktı bilgi) | MVP kısmi → V1 tam |
| **Pipeline Runner** | `src/lib/agents/pipeline-runner.ts` | stage tanımı → traced yürütme + roleFallback | (taşıyıcı) | — | KEEP |
| **Memory Extraction/Consolidation** | yeni job, 18:00 cron slotu | FeedbackEvent/edit-diff → `proposed` MemoryFact/learnedRules | memory (deepseek-v4-pro) | **evet** — identity yazımı her zaman onaylı | V1 |
| **Website Verifier** | `src/lib/verify/verifyWebsite.ts` | URL → Zod `VerificationEvidence` | **LLM YOK** (deterministik; özet için multimodal-audit ayrı görev) | hayır (kanıt otoriter) | V1 |
| **IG Competitor Sync** | `src/lib/instagram/competitor/` (YouTube `syncCompetitors` klonu) | watchlist → ContentItem/Baseline/OutlierScore | **LLM YOK** | hayır | V1 |
| **IG Swipe-file Capture** | operatör tetikli capture akışı | URL/screenshot → CompetitorContentItem → Board/Idea | multimodal-audit | **evet** — operatör başlatır | V1 |
| **Reels Dossier Generator** | `src/lib/reels/reelDossierFor.ts` (`briefForVideo` klonu) | konu+kanıt → ReelDossier | research + writer + final-judge | **evet** — kanıtsız araç `not_ready` + operatör | V1 |
| **Monthly Plan Assembler** | saf TS assembler | dossier havuzu → ay planı (pillar/mix/repetition) | **LLM YOK** (strategist yalnız taslak metin için) | **evet** | V1 (geç) |
| **YouTube Sync + Brief** | `src/lib/youtube/` mevcut | kanal → outlier; video → YtBrief | mevcut roller → preset map | brief operatör-tetikli | KEEP |
| **Learn Pipeline** | `src/lib/learning/` mevcut, flag'li | transcript → LearnPack/SRS | mevcut STAGE_ROLES → preset map | hayır | KEEP |

## 2. Birleştirilen / emekli edilen

| Öğe | Karar | Koşul |
|---|---|---|
| `growth-engine/account-profiles.ts` | **SİL** | `accounts.ts` tek kaynak; adapter geçişi + import grep'i temiz + eval parity |
| `growth-engine/draft-generator.ts` | **EMEKLİ** | LIVE writer omurga; eval golden set parity yeşil |
| `growth-engine/draft-critic.ts` | **EMEKLİ** | Batched judge devralır |
| `growth-engine/scorer.ts` | **ABSORBE** | Alt-sinyal katmanı olarak omurgaya taşınır (silinmez) |
| `growth-engine/leak-detector.ts` | **ABSORBE** | Bloklayıcı kapıya terfi |
| `agents/council.ts` | **BİRLEŞİR (V1)** | Lensler judge rubriğine map'lenir; `council-config` ağırlıkları rubrik ağırlığı |
| Zustand legacy slice'ları (queue/flow/sources) | dokunma | UI zaten API-backed; ayrı temizlik görevi (V2, düşük öncelik) |

## 3. Skill/görev registry'si = 25-görev matrisi

**Tam matris:** [FINAL-OPENROUTER-ROUTING.md §3](./FINAL-OPENROUTER-ROUTING.md) — görev başına preset/model/fallback/structured/cache/onay/maliyet oradadır; burada tekrarlanmaz.

Görev başına ek sözleşme:

| Boyut | Kural |
|---|---|
| I/O şeması | Zod; structured `json_schema strict` destekleyen rotalarda zorunlu; `runValidatedStage` pattern'i (1 repair retry) |
| Tool izni | Preset'ten türer: none/read-only. Hiçbir görev yazma/yayın aracı alamaz (registry testi) |
| Budget | Preset purpose prefix'i; `getMonthlySpendByPurpose` ile dilim |
| Eval | Sıcak görevler (X draft, X critique, caption, reels script, monthly plan, final judge) `EvalTest` golden set'li; prompt/model değişimi `eval:run` gate'li |
| Versiyon | `PROMPT_VERSION` X/news/IG yollarına genişler (V1); her skor judge model+versiyonla saklanır |
| İnsan onayı | Matristeki sütun; yayına dokunan her şey ayrıca edit-gate'li |

## 4. Çağrı akışı (metin diyagram)

```
cron/UI tetik
 → engine modülü (agent)
   → resolvePreset(name) → { role, temp, provider, structured, purpose, timeout }
   → generateJsonGated({preset, system, user(fenced), meta})
     → assertGenerationAllowed()            [bütçe]
     → generateJson(...)                    [resolveModel(role) + fallback zinciri]
     → usageService.recordOpenRouter(...)   [ledger, purpose]
   → pipeline-runner (çok aşamalıysa)       [PipelineTrace]
 → çıktı: DB satırı (QueueItem/Dossier/MemoryFact[proposed]/...)
 → insan yüzeyi (Bugün/queue/onay kuyruğu)  [tek yayın yolu = insan]
```

## 5. Kabul kriterleri

- [ ] Registry testleri: hiçbir preset/görev yazma aracı vermez; writer ailesi ≠ judge ailesi; her preset primary pinned.
- [ ] Draft yolunda `growth-engine/account-profiles` import'u yok (grep).
- [ ] Draft yolundaki her LLM çağrısı gated (raw `generateJson` assert'ü).
- [ ] Council birleşiminden sonra (V1) tek skor sözlüğü: `QueueItem.scores` alt-skor adları FINAL-EVALUATION-SPEC §2 ile birebir.
- [ ] Emekli dosyalar ancak eval golden set parity yeşilken silinir.
