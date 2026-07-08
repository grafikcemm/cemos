# 06 — OpenRouter Model Routing & Cost Benchmark

> **Corpus:** CemOS V2 planning research. **Grounding anchor:** [`_repo-baseline.md`](./_repo-baseline.md) — read it first. Every finding here is framed **KEEP → gap → decision** against what already ships. This report designs a **task/preset layer OVER the existing role registry**, not a rewrite.
> **Verification window:** OpenRouter catalog, pricing, and feature docs accessed **2026-07-08** via `https://openrouter.ai/api/v1/models` (JSON API) and `openrouter.ai/docs/*`. Items I could not confirm are tagged `unverified`.

---

## 1. Executive summary

CemOS already has the hard parts of model routing: a **role registry** (`model-config.ts`, 6 roles), **profile routing** (`MODEL_PROFILE`), **cross-provider fallback** (`openrouter.ts getFallbackModels`), a **budget gate** (`costGate.ts` + `UsageLog`), and a **one-call gated wrapper** (`generateJsonGated`). What is missing is not infrastructure — it is a **task-facing vocabulary** and **discipline**:

1. **Roles are too coarse.** Six roles (`cheapWriter`/`qualityJudge`/`premiumCreative`/`creativeWriter`/`viralJudge`/`finalEditor`) get reused across ~25 semantically different tasks. A news-metadata extract and a monthly content plan both fall through to `qualityJudge` or `cheapWriter`, so they get the same model, temperature, and (absent) structured-output policy. There is no place to say "this task is a cheap high-volume prefilter" vs. "this task is the publish-quality writer."
2. **The catalog is stale.** The registry hardcodes `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4-5`, `deepseek/deepseek-chat`. As of 2026-07 every one has a cheaper-and-better successor. Notably **`claude-sonnet-5` is cheaper AND stronger than `claude-sonnet-4-5`** ($2/$10 vs $3/$15).
3. **The gate is bypassed by ~95% of callers.** `generateJsonGated` (gate + log in one place) has ~2 callers; ~72 sites call raw `generateJson`. The Sprint growth-engine path neither gates nor logs.

**The proposal:** a thin **preset layer** — 9 named presets (`cemos-fast-extract`, `cemos-budget-batch`, `cemos-research`, `cemos-multimodal-audit`, `cemos-memory`, `cemos-writer`, `cemos-strategist`, `cemos-final-judge`, `cemos-image-concept`) — each a frozen bundle of `{ primary, fallback, provider order, sort, reasoning, temperature, structured, tools, timeout, retry, cache, data policy, budget slice, escalation }`. Presets **compile down to existing roles**, so `resolveModel(role)` stays the source of truth and no call site loses its fallback. The two-stage funnel principle (cheap models on all candidates, premium only on the top-3 finalists) is applied consistently, which is what keeps a 2-account solo operator comfortably inside a **$10–12/mo** normal envelope while raising draft quality (the #2 user-confirmed pain).

---

## 2. CemOS current-state link (existing registry + gate)

**KEEP — do not rebuild** (from baseline §3, confirmed by reading `model-config.ts` + `generateGated.ts`):

| Asset | File | What it does | Decision |
|---|---|---|---|
| Role registry | `src/lib/ai/model-config.ts` | `ModelRole` × 6; `resolveModel(role)` reads `MODEL_PROFILE` (`operator_quality`/`premium`/`dev`) + per-role env override; `estimateCost()`; `getJudgeMode(handle)` | **KEEP** — presets resolve *to* roles |
| Chat client | `src/lib/ai/openrouter.ts` | hand-rolled `generateJson<T>({role,system,user,temperature,maxTokens,deadlineMs})` → `response_format:{type:"json_object"}`, `usage:{include:true}`; 400/422 retry stripping `response_format` | **KEEP + extend** (add `json_schema` + provider block) |
| Fallback | `openrouter.ts getFallbackModels(base)` | cross-provider try-list inside `generateJson`; role fallback `premiumCreative→qualityJudge` unless `ENABLE_PREMIUM_MODEL`; `pipeline-runner.runStage({roleFallback})` | **KEEP** — presets declare a fallback *slug*, funnel into this |
| Budget gate | `src/lib/config/costGate.ts` | `assertGenerationAllowed()` throws `BudgetExceededError` vs `MONTHLY_AI_BUDGET_USD` ($10 default); `getMonthlySpendByPurpose(prefix)` per-feature slices; separate `getFalBudgetStatus()` | **KEEP** — preset `budget slice` = a `purpose` prefix |
| Gated wrapper | `src/lib/ai/generateGated.ts` | `generateJsonGated<T>({role,system,user,temperature,purpose,accountId,platform,meta})` = `assertGenerationAllowed()` → `generateJson` → `usageService.recordOpenRouter` | **KEEP — make it the ONLY entry point**; add `preset` field |
| Ledger | `UsageLog` via `usageService` | `recordOpenRouter/recordGeneration/recordScan/recordImage`, `meta.purpose` | **KEEP** |

**The gap this report fills** (baseline §4 "genuine gaps"): *"task/preset OpenRouter layer"* + *"current model catalog."* The preset layer is **additive** — a new `src/lib/ai/presets.ts` (name → config) plus a `resolvePreset(name)` that returns `{ role, temperature, provider, structured, ... }` and defers model choice to `resolveModel(role)`. Zero renames, zero state risk.

---

## 3. Primary-source findings (verified OpenRouter catalog + features, 2026-07-08)

### 3.1 Verified catalog (JSON API `/api/v1/models`, accessed 2026-07-08)

Pricing is **USD per 1M tokens** (input / output). The API returns **pinned dated slugs**; the brief's short slugs (`anthropic/claude-opus-4.8`) are **aliases** that float to the pinned version. **Rule applied: pinned slug = primary; alias/`-latest`/`-fast`/`fable` = never a primary.**

| Task family | Alias (brief) | **Pinned slug (primary)** | Ctx | In / Out | Notes |
|---|---|---|---|---|---|
| Writer (premium) | `anthropic/claude-sonnet-5` | **`anthropic/claude-sonnet-5-20260630`** | 1M | **$2 / $10** | Cheaper + better than sonnet-4-5 |
| Deep reasoning | `anthropic/claude-opus-4.8` | **`anthropic/claude-4.8-opus-20260528`** | 1M | $5 / $25 | Escalation only |
| — (floating) | `anthropic/claude-opus-4.8-fast` | *floating* | 1M | $10 / $50 | fallback-only, never primary |
| — (floating) | `anthropic/claude-5-fable` | *floating* | — | $10 / $50 | creative-preview, never primary |
| Cheap chat | `anthropic/claude-haiku-latest` | *floating* (no pinned in query) | 200k | $1 / $5 | **needs a pinned fallback — `unverified` which** |
| Reasoning/big | `openai/gpt-5.5` | **`openai/gpt-5.5-20260423`** | 1.05M | $5 / $30 | writer/judge fallback |
| Max reasoning | `openai/gpt-5.5-pro` | **`openai/gpt-5.5-pro-20260423`** | 1.05M | $30 / $180 | avoid; escalation last resort |
| Cheap OpenAI | `openai/gpt-mini-latest` | *floating* | 400k | $0.75 / $4.50 | fallback-only |
| Research/multimodal | `google/gemini-3.5-flash` | **`google/gemini-3.5-flash-20260519`** | 1M | **$1.5 / $9** | workhorse for research/audit |
| Cheapest capable | `google/gemini-3.1-flash-lite` | **`google/gemini-3.1-flash-lite-20260507`** | 1M | **$0.25 / $1.5** | extract/classify workhorse |
| Quality Google | `google/gemini-pro-latest` | *floating* | 1M | $2 / $12 | escalation for audit |
| Image gen | `google/gemini-3-pro-image` | **`google/gemini-3-pro-image-20260528`** | 65k | $2 / $12 | OpenRouter-side image |
| Batch reasoning | `deepseek/deepseek-v4-pro` | **`deepseek/deepseek-v4-pro-20260423`** | 1M | **$0.44 / $0.87** | cheap big-ctx consolidation |
| Cheapest overall | `deepseek/deepseek-v4-flash` | **`deepseek/deepseek-v4-flash-20260423`** | 1M | **$0.09 / $0.18** | absolute-floor prefilter |
| Embeddings | `openai/text-embedding-3-small` | (repo default) | — | see §3.4 | **still valid** |

**Stale → upgrade map** (apply in `model-config.ts` defaults):

| Repo uses (stale) | Replace with (pinned) | Why |
|---|---|---|
| `google/gemini-2.5-pro` | `google/gemini-3.5-flash-20260519` (or `gemini-pro-latest` when quality-critical) | Newer, 1M, cheaper for the flash tier |
| `google/gemini-2.5-flash` | `google/gemini-3.1-flash-lite-20260507` | $0.25/$1.5 vs old flash; structured-output capable |
| `anthropic/claude-sonnet-4-5` | `anthropic/claude-sonnet-5-20260630` | **Strictly better + cheaper** ($2/$10) |
| `deepseek/deepseek-chat(:free)` | `deepseek/deepseek-v4-flash-20260423` | Stable paid floor; avoid `:free` rate-limits/quality lottery |
| `openai/gpt-4o(-mini)` (premium profile) | `openai/gpt-5.5-20260423` / `openai/gpt-mini-latest` | 4o generation superseded |

### 3.2 Structured outputs (`docs/features/structured-outputs`, 2026-07-08)

- **`response_format: { type:"json_schema", json_schema:{ name, strict:true, schema } }`** — strict JSON-Schema enforcement, stronger than the repo's current `type:"json_object"` (which only guarantees *valid JSON*, not *your shape*).
- Supported: **OpenAI GPT-4o+, Google Gemini, Anthropic (Sonnet 4.5 / Opus 4.1+), most open-source, all Fireworks-hosted**. Filter live via `supported_parameters=structured_outputs`.
- **Decision:** presets that already have a Zod schema (news scoring, growth-engine types, learn stages) should send `json_schema strict:true` and drop the hand-rolled normalizers/clamps. Keep the existing 400/422 retry that strips `response_format` as the fallback path (some provider routes reject strict schema → auto-degrade to `json_object`).

### 3.3 Provider routing (`docs/features/provider-routing`, 2026-07-08)

`provider` block fields: **`order`** (slugs tried in sequence), **`sort`** (`"price"` | `"throughput"` | `"latency"`), **`allow_fallbacks`** (default `true`), **`require_parameters`** (default `false` — set `true` to force structured-output-capable routes), **`data_collection`** (`"allow"`/`"deny"`). Model-slug suffix **`:nitro`** = throughput-first shortcut. Default cross-provider balancing is weighted by inverse-square of price.

- **Decision:** each preset carries a small `provider` object. High-volume presets set `sort:"price"`; the writer sets `require_parameters` off + provider `order:["anthropic"]` for voice consistency; interactive presets (X critique in-app) may set `sort:"latency"`.

### 3.4 Embeddings & rerank (`docs/api-reference/embeddings`, 2026-07-08)

- OpenRouter **now exposes `/api/v1/embeddings`** (text **and** image embeddings, single + batch). Models incl. `openai/text-embedding-3-small`, `openai/text-embedding-3-large`, `qwen/qwen3-embedding-0.6b`, `nvidia/llama-nemotron-embed-vl-1b-v2`. This is **new relative to OpenRouter's historically chat-only surface** — worth noting because the repo currently reaches embeddings a different way (baseline: `text-embedding-3-small` "hardcoded in vector-memory", JSON + JS cosine, `createLocalFallbackEmbedding` 256-dim hashing).
  - **Decision:** the `cemos-memory` preset can route embeddings through the *same* OpenRouter key/ledger (one budget, one provider) instead of a separate OpenAI path. `text-embedding-3-small` **stays the default** (cheap, 1536-dim, proven). Keep the local hashing fallback.
- **Rerank:** I did **not** find a documented OpenRouter rerank endpoint. **`unverified`** — treat cross-encoder rerank as out-of-scope for V2; two-stage cosine + LLM-judge already covers the ranking need.

### 3.5 Prompt caching (`docs/features/prompt-caching`, 2026-07-08)

| Provider | Cache write | Cache read | Trigger |
|---|---|---|---|
| Anthropic | 1.25× (5-min) / 2.0× (1-hr) | **0.1×** | **explicit `cache_control` breakpoint** |
| Google Gemini | input + storage | 0.25× | automatic |
| DeepSeek | 1.0× | **0.1×** | automatic |
| OpenAI | free | 0.25×–0.5× | automatic |

Min threshold ≈ **1,024 tokens** (Gemini 2.5 Pro 4,096). **Decision:** the writer/judge/strategist presets carry large, stable system prompts (voice profile, banned phrases, grounding scaffold) → mark Anthropic `cache_control` on the static block. At 0.1× read this roughly **halves the effective input cost** of the sonnet-5 writer, which is the single biggest line item (see §7).

---

## 4. Competitor / product patterns (model-router dashboards)

Observed patterns in comparable "LLM gateway / router" products (OpenRouter's own routing UI, Portkey, LiteLLM, Vercel AI Gateway, Helicone; general prior art — `unverified` on any specific vendor's current feature exact naming):

1. **Named virtual models / aliases** — you call `"my-cheap-json"`, the gateway resolves provider+model+params. This is exactly the **preset** concept; validates the approach.
2. **Two-stage funnels are the default cost lever** — cheap classifier gates an expensive generator; premium spend concentrated on a small finalist set. Matches CemOS's existing council top-3 pattern.
3. **Fallback chains as config, not code** — declarative `primary → [fallbacks]`, with automatic degrade on 4xx/5xx/timeout. CemOS already has this in `getFallbackModels`; presets just make it declarative per task.
4. **Per-route budget + observability** — spend attributed by tag/route. CemOS's `meta.purpose` + `getMonthlySpendByPurpose` already does this; presets should each own a `purpose` prefix so the Costs tab breaks down by task family.
5. **Pin-with-float-fallback** — dashboards warn on floating aliases and encourage pinned primaries with a floating fallback for resilience. This is the rule the brief mandates; we enforce it in the preset schema (a lint that rejects a floating `primary`).
6. **Structured-output "modes" per route** — routers expose json/json_schema toggles per virtual model. CemOS should attach `structured` to each preset.

**Anti-pattern to avoid (baseline §7 "IA dispersion" analogue):** a full router *dashboard/UI*. The user's north star is focus + draft quality, not a control panel. Presets live in code + env; the only surface is the existing **Costs tab** showing per-preset spend. No new screen.

---

## 5. Architecture options (Low / Med / High)

### Option A — Low: "Catalog refresh + funnel discipline" (no new abstraction)
- Update `model-config.ts` defaults to the pinned 2026-07 slugs (§3.1 map).
- Route the remaining ~72 raw `generateJson` callers through `generateJsonGated`.
- Add `cache_control` on the writer/judge static prompts; switch schema'd calls to `json_schema strict`.
- **No preset layer** — roles stay the only vocabulary.
- **Pros:** smallest diff, immediate cost/quality win. **Cons:** roles still too coarse; task→model choices stay implicit and scattered; can't express "prefilter vs finalist" per task.

### Option B — Med (RECOMMENDED): "Preset layer over roles"
- New `src/lib/ai/presets.ts`: `PRESETS: Record<PresetName, PresetConfig>`; `resolvePreset(name)` returns params and a `role`; model still comes from `resolveModel(role)`.
- `generateJsonGated` gains an optional `preset` field; when present it seeds `role/temperature/provider/structured/purpose/timeout` from the preset (explicit args still override).
- Presets declare `primary`/`fallback` **slugs** used only to (a) set env-override defaults and (b) drive a startup lint (reject floating primary). Runtime model resolution is unchanged → fallbacks preserved.
- 9 presets (§10) map onto the 6 roles.
- **Pros:** task-facing, self-documenting, funnel + budget slices explicit, minimal new surface, fully additive. **Cons:** one new file + a migration pass over call sites.

### Option C — High: "Preset layer + per-task eval routing + auto-escalation"
- Everything in B, plus: each preset has an **`EvalTest`-backed acceptance gate** (baseline has `EvalTest` model + `scripts/run-eval-tests.ts`), and a runtime **auto-escalation** rule (if judge score < threshold, re-run the finalist on the escalation model, once, within budget).
- Optional: dynamic `sort` (latency in interactive contexts, price in cron).
- **Pros:** self-tuning quality, measurable. **Cons:** more moving parts, escalation risks budget spikes; premature before presets prove out. **Defer escalation logic to V2.**

**Recommendation: ship B for V1**, carry C's auto-escalation as a V2 flag-gated add-on.

---

## 6. Risks (preview / expiry / provider)

| Risk | Severity | Mitigation |
|---|---|---|
| **Floating alias silently changes model** (`-latest`, `-fast`, `fable`, `haiku-latest`) | HIGH | Preset lint: **primary MUST be a pinned dated slug**; floating allowed only in `fallback`. `claude-haiku-latest` currently has no pinned slug in my query → **`unverified`; pin before use or avoid haiku**. |
| **Pinned slug retired / 404** by provider | MED | `getFallbackModels` cross-provider chain already degrades; add a weekly `AiModelSnapshot` refresh (model exists in schema) to detect disappeared slugs. |
| **Provider outage / 5xx** on primary | MED | `allow_fallbacks:true` + declared fallback slug on a *different* provider (e.g. writer sonnet-5 → gpt-5.5 → gemini-pro). |
| **Structured `json_schema` rejected** by a routed provider | MED | Keep existing 400/422 retry that strips `response_format` → degrades to `json_object`; set `require_parameters:true` on schema-critical presets to avoid incapable routes. |
| **`:free` model quality/rate lottery** (current `deepseek-chat:free` default) | MED | Replace defaults with paid `deepseek-v4-flash` ($0.09/$0.18 ≈ free in practice); keep `ENABLE_FREE_MODELS` for dev only. |
| **Budget spike from escalation** (Option C) | MED | Escalation deferred to V2; when added, gate through `assertGenerationAllowed` per escalation call + cap escalations/day. |
| **Prompt-cache miss storms** (cache expiry between cron ticks) | LOW | Anthropic 1-hr cache for hourly writer batches; accept 5-min for interactive. |
| **Multimodal cost surprise** (image tokens) | LOW-MED | `cemos-multimodal-audit` capped by a small daily limit + its own `purpose` budget slice; heavy image *generation* stays on the separate `fal` budget (`getFalBudgetStatus`). |
| **Catalog drift** (this report dated 2026-07-08) | LOW | Re-run `/api/v1/models` at V2 build start; slugs/prices change. |

---

## 7. Cost & maintenance (projections)

**Operator:** 2 X accounts (grafikcem + maskulenkod), solo, manual-publish. Token estimates are **order-of-magnitude, `unverified`** — anchors, not guarantees. Prices from §3.1. "Cached" assumes Anthropic `cache_control` on the ~4k static writer/judge prompt (read 0.1×).

**Per-call anchors:**
- Extract (`gemini-3.1-flash-lite`, ~1.5k in / 0.3k out): ≈ **$0.0008/call**
- Prefilter (`deepseek-v4-flash`, ~1k in / 0.1k out): ≈ **$0.0001/call**
- Research (`gemini-3.5-flash`, ~5k in / 1k out): ≈ **$0.017/call**
- Writer (`claude-sonnet-5`, ~5k in / 1.5k out): ≈ **$0.025/call** uncached → **~$0.013 cached**
- Final-judge (`claude-sonnet-5`, ~3k in / 0.4k out): ≈ **$0.010/call** → **~$0.006 cached**

**Monthly projection (30 days):**

| Preset (purpose slice) | Low | Normal | Heavy | Driver |
|---|---:|---:|---:|---|
| `cemos-fast-extract` | $0.6 | $1.2 | $2.4 | news metadata+classify, hashtags, routing |
| `cemos-budget-batch` | $0.1 | $0.3 | $0.8 | dup prefilter, source reliability, recency |
| `cemos-research` | $0.5 | $2.0 | $4.5 | trend, opportunity, reels/competitor research |
| `cemos-multimodal-audit` | $0.2 | $1.0 | $3.0 | competitor visual, website verify, visual audit |
| `cemos-memory` (LLM + embeddings) | $0.2 | $0.6 | $1.5 | feedback extract, consolidation, embeddings |
| `cemos-writer` (cached) | $2.0 | $4.5 | $9.0 | X drafts, reels script, caption, carousel |
| `cemos-strategist` | $0.2 | $0.8 | $2.5 | monthly plan, topic clustering, X critique |
| `cemos-final-judge` (cached) | $0.8 | $2.0 | $4.5 | top-3 publish scoring, final judge |
| `cemos-image-concept` (text) | $0.1 | $0.3 | $0.8 | image briefs (fal spend separate) |
| **Total (OpenRouter)** | **~$4.7** | **~$12.7** | **~$29** | |
| Trimmed w/ caching + funnel | **~$3** | **~$9–10** | **~$22** | fits `MONTHLY_AI_BUDGET_USD=$10` at normal |

**Where premium is justified vs. where cheap suffices:**
- **Premium (sonnet-5) justified ONLY on:** the writer (draft *is* the product — user pain #2) and the final judge on the **top-3 finalists**. Everything upstream of the finalist set is cheap.
- **Cheap suffices for:** all extraction, classification, dedup, reliability, recency, routing, hashtags, and *first-pass* research/clustering — these feed a downstream judge that catches errors. Running them on flash-lite/deepseek-flash is 20–100× cheaper with no quality loss the funnel doesn't recover.
- **Two-stage funnel rule (make it structural):** generate cheap → score cheap → **promote only top-3 to premium**. This is already how council/growth-engine works; presets make it the default for *every* multi-candidate task.

**Maintenance:** one file (`presets.ts`) + the `model-config.ts` default map. Catalog refresh = re-run the JSON API + update ~14 slugs, ~quarterly or on provider deprecation notice. `AiModelSnapshot` cron can flag drift automatically.

---

## 8. Security / policy (data policy, key handling)

- **Single key, single ledger.** All presets use `OPENROUTER_API_KEY` (env NAME only — never quoted). Routing embeddings through OpenRouter's new `/embeddings` (§3.4) consolidates onto that one key + `UsageLog`, removing any separate OpenAI credential path.
- **Data collection.** Set `provider.data_collection:"deny"` on presets that handle the operator's private strategy/voice (writer, strategist, memory) so OpenRouter excludes providers that retain prompts. High-volume public-content presets (extract on public news/tweets) can leave default `"allow"` for wider/cheaper routing. **Decision:** default `"deny"` for writer/strategist/memory/final-judge; `"allow"` acceptable for extract/budget-batch/research on public source data.
- **Untrusted input stays fenced.** All presets that ingest scraped/tweet/competitor content MUST wrap it via the existing `untrustedData.wrapUntrustedData()` (`<<<KAYNAK_VERI>>>` fences) — external content is DATA, not instructions (per OS security rule). Presets don't change this; the migration must not drop the fence when moving a call site.
- **Budget as a safety control.** `assertGenerationAllowed()` runs *before spend* on every gated call. Making `generateJsonGated` the sole entry point closes the current hole where the Sprint path spends unlogged/ungated.
- **No secrets in preset config.** Presets contain slugs, numbers, policy enums — never keys. Env override keys (`OPENROUTER_*_MODEL`) are NAMEs only.
- **Structured-output as injection hardening.** `json_schema strict` shrinks the model's output surface, reducing the blast radius of a prompt-injection that tries to smuggle prose/instructions through a JSON field.

---

## 9. MVP / V1 / V2 placement

**MVP (ships with V2 focus+quality sprint):**
- Catalog refresh in `model-config.ts` (pinned slugs; sonnet-5, gemini-3.1-flash-lite, deepseek-v4-flash, gemini-3.5-flash). *(Option A subset — do this even if presets slip.)*
- `presets.ts` with the 9 presets → roles; `resolvePreset` + `generateJsonGated({preset})`.
- Migrate the **writer + judge + news-extract** hot paths onto presets (biggest cost + quality leverage).
- Anthropic `cache_control` on writer/judge static prompts.

**V1 (fast follow):**
- Migrate remaining ~72 raw `generateJson` callers to `generateJsonGated` (esp. Sprint growth-engine — close the gate/log hole).
- `json_schema strict` on all Zod-backed presets; retire redundant normalizers.
- Per-preset `purpose` slices surfaced in the Costs tab.
- Route embeddings through OpenRouter `/embeddings`.

**V2 (later):**
- Option C auto-escalation (flag-gated) + `EvalTest` acceptance gates per preset.
- `AiModelSnapshot`-driven catalog-drift alerting.
- Dynamic `sort` (latency for interactive, price for cron).
- Rerank — only if OpenRouter ships a documented endpoint (currently `unverified`).

---

## 10. Recommended approach — the 9 presets + migration

**Preset schema** (each preset is this frozen object; compiles to a role):

```
PresetConfig = {
  role: ModelRole            // → resolveModel(role) picks the actual slug
  primary: string            // pinned slug, for env-default + lint (must NOT float)
  fallback: string[]         // cross-provider; feeds getFallbackModels
  provider: { order?, sort, allow_fallbacks, require_parameters?, data_collection }
  reasoning: "none"|"low"|"medium"|"high"
  temperature: number
  structured: "json_schema"|"json_object"|"none"
  tools: "none"|"read-only"  // CemOS never grants write tools (manual-publish invariant)
  timeoutMs: number          // → generateJson deadlineMs
  retry: number
  cache: "none"|"auto"|"anthropic-breakpoint"
  dataPolicy: "allow"|"deny"
  budgetSlice: string        // UsageLog meta.purpose prefix
  escalateTo?: string        // V2: escalation slug when judge score < threshold
}
```

### The 9 presets

| Preset | role | Primary (pinned) | Fallback | sort | reason | temp | structured | tools | timeout | retry | cache | data | budget slice | escalation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **cemos-fast-extract** | cheapWriter | `google/gemini-3.1-flash-lite-20260507` | `deepseek-v4-flash-20260423`, `gemini-3.5-flash` | price | none | 0 | json_schema | none | 15s | 1 | auto | allow | `extract_` | — |
| **cemos-budget-batch** | cheapWriter | `deepseek/deepseek-v4-flash-20260423` | `gemini-3.1-flash-lite-20260507` | price | none | 0 | json_schema | none | 12s | 1 | auto | allow | `prefilter_` | — |
| **cemos-research** | qualityJudge | `google/gemini-3.5-flash-20260519` | `deepseek-v4-pro-20260423`, `gpt-5.5-20260423` | price | low | 0.3 | json_schema | read-only | 40s | 1 | auto | allow | `research_` | `gemini-pro-latest` (V2) |
| **cemos-multimodal-audit** | qualityJudge | `google/gemini-3.5-flash-20260519` | `google/gemini-pro-latest`, `gpt-5.5-20260423` | price | low | 0.2 | json_schema | read-only | 45s | 1 | auto | allow | `audit_` | `gemini-pro-latest` |
| **cemos-memory** | cheapWriter | `deepseek/deepseek-v4-pro-20260423` (LLM) + `openai/text-embedding-3-small` (embed) | `gemini-3.5-flash`; local-hash embed | price | none | 0.1 | json_schema | none | 30s | 1 | auto | deny | `memory_` | — |
| **cemos-writer** | creativeWriter | `anthropic/claude-sonnet-5-20260630` | `gpt-5.5-20260423`, `gemini-pro-latest` | (order: anthropic) | medium | 0.9 | none | none | 45s | 1 | anthropic-breakpoint | deny | `writer_` | `claude-4.8-opus-20260528` (V2) |
| **cemos-strategist** | qualityJudge | `anthropic/claude-sonnet-5-20260630` | `gpt-5.5-20260423`, `gemini-3.5-flash` | (order: anthropic) | high | 0.4 | json_schema | read-only | 60s | 1 | anthropic-breakpoint | deny | `strategy_` | `gpt-5.5-pro` (rare) |
| **cemos-final-judge** | viralJudge/finalEditor | `anthropic/claude-sonnet-5-20260630` | `gpt-5.5-20260423`, `gemini-3.5-flash` | (order: anthropic) | low | 0.2 | json_schema | none | 30s | 1 | anthropic-breakpoint | deny | `judge_` | `claude-4.8-opus-20260528` (V2) |
| **cemos-image-concept** | creativeWriter | `google/gemini-3.5-flash-20260519` (concept text) | `claude-sonnet-5-20260630` | price | low | 0.7 | json_schema | none | 30s | 1 | auto | deny | `image_` | `google/gemini-3-pro-image-20260528` (actual gen; fal budget primary) |

> Notes: `viralJudge`/`finalEditor` both resolve to sonnet-5 under the refreshed `operator_quality` profile, so `cemos-final-judge` can pick either role via `getJudgeMode(handle)`. `tools:"read-only"` = the model may be given retrieval/grounding context but **never a publish tool** (manual-publish invariant, baseline §6). Actual **image generation** stays on the existing `fal` path + `getFalBudgetStatus`; `cemos-image-concept` primarily produces the *brief*, with `gemini-3-pro-image` as the OpenRouter-native option if we consolidate later.

### Task → model matrix (25 CemOS tasks)

| # | Task | Preset | role → primary slug | Fallback (1st) |
|---|---|---|---|---|
| 1 | haber metadata çıkarma | fast-extract | cheapWriter → gemini-3.1-flash-lite | deepseek-v4-flash |
| 2 | haber sınıflandırma | fast-extract | cheapWriter → gemini-3.1-flash-lite | deepseek-v4-flash |
| 3 | topic clustering | research | qualityJudge → gemini-3.5-flash | deepseek-v4-pro |
| 4 | duplicate prefilter | budget-batch | cheapWriter → deepseek-v4-flash | gemini-3.1-flash-lite |
| 5 | semantic duplicate | memory (embeddings) | — → text-embedding-3-small | local-hash |
| 6 | kaynak güvenilirliği | budget-batch | cheapWriter → deepseek-v4-flash | gemini-3.1-flash-lite |
| 7 | güncellik (recency) | *(deterministic `buzzScore`)*; if LLM → budget-batch | cheapWriter → deepseek-v4-flash | — |
| 8 | account routing | fast-extract | cheapWriter → gemini-3.1-flash-lite | deepseek-v4-flash |
| 9 | trend analysis | research | qualityJudge → gemini-3.5-flash | deepseek-v4-pro |
| 10 | competitor metadata | fast-extract | cheapWriter → gemini-3.1-flash-lite | deepseek-v4-flash |
| 11 | competitor multimodal | multimodal-audit | qualityJudge → gemini-3.5-flash | gemini-pro-latest |
| 12 | website-verification summary | multimodal-audit | qualityJudge → gemini-3.5-flash | gpt-5.5 |
| 13 | content opportunity | research | qualityJudge → gemini-3.5-flash | deepseek-v4-pro |
| 14 | X draft | **writer** | creativeWriter → **claude-sonnet-5** | gpt-5.5 |
| 15 | X critique | **final-judge** | viralJudge → **claude-sonnet-5** | gpt-5.5 |
| 16 | reels research | research | qualityJudge → gemini-3.5-flash | deepseek-v4-pro |
| 17 | reels script | **writer** | creativeWriter → **claude-sonnet-5** | gpt-5.5 |
| 18 | carousel planning | writer / strategist | creativeWriter → claude-sonnet-5 | gpt-5.5 |
| 19 | caption | **writer** | creativeWriter → **claude-sonnet-5** | gemini-pro-latest |
| 20 | hashtag selection | fast-extract | cheapWriter → gemini-3.1-flash-lite | deepseek-v4-flash |
| 21 | monthly planning | **strategist** | qualityJudge → **claude-sonnet-5** | gpt-5.5 |
| 22 | feedback extraction | memory | cheapWriter → deepseek-v4-pro | gemini-3.5-flash |
| 23 | memory consolidation | memory | cheapWriter → deepseek-v4-pro | gemini-3.5-flash |
| 24 | final judge | **final-judge** | finalEditor → **claude-sonnet-5** | gpt-5.5 |
| 25 | visual audit | multimodal-audit | qualityJudge → gemini-3.5-flash | gemini-pro-latest |

**Fallback matrix (provider diversity — every primary degrades to a *different* provider):**

| Primary provider | 1st fallback | 2nd fallback | Final safety |
|---|---|---|---|
| Anthropic (sonnet-5) | OpenAI (gpt-5.5) | Google (gemini-pro-latest) | `getFallbackModels` chain + `json_object` degrade |
| Google (gemini-3.5-flash / lite) | DeepSeek (v4-pro/flash) | OpenAI (gpt-mini) | local-hash embed (memory only) |
| DeepSeek (v4-flash/pro) | Google (gemini-3.1-flash-lite) | — | mock fallback (dev) |

### Migration onto `generateJsonGated`

1. **Add `preset?: PresetName`** to `GenerateGatedOptions`; when set, seed `role/temperature/purpose/provider/structured/deadlineMs` from `resolvePreset(preset)` (explicit args win). No behavior change for existing 2 callers.
2. **Extend `openrouter.ts generateJson`** to accept an optional `provider` block + `structured:"json_schema"` (build `response_format` accordingly); keep the 400/422 strip-and-retry as the degrade path.
3. **Codemod the ~72 raw `generateJson` callers** in waves, by preset (writer → judge → news-extract → research → memory → Sprint growth-engine). Each wave: swap `generateJson(...)` → `generateJsonGated({ preset:"cemos-…", system, user, purpose })`; verify the untrusted-data fence is preserved; run `vitest` for that module.
4. **Sprint growth-engine** (`src/lib/growth-engine/*`) is the priority target — it currently neither gates nor logs; moving it onto presets closes the budget hole in one pass.
5. **Startup lint** (`presets.ts` self-check, run in a test): assert every `primary` is a pinned dated slug (regex `-\d{8}$` or known-pinned set); floating slugs allowed only in `fallback`. Fails CI if someone sets a floating primary.
6. **Costs tab**: group `UsageLog` by `meta.purpose` prefix → per-preset spend (readers already exist via `getMonthlySpendByPurpose`).

---

## 11. Test & acceptance criteria

- **Catalog correctness:** a unit test asserts each preset `primary` exists in a snapshot of `/api/v1/models` (or the pinned-slug allowlist) and is non-floating. *(Guards against typo'd/fabricated slugs.)*
- **Resolution:** `resolvePreset(name).role` → `resolveModel(role)` returns the expected slug under `MODEL_PROFILE=operator_quality`; env override still wins.
- **Gate invariant:** every `generateJsonGated` path calls `assertGenerationAllowed` before spend and writes exactly one `UsageLog` row with the preset's `purpose` prefix (mock `usageService`, assert call count = 1).
- **Fallback:** simulate primary 5xx (MSW) → asserts the declared fallback slug is attempted and succeeds; simulate `json_schema` 400 → asserts degrade to `json_object`.
- **Funnel:** for a multi-candidate task (draft→judge), assert only top-3 candidates hit the premium (sonnet-5) preset; the rest stay on cheap.
- **Budget:** with `MONTHLY_AI_BUDGET_USD` set below current spend, `assertGenerationAllowed` throws `BudgetExceededError` and no LLM call fires.
- **Cache:** writer/judge requests to Anthropic include a `cache_control` breakpoint on the static block (assert request shape).
- **Cost regression:** a scripted "normal day" simulation (fixtures) totals within the §7 normal envelope (≤ ~$12/mo projected). Wire into `scripts/run-eval-tests.ts` / `EvalTest`.
- **No-write-tools invariant:** assert no preset grants a write/publish tool (manual-publish guarantee).
- **Acceptance:** hot paths (tasks 14, 15, 21, 24 + news 1/2) migrated to presets; 994 existing tests stay green; Costs tab shows per-preset breakdown; startup lint passes.

---

## 12. Kaynakça

All accessed **2026-07-08**.

1. OpenRouter Models JSON API — `https://openrouter.ai/api/v1/models` — pinned slugs, context lengths, per-token pricing (§3.1). *(Primary source; HTML `/models` page is an SPA — JSON API used.)*
2. OpenRouter Structured Outputs — `https://openrouter.ai/docs/features/structured-outputs` — `json_schema strict` shape, provider support (§3.2).
3. OpenRouter Provider Routing — `https://openrouter.ai/docs/features/provider-routing` — `order`/`sort`/`allow_fallbacks`/`require_parameters`/`data_collection`, `:nitro` (§3.3).
4. OpenRouter Embeddings API — `https://openrouter.ai/docs/api-reference/embeddings` — `/embeddings` endpoint, model list (§3.4).
5. OpenRouter Prompt Caching — `https://openrouter.ai/docs/features/prompt-caching` — write/read multipliers, `cache_control`, thresholds (§3.5).
6. CemOS repo baseline — [`_repo-baseline.md`](./_repo-baseline.md) — existing registry, gate, fallback, ledger, 61 models.
7. CemOS source (read for grounding) — `src/lib/ai/model-config.ts`, `src/lib/ai/generateGated.ts`.

**`unverified` items:** (a) `claude-haiku-latest` has no pinned dated slug in the query result — needs a pinned fallback or avoid; (b) no documented OpenRouter **rerank** endpoint found — treated out-of-scope; (c) all **token-count assumptions** in §7 are estimates, not measured; (d) competitor router feature specifics in §4 are pattern-level, not vendor-exact; (e) whether `deepseek-v4-*` / `gemini-3.*` routes honor `json_schema strict` on *every* provider route (repo's strip-and-retry degrade covers this).
