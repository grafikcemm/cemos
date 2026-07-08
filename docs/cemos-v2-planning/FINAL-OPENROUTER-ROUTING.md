# CemOS V2 — Final OpenRouter Routing

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) D6 + C1/C2/C3/C8 kararları + [research/06-openrouter-routing.md](./research/06-openrouter-routing.md).
>
> **⚠️ REVİZYON (2026-07-09, Sprint 1 canlı doğrulaması):** Bu dokümanın önceki
> sürümündeki **dated slug'lar (`-\d{8}$`, örn. `claude-sonnet-5-20260630`) gerçek
> OpenRouter kataloğunda HİÇ VAR OLMADI** — OpenRouter tarihsiz canonical id
> kullanır (`anthropic/claude-sonnet-5` gibi). Sonuç: writer/judge sessizce mock'a
> düşüyordu. Karar (Ali Cem): **canlı katalog otoriterdir.** Aşağıdaki tüm slug'lar
> `https://openrouter.ai/api/v1/models` çıktısına karşı 2026-07-09'da tek tek
> doğrulanmış gerçek id'lerdir. `npm run verify:catalog`
> (scripts/verify-model-catalog.ts) her preset primary+fallback'ini canlı katalogda
> arar; eksik slug veya erişilemeyen katalog = **açık hata (exit 1)**. Startup lint
> (`validatePresets`, instrumentation.ts) katalog-snapshot üyeliği + floating yasağı
> + writer≠judge ailesini zorlar — **sessiz mock fallback primary drift'ini asla
> saklayamaz.**
>
> **Katalog doğrulama:** `https://openrouter.ai/api/v1/models` (JSON API), **2026-07-09, canlı**. Her model/preset değişikliğinde ve build/CI öncesi `npm run verify:catalog` koş (`AiModelSnapshot` haftalık drift kontrolü V1'de otomatikleşir).
> **Kurallar:** primary = canlı katalogda doğrulanmış canonical slug; floating (`-latest`/`-fast`/`fable`/`preview`/`:free`) primary OLAMAZ; her primary'nin farklı-sağlayıcı fallback zinciri var; preset katmanı mevcut rol registry'sinin (`model-config.ts`) ÜZERİNE oturur, yeniden yazmaz; tüm çağrılar `generateJsonGated` üzerinden.

---

## 1. Doğrulanmış katalog (2026-07-09 canlı, $/M input/output)

| Canonical slug (primary kullanım) | Ctx | In/Out | Not |
|---|---|---|---|
| `anthropic/claude-sonnet-5` | 1M | $2/$10 | Writer — sonnet-4-5'ten hem ucuz hem iyi |
| `anthropic/claude-opus-4.8` | 1M | $5/$25 | Yalnız V2 escalation |
| `openai/gpt-5.5` | 1.05M | $5/$30 | **Final judge primary (C3)** + writer fallback |
| `openai/gpt-5.5-pro` | 1.05M | $30/$180 | Kaçın; son çare |
| `google/gemini-3.5-flash` | 1M | $1.5/$9 | Research/multimodal iş atı |
| `google/gemini-3.1-flash-lite` | 1M | $0.25/$1.5 | Extract/classify iş atı |
| `google/gemini-3-pro-image` | 65k | $2/$12 | Görsel (fal birincil kalır) |
| `deepseek/deepseek-v4-flash` | 1M | $0.09/$0.18 | Mutlak taban prefilter |
| `deepseek/deepseek-v4-pro` | 1M | $0.44/$0.87 | Ucuz büyük-ctx consolidation |
| `openai/gpt-5.4-mini` | 1M | $0.75/$4.50 | Premium profil mini rolleri |
| `openai/text-embedding-3-small` | — | $0.02/M | Embedding (ayrı `/embeddings` endpoint'i — `/models` listesinde görünmez) |

**Floating/preview varyantları primary OLAMAZ** (katalogda gerçek örnekler: `claude-opus-4.8-fast`, `claude-fable-5`, `gemini-3.1-flash-lite-preview`, `:free` uçları). Eski doküman sürümündeki `gemini-pro-latest` / `gpt-mini-latest` / `claude-sonnet-latest` / `gemini-flash-latest` **katalogda yok → kullanma**; fallback zincirleri gerçek modellerle kuruldu (§2).

**Eski→yeni map (`model-config.ts` default'ları):** `gemini-2.5-pro`→`gemini-3.5-flash` · `gemini-2.5-flash`→`gemini-3.1-flash-lite` · `claude-sonnet-4-5`→`claude-sonnet-5` · `deepseek-chat(:free)`→`deepseek-v4-flash` · `gpt-4o`→`gpt-5.5` · `gpt-4o-mini`→`gpt-5.4-mini`.

**Doğrulanmış yetenekler:** `response_format:{type:"json_schema",strict:true}` (Anthropic/OpenAI/Gemini/DeepSeek; 400/422 strip-retry degrade korunur) · provider routing (`order`/`sort`/`allow_fallbacks`/`require_parameters`/`data_collection`) · prompt caching (Anthropic `cache_control` read 0.1×; Gemini 0.25×; DeepSeek 0.1×; OpenAI 0.25-0.5× otomatik) · `/api/v1/embeddings` endpoint mevcut · **rerank endpoint YOK** (`unverified`; plan LLM-as-reranker).

## 2. 9 preset (D6 + C3 düzeltmesiyle)

| Preset | Rol | Primary | Fallback zinciri | sort | reason | temp | structured | cache | data | purpose | timeout/retry |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cemos-fast-extract` | cheapWriter | gemini-3.1-flash-lite | deepseek-v4-flash → gemini-3.5-flash | price | none | 0 | json_schema | auto | allow | `extract_` | 15s/1 |
| `cemos-budget-batch` | cheapWriter | deepseek-v4-flash | gemini-3.1-flash-lite | price | none | 0 | json_schema | auto | allow | `prefilter_` | 12s/1 |
| `cemos-research` | qualityJudge | gemini-3.5-flash | deepseek-v4-pro → gpt-5.5 | price | low | 0.3 | json_schema | auto | allow | `research_` | 40s/1 |
| `cemos-multimodal-audit` | qualityJudge | gemini-3.5-flash | gpt-5.5 → deepseek-v4-pro | price | low | 0.2 | json_schema | auto | allow | `audit_` | 45s/1 |
| `cemos-memory` | cheapWriter | deepseek-v4-pro (+ text-embedding-3-small) | gemini-3.5-flash; local-hash embed | price | none | 0.1 | json_schema | auto | **deny** | `memory_` | 30s/1 |
| `cemos-writer` | creativeWriter | **claude-sonnet-5** | gpt-5.5 → gemini-3.5-flash | order:[anthropic] | medium | 0.9 | json_object* | **anthropic-breakpoint** | **deny** | `writer_` | 45s/1 |
| `cemos-strategist` | qualityJudge | claude-sonnet-5 | gpt-5.5 → gemini-3.5-flash | order:[anthropic] | high | 0.4 | json_schema | anthropic-breakpoint | **deny** | `strategy_` | 60s/1 |
| `cemos-final-judge` | viralJudge/finalEditor | **openai/gpt-5.5** ← C3: writer'la KARŞI aile | gemini-3.5-flash → claude-sonnet-5 (son çare) | order:[openai] | low | 0.2 | json_schema | auto (OpenAI) | **deny** | `judge_` | 30s/1 |
| `cemos-image-concept` | creativeWriter | gemini-3.5-flash (konsept metni) | claude-sonnet-5 | price | low | 0.7 | json_schema | auto | **deny** | `image_` | 30s/1 |

\* Writer structured önceki sürümde "none" idi; mevcut draft-pipeline JSON çoklu-taslak sözleşmesiyle çalıştığı için Sprint 1'de `json_object` uygulandı ("preset default none, call-level JSON contract override" — Ali Cem onayı).

**Ortak:** tools = none/read-only (yayın aracı ASLA); escalation V2 flag'li (`writer→opus-4.8`, `judge→opus-4.8`, günlük cap + per-call gate); startup lint primary'nin **canlı-katalog snapshot'ında mevcut** olduğunu ve floating/preview marker taşımadığını doğrular (dated `-\d{8}$` regex'i KALDIRILDI — OpenRouter dated slug kullanmaz); ihlal CI'ı/startup'ı kırar; canlı doğrulama `npm run verify:catalog`. **Writer-ailesi ≠ judge-ailesi registry testi zorunlu** (Anthropic writer / OpenAI judge — Panickssery NeurIPS 2024 self-preference savunması).

## 3. ZORUNLU 25-görev matrisi

Sütunlar: Risk sınıfı (D=düşük deterministik-yakın, O=orta, Y=yüksek marka/para etkisi) · İnsan onayı (yayına giden her şey zaten edit-gate'li; buradaki = ek onay noktası).

| # | CemOS görevi | Risk | Preset | Primary model | Fallback | Reasoning | Araçlar | Structured | Cache | İnsan onayı | Tahmini maliyet* |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Haber metadata çıkarma | D | fast-extract | gemini-3.1-flash-lite | deepseek-v4-flash | none | yok | json_schema | auto | hayır | ~$0.0008/çağrı |
| 2 | Haber sınıflandırma | D | fast-extract | gemini-3.1-flash-lite | deepseek-v4-flash | none | yok | json_schema | auto | hayır | ~$0.0008 |
| 3 | Topic clustering | D | research | gemini-3.5-flash | deepseek-v4-pro | low | yok | json_schema | auto | hayır | ~$0.017 |
| 4 | Duplicate prefilter | D | budget-batch | deepseek-v4-flash | gemini-3.1-flash-lite | none | yok | json_schema | auto | hayır | ~$0.0001 |
| 5 | Semantic duplicate | D | memory (embed) | text-embedding-3-small | local-hash | — | yok | — | — | hayır | ~$0.00002 |
| 6 | Kaynak güvenilirliği | D | budget-batch (çoğu deterministik) | deepseek-v4-flash | gemini-3.1-flash-lite | none | yok | json_schema | auto | hayır | ~$0.0001 |
| 7 | Güncellik | D | — deterministik `buzzScore`; LLM gerekirse budget-batch | deepseek-v4-flash | — | none | yok | json_schema | auto | hayır | $0 |
| 8 | Account routing | O | fast-extract | gemini-3.1-flash-lite | deepseek-v4-flash | none | yok | json_schema | auto | hayır (guard: aynı taslak 2 hesaba asla) | ~$0.0008 |
| 9 | Trend analysis | O | research | gemini-3.5-flash | deepseek-v4-pro | low | read-only | json_schema | auto | hayır | ~$0.017 |
| 10 | Competitor metadata | D | fast-extract | gemini-3.1-flash-lite | deepseek-v4-flash | none | yok | json_schema | auto | hayır (sync LLM-siz; yalnız capture) | ~$0.0008 |
| 11 | Competitor multimodal | O | multimodal-audit | gemini-3.5-flash | gpt-5.5 | low | yok | json_schema | auto | **evet** (operatör capture başlatır) | ~$0.02/görsel |
| 12 | Website-verification summary | O | multimodal-audit | gemini-3.5-flash | gpt-5.5 | low | yok (kanıt fenced input) | json_schema | auto | hayır (kanıt otoriter, LLM yalnız özet) | ~$0.01 |
| 13 | Content opportunity | O | research | gemini-3.5-flash | deepseek-v4-pro | low | yok | json_schema | auto | hayır | ~$0.017 |
| 14 | **X draft** | **Y** | **writer** | **claude-sonnet-5** | gpt-5.5 | medium | yok | none | **breakpoint** | **evet** (edit-gate + manuel yayın) | ~$0.013 cached |
| 15 | **X critique** | Y | **final-judge** | **gpt-5.5** | gemini-3.5-flash | low | yok | json_schema | auto | hayır (çıktı = alt-skorlar) | ~$0.012 |
| 16 | Reels research | O | research | gemini-3.5-flash | deepseek-v4-pro | low | read-only | json_schema | auto | hayır | ~$0.017 |
| 17 | Reels script | Y | writer | claude-sonnet-5 | gpt-5.5 | medium | yok | none | breakpoint | **evet** (dossier `not_ready` gate + operatör) | ~$0.02 |
| 18 | Carousel planning | Y | writer/strategist | claude-sonnet-5 | gpt-5.5 | medium | json_schema | breakpoint | breakpoint | **evet** | ~$0.02 |
| 19 | Caption | Y | writer | claude-sonnet-5 | gemini-3.5-flash | medium | yok | none | breakpoint | **evet** (edit-gate) | ~$0.01 |
| 20 | Hashtag selection | D | fast-extract | gemini-3.1-flash-lite | deepseek-v4-flash | none | yok | json_schema | auto | hayır | ~$0.0008 |
| 21 | Monthly planning | Y | strategist | claude-sonnet-5 | gpt-5.5 | high | read-only | json_schema | breakpoint | **evet** (plan taslak; operatör düzenler) | ~$0.05/ay-planı |
| 22 | Feedback extraction | O | memory | deepseek-v4-pro | gemini-3.5-flash | none | yok | json_schema | auto | hayır (çıktı `proposed`) | ~$0.002 |
| 23 | Memory consolidation | Y | memory | deepseek-v4-pro | gemini-3.5-flash | none | yok | json_schema | auto | **evet** (identity yazımı her zaman onaylı) | ~$0.005/hafta |
| 24 | **Final judge** | Y | **final-judge** | **gpt-5.5** | gemini-3.5-flash | low | yok | json_schema | auto | hayır (yalnız top-3'e koşar) | ~$0.012 |
| 25 | Visual audit | O | multimodal-audit | gemini-3.5-flash | gpt-5.5 | low | yok | json_schema | auto | hayır | ~$0.02 |

\* Token varsayımları rapor 06 §7 çapaları; `unverified` tahmin — gerçek maliyet `usage.cost`'tan.

## 4. Two-stage content funnel (2 hesap, gerçek günlük hacim)

CemOS ölçeği brief'in 1000-item örneğinden küçük; gerçekçi gün:

```
~150 kaynak öğe/gün (RSS+HN+Reddit+X SourcePost+YT)
 → deterministik normalize + tweetId/url dedup           → ~90 benzersiz     ($0)
 → embed semantic-dup (görev 5)                          → ~75               (~$0.002)
 → ucuz sınıflandırma/routing (görev 1,2,8; flash-lite)  → ~25 alakalı       (~$0.02)
 → research analiz (görev 3,9,13; gemini-3.5-flash)      → ~8 fırsat         (~$0.14)
 → opportunity ranking (deterministik + mevcut skorlar)   → ~5 finalist       ($0)
 → premium taslak (görev 14; sonnet-5 cached, 2 hesap)   → 5-8 taslak        (~$0.10)
 → karşı-aile judge (görev 15/24; gpt-5.5, top-3/hesap)  → skorlu kuyruk     (~$0.07)
 → insan inceleme (Bugün)                                → 2-6 yayın
```

**Günlük toplam:** ~45-60 LLM çağrısı · ~250k in / ~35k out token · **~$0.33/gün** → **~$10/ay** (normal). Düşük ~$0.15/gün ($4.5/ay) · yoğun ~$0.75/gün ($22/ay).
**İçerik başına:** ~$0.06-0.12/yayınlanan taslak. **Premium kullanım oranı:** çağrıların ~%15'i, maliyetin ~%55'i (writer+judge — doğru yerde). **Fallback oranı hedefi:** <%5 (aşarsa readiness uyarısı). **Cache kazanımı:** writer input 0.1× read ≈ writer maliyetinin ~%45 düşüşü ≈ ay bazında ~$2-3 tasarruf.

## 5. Politikalar

- **Preview policy:** floating/preview primary yasak (startup lint); her preset farklı-sağlayıcı fallback taşır; sağlanamazsa `getFallbackModels` zinciri + `json_object` degrade.
- **Budget:** global `MONTHLY_AI_BUDGET_USD` gate + purpose-prefix dilimleri; `BudgetExceededError` harcamadan ÖNCE; fal (görsel) ayrı bütçe.
- **Escalation:** yalnız V2, flag'li, per-call gate + günlük cap.
- **Data policy:** writer/strategist/judge/memory/image-concept = `data_collection:"deny"`; extract/prefilter/research/audit (kamusal içerik) = `allow`.
- **Benchmark sistemi:** her sıcak görev için `EvalTest` golden set; prompt/model değişimi `eval:run` CI gate'inden geçer; katalog çeyreklik veya deprecation duyurusunda yeniden doğrulanır.

## 6. Migration planı (özet — detay IMPLEMENTATION-HANDOFF)

1. `presets.ts` (yeni, additive) + `resolvePreset` + `generateJsonGated({preset})`.
2. `model-config.ts` default map güncelle (eski→yeni tablo §1).
3. Dalga 1 (Sprint 1): writer + judge + news-extract sıcak yolları.
4. Dalga 2-4 (V1): research/memory → Sprint growth-engine (gate+log deliği) → kalanlar. Her dalga: fence korunur, modül vitest'i yeşil.
5. Startup lint + writer≠judge testi + cost-regression fixture (normal gün ≤ ~$12/ay projeksiyonu).

## 7. Kabul kriterleri

- [ ] Her preset primary'si canlı-katalog snapshot'ında mevcut + floating değil (test + `verify:catalog`).
- [ ] Writer ailesi ≠ judge ailesi (registry testi).
- [ ] Gated çağrı başına tam 1 UsageLog satırı, purpose prefix dolu.
- [ ] MSW ile primary 5xx → declared fallback denenir; json_schema 400 → json_object degrade.
- [ ] Funnel testi: yalnız top-3 premium'a gider.
- [ ] Bütçe aşımı → hiçbir LLM çağrısı ateşlenmez.
- [ ] Anthropic isteklerinde `cache_control` breakpoint (request shape assert).
- [ ] 994 mevcut test yeşil; CostsTab preset-bazlı döküm gösterir.
