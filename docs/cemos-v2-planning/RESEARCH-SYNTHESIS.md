# CemOS V2 — Research Synthesis

> **Inputs:** 9 research reports in [`research/`](./research/) + [`research/_repo-baseline.md`](./research/_repo-baseline.md) (grounding anchor).
> **Method:** every load-bearing finding was critiqued against 11 criteria (primary-sourced? current? applicable to the real repo? needless complexity? real user value? maintenance cost? policy-safe? too much for one operator? sustainable cost? simpler deterministic option? already covered by an existing engine?). Contradictions between reports are tabled with a **final ruling** each. The 7 decision areas at the end are **locked** — the FINAL-* specs implement them.
> **North star (user-confirmed):** CemOS isn't used daily because of (1) **Odak yok** (IA dispersion) and (2) **Taslak kalitesi** (drafts not publish-ready). Freshness/reliability secondary. MVP = focus + quality only.
> Date: 2026-07-08.

---

## 1. Verdict per report (critique pass)

| # | Report | Verdict | Critique highlights |
|---|---|---|---|
| 01 | Product Simplification | **ACCEPT** | Grounded (Playwright tour of Typefully + 4 doc-verified products). "One surface, one number, one action" is the correct answer to root cause #1. KEEP/MERGE/MOVE table covers all 16 screens. Linear 31%→70% figure correctly tagged `unverified`. No over-engineering — Low option is pure reorder. |
| 02 | Agentic Memory | **ACCEPT with trims** | Found two REAL live bugs (pattern retrieval uses 256-dim hash fallback `vector-memory.ts:304`; `FeedbackEvent` never read back) — highest-value findings of the corpus. Three-tier store + ≥3-obs promotion + provenance gate are right-sized. TRIM: Graphiti-style bi-temporal `MemoryFact` is V1, not MVP; framework SDKs correctly rejected. Embedding-swap recommendation conflicts with 06 (ruled below). |
| 03 | X Content Engine | **ACCEPT** | The core quality report. Two-engine overlap map is exact; "LIVE spine + absorb Sprint scorer + leak-detector" is the simplest unification that keeps the best assets. Viral-prediction limits properly sourced (F1≈87% is post-hoc WITH network features → draft-time score is a weak prior). X-policy verified: manual-publish correct; only live constraint = no substantially-similar content across own accounts → routing guard. Turkish checklist honestly marked part-inferred. |
| 04 | IG Competitor Intel | **ACCEPT** | Policy work is exemplary: business_discovery = only sanctioned read; CrowdTangle dead; MCL unavailable; Bright Data ruling correctly read as NOT a safe-harbor. Clone-YouTube-engine approach = ~80% infra reuse. Correctly self-placed in V1. Model refs (gemini-2.5) are stale → mapped to preset layer (ruling C2). |
| 05 | Reels Monthly Planner | **ACCEPT with correction** | Playwright PoC (Bard→Gemini redirect; Ideogram signup-gate) is decisive proof for HTTP/browser-authoritative verification. Verifier-as-separate-module design is right. CORRECTION: its "live catalog" price table (gemini-2.5-flash $0.30/$2.50, sonnet-4-5 $3/$15) contradicts 06's JSON-API pull — 06 wins (ruling C1); 05's cost conclusions survive since they're order-of-magnitude. |
| 06 | OpenRouter Routing | **ACCEPT (canonical catalog)** | Only report that queried `/api/v1/models` directly; pinned dated slugs + prices + structured-output/provider-routing/caching docs all primary. Preset-over-roles (Option B) is the right thin layer. ONE DEFECT: its preset table puts writer AND final-judge both on `claude-sonnet-5`, violating 07's writer≠judge-family invariant (ruling C3 fixes this). |
| 07 | Evaluation & Learning Loop | **ACCEPT** | 14 sub-scores with [D]/[J] split and one-batched-judge-call cost shape is disciplined. Two-gate false-learning defense (repetition AND significance AND brand veto) is the strongest anti-drift design in the corpus. Edit-distance from existing `FeedbackEvent` = free high-signal metric; adopt everywhere. Honest about future-dated arXiv IDs. |
| 08 | Data/Workers/Observability | **ACCEPT** | Correctly refuses Vercel Queues/Workflows for one operator despite their existence; "90% KEEP + plumbing discipline" matches north star. Idempotency keys on two spend-heavy ticks = right-sized durability. Hobby cron ±59 min finding is material for the 04:00 draft cron. RLS-skip decision correct. |
| 09 | Series & Voice DNA | **ACCEPT** | Found that `VoiceProfile` (17 fields) IS Voice DNA but is **not consumed** by `buildDraftSystemPrompt` — a wire-it gap, not a build gap. `SeriesProfile` single-table design + ≤5 few-shot cap (sourced) + PRELUDE edit-diff loop are additive and lean. Correctly scopes MVP to one series. |

**Cross-corpus signal — the most-agreed single action (6/9 reports independently):** make **`generateJsonGated` the sole OpenRouter entry point** (~72 raw `generateJson` callers today; Sprint path neither gates nor logs). This is simultaneously a cost, governance, observability, and security fix. It is Priority 1 of the whole program.

**Second most-agreed:** everything additive; no framework/SDK/queue/vector-DB adoption at this scale; reuse `CronRun`/`PipelineTrace`/`UsageLog`/`EvalTest`/`FeedbackEvent` rather than new subsystems.

---

## 2. Contradiction table + rulings

| # | Conflict | Reports | Final ruling |
|---|---|---|---|
| **C1** | **Which model catalog is real?** 06: JSON-API pull → `gemini-3.5-flash`/`gemini-3.1-flash-lite`/`claude-sonnet-5`/`deepseek-v4-*` with pinned dated slugs. 05: claims live pages show `gemini-2.5-flash`/`sonnet-4-5` prices. 02: embeddings collection shows qwen3/gemini-embedding options. | 05 vs 06 | **06 is canonical.** It used the machine-readable `/api/v1/models` endpoint; 05/04/07 model name references were role-level shorthand from the baseline. All FINAL docs use 06's pinned slugs. 05's per-dossier cost estimates survive (order-of-magnitude, re-anchored to 06 prices). Variance itself tagged `unverified` and re-check mandated at build time. |
| **C2** | **Stale model names in 04/05/07** (`gemini-2.5-flash`, `claude-sonnet-4-5`) vs 06's refresh. | 04, 05, 07 vs 06 | Mechanical mapping: every task keeps its **preset**, models come from the preset. Multimodal capture (04) → `cemos-multimodal-audit` (gemini-3.5-flash). Verifier summary (05) → `cemos-multimodal-audit`. Judge (07) → `cemos-final-judge`. No report's *architecture* changes. |
| **C3** | **Writer≠judge family violated by 06's own preset table.** 06: writer = sonnet-5, final-judge = sonnet-5 (same family). 07: writer model family must never grade its own drafts (self-preference bias, NeurIPS 2024). | 06 vs 07 | **07's invariant wins — it is evidence-backed.** Fix: `cemos-writer` primary stays `anthropic/claude-sonnet-5-*` (best Turkish creative + prompt-cache 0.1×); **`cemos-final-judge` primary becomes `openai/gpt-5.5-*`** (opposing family), fallback `google/gemini-3.5-flash-*` (third family), with sonnet allowed only as last-resort fallback. Registry gains an enforced writer-family ≠ judge-family test. Cost impact ≈ neutral (gpt-5.5 $5/$30 vs sonnet-5 $2/$10 on a small top-3-only call volume; judge calls are short). |
| **C4** | **Embedding model.** 02: switch primary to `qwen/qwen3-embedding-8b` (Turkish value, $0.01/M). 06: `openai/text-embedding-3-small` "stays default". | 02 vs 06 | **Phased.** MVP: keep `text-embedding-3-small` (wired, proven; churn now buys nothing while vectors are few). V1: upgrade to `qwen3-embedding-8b` **with** 02's own preconditions — store `model`+`dimensions` per vector, gated re-embed migration, never mix spaces. Turkish-ranking claim stays `unverified` (multilingual MTEB inference) → run a small A/B on the golden set before committing. |
| **C5** | **How much lands in the first sprint?** 01/02/03/07/09 each nominate their own "MVP" items; summed they exceed a 2-week sprint. | all | **Sprint-1 scope locked** (see §4/FIRST-SPRINT): 01-Low (Bugün queue-first + error states) + 03-Low (engine unification: single account identity, scorer sub-signals into `QueueItem.scores`, leak gate, Turkish lint) + 06 catalog refresh + presets on hot paths (writer/judge/news-extract) + gate migration on those hot paths + 07 edit-distance capture (free) + 02's two bug fixes (pattern embeddings, FeedbackEvent wire-in) + 09's "wire VoiceProfile into builder" (no new calls). **Deferred out of sprint 1:** full 14-sub-score set (sprint 1 ships 03's decomposed signals; 07's full set = V1), `MemoryFact`/DNA tables (V1), `SeriesProfile` (V1), voice-constitution.md (V1), nav consolidation (V1), all of 04/05 (V1). |
| **C6** | **Three different "first Instagram UI" proposals.** 01: IG review lane in Bugün (reuse DraftReviewCard). 04: `ig-radar` competitor screen. 05: Reels dossier list. | 01 vs 04 vs 05 | **Sequence, don't multiply.** V1 order: (1) IG review lane inside Bugün (smallest, reuses DraftReviewCard, serves the daily ritual); (2) ONE "Instagram" area screen with sub-tabs hosting Rakip Radarı (04) and Reels Dosyaları (05) — not three top-level screens. Consistent with 01's anti-sprawl thesis and the ≤5-group nav. |
| **C7** | **Council vs new batched judge.** 03 keeps `council.deliberate` as-is; 07 says council lenses overlap the 14 sub-scores and should be repurposed as the judge stage. | 03 vs 07 | **Converge in V1.** Sprint 1: council untouched (it's off the daily draft path). V1: the batched opposing-family judge call absorbs the four council lenses (hook/persona/risk/novelty map to sub-scores #8/#5/#12-veto/#6); `council-config.ts` weights become rubric weights. One judge vocabulary, one call. |
| **C8** | **Memory extraction model.** 02: `cheapWriter` (flash) for extraction. 06 preset `cemos-memory`: `deepseek-v4-pro`. | 02 vs 06 | **06 wins** (preset layer is the single routing authority; deepseek-v4-pro $0.44/$0.87 with 1M ctx is strictly better for consolidation batches). 02's Zod-validation + `mem_` budget prefix requirements carry over unchanged (06 preset uses `memory_` — **unify prefix as `memory_`**). |
| **C9** | **Where do eval KPIs render?** 07: fold into `costs`/settings, no new screen. 08: health dashboard extends `OperatorReadinessGate` + `CostsTab`. 01: readiness gate collapses when healthy. | 01/07/08 | Compatible — **one rule:** no new top-level screen. Health + eval KPIs live in `CostsTab` (detail) + the collapsed-unless-unhealthy readiness tick on Bugün (signal). 08's "untracked-call counter" and cron `!ok` alerts surface through the readiness gate only when red. |
| **C10** | **Verifier render tier placement.** 05: Playwright render escalation "on the worker or a dedicated route", serverless feasibility `unverified`. 08: worker is local-only, no-ops on Vercel. | 05 vs 08 | **HTTP tier ships first (V1 MVP-of-the-feature) — it is serverless-safe.** Render escalation runs on the local worker initially (08's split makes this free); a Vercel-compatible slim-chromium spike is a V1 task with its own go/no-go. Dossiers gate on HTTP evidence; render-only signals (signup/free-tier) show `unknown` until render tier lands. |
| **C11** | **Hobby cron imprecision (±59 min) vs "morning drafts ready when he wakes".** 08 finding. | 08 vs 01's ritual | Accept on Hobby: move expectation, not infra — schedule `generate-morning` at `0 3 * * *` UTC so even +59 min lands before the operator's morning (Istanbul = UTC+3 → 06:00-07:00). Document; revisit Pro only if it ever bites. |

---

## 3. The 11-criteria sweep (what got cut)

Findings **rejected or deferred** for failing criteria (needless complexity / too much for one operator / simpler deterministic option / already covered):

- **Framework adoption** (Mem0/Letta/Zep SDKs, LangChain/LangSmith, DeepEval-as-dep, Temporal/Inngest, Vercel Queues mesh) — all rejected across 02/07/08. Borrow ideas, keep Prisma+TS.
- **Temporal knowledge graph** (02-High) — deferred indefinitely; 2 accounts don't need multi-hop.
- **pgvector now** (02/08) — deferred to V2 behind a measured threshold (~50k vectors or p95 >150 ms). JS-cosine exact scan is *correct*, not a compromise, at this scale.
- **Pairwise preference learning / bandits** (07-High) — V2-later; only after the significance gate demonstrably blocks one bad lesson.
- **Full router dashboard UI** (06 anti-pattern) — never; presets live in code, spend shows in CostsTab.
- **Automated IG scraping / Apify default** (04) — never by default; policy ruling final.
- **Auto-posting / API scheduling** (03-High) — deferred past V2 start; manual-publish is a security feature.
- **RLS** (08) — skipped; no threat it mitigates in a single-operator app.
- **Deterministic-first rule confirmed everywhere:** freshness, corroboration, originality-cosine, leak gates, phrase lint, pillar balance, repetition histograms, edit distance — all pure code, no LLM. LLM only where judgment is genuinely needed.

---

## 4. Locked decisions (7 areas)

### D1 — Kullanıcı deneyimi (UX)
- **Nav (final):** 5 groups — **Bugün · Radar · Kütüphane · Youtube · Araçlar**. `daily-queue` demoted to Bugün drill-down; 4 Twitter intel screens merge into Radar; 3 libraries merge into one Kütüphane (sub-tabs); Instagram becomes a lane in Bugün (V1) + one Instagram area screen (V1, sub-tabs Rakip Radarı / Reels). All ids preserved via `TAB_ALIASES`; regression test per alias.
- **Açılış ekranı:** Bugün, queue-first. Order: (1) "N taslak seni bekliyor" counter + health tick (expands only when unhealthy), (2) ReviewQueue with NEXT-UP card + inline edit + fixed primary action, (3) "Worth reacting to" (bounded ~3, collapsed), (4) digest/bento (collapsed). End state: "Bugünlük bitti ✓".
- **Günlük X akışı:** open → card → edit (one keystroke, satisfies edit-gate) → copy/X'te aç → next. ≤2 steps to primary task; Time-to-First-Approve <60s; screens-touched=1. Keyboard `A/E/J/K` + command bar in V1.
- **Instagram akışı (V1):** IgReplyDraft/IgDmDraft through the same DraftReviewCard, risk badge, drafts-only.
- **Aylık plan (V1):** dossier list first, month grid later; verified-tool badge is the hero element.
- **Teknik ekranlar:** costs/settings/toolbox stay demoted under Araçlar; eval+health KPIs inside CostsTab; readiness = collapsed tick.
- **Mobil:** keep single 640px breakpoint; verify queue-first at 320/375/640; drawer intact. **Bildirim:** Linear consequence-tiering — interrupt only on unhealthy/action-required; digests collapsed.

### D2 — Agent mimarisi
- **Final agent list (all existing, none new):** `router.routeItem` (account routing) · unified draft pipeline (writer→judge→editor, ONE spine) · batched opposing-family judge (absorbs council lenses in V1) · `pipeline-runner` (traced execution) · memory extraction/consolidation job (V1) · verifier service (deterministic, not an LLM agent).
- **Merged/deleted:** Sprint `draft-generator`, `draft-critic`, `growth-engine/account-profiles.ts` → retired after eval parity. Council merges into judge (V1).
- **Tool izinleri:** LLM stages get read-only context; **no write/publish tools ever** (manual-publish invariant); verifier is the only outbound-fetch component and is SSRF-guarded, non-LLM.
- **Human approval:** edit-gate stays; identity-memory writes and learned rules always operator-approved; publish always human.
- **Context sınırları:** source compaction ≤900 chars stays; grounding block bounded; ≤5 few-shot examples; untrusted data always fenced.

### D3 — Skills (task layer)
- The "skill list" = the **25-task → preset matrix** (FINAL-OPENROUTER-ROUTING). Every task: Zod I/O schema (structured `json_schema strict` where supported), preset-derived tool permissions (none/read-only), `purpose` budget prefix, eval coverage via `EvalTest` golden sets. No separate skill registry — tasks ARE the registry.

### D4 — Hafıza
- **Storage:** three-tier — Markdown voice constitution (identity, human-owned, V1) · relational `MemoryFact` + Caption/Hashtag/Series DNA (confidence, temporal validity, provenance, approval; V1) · vectors for recall (JS cosine; pgvector V2-threshold).
- **Retrieval:** account-scoped cosine top-K; LLM-as-reranker on top-8 (existing judge roles; no rerank vendor — none exists on OpenRouter, verified).
- **Write discipline:** proposed→approve; promotion needs ≥3 corroborating observations OR explicit operator instruction; contradictions supersede-not-delete with rollback; external provenance can NEVER write identity memory.
- **Expiry:** decay half-life on performance memory; identity memory near-∞; staleness sweep weekly (18:00 cron).
- **MVP slice:** fix pattern-embedding bug + wire FeedbackEvent → retrieval + edit-distance metric. Everything else V1.

### D5 — İçerik motorları
- **News:** KEEP as-is (mature); budget-gate its LLM calls (migration wave).
- **X:** ONE unified 16-stage pipeline on the LIVE spine (03 §5.1 table is the spec). Sprint assets absorbed: decomposed scorer + leak gate. Gaps added V1: near-dup cluster, originality-vs-own-history, opposing judge, provenance tags, prompt versioning.
- **Competitor (V1):** manual watchlist + daily business_discovery sync (LLM-free) cloned from YouTube engine + operator swipe-file multimodal capture. No scraping.
- **Reels (V1):** `verifyWebsite()` (HTTP tier; render escalation on worker) + `reelDossierFor()` cloned from `briefForVideo`; evidence-gated `not_ready` blocking.
- **Carousel (V1):** Series DNA (`SeriesProfile`) + `buildCarouselPrompt` + VisualStyleProfile; first series = Best AI Tools.
- **Monthly planner (V1):** deterministic assembler (pillars 3-5, 60/25/15, repetition histogram) over dossiers; month grid UI after list view.
- **Website verifier:** separate module, authoritative, non-LLM; LLM only summarizes fenced evidence.
- **Evaluation:** 07's loop; sub-scores per D6; false-learning two-gate + brand veto.

### D6 — OpenRouter
- **Presets (9):** per 06 §10, with C3 correction (final-judge primary = `openai/gpt-5.5-*`). Pinned dated slugs as primaries; floating (`-latest`/`-fast`/`fable`) fallback-only; startup lint enforces.
- **Preview policy:** no preview/floating model ever a primary; every primary has a cross-provider fallback chain; `AiModelSnapshot` weekly drift check (V1).
- **Cache:** Anthropic `cache_control` breakpoints on writer/judge static prompts (~0.1× reads ≈ halves writer input cost); Gemini/DeepSeek/OpenAI auto-cache.
- **Budget:** presets own `purpose` prefixes; `MONTHLY_AI_BUDGET_USD` global gate; per-feature slices (`writer_`, `judge_`, `extract_`, `memory_`, `reel_`, `ig_`, `yt_`, `learn_`, `series_`). Normal projection ≈ $9-10/mo (fits $10 default).
- **Escalation:** V2 only, flag-gated, per-call gated + daily cap.
- **Benchmark:** `EvalTest` golden sets per hot task; catalog re-verified quarterly or on deprecation notice.

### D7 — Veri / worker
- **DB:** Neon Postgres, additive `db:push` discipline continues; drift check (`prisma migrate diff`, read-only) added to CI in V1. New tables (all additive): V1 — `MemoryFact`, `SeriesProfile`, `IgWatchAccount`, `WebsiteVerification`, `ReelDossier`, `ReelPlan(+Slot)`; MVP — none (sprint 1 needs zero migrations; scores go into existing `QueueItem.scores` JSON).
- **Event/queue:** NO new queue. `CronRun` heartbeat + DB-state ticker + `LearnProcessingJob` lease pattern KEEP. Idempotency keys on generate-morning + discovery ticks (MVP).
- **Cron:** 4 Vercel crons KEEP; new work folds into existing slots (06:00 IG sync, 18:00 memory/eval/learn sweeps). Local worker KEEP (render tier host).
- **Retry/dead-letter:** fail-open + `partial` flag + resumable job rows = the dead-letter equivalent; `!ok` CronRun alert via readiness gate (V1).
- **Tracing:** `PipelineTrace` KEEP (MVP); Langfuse optional V2.
- **Cost attribution:** `UsageLog.meta.purpose` taxonomy (per-preset prefixes); trace `totalCostUsd` must reconcile with summed UsageLog rows (test).
- **Other MVP plumbing:** startup secret assertion (names only); `typecheck` script added; Fluid Compute confirmed; `waitUntil` for post-response trace writes.

---

## 5. MVP / V1 / V2 master placement

| Capability | MVP (Sprint 1) | V1 | V2 |
|---|---|---|---|
| Bugün queue-first + collapsed health + error states | ✅ | | |
| Engine unification (identity, scorer signals, leak gate, TR lint) | ✅ | | |
| Catalog refresh + 9 presets + hot-path gate migration | ✅ (hot paths) | remaining ~72 sites | |
| Edit-distance capture + eval golden set stand-up | ✅ | κ-calibration cron | pairwise/bandit |
| Pattern-embedding fix + FeedbackEvent wire-in + VoiceProfile wiring | ✅ | | |
| Idempotency keys + secret assertion + typecheck script | ✅ | | |
| Nav consolidation (16→5) + keyboard review + IG lane | | ✅ | unified inbox + pixelspor |
| MemoryFact + DNA tables + approval queue + voice constitution | | ✅ | procedural memory, pgvector |
| 14 sub-scores full set + opposing judge + council merge | | ✅ | auto-escalation |
| Competitor watchlist + swipe-file + IG screen | | ✅ | content-gap engine, licensed tier |
| Website verifier (HTTP) + Reels dossier + Series DNA (1 series) | | ✅ | render tier GA, monthly auto-draft cron |
| Monthly planner grid + performance attribution + drift alarms | | ✅ (late) | advanced multimodal, benchmark automation |

**MVP is NOT an agent platform** — sprint 1 contains zero new tables, zero new screens, zero new agents. It reorders one screen, unifies one engine, refreshes one registry, and wires three existing-but-dormant signals.

---

## 6. Program-level risks (top 5)

1. **Model-catalog drift** — pinned slugs verified 2026-07-08; providers deprecate. Mitigation: startup lint + `AiModelSnapshot` weekly check + re-verify at each build start.
2. **Sprint-1 scope creep** (C5 pressure is real — five reports wanted their MVP in). Mitigation: FIRST-SPRINT.md is the contract; everything else has a named V1/V2 slot.
3. **Engine-unification regression** (retiring Sprint path could lose scoring quality). Mitigation: eval golden set green BEFORE retiring any Sprint file; adapter pattern first, delete later.
4. **False learning** once the loop closes (V1). Mitigation: two-gate + brand veto shipped WITH attribution, never after.
5. **Verification staleness + SSRF** (V1 verifier). Mitigation: expiry+re-verify design; OWASP guard checklist is acceptance-tested, adversarial redirect tests included.

**Unverified carried forward (consolidated):** exact X free-tier write quota · Turkish-specific embedding benchmark · OpenRouter rerank endpoint (assumed absent) · business_discovery rate limits + per-field allowlist · Vercel Workflows pricing/GA · Neon PITR retention on current plan · Neon live schema ≡ `schema.prisma` · serverless Playwright feasibility · all token-count cost estimates (anchors, not guarantees) · Linear 31→70% figure · some future-dated arXiv IDs (findings corroborated by 2023-24 primaries).
