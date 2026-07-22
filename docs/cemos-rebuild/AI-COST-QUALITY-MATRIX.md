# AI Cost / Quality Matrix — CemOS (Phase 5F §4)

> Static inventory of every real LLM (OpenRouter) call site + the routing/pricing
> contract. Method: `generateJson`/`generateJsonGated`/`preset:`/`role:` grep across
> `src/`, each hit read in context; pricing re-verified against the **live**
> OpenRouter catalog on **2026-07-20**. Branch `feature/cemos-rebuild` @ `720bc06`.
>
> **Ground-truth invariants (verified this pass):**
> - **DIRECT-UNGATED = ∅.** No production file calls the raw `generateJson` primitive.
>   The only `generateJson(` / `generateJson<` occurrences in `src/` are its definition
>   (`openrouter.ts:208`), the single gate caller (`generateGated.ts:84`), and its own
>   cost test. Every business call goes through `generateJsonGated` → budget gate +
>   exactly-one `UsageLog` row.
> - **No unowned call.** All 47 sites below carry a `purpose` (or preset `purposePrefix`)
>   and a budget class; none is `other/unknown`.
> - **Pricing has a source.** Every routed slug is priced from the catalog-verified
>   `MODEL_PRICING` (see §5); unknown slugs fall back to a **positive** role estimate,
>   never `$0`; the provider-reported `usage.cost` is authoritative when present.

---

## 1. Routing architecture — two layers (the §5 finding)

CemOS resolves a model in one of two ways. **Both are honest and both write `UsageLog`,
but they are parallel systems and the same conceptual job can be priced differently
depending on which path a caller took.**

| Layer | Where | Governs | Profile-aware? |
|---|---|---|---|
| **Preset** (`presets.ts`, 9 presets) | passed as `preset:` to the gate | model + fallbacks + structured + cache + provider + maxPrice + reasoning + timeout, all pinned | **No** — presets hardcode `primary`; `MODEL_PROFILE` is ignored |
| **Role** (`model-config.ts`, 6 roles) | passed as `role:` (no preset) | `resolveModel(role)` → slug by `MODEL_PROFILE` (dev/operator_quality/premium) + env overrides | **Yes** |

**Consequence (documented, not yet unified):** the model profile (`dev`/`operator_quality`/
`premium`) only steers **role-path** calls. Preset-path calls (the X writer, final judge,
news, memory, curation, research) always use their pinned slugs regardless of profile. The
profile is now **durable** (§6 fix) and honestly reflected, but its runtime reach is the
role path only. Unifying both behind one `ResolvedAiRoute` resolver is a **provisional
recommendation** (§8 below) — deferred because it is a cross-cutting rewrite that needs
benchmark evidence, and the task forbids risky rewrites without it.

### 1a. Preset table (pinned; catalog-verified 2026-07-20)

| Preset | role | primary | in/out $/M | fallbacks | structured | reasoning | cache | data | budget* |
|---|---|---|---|---|---|---|---|---|---|
| cemos-fast-extract | cheapWriter | google/gemini-3.1-flash-lite | 0.25 / 1.5 | deepseek-v4-flash, gemini-3.5-flash | json_schema | none | auto | allow | background |
| cemos-budget-batch | cheapWriter | deepseek/deepseek-v4-flash | 0.09 / 0.18 | gemini-3.1-flash-lite | json_schema | none | auto | allow | background |
| cemos-research | qualityJudge | google/gemini-3.5-flash | 1.5 / 9 | deepseek-v4-pro, gemini-3.1-flash-lite | json_schema | low | auto | allow | background |
| cemos-multimodal-audit | qualityJudge | google/gemini-3.5-flash | 1.5 / 9 | deepseek-v4-pro, gemini-3.1-flash-lite | json_schema | low | auto | allow | background |
| cemos-memory | cheapWriter | deepseek/deepseek-v4-pro | 0.435 / 0.87 | gemini-3.5-flash | json_schema | none | auto | **deny** | background |
| cemos-writer | creativeWriter | anthropic/claude-sonnet-5 | 2 / 10 | deepseek-v4-pro, gemini-3.5-flash | json_object | medium | anthropic-breakpoint | **deny** | **essential** |
| cemos-strategist | qualityJudge | anthropic/claude-sonnet-5 | 2 / 10 | gpt-5.4-mini, gemini-3.5-flash | json_schema | high | anthropic-breakpoint | **deny** | background |
| cemos-final-judge | viralJudge | openai/gpt-5.4-mini | 0.75 / 4.5 | deepseek-v4-pro, gemini-3.1-flash-lite | json_schema | low | auto | **deny** | **essential** (judge_) |
| cemos-image-concept | creativeWriter | google/gemini-3.5-flash | 1.5 / 9 | deepseek-v4-pro | json_schema | low | auto | deny | background |

\* Budget class is derived from `purpose` at the call site (`inferAiBudgetClass`), not from the
preset — `writer_*` and `judge_x_critique`/`judge_final_polish` → **essential**; `eval_*` →
**evaluation**; everything else → **background**.

**Writer/judge family split (C3):** writer = `anthropic`, final-judge = `openai` — enforced by
`validatePresets()` at boot and `verify:catalog`. ✓

### 1b. Role table (operator_quality resolution)

| role | operator_quality slug | in/out $/M | dev default | premium |
|---|---|---|---|---|
| cheapWriter | gemini-3.1-flash-lite | 0.25 / 1.5 | deepseek-v4-flash | gpt-5.4-mini |
| creativeWriter | gemini-3.5-flash | 1.5 / 9 | deepseek-v4-flash | gpt-5.4-mini |
| viralJudge | gemini-3.1-flash-lite | 0.25 / 1.5 | deepseek-v4-flash | gpt-5.5 |
| qualityJudge | gemini-3.5-flash | 1.5 / 9 | deepseek-v4-flash | gpt-5.5 |
| finalEditor | claude-sonnet-5 (opt-in) | 2 / 10 | deepseek-v4-flash | gpt-5.4-mini |
| premiumCreative | claude-sonnet-5 (opt-in) | 2 / 10 | claude-sonnet-5 | claude-sonnet-5 |

> The role-path judge (`viralJudge`/`qualityJudge`, gemini) differs from the preset-path
> judge (`cemos-final-judge`, gpt-5.4-mini). Same "judge" concept, different family/price
> by path — the crux of the §5 unification recommendation.

---

## 2. Call-site inventory — 47 distinct production prompts

Every row: `file:line` · purpose · preset/role · user-waiting? · frequency · degraded behavior.
All reach `generateJsonGated` (directly, or via the shared executors `pipeline-runner.ts:54`
`runStage` and `learning/pipeline/run-llm.ts` `runValidatedStage`).

### X / Twitter — draft pipeline
- `draft-pipeline.ts:260` · `writer_x_draft` · **preset cemos-writer** · both (cron+interactive+worker) · 1–2/run (1 repair-retry) · no key → mock before call; hard throw (budget) propagates to `draftService`.
- `draft-pipeline.ts:429` · `judge_x_critique` · **preset cemos-final-judge** · same · 1/run reaching judge (skipped by `judge_mode=off`/risk-fast-path/deadline) · throw propagates; empty ranked → falls back to promoted writer drafts.
- `draft-pipeline.ts:508` · `judge_final_polish` · preset cemos-final-judge · same · **0 by default** (opt-in `ENABLE_FINAL_EDITOR`) · local try/catch → keeps unpolished winner.

### X / Twitter — quality / eval
- `batchedJudge.ts:147` · `judge_x_subscores14` · preset cemos-final-judge · same triggers · 1/draft, only when `EVAL14` on + real draft · throws by design; `draftService:444` catches → `eval14=null`, generation continues.
- `qualityLintService.ts:117` · `quality_lint` · **role qualityJudge** · draft path only · 0–1/draft (skipped by deterministic-only / `ENABLE_LLM_LINT=false` / risk-fast-path / blocker / mock) · local try/catch → deterministic-only report + warning, never throws.

### X / Twitter — routing / council / memory-rerank
- `router.ts:50` · `extract_account_route` · role cheapWriter · background · 1/routed item · try/catch → `{best:null, usedLlm:false}`, fail-open.
- `council.ts:65` · `judge_council_lens` · role cheapWriter · background · **4 parallel**/deliberate · per-lens try/catch + allSettled → neutral default.
- `retrieval.ts:91` · `memory_rerank` · preset cemos-final-judge · background · 0–1/draft (skip when pool ≤ 8) · try/catch → original cosine order, fail-open.

### X / Twitter — mining / discovery
- `pre-filter.ts:63` · `prefilter_source_batch` · role cheapWriter · background · 1/≤40-item batch · try/catch → keep ALL items, fail-open.
- `viral-analysis.ts:90` · `extract_viral_analysis` · role cheapWriter · background · 1/mined item · try/catch → deterministic `heuristicAnalysis`, fail-open.

### X / Twitter — Growth Engine (parallel subsystem)
- `draft-generator.ts:94` · `writer_x_growth` · role creativeWriter · interactive · 1/req · outer try/catch → **static canned** fallback strings (⚠ not a heuristic; flagged).
- `scorer.ts:959` · `extract_source_score` · role cheapWriter · **DEAD (no live caller)** · 0 · would fall back to heuristic sibling (also unreachable).
- `scorer.ts:991` · `judge_draft_score` · role cheapWriter · interactive · ~1/variant + feedback + rescore · try/catch → `scoreDraftFallback` heuristic.
- `pattern-extractor.ts:346` · `extract_pattern` · role cheapWriter · interactive · 0–1/qualifying feedback · try/catch → heuristic extraction.

### News (cron-primary)
- `newsAi.ts:84` · `news_translate` · preset cemos-fast-extract · bg cron+interactive · 1/new item · typed `{success:false}`, never throws.
- `newsAi.ts:217` · `news_score` · preset cemos-fast-extract · same (+opportunities) · 1/item · typed failure result.
- `newsAi.ts:278` · `news_repo` · preset cemos-fast-extract · cron+interactive · 1/new repo · try/catch → original description fallback.
- `newsAi.ts:331` · `digest` · preset cemos-research · cron daily · 1/build · try/catch → empty summary.

### Memory (background/cron)
- `consolidation.ts:141` · `memory_extraction` · preset cemos-memory · cron · 1/account · per-account loop catches → `invalid_llm_output`, others unaffected.
- `voiceProfileService.ts:73` · `memory_voice_distill` · role cheapWriter · cron · 1/account (≥8 samples) · try/catch → `{ok:false}`, never breaks cron.

### Opportunities / Agent Registry
- `opportunityCurator.ts:147` · `research_opportunity_curation` · preset cemos-research · interactive/cron · **~0 (hard-gated `ENABLE_AGENT_CURATION` + key-rotation)** · throws `AgentBlockedError` before network; route → deterministic curation, labeled honestly.

### Content Library
- `reverseEngineer.ts:147` · `reverse_engineer` · role creativeWriter · interactive · 1/req (24h idempotency reuse) · throw propagates; invalid Zod → no Idea row, cost still logged.

### Instagram — comments/DMs (ALL 6 DEAD at runtime)
`instagramService` (sole caller) has no live production consumer; `/api/instagram/sync` uses `bridgeSyncService` instead. Exercised only by tests.
- `comment-pipeline.ts:198` · `ig_comment_classify` · role cheapWriter · **dead** · throws (caller swallows).
- `comment-pipeline.ts:226` · `ig_reply_draft` · role creativeWriter · **dead**.
- `comment-pipeline.ts:247` · `ig_reply_draft` · role cheapWriter · **dead** · fail-open safety:70 if reached.
- `dm-pipeline.ts:146` · `ig_dm_read` · role cheapWriter · **dead**.
- `dm-pipeline.ts:162` · `ig_dm_read` · role cheapWriter · **dead**.
- `dm-pipeline.ts:187` · `ig_dm_draft` · role creativeWriter · **dead** (no local catch, but unreachable).
- `dm-pipeline.ts:208` · `ig_dm_draft` · role cheapWriter · **dead**.

### Instagram — Reels Dossier (4-stage, fail-closed)
- `dossier-generator.ts:333` konsept · role qualityJudge · interactive (never cron) · 1/req · abort-on-fail, **no partial write**.
- `dossier-generator.ts:345` hook · role creativeWriter · same · 1 if konsept ok.
- `dossier-generator.ts:357` senaryo · role premiumCreative (fallback creativeWriter) · same · 1 if prior ok · 1 role-fallback retry inside runner.
- `dossier-generator.ts:371` caption · role creativeWriter · same · 1 if prior ok · success → single `reelDossier.create` (all-or-nothing).

### Instagram — Carousel
- `carouselGenerator.ts:340` · `ig_carousel` · role premiumCreative (fallback creativeWriter) · interactive (never cron) · 1/req · try/catch → `invalid_output`, no partial write.

### YouTube — Brief (5-stage, fail-open)
- `brief-generator.ts:105` analiz · role viralJudge · interactive · 1/req · per-stage try/catch, continues.
- `brief-generator.ts:123` fark · role qualityJudge · · continues.
- `brief-generator.ts:142` iskelet · role creativeWriter · · continues.
- `brief-generator.ts:174` tammetin · role premiumCreative (fallback creativeWriter) · · continues.
- `brief-generator.ts:197` cila · role finalEditor · only if fullScript · never throws, returns partial + warnings.

### Learn Pipeline (8 stages, `runValidatedStage` → 1 repair-retry → throw)
All `purpose = learn_pack` (stage in `meta.stage`); interactive `/advance` + cron sweep; orchestrator catches per-stage, job resumable.
- `stages-ai.ts:60` section_N · role content_analysis→cheapWriter · N/job (per section).
- `stages-ai.ts:83` global_synthesis · role qualityJudge (fb creativeWriter) · 1/job.
- `stages-ai.ts:103` concepts · role qualityJudge · 1/job.
- `stages-ai.ts:125` assessment · role creativeWriter · 1/job.
- `stages-ai.ts:144` notes · role creativeWriter · 1/job.
- `stages-ai.ts:163` graph · role qualityJudge · 1/job.
- `stages-ai.ts:182` tasks · role creativeWriter · 1/job.
- `stages-ai.ts:201` content_ideas · role creativeWriter · 1/job.

---

## 3. Dead / gated-off sites (cost = $0 today)
- **7 dead at runtime:** 6 Instagram comment/DM sites + `scorer.ts:959`. Cross-checked: `instagramService` unimported by `src/app/*`; IG sync uses `bridgeSyncService`. Consistent with the dormant IG cluster (Phase 5A/5E — re-home pending, models seed-only). → tracked in POST-RELEASE-BACKLOG; not deleted this pass (per §15 per-route proof + churn-safety; the AI *stages* are shared code, deleting needs the whole IG cluster decision).
- **1 hard-gated off:** `opportunityCurator.ts:147` (`ENABLE_AGENT_CURATION` + `OPENROUTER_KEY_ROTATED_AT`).
- **1 opt-in off:** `draft-pipeline.ts:508` final editor (`ENABLE_FINAL_EDITOR`).

---

## 4. Budget classes & gate (`costGate.ts`)
- **essential** — `writer_*`, `judge_x_critique`, `judge_final_polish`, `ig_dm_draft`, `ig_reply`. Paced against the full monthly limit.
- **background** — everything else. Capped at `operatingBudget × backgroundRatio(0.3) × monthProgress`.
- **evaluation** — `eval_*`. Hard `$0` unless `AI_EVAL_SPEND_ENABLED=true` (default off).
- Provider key remaining (`getOpenRouterKeyStatus`) is a second hard ceiling. Reserve (`AI_MONTHLY_RESERVE_USD`, default $1) is kept away from background. **Gap (§10):** check→call→settle has no atomic reservation (see task §10).

---

## 5. Pricing provenance (live-verified 2026-07-20)
`MODEL_PRICING` (`model-config.ts`, `MODEL_PRICING_VERIFIED_AT = "2026-07-20"`) — every routed
slug matched the live OpenRouter catalog **exactly**:

| slug | code in/out | live in/out | ✓ |
|---|---|---|---|
| anthropic/claude-sonnet-5 | 2 / 10 | 2 / 10 | ✓ |
| anthropic/claude-opus-4.8 | 5 / 25 | 5 / 25 | ✓ (added 5F) |
| openai/gpt-5.5 | 5 / 30 | 5 / 30 | ✓ |
| openai/gpt-5.4-mini | 0.75 / 4.5 | 0.75 / 4.5 | ✓ |
| google/gemini-3.5-flash | 1.5 / 9 | 1.5 / 9 | ✓ |
| google/gemini-3.1-flash-lite | 0.25 / 1.5 | 0.25 / 1.5 | ✓ |
| deepseek/deepseek-v4-flash | 0.09 / 0.18 | 0.09 / 0.18 | ✓ |
| deepseek/deepseek-v4-pro | 0.435 / 0.87 | 0.435 / 0.87 | ✓ |

- Real per-call cost = provider `usage.cost` when present (`GenerateJsonResult.actualCostUsd`),
  else the catalog estimate; the gate logs the **actual model used** after fallback, not the
  primary, and logs **failed-but-billed** attempts too. This is honest for §7's actual-vs-estimated.
- Catalog notes ~60–80% savings from prompt caching → the writer/strategist anthropic
  `cache_control` breakpoint already exploits this; other presets don't (a §11 lever, not a bug).
- **No live-refresh pipeline.** `AiModelSnapshot` is a *rankings* table, not pricing;
  `MODEL_PRICING` is the committed, dated, catalog-verified fallback. A periodic price-drift
  check is a provisional §7 recommendation, not implemented (network to openrouter.ai is
  reachable only via WebFetch here, not the runtime).

---

## 6. Cheaper-deterministic-alternative candidates (§9 Tier-0 map)
Sites where an LLM is used but a deterministic path exists or already backstops it:
- `pre-filter.ts` — LLM prefilter already **fails open to keep-all**; a deterministic keyword
  prefilter could gate the LLM to only ambiguous items (Tier-1 candidate).
- `viral-analysis.ts` / `scorer.ts` — deterministic `heuristicAnalysis`/`*Fallback` already
  exist as the fallback; could be promoted to first-pass, LLM only on low-confidence (Tier-1).
- `router.ts` account routing — deterministic fit-scoring exists (`usedLlm:false` path); LLM is
  the enhancer, not required.
- `draft-generator.ts` static-canned fallback — ⚠ the only fallback that is **not** a
  computation; flag for review (a failed growth draft returns fixed marketing copy).

None changed this pass — promotion requires the benchmark (§8) to prove no quality loss.

---

## 7. Provisional recommendations (evidence-pending — NOT applied)
1. **Unify routing** behind one `ResolvedAiRoute` resolver so preset & role paths share one
   price/budget/family contract and the profile can (optionally) steer both. Compatibility
   wrappers, not a rewrite. Needs §8 benchmark to justify any model change.
2. **Adaptive escalation** (Tier 0→3): deterministic prefilter → cheap extract → balanced →
   premium only on quality-bar miss / high-risk / explicit premium profile. Judge `risk_based`
   mode already exists (`getJudgeMode`); extend to more sites.
3. **Price-drift check** reusing the WebFetch-verified catalog on a schedule with a committed
   fallback + staleness flag.

These are recommendations only; "cheapest = best" / "quality unchanged" are **not** claimed
without the bounded live benchmark, which requires an explicit USD ceiling + `AI_EVAL_SPEND_ENABLED`
(operator action, §19). Dry-run (free) benchmark = catalog/capability/price/fixture-contract
checks; that is the `verify:ai-economics` guard (§17).
