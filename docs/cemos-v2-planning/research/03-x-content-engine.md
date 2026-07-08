# 03 — X Content Quality & Viral Engine

> **Owns root cause #2 — Taslak kalitesi.** Drafts must become publish-ready so the operator's edits are cosmetic, not rewrites.
> **Grounding anchor:** [`_repo-baseline.md`](./_repo-baseline.md). Every finding below is framed **KEEP → gap → decision**, never greenfield.
> **Scope lock:** single-operator; **manual-publish** (system drafts, human posts — no auto-posting); Turkish UI; 2 accounts (`grafikcem` + `maskulenkod`; `pixelspor` = next phase).
> **Method:** read-only source audit (branch `fix/audit-p1-stability`, 2026-07-08) + primary-source web research (accessed 2026-07). Cross-refs to report 06 (model catalog) are marked `[→06]`; report 06 not yet written at audit time, so per-draft cost uses the baseline model list.

---

## 1. Executive summary

CemOS already contains a **mature, multi-stage viral drafting engine — built twice.** The problem is not missing capability; it is that quality-critical logic is **split across two parallel engines** that disagree on account identity, scoring vocabulary, budget discipline, and even what "publish-ready" means. The operator feels this as "drafts aren't mine / need rewriting" (root cause #2) because the *strongest* quality signals (the Sprint scorer's decomposed sub-scores, the deterministic leak detector) are not consistently wired into the path that actually produces the daily queue.

**The two engines:**

- **LIVE spine** — `draftService.generateDraft` → `grounding.ts` → `draft-pipeline.ts` (multi-angle writer → viral judge → optional final editor) using `accounts.ts` + `prompts.ts`. This is what fills the queue today. It is budget-gated, deadline-aware, fail-soft, and has the richer *prompt* craft (gold examples, banned phrases, payoff/next-move, concrete-anchor rule). Its *scoring* is a single LLM judge pass returning 7 axes.
- **Sprint engine** — `growth-engine/*` with its **own** `account-profiles.ts`, a heuristic-first `scorer.ts` (11-factor `SourcePostScore`, decomposed `calculateOpportunityScore` / `calculatePublishScore`), `draft-generator.ts` (safe/strong/provocative variants), `draft-critic.ts`, `leak-detector.ts`, `pattern-extractor`, `vector-memory`. Richer *decomposed, explainable scoring and deterministic fallbacks* — but **not budget-gated, not logged, and not on the daily path.**

**Core recommendation:** collapse to the LIVE `draft-pipeline` as the **spine**, and **port the best Sprint parts into it as stages** rather than run two engines. Specifically: keep LIVE's grounding + prompt craft + budget gate + deadline handling; absorb Sprint's *decomposed sub-signal scorer* and *deterministic leak detector* as the explainable scoring + pre-queue gate; retire Sprint's duplicate account-profiles, duplicate generator, and duplicate critic. Result: one pipeline, one account-profile source, one scores vocabulary, one budget ledger — and a queue where every draft carries **explainable sub-signals** the operator can trust.

**Five load-bearing decisions** (detail in §10):
1. **One spine, LIVE.** `draft-pipeline` stays the generator; Sprint generator/critic retired.
2. **Decompose the viral score.** Never surface a single "virality" number as truth; surface the Sprint-style sub-signals (hook / persona / Turkish-naturalness / novelty / risk / source-faithfulness / payoff) + a deterministic leak list. LLM judge ranks; deterministic gate blocks.
3. **Manual-publish is correct and low-risk.** No X write API is used; the human posts. X automation rules do not govern the *drafting*; the only live X-policy constraint (duplicate content across accounts) is already satisfied by per-account routing. Assisted "1-click schedule via API" is *possible and compliant* but adds a compliance surface — defer past V1.
4. **Turkish-native quality is a first-class gate.** `turkishNaturalness` gets promoted from one judge axis to a scored, veto-capable stage with a concrete anti-AI checklist (§3.4).
5. **Evaluate before trusting.** The existing `EvalTest` table + `eval:run` script become a real regression harness (golden set of the operator's own top tweets) so "publish-ready" is measured, not asserted.

---

## 2. CemOS current-state — the two-engine reality

### 2.1 LIVE path (what fills the queue today)

`draftService.generateDraft` (`src/lib/services/draftService.ts`) is the real spine:

1. Resolve account + `profile` from **`accounts.ts`** (`accountProfiles[handle]`).
2. Build `sourceInput` (source handle + draft type + compacted source ≤900 chars).
3. **Hard budget gate** — `getBudgetStatus()`; returns `blocked:"budget"` before any spend.
4. **Grounding** (`grounding.ts` `buildGroundingContext`, fail-soft): mined `ViralPattern`s (top-3, X-only) + live hot `SourcePost`s (`viralScore ≥ 40`, top-5, "what's working now") + active `VoiceProfile` (personality/tone/vocab/rhythm/avoid) + semantic memory (`vector-memory`) + **`BANNED_PHRASES`** brand-voice discipline + platform-native adaptation. Returns `{block, patternIds, sourcePostIds}` (pattern IDs persisted for the learning loop).
5. **`runDraftPipeline`** (`draft-pipeline.ts`): **Phase 1** multi-angle writer (`role:"creativeWriter"`, temp 0.9, one repair retry, per-account ANGLES + GOLD_EXAMPLES + VIRAL_PATTERNS from `prompts.ts`) → **Phase 2** viral judge (`role:"viralJudge"`, temp 0.2, ranks top-3 on 7 axes + payoff) → **Phase 3** optional final editor (`role:"finalEditor"`, Türkçe "Baş Editör" cila step). Risk-based fast paths (`getJudgeMode`): `off` / `risk_based` (deterministic-lint pass → skip judge) / full. Deadline guard promotes drafts rather than lose them to mock.
6. **Fit + lint** — `fitToMaxChars` by winner's own mode tier → `qualityLintService.lint` (mojibake/length/cliché); lint fail → `markBlocked`, **no QueueItem created**.
7. **Payoff + leaks** — winner `payoff` (NextMove) + `detectLeaks` (only when judge actually ran) → persist `QueueItem` with `scores` JSON.

**LIVE strengths (KEEP):** budget-gated, deadline-aware, fail-soft to mock, transparent fallback flags (`usedMock`, `writerFallbackUsed`), the richest *prompt craft* (hook-first rule, concrete-anchor rule, payoff taxonomy, per-account gold examples, banned phrases), account-native voice profile injection.

**LIVE gaps:** scoring is a *single LLM judge pass* — one `viralPotential` number per candidate, no deterministic decomposition; `turkishNaturalness` is just one of seven judge axes (easily washed out); no originality/near-duplicate check against the account's own history; no opposing-model judge (single judge = single point of taste failure); `detectLeaks` runs *after* the winner is chosen (advisory), not as a gate that can re-rank.

### 2.2 Sprint path (`growth-engine/*` — mature but off the daily path)

`generateDrafts` (`growth-engine/draft-generator.ts`): `buildGenerationContext` (+ `turkey-context`, `keyword-hints`, `vector-memory`) → `generateDraftsWithAI` (safe/strong/provocative variants) → **`critiqueDrafts`** (`draft-critic.ts`) → scored via **`scorer.ts`**. Uses its **own `account-profiles.ts`** (different shape: `tone`/`format`/`viralMechanic`/`forbidden` strings) and calls `generateJson` **directly — no budget gate, no usage log.**

**Sprint strengths (the parts worth keeping):**
- **`scorer.ts` — decomposed, explainable, deterministic-first.** `SourcePostScore` = 11 factors (relevance, freshness, controversy, audienceFit, quote/reply/standalone potential, opportunity, risk, suggestedAction, confidence). `DraftScore` = persona/hook/clarity/virality/novelty/risk → `calculatePublishScore` (explicit weights: persona 0.25, hook 0.20, clarity 0.20, virality 0.20, novelty 0.15, minus risk penalty). **AI-first, heuristic-fallback** — every score has a deterministic path (`scoreDraftFallback`) so it never returns nothing. `freshnessScore` uses time buckets (≤6h=95, ≤24h=80, ≤72h=55…). This is exactly the "decompose the viral score into explainable sub-signals" the north star demands.
- **`leak-detector.ts` — deterministic content-quality gate.** Pure function → `Leak[]` with kinds `weak_hook` / `no_payoff` / `off_pillar` / `naked_link` / `generic`, each with severity + Turkish operator note. `hasConcreteAnchor` (digit or non-first capitalized token = named tool/number). This is the single most reusable Sprint asset — deterministic, testable, explainable.
- `pattern-extractor`, `pillar-consistency`, `trend-aggregator`, `feedback-service`, `vector-memory` — supporting intel.

**Sprint gaps:** off the daily path; **no budget gate / no usage log** (a real spend + policy hole — baseline §3); duplicate account identity (`growth-engine/account-profiles.ts` vs `accounts.ts`) that can silently drift; heuristic keyword scoring is shallow (substring hits) and Turkish-naive.

### 2.3 The overlap map (why this is the SIMPLIFY target)

| Concern | LIVE | Sprint | Duplication / conflict |
|---|---|---|---|
| Account identity | `accounts.ts` (`accountProfiles`) | `growth-engine/account-profiles.ts` | **Two sources of truth** — drift risk |
| Generation | `draft-pipeline` writer (multi-angle) | `draft-generator` (safe/strong/provocative) | Two generators, two prompt styles |
| Scoring | single LLM judge, 7 axes | decomposed `scorer.ts` + `draft-critic` | LIVE=holistic, Sprint=explainable |
| Leak/quality gate | `detectLeaks` (advisory, post-hoc) | `leak-detector` (same fn) + critic | Same detector, wired differently |
| Budget/log | gated + logged | **neither** | Policy hole |
| Council/router | `agents/council`, `agents/router` | — | LIVE-adjacent, keep |
| News/source scoring | `news/scoreNews` + `buzzScore` | `scorer` source scoring | Two source-scoring vocabularies |

**Decision (spine):** LIVE `draft-pipeline` is the spine. Sprint contributes **`scorer.ts` (as the explainable score layer)** and **`leak-detector.ts` (as the pre-queue gate)**, both re-pointed at `accounts.ts`. Everything else in Sprint that duplicates LIVE (its account-profiles, its generator, its critic) is **retired** after parity is proven by the eval harness (§11).

---

## 3. Primary-source findings (dated)

### 3.1 X / Twitter automation & developer policy (accessed 2026-07)

Authoritative source `docs.x.com/developer-terms/policy` (WebFetch 2026-07; no effective date printed, "may be changed from time to time without notice") plus X Help "Automation Rules" (help page returned HTTP 403 to automated fetch — corroborated via secondary summaries, dated 2026). Key findings:

- **Drafting/scheduling/AI-writing your own original content via the API is explicitly permitted.** Scheduling your own posts through any authorized third-party tool "is completely fine." AI drafting and bulk uploading of *original* content are allowed within rate limits. (WebSearch synthesis, 2026.)
- **Prohibited:** auto-follow/unfollow, keyword-triggered auto-replies, bulk/cold DMs, automated posting *about trending topics* to manipulate them, and — critical for CemOS — **"post identical or substantially similar content across multiple accounts you operate."** (docs.x.com, quoted.)
- **Consent required** for automated replies/DMs; must honor opt-out; bots must be labeled. None of these apply to CemOS (it sends no replies/DMs, runs no bots).
- **Manual, human-posted content is not governed by the Automation Rules at all** — the policy "contains no specific statement addressing content drafted by humans but posted [manually]," because the rules attach to *automated write actions via the API*. CemOS uses **no X write API**; the operator copies text and posts by hand.
- **Free-tier write limits (if ever adopted):** ~300k posts/month, 10k req/15-min; Basic ~2M/month. (Secondary, 2026 — verify against developer.x.com before any API-posting work.) `unverified`: exact 2026 free-tier *write* quota (X has repeatedly changed this; treat as directional).

**Implication for CemOS:** the **manual-publish stance is correct and is the lowest-compliance-surface option.** The only automation rule that *could* bite — duplicate content across `grafikcem`/`maskulenkod` — is structurally avoided because the pipeline routes to *distinct accounts with distinct personas and distinct angle sets* (`prompts.ts` ANGLES differ per handle). The engine must simply **never emit the same draft to both accounts** (guard in routing, §5).

### 3.2 Viral prediction — scientific limits (2024 research)

- Transformer (BERT-variant) virality classifiers reach **F1 ≈ 87.3%**, RNNs ≈ 84.5% ([SpringerLink 2024](https://link.springer.com/chapter/10.1007/978-981-99-8476-3_13); [arXiv 2401.09724, 2024](https://arxiv.org/html/2401.09724v1)). That is *classification of already-posted tweets with engagement + follower + network features* — **not** ex-ante scoring of an unposted draft with no author/network context.
- Documented limitations: **temporal fragility** ("tweets must be close in time for predictions to be effective"), content-type confusion (rumor vs normal), and follower/network dominance — the single strongest virality predictor (author's follower graph & timing) is **unavailable at draft time.**
- **Conclusion:** any "viral score" CemOS shows is at best a *weak prior on text features*, not a probability. The honest design is to **decompose it into explainable sub-signals** (hook, novelty, payoff, source-faithfulness, Turkish-naturalness, risk) that the operator can read and override — exactly what Sprint's `scorer.ts` already does, and what LIVE's single number hides. **Never present a viral score as certainty.**

### 3.3 Competitor / product patterns (2026)

From product surveys (accessed 2026-07): [posteverywhere.ai](https://posteverywhere.ai/blog/25-best-ai-tools-for-x-twitter), [xpatla.com](https://xpatla.com/blog/tweethunter-vs-hypefury-comparison), [fireply.ai](https://fireply.ai/blog/best-ai-tools-grow-x-2026), [climbx.so](https://climbx.so/blog/best-ai-tools-grow-twitter-2026).

- **Tweet Hunter** — AI ghostwriter trained on viral patterns + **3M+ high-performing tweet library** for retrieval inspiration + **10 hook variations per idea**. → validates CemOS grounding (mined patterns + hot SourcePosts) and multi-angle writer.
- **Postwise GhostWriter** — takes a rough draft/topic, emits **6 variations in your style**; leads on *style matching*. → validates CemOS `VoiceProfile` injection; CemOS should lean harder on the operator's own voice.
- **ClimbX** — **outlier detection**: flags posts running 2–3× an author's baseline and drafts more in that vein. → CemOS already has `outlierScore` (YouTube) + `ContentOutlierScore`; extend the *same* baseline-relative outlier idea to X source selection.
- **Typefully** — deliberately a *writing + scheduling* tool, no engagement automation. → validates the manual-publish, no-auto-reply posture as a legitimate product category.
- **Hypefury** — monetization/auto-plug; explicitly *not* CemOS's lane (no funnel/revenue — see memory `cemos-x-brain-not-revenue`).

**Pattern takeaway:** the market has converged on (a) retrieval from a large viral corpus, (b) N-variation generation, (c) style/voice matching, (d) outlier-relative source selection. CemOS has all four primitives already; the win is *wiring them into one coherent, explainable pipeline*, not building new ones.

### 3.4 Turkish-native copy quality (what makes a tweet feel "mine", not AI)

Web search for Turkish-specific anti-AI writing returned mostly SEO spam (`unverified` as authoritative), but the repo's own `prompts.ts` + `grounding.ts` already encode a strong, evidence-based Turkish quality doctrine. Consolidated checklist (from `BANNED_PHRASES`, ACCOUNT_WRITING_RULES, GOLD_EXAMPLES + general Turkish-linguistics knowledge, marked where inferred):

**AI/translation "tells" to detect and kill:**
1. **Cliché soru-CTA** — "Peki siz ne düşünüyorsunuz?", "Sizce doğru mu?", "Bu ne anlama geliyor?" — already banned in `prompts.ts`; make it a *deterministic regex gate*, not just a prompt instruction.
2. **Marketing hype words** — "oyunun kurallarını değiştir", "çığır açan", "devrim niteliğinde", "inanılmaz", "şok edici", "herkes konuşuyor" — already in `BANNED_PHRASES`; extend the list and enforce in lint.
3. **Translationese syntax** — over-explicit subject pronouns, English-order clauses, "-mektedir/-maktadır" bureaucratic register, comma splices that mirror English. (`inferred` — Turkish is pro-drop + SOV + agglutinative; native tweets drop pronouns and front the hook.)
4. **No concrete anchor** — generic "AI iş akışını dönüştürüyor" with no named tool/number. Already the `requireConcreteAnchor` leak + judge rule; keep as veto for `grafikcem`.
5. **Emoji-bullet spam / hashtag stuffing** — native TR tech/masculinity tweets use `→` arrows, not emoji bullets (see GOLD_EXAMPLES); `noHashtags` already enforced.
6. **Register mismatch** — `maskulenkod` must avoid terapist dili / kişisel-gelişim klişesi / motivasyon sloganı (already in rules); `grafikcem` must avoid soyut AI yorumu.

**Design decision:** promote Turkish-naturalness from a soft judge axis to a **two-part gate** — (a) deterministic regex/phrase lint (cheap, in `qualityLintService`), (b) an LLM `turkishNaturalness` sub-score that can *cap* publishScore (a draft below threshold cannot reach "publish-ready", only "needs-edit"). This directly attacks root cause #2.

---

## 4. Competitor / product patterns → CemOS mapping

| Market primitive | Competitor exemplar | CemOS equivalent (exists) | Gap / action |
|---|---|---|---|
| Viral corpus retrieval | Tweet Hunter 3M library | `grounding.ts` hot SourcePosts + `ViralPattern` | Corpus is small; grow SourcePost ingest (report on sources) |
| N-variation generation | Postwise 6 / TH 10 | `draft-pipeline` multi-angle writer | KEEP; angles already per-account |
| Voice/style match | Postwise GhostWriter | `VoiceProfile` + `grounding` ses profili | KEEP; make voice a scored gate |
| Outlier source selection | ClimbX 2–3× baseline | `outlierScore` / `ContentOutlierScore` | Extend baseline-relative to X sources |
| Explainable scoring | (weak in market) | Sprint `scorer.ts` sub-signals | **CemOS advantage** — wire it in |
| Deterministic quality gate | (rare in market) | `leak-detector.ts` | **CemOS advantage** — make it a gate |

CemOS's differentiators vs the market are the two Sprint assets that are currently *not on the daily path*: decomposed explainable scoring + a deterministic leak gate. The whole thesis of this report is to move them onto the spine.

---

## 5. The unified pipeline (stage-by-stage) & architecture options

### 5.1 Target pipeline — one spine, sixteen stages

```
Collect → Normalize → Deduplicate → Cluster → Freshness → Source-score →
Account-route → Opportunity-score → Angle-gen → Draft → Fact-check →
Voice-check → Originality → Opposing-judge → Leak-gate → Human queue
```

Stage → what EXISTS → KEEP-from / decision:

| Stage | LIVE has | Sprint has | Decision |
|---|---|---|---|
| **Collect** | news pipeline, SourcePost ingest | trend-aggregator | KEEP news+SourcePost; fold Sprint trend-aggregator signals in |
| **Normalize** | source compaction (≤900) | context-builder | KEEP LIVE; one normalizer |
| **Deduplicate** | SourcePost dedup on `tweetId` | — | KEEP; add near-dup (embedding cosine on `ContentEmbedding`) — **gap** |
| **Cluster** | — | — | **Gap** — add lightweight embedding cluster so N sources on one story yield ONE draft, not N |
| **Freshness** | news `buzzScore` (half-life 18h) | `scorer.freshnessScore` (buckets) | KEEP `buzzScore` for news; reuse bucketed freshness for X sources — **unify vocabulary** |
| **Source-score** | news `scoreNews` (5-crit) | `scorer` 11-factor `SourcePostScore` | **Adopt Sprint `SourcePostScore`** as the X source scorer (decomposed) |
| **Account-route** | `agents/router.routeItem` | scorer `suggestedAccounts` | KEEP `routeItem`; add **no-duplicate-across-accounts guard** (§3.1) |
| **Opportunity-score** | — | `calculateOpportunityScore` (weighted) | **Adopt Sprint** — the "is this worth a draft?" gate |
| **Angle-gen** | `prompts.ts` ANGLES per account | draft-generator variants | KEEP LIVE angles (richer, gold examples) |
| **Draft** | multi-angle writer (temp 0.9) | safe/strong/provocative | KEEP LIVE writer; retire Sprint generator |
| **Fact-check** | judge `sourceFaithfulness` + prompt "kaynakta olmayan sayı uydurma" | — | KEEP; **strengthen** — provenance-tag every claim to `sourcePostIds` (§8) |
| **Voice-check** | judge `turkishNaturalness` + `VoiceProfile` grounding | — | **Promote to scored gate** (§3.4) |
| **Originality** | — | vector-memory (advisory) | **Gap** — add cosine-vs-own-history check; block near-clones of already-published |
| **Opposing-judge** | single `viralJudge` | draft-critic (separate model) | **Adopt**: judge + one *opposing-model* critic; disagreement → hold (uses `qualityJudge` role) |
| **Leak-gate** | `detectLeaks` (advisory, post-hoc) | `leak-detector` | **Promote to blocking gate before queue** |
| **Human queue** | `QueueItem` + morning ReviewQueue + DailyQueue | — | KEEP (baseline §2) |

### 5.2 Architecture options

**Low (unify identity + wire the two Sprint assets) — recommended MVP.**
- Delete `growth-engine/account-profiles.ts`; point `scorer.ts` + `leak-detector.ts` at `accounts.ts` (adapter for shape).
- In `draftService`, after the judge, run `scorer.normalizeDraftScore`/`calculatePublishScore` on the winner (LLM-first, deterministic fallback) and store the **decomposed sub-signals** in `QueueItem.scores` (already a JSON blob — additive).
- Promote `detectLeaks` to a **gate**: high-severity leak → `status:"needs_edit"` not `"active"`, with the Turkish note surfaced.
- Add the Turkish deterministic phrase/regex lint to `qualityLintService`.
- **No new tables.** Cost: low. Risk: low (additive, behind the existing budget gate). Kills the duplicate-identity drift and puts explainable scores in the queue.

**Med (add the missing quality stages).**
- Add **originality** (cosine vs `ContentEmbedding` of own `PublishedPost`) + **near-dup cluster** at collect time (pgvector still optional — JS cosine works at this scale, baseline §5).
- Add **opposing-model judge** (second model via `qualityJudge` role; disagreement → hold). `[→06]` for the second model + cost.
- Add **provenance tags** (claim → sourcePostId) into `scores` JSON for fact-check auditability.
- Cost: +1–2 LLM calls/draft; still one engine. Risk: medium (latency, budget).

**High (assisted posting + eval-driven auto-tune) — post-V2.**
- Optional **compliant API scheduling** (Free tier, own account, own original content) as a *1-click "schedule" from the queue* — still human-approved, just spares the copy-paste. Adds OAuth + a write-scope compliance surface; only if the operator wants it.
- **Eval-driven prompt tuning**: `EvalTest` golden set → automatic A/B of prompt versions → promote winners. Turns the engine self-improving.
- Cost: high (integration + ongoing eval). Risk: higher (X API policy exposure, prompt-version sprawl).

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Two engines drift further** if left parallel (account identity, scores vocab) | HIGH | Low-option unification; single `accounts.ts` source of truth |
| R2 | **Viral score treated as truth** by operator or auto-gate | HIGH | Decompose into sub-signals; label as prior not probability (§3.2); never auto-reject on the number alone |
| R3 | **Duplicate content across accounts** = the one live X-policy violation | MED | No-duplicate-across-accounts routing guard; distinct angle sets already differ |
| R4 | **Prompt injection via source tweets/news** (untrusted external data) | MED | `wrapUntrustedData` fences already exist — enforce on *every* source-bearing prompt (baseline notes inconsistency); treat source as DATA |
| R5 | **Fact fabrication** ("kaynakta olmayan sayı") reaching queue | MED | `sourceFaithfulness` gate + provenance tags; deterministic "no-invented-number" heuristic |
| R6 | **Turkish-naturalness regressions** from model/prompt changes | MED | Eval harness golden set + deterministic phrase lint |
| R7 | **Budget blowout** if Sprint scoring joins the path ungated | MED | Route ALL scoring/generation through `generateJsonGated`; Sprint currently bypasses (baseline §3) |
| R8 | **Over-editing by the pipeline** (final editor flattens the operator's voice) | LOW-MED | Keep final editor optional + measured against eval set; voice profile as guardrail |
| R9 | **pixelspor onboarding** breaks single-source assumptions | LOW | Account-profile shape must stay data-driven, not hardcoded per handle |

---

## 7. Cost & maintenance

**Per-draft cost (current LIVE, operator_quality profile, baseline model list; `[→06]` for verified catalog):**
- Writer (`creativeWriter` → `gemini-2.5-pro`, temp 0.9) + Judge (`viralJudge` → `gemini-2.5-flash`, temp 0.2) + optional Final Editor (`finalEditor` → `claude-sonnet-4-5`).
- `estimateCost()` reads **stale hand-maintained prices** (baseline §3) and real `usage.cost` when the provider reports it. `unverified`: absolute per-draft $ until report 06 pins the catalog. Directional: a full 3-phase draft is a small-multiple of a single mid-tier call; fast paths (`judgeMode` off/risk_based) cut it to ~1 call.
- **Med option adds** originality embed (cheap, can be local fallback embedding — baseline §3) + opposing judge (+1 mid-tier call). Budget stays under the existing `MONTHLY_AI_BUDGET_USD` gate *only if Sprint scoring is routed through `generateJsonGated`* (currently it is not — must fix).

**Maintenance wins from unification:** one account-profile file, one scores vocabulary, one budget ledger, one prompt catalog to version. Retiring the Sprint generator/critic/profiles removes ~5 files of parallel logic and their tests' divergence risk. **Maintenance cost:** the eval harness (golden set curation) is ongoing but small (single operator, 2 accounts).

**Prompt versioning gap (KEEP-fix):** only learning + reverseEngineer version prompts today (baseline §3). Add `PROMPT_VERSION` to the X draft/judge prompts so the eval harness can attribute quality to a prompt version.

---

## 8. Security / policy

- **Manual-publish invariant is a security feature** — no X write credentials in CemOS, no auto-post blast radius. Preserve it; assisted scheduling (High option) is the *only* thing that would introduce X OAuth write scope — gate behind explicit operator opt-in.
- **Prompt injection (R4):** source tweets, news bodies, competitor text are **untrusted data, not instructions** (OS rule 40-security). `wrapUntrustedData` / `UNTRUSTED_DATA_NOTICE` fences exist in `prompts.ts`; the fix is *coverage* — every prompt that embeds a source must fence it (baseline flags inconsistent use). Add a test that fails if a source-bearing prompt builder omits the fence.
- **Fact-check provenance:** the anti-fabrication rule lives only in prompt text today. Harden by (a) storing `sourcePostIds` alongside the draft (already returned by grounding), (b) a deterministic check that flags numbers/prices in the draft absent from the source, (c) surfacing "claims → source" in the review card so the human verifies before posting. **LLM output never replaces the human fact-check** — the edit-gate (baseline §2, Publish disabled until operator edits) enforces a human in the loop.
- **Duplicate-content policy (X):** routing guard ensures `grafikcem` and `maskulenkod` never receive substantially-similar drafts of the same source (they have different personas/angles, so this is structurally unlikely, but assert it).
- **Budget as policy:** Sprint's ungated `generateJson` calls are both a cost and a governance gap — unify onto `generateJsonGated`.

---

## 9. MVP / V1 / V2 placement

**MVP (focus + quality sprint — root causes #1/#2 only):** Low architecture option.
- Unify account identity (`accounts.ts` single source).
- Wire Sprint `scorer.ts` decomposed sub-signals into the LIVE winner → surface in the queue.
- Promote `detectLeaks` to a blocking pre-queue gate.
- Add deterministic Turkish phrase/CTA lint + promote `turkishNaturalness` to a capping sub-score.
- Stand up the eval golden set (operator's own top ~30 tweets/account) + wire `eval:run`.
- *Outcome:* every queued draft carries explainable sub-signals + leak notes; Turkish-native gate live; edits become cosmetic.

**V1:** Med option — originality (own-history cosine), near-dup clustering at collect, opposing-model judge, provenance tags, prompt versioning on X prompts. Retire Sprint generator/critic/profiles once eval proves parity.

**V2:** High option — optional compliant API scheduling (opt-in), eval-driven prompt auto-tuning, `pixelspor` onboarding via data-driven profile. ClimbX-style baseline-relative X outlier source selection.

---

## 10. Recommended approach — the one unified pipeline

**Collapse to the LIVE `draft-pipeline` spine; make it explainable and gated by absorbing the two Sprint assets.** Concretely:

1. **One account identity.** `accounts.ts` is the sole source. Adapter maps it to whatever `scorer`/`leak-detector` expect; delete `growth-engine/account-profiles.ts` after tests pass.
2. **Generate (KEEP LIVE):** grounding (patterns + hot SourcePosts + voice + banned phrases) → multi-angle writer → viral judge → optional final editor, with the existing fast paths and deadline guard. This craft is already good; don't rebuild it.
3. **Score = explainable, not a verdict.** After the judge picks a winner, compute the **Sprint decomposed sub-signals** (persona / hook / clarity / Turkish-naturalness / novelty / risk / source-faithfulness / payoff), LLM-first with deterministic fallback, and store them in `QueueItem.scores`. The queue shows *these*, never a lone "virality: 82".
4. **Gate = deterministic + opposing.** `detectLeaks` (high severity) and the Turkish deterministic lint **block** a draft from `active`, routing it to `needs_edit` with the Turkish note. A single LLM judge is one point of taste failure → add one **opposing-model critic** (V1); agreement → queue, disagreement → hold. Fact-fabrication heuristic + `sourceFaithfulness` block invented claims.
5. **Human in the loop stays.** Edit-gate + manual publish preserved. The pipeline's job is to make the *first* draft publish-ready enough that the human's edit is a tweak, and to *explain why* it thinks so.
6. **Measure it.** Golden-set eval per account gates prompt/model changes. "Publish-ready" is a number the harness reports, not a claim.

This is a **simplification** (two engines → one), an **explainability upgrade** (one number → decomposed signals + leak list), and a **direct hit on root cause #2** (Turkish-native gate + leak gate + originality make the draft feel "mine" before the operator touches it).

---

## 11. Test & acceptance criteria

**Golden-set eval (`EvalTest` + `eval:run`):**
- Curate ~30 real high-performing tweets per account (`grafikcem`, `maskulenkod`) + ~10 known-bad (AI-slop, off-persona, fabricated).
- Metrics per run: (a) **Turkish-naturalness** — golden tweets score above threshold, AI-slop below; (b) **persona fit** — cross-account contamination flagged; (c) **fact-faithfulness** — every fabricated-number sample caught; (d) **leak recall** — every seeded leak (weak hook / no payoff / naked link / off-pillar) detected; (e) **CTA/hype lint** — every banned phrase & cliché soru-CTA caught deterministically.

**Acceptance criteria (MVP "done"):**
1. Only **one** account-profile source imported anywhere (`accounts.ts`); grep proves `growth-engine/account-profiles` has no importers on the draft path.
2. Every `QueueItem` on the daily path carries decomposed sub-signals **and** a (possibly empty) leak list in `scores`.
3. A draft with a high-severity leak or sub-threshold Turkish-naturalness **cannot** land in `active` — it lands in `needs_edit` with a Turkish reason.
4. Every source-bearing prompt builder wraps source in `wrapUntrustedData` (unit-tested).
5. All draft/score/leak LLM calls go through `generateJsonGated` (budget-gated + logged); a test asserts no raw `generateJson` on the draft path.
6. Eval golden set runs green in `eval:run`; a prompt/model change that regresses Turkish-naturalness or leak-recall fails CI.
7. No draft is emitted to both accounts for the same source (routing guard, unit-tested).
8. Existing suite (~994 cases) stays green; new stages are additive.

**Non-goals (explicit):** no auto-posting; no funnel/revenue scoring (memory `cemos-x-brain-not-revenue`); no rename of legacy symbols; no pgvector migration required for MVP (JS cosine suffices).

---

## 12. Kaynakça

**Repo (read-only audit, branch `fix/audit-p1-stability`, 2026-07-08):**
- `docs/cemos-v2-planning/research/_repo-baseline.md`
- `src/lib/services/draftService.ts` (LIVE spine)
- `src/lib/ai/draft-pipeline.ts`, `src/lib/ai/grounding.ts`, `src/lib/ai/prompts.ts`, `src/lib/ai/model-config.ts`, `src/lib/ai/generateGated.ts`, `src/lib/ai/untrustedData.ts`, `src/lib/ai/next-move.ts`
- `src/lib/growth-engine/scorer.ts`, `draft-generator.ts`, `leak-detector.ts`, `account-profiles.ts`, `draft-critic.ts`, `pattern-extractor.ts`, `vector-memory.ts`
- `src/lib/agents/router.ts`, `council.ts`, `pipeline-runner.ts`
- `src/lib/accounts.ts`

**Primary-source web (accessed 2026-07):**
- X Developer Policy — https://docs.x.com/developer-terms/policy (WebFetch; no printed effective date)
- X Automation Rules — https://help.x.com/en/rules-and-policies/x-automation (help page 403 to automated fetch; corroborated via secondary 2026 summaries)
- Twitter/X automation rules 2026 (secondary) — https://opentweet.io/blog/twitter-automation-rules-2026 · https://www.unfollr.com/blog/twitter-automation-rules
- Predicting Virality of Tweets Using ML (2024) — https://link.springer.com/chapter/10.1007/978-981-99-8476-3_13
- Predicting Viral Rumors / graph neural multi-task (2024) — https://arxiv.org/html/2401.09724v1
- Measuring and Detecting Virality on Twitter — https://arxiv.org/pdf/2303.06120
- Best AI tools for X 2026 (product patterns) — https://posteverywhere.ai/blog/25-best-ai-tools-for-x-twitter · https://xpatla.com/blog/tweethunter-vs-hypefury-comparison · https://fireply.ai/blog/best-ai-tools-grow-x-2026 · https://climbx.so/blog/best-ai-tools-grow-twitter-2026

**`unverified` items:** exact 2026 X API free-tier *write* quota; absolute per-draft USD (pending report 06 model catalog); authoritative Turkish anti-AI-writing source (checklist built from repo `prompts.ts` evidence + linguistic reasoning, not a single external authority).
