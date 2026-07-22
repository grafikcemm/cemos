# 07 — Evaluation, Viral Scoring & the Learning Loop

> **Corpus:** CemOS V2 planning research. **Baseline anchor:** [`_repo-baseline.md`](./_repo-baseline.md) — read that first; everything below is **KEEP → gap → decision**, never greenfield.
> **North star (from baseline §7):** root causes = **focus + quality**. Evaluation exists to make draft quality *measurable* and to *prevent false learning* — not to add dashboards. Single-operator, additive-only DB, Turkish UI.
> **Hard rule:** never present **"viral olabilir"** as certainty. Decompose into separate, explainable sub-signals. A single virality number is banned from the UI unless its breakdown is shown next to it.
> **Method/date:** desk research, accessed **2026-07-08**. Sources are dated inline; doubtful/future-dated arXiv IDs are marked `unverified`.

---

## 1. Executive summary

1. **The scoring problem is not "add more numbers" — it is "make each number mean one thing."** CemOS already emits ~7 blended scores (`viralScore`, `xValueScore`, `opportunityScore`, `publishScore`, `outlierScore`, `buzzScore`, plus `DraftScore`/`CriticScores` fields). The gap is that several of them silently fold *source*, *fit*, *hook*, and *risk* into one figure the operator can't interrogate. The V2 move is to **split into 14 orthogonal sub-scores**, each with a declared signal source, a cheap-deterministic-vs-LLM tag, and a 0–100 rubric.

2. **Cheap-deterministic first, LLM-judge second, and never the writer grading itself.** Roughly half the 14 sub-scores can be computed with no LLM call (recency half-life, corroboration, embedding-cosine originality, char/format feasibility, leak/lint gates). The rest need a judge — but the **writer model must not be the judge** (self-preference bias is real and measurable: Panickssery et al., NeurIPS 2024). CemOS's writer is `google/gemini-2.5-pro`; the judge should sit in an **opposing family** (Claude/GPT), which the registry already supports via `finalEditor=claude-sonnet-4-5`.

3. **Binary rubric verdicts beat 1–5 Likert scales.** Multiple 2024–2025 sources (pragmatic-engineer evals guide; rubric-eval literature) converge: pointwise Likert scores drift and are unreliable; pass/fail-per-criterion forces a defined line and is cheaper to calibrate against human labels. CemOS should store each sub-score as a **0–100 number derived from a small set of binary rubric checks**, not a free-floating LLM "give it a score 0–100".

4. **The learning loop's danger is false learning, not missing data.** Engagement counts are heavy-tailed and noisy; optimizing them directly breeds clickbait and brand erosion (arXiv 2401.09804, 2024). A lesson must clear **two gates before it becomes a rule**: (a) *repetition* — minimum support count; (b) *statistical significance* — normalized-performance lift with a confidence interval that excludes zero. This ties directly to existing `FeedbackEvent` + `PerformanceSnapshot`.

5. **Everything is additive and mostly already present.** `EvalTest` + `scripts/run-eval-tests.ts` (`eval:run`) is a working golden-regression harness today; `PipelineTrace` already records per-stage cost/score; `FeedbackEvent` already records original/edited/reason. The V2 build is: reshape scores → add an opposing-model batched judge → add edit-distance capture → add a normalized-performance + statistical-gate pattern extractor → a calibration job. No table renames, no new engine.

---

## 2. CemOS current-state link (KEEP → gap)

| Existing asset (baseline ref) | What it already does | Gap for V2 |
|---|---|---|
| **`EvalTest`** table + `scripts/run-eval-tests.ts` (`eval:run`) | Golden-case regression: seeds cases, runs the real `generateDrafts` pipeline, parses `PASS: clarity>=75, risk<=25` lines, records `score`/`failureReason`; `--all` re-runs for regression. Maps criteria to `DraftScore` fields. | Only ~8 metrics addressable (`METRIC_MAP`); **no judge-vs-human calibration**; runs off `DraftScore` which is a *self-graded* critic. No golden-set sizing discipline, no CI gate on prompt change. |
| **`FeedbackEvent`** (`feedbackType`/`original`/`edited`/`reason`) | Captures operator verdict + edited text on the full-queue surface (`approved/rejected/edited/not_my_tone/hook_weak/too_ai/make_stronger/make_clearer`). | `edited` text is stored but **edit distance is never computed** — the single strongest cheap human-preference signal is left on the floor. Morning quick-review lane logs less. |
| **`PipelineTrace`** (`stagesJson`, `totalCostUsd`, 30-day prune) | Per-stage cost + score trace for the traced pipeline. | Not joined to outcome; no attribution back from published performance to the stage/prompt version that produced it. |
| **`PerformanceSnapshot`** + `PublishedPost` + `CreatorBaseline` | Content-intel tables for real post performance and per-creator baselines. | **Not wired into the X draft loop.** No normalization (z-score vs baseline), no time-decay, no cold-start handling, no pattern extraction gated by significance. |
| **Council** (`council.deliberate` → `CouncilVerdict`, 4 lens-agents hook/persona/risk/novelty, weighted) | Already a multi-judge rubric with weights (`council-config.ts`). | The lenses overlap the new 14 sub-scores; council can be **repurposed as the LLM-judge stage** rather than a parallel scorer. Same-model-as-writer risk applies. |
| **`detectLeaks`** + quality lint + `lintReport` | Deterministic leak/quality checks (payoff/leaks/next-move). | This *is* the Publication-Readiness deterministic gate — keep, formalize as sub-score #14. |
| **Sub-scores** `viralScore`/`xValueScore`/`opportunityScore`/`publishScore`/`outlierScore`/`buzzScore` | Working numbers across news/X/YouTube engines. `buzzScore` is already a clean deterministic composite (recency half-life 18h + corroboration + source-quality + HN/Reddit). | These are **blended**; the operator can't see *why*. `buzzScore` is the template for how the other sub-scores should be built (transparent, deterministic, decomposable). |
| **Model registry** (`model-config.ts`, `ModelRole`) | Role-keyed model resolution incl. `viralJudge`, `qualityJudge`, `finalEditor`; opposing-family judge is a config change, not new code. | No enforced writer≠judge-family invariant; `estimateCost` prices stale. |

**Decision:** V2 evaluation is a *reshaping + wiring* job on top of these, not a new subsystem. The two engines (LIVE `draft-pipeline` vs Sprint `growth-engine`) must converge on **one score object** so `EvalTest` and the loop grade the same thing.

---

## 3. Primary-source findings (dated)

**LLM-as-judge biases are well-documented and material.**
- The canonical reference (Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS 2023, arXiv 2306.05685) named the core failure modes: **position bias, verbosity bias, self-enhancement bias, limited reasoning/math**. This is the anchor: a judge is a biased instrument that must be *controlled*, not trusted blind.
- **Self-preference / self-recognition:** Panickssery et al., *LLM Evaluators Recognize and Favor Their Own Generations* (NeurIPS 2024) shows LLM judges can recognize their own text and rate it higher; self-preference correlates with self-recognition strength. Wataoka et al., *Self-Preference Bias in LLM-as-a-Judge* (arXiv 2410.21819, 2024) quantifies it: GPT-4 shows significant self-preference, hypothesized to track **lower perplexity / familiarity** of the output. **Implication for CemOS: the Gemini writer must not grade Gemini drafts.**
- **Position/scoring bias at scale:** a 2025 study across ~15 judges and ~150k instances found position bias is systematic (not chance) and varies by judge/task (Adaline write-up + arXiv scoring-bias papers, 2025; some IDs `unverified`). Mitigations in the literature: **multiple-evidence calibration, balanced-position calibration, human-in-the-loop calibration**; and **CalibraEval** (arXiv 2410.15393, 2024) framing debiasing as distribution optimization.

**Pairwise vs pointwise — a real trade-off, not a free lunch.**
- *Pairwise or Pointwise? Evaluating Feedback Protocols for Bias in LLM-Based Evaluation* (arXiv 2504.14716, 2025): **pairwise preferences flip in ~35% of cases vs ~9% for absolute scores** under distractor manipulation (figure per search summary; `unverified` exact %). Absolute scoring is more robust to gaming.
- *The Comparative Trap* (arXiv 2406.12319, 2024): pairwise comparison can *amplify* existing evaluator bias.
- Practitioner consensus (Cameron Wolfe, *Using LLMs for Evaluation*, 2024): pointwise Likert **fluctuates** because the judge has no stable internal anchor; pairwise is more consistent but order-sensitive. **Takeaway: use binary rubric checks (stable), reserve pairwise for the occasional operator A/B, and never ship a raw pointwise 0–100 straight from the judge.**

**Golden datasets + eval-driven development (2025–2026 practitioner guidance).**
- Size: **50–100 examples for a single feature**, ~40–60% core + 15–25% edge cases (getmaxim, Arize, Techment, 2025). Small enough to run on every prompt/model change, big enough to catch regressions.
- Gate: **every PR touching a prompt/model/retrieval config runs the golden set; a regression past threshold blocks merge.** Production monitoring samples 5–10% of live traffic scored by an automated evaluator to watch drift.
- Binary over scales, with a **domain-expert critique attached** to each label — that critique is the raw material for building the judge (pragmatic-engineer evals guide, 2025). Validate the judge against human labels with **TPR/TNR**, and **partition data** to test that the judge generalizes rather than memorizes.

**Human-preference / edit-distance signals.**
- *Assessing Human Editing Effort on LLM-Generated Texts via Compression-Based Edit Distance* (arXiv 2412.17321, 2024) and *Revision Distance* (arXiv 2404.07108, 2024): **how much the human edited** correlates strongly with real editing effort and is a more human-centered quality metric than surface similarity. CemOS already stores `original`/`edited` in `FeedbackEvent` — computing normalized edit distance is a near-free, high-signal offline metric and doubles as an online acceptance proxy.

**Virality is genuinely hard to predict — this is why the "no certainty" rule is correct.**
- Pre-posting virality classifiers top out around **ROC-AUC ≈ 0.66, PR-AUC ≈ 0.54–0.56, Precision@1% ≈ 0.75** (GNN + content features, 2025) — usable for *ranking/triage*, useless as a *promise*. Exact-count prediction under temporal drift + heavy tails remains open (arXiv 2508.21650, 2025).
- Counterintuitive: most viral events **don't** produce sustained growth, and virality is independent of follower count (PMC studies, 2024). So CemOS should score **"why this could travel"** as decomposed sub-signals, not forecast a number.

**False learning / engagement-optimization pathologies.**
- *Clickbait vs. Quality* (arXiv 2401.09804, 2024): engagement-based optimization **proliferates clickbait and divisive content** and degrades the content landscape. Recommender-feedback-loop work (Denoising Implicit Feedback, arXiv 2006.04153; false-positive interaction studies) shows optimizing noisy engagement **hurts** the system and compounds via feedback loops. Directly motivates the **repetition + significance gate** and a **brand-consistency counter-signal** in CemOS's loop.

---

## 4. Competitor / product patterns (eval frameworks)

| Tool (accessed 2026-07) | Shape | What CemOS should borrow |
|---|---|---|
| **DeepEval** (MIT, local) | "Pytest for LLMs", 60+ metrics, CI-native. Recommended default for **solo/early-stage**. | The **assertion-in-CI** mental model. `EvalTest` + `eval:run` is already a home-grown DeepEval-lite; keep it, don't adopt a heavy dep. |
| **promptfoo** | Fastest multi-model/prompt comparison; red-team vectors. | Use its **matrix-compare** idea when choosing writer/judge model pairs and prompt versions. |
| **Braintrust** | Single-system: dataset → scoring → prod monitoring → CI release gate. Generous free tier (1M spans). | The **lifecycle unification** goal — CemOS's `EvalTest`/`FeedbackEvent`/`PerformanceSnapshot` should form one closed loop, mirroring this without the SaaS. |
| **LangSmith** | SaaS-only, LangChain-native, small free tier. | Skip — CemOS isn't LangChain and is single-operator; SaaS trace cost not justified. |
| **Arize Phoenix** (self-hostable) | Traces prod requests, surfaces regressions live. | The **"score a 5–10% sample of live output continuously"** drift pattern — cheap to add as a cron on published drafts. |

**Pattern consensus:** a **lightweight CI gater (own `EvalTest`)** + a **thin production-drift sampler** covers a single-operator system. No third-party eval SaaS is warranted; the cost/lock-in beats the benefit at this scale.

---

## 5. Architecture options (Low / Med / High)

**Option Low — "Explainable scores + honest judge" (MVP-grade, additive, ~no new tables).**
- Replace blended numbers with the **14 sub-scores** written into `QueueItem.scores` JSON (already a JSON blob) + `Idea.scoresJson`. Deterministic sub-scores computed in code; LLM sub-scores from **one batched judge call** (structured JSON, all rubric checks at once) on an **opposing-family** model.
- Enforce **writer≠judge family** in `model-config.ts`.
- Compute **edit distance** from `FeedbackEvent.original/edited` (Levenshtein-normalized) — pure code.
- Extend `EvalTest`/`METRIC_MAP` to the new sub-score names; run `eval:run` as a **pre-prompt-change gate**.
- Cost: ~1 extra judge call per candidate (already paying for `viralJudge`); everything else free.

**Option Med — "Closed loop with a statistical gate" (V1-grade).**
- Wire `PerformanceSnapshot` into the X loop: on manual-publish (`PublishLog`), schedule a snapshot; compute **normalized performance** = z-score vs `CreatorBaseline` with a **time-decay** weight and a **cold-start** floor (min impressions before trusting).
- Add a **pattern-candidate** store (reuse/extend `ViralPattern` with `supportCount`, `confidence`, `status: candidate|validated|retired`) — additive columns only.
- **Pattern extractor** proposes lessons; a lesson promotes to a rule **only if** `supportCount ≥ N` **and** normalized-lift CI excludes 0 (bootstrap or Mann–Whitney). Promotion writes to the memory system (report 02) + voice profile.
- Add a **calibration job** (weekly cron): sample human-labeled drafts, compute judge–human **Cohen's κ / TPR / TNR / Spearman**, and only trust sub-scores whose κ clears a floor; auto-widen thresholds otherwise.
- Add **dashboard KPIs** (see §11) to the existing `costs`/settings surface — no new screen (baseline §7: no dashboard sprawl).

**Option High — "Preference learning + online selection" (V2-grade, optional).**
- Collect **pairwise operator picks** (A vs B) on the review surface; fit a lightweight ranking/reward signal (Bradley–Terry) offline.
- **Bandit** for angle/variant selection (Thompson sampling over `draft-generator` variants safe/strong/provocative), constrained by the brand-safety veto.
- Full **offline (golden + reward model) + online (published performance)** eval harness with drift alerts.
- Heavier; only justified once the loop in Med is proven not to false-learn.

**Recommendation:** ship **Low** in MVP, **Med** in V1. High is explicitly *later-list* until the significance gate has demonstrably prevented at least one bad lesson.

---

## 6. Risks (false learning first)

| Risk | Mechanism | Defense in this design |
|---|---|---|
| **False learning from noise** | Heavy-tailed engagement; one lucky post becomes a "rule". | **Two-gate promotion:** repetition (`supportCount ≥ N`) **and** significance (normalized-lift CI excludes 0). No single post ever promotes a lesson. |
| **Self-preference bias** | Gemini writer grading Gemini drafts inflates scores (Panickssery 2024; Wataoka 2024). | Judge on **opposing family**; enforce in registry; periodically spot-check with a second judge family. |
| **Position/verbosity bias** | Judge favors order/length not quality (Zheng 2023). | Randomize candidate order per judge call; length-normalize; prefer **binary rubric checks** over holistic scoring. |
| **Clickbait / brand erosion** | Optimizing Share/Discussion breeds bait; brand voice drifts (arXiv 2401.09804). | Cap the weight of Share/Discussion in any composite; **brand-safety veto** via `detectLeaks`+`riskScore`; track **edit-distance & rejection rate as counter-signals**; a "voice drift" penalty against the voice profile. |
| **Overfitting the golden set** | Judge/prompt memorizes eval cases. | **Partition** golden set; hold out a rotating slice; validate judge generalization (TPR/TNR on unseen). |
| **Cold start** | New account/topic has no baseline → garbage normalization. | Min-sample floor before normalized performance is trusted; fall back to deterministic sub-scores only. |
| **Calibration rot** | Model swap silently shifts judge behavior. | Weekly calibration job; `EvalTest` regression gate on model change; store judge model+prompt version alongside every score. |
| **Metric gaming collapse** | Loop optimizes the proxy, not real quality. | Keep **human review in the loop** (manual-publish invariant, baseline §6); acceptance/edit-distance is the ground-truth check on the proxy. |

---

## 7. Cost & maintenance

- **Deterministic sub-scores (7 of 14): $0** — pure code (recency, corroboration, embedding cosine reusing `ContentEmbedding`/JS cosine, char/format, leak/lint).
- **LLM judge: one batched structured call per candidate**, replacing (not adding to) the current `viralJudge` step. Route on `qualityJudge`/opposing family; keep inside the existing **`assertGenerationAllowed` budget gate** (baseline §3) — and route it through **`generateJsonGated`** (baseline flagged only ~2 callers today; the judge should be caller #3).
- **Golden regression (`eval:run`): 50–150 cases × 1 draft each, run on prompt/model change only** — not per-draft. Bounded, run manually/CI, not in the hot path.
- **Calibration + pattern-extraction crons:** small, weekly; fold into the existing `0 18 * * *` learn cron rather than a new schedule.
- **Maintenance burden:** the golden set is *living* (add each new failure mode). Owner discipline > tooling. Prices in `estimateCost` are stale (baseline §3) — refresh as part of this work since eval reports cost.

---

## 8. Security / policy

- **Judge input is untrusted data.** Draft source material (mined tweets, news) is DATA, not instructions — wrap in the existing `wrapUntrustedData()` `<<<KAYNAK_VERI>>>` fences before the judge sees it (baseline §3). Prompt-injection via a scraped post must not steer the judge.
- **Manual-publish invariant preserved.** Evaluation and the learning loop **never auto-publish** and never call a platform write API (there are none — baseline §6). The loop only ranks, explains, and proposes lessons for human approval.
- **No secrets in eval artifacts.** `EvalTest.generatedOutput`, `FeedbackEvent`, `PipelineTrace` must never capture credentials; reference env NAMES only (global rule).
- **Brand-erosion policy is a security control here.** The two-gate + brand-veto is what stops the system from *learning its way into* clickbait. Treat "a lesson that raises engagement but raises edit-distance/rejection" as a **blocked** promotion.
- **Guard the judge/eval routes.** Any new eval-trigger endpoint follows the same `isOperatorOrCronAuthorized` guard pattern as other mutations (baseline §6).

---

## 9. MVP / V1 / V2 placement

- **MVP (focus+quality sprint):**
  1. **14 explainable sub-scores** on the draft, deterministic ones + one opposing-model batched judge; UI shows the **breakdown**, never a bare "viral olabilir".
  2. **Edit-distance capture** in `FeedbackEvent` (free, high-signal).
  3. **`EvalTest` as a real regression gate** on prompt/model change; extend `METRIC_MAP` to the new sub-scores; grow golden set to ~50–100 cases.
  4. Enforce **writer≠judge family** + route judge through `generateJsonGated`.
- **V1:** normalized `PerformanceSnapshot` attribution (z-score/time-decay/cold-start) → pattern extractor with **repetition + significance gate** → memory update; **calibration cron** (κ/TPR/TNR); **dashboard KPIs** folded into `costs`/settings (no new screen).
- **V2 (later-list):** pairwise operator A/B + reward model; bandit variant selection; full offline+online drift harness.

---

## 10. Recommended approach — the 14 sub-scores + the loop

### 10.1 The 14 sub-scores

Design rules: each sub-score is **one signal**, tagged **[D]** deterministic (no LLM) or **[J]** LLM-judge (opposing family, binary rubric checks aggregated to 0–100). No sub-score is a forecast; each answers *"how strong is THIS signal?"*. Composite is optional, sortable, and always shown **with** its parts.

| # | Sub-score (TR label) | Signal | Type | 0–100 rubric (aggregate of binary checks unless noted) | Maps to today |
|---|---|---|---|---|---|
| 1 | **Source Reliability** (Kaynak Güveni) | Is the seed material trustworthy? | **[D]** | Source-quality tier + corroboration count (already in `buzzScore`). 100 = tier-1 + multi-source corroboration; 0 = single low-trust source. | `buzzScore` inputs, `SourcePostScore` |
| 2 | **Freshness** (Tazelik) | How recent/timely is the hook? | **[D]** | Recency half-life (reuse `buzzScore` 18h decay). 100 = <½ life, decays smoothly. | `buzzScore` recency |
| 3 | **Relevance** (İlgi) | Does it match a topic the account posts about? | **[D]** embedding + **[J]** confirm | Cosine of draft vs account topic centroid (reuse `ContentEmbedding`); judge confirms on-topic Y/N. | `xValueScore` (partial) |
| 4 | **Account Fit** (Hesap Uyumu) | Right *account* of the two channels (grafikcem vs maskulenkod)? | **[J]** + **[D]** router | Rubric: audience match, mandate match, not-off-brand. | `router.routeItem`, `personaMatch` |
| 5 | **Voice Match** (Ses Uyumu) | Sounds like *me*, not generic AI? | **[J]** vs voice profile + **[D]** guards | Deterministic: banned-phrase hits + `detectLeaks` "too_ai" markers (auto-fail). Judge: tone/register match vs `VoiceProfile`. | `personaMatchScore`, `VoiceProfile`, lint |
| 6 | **Originality** (Özgünlük) | Not a rehash of prior posts or the corpus? | **[D]** embedding + **[J]** novelty | Max cosine to prior `PublishedPost`/`TrainingExample` (high similarity → low score); judge novelty check. | `noveltyScore`, `embeddingJson` |
| 7 | **Information Value** (Bilgi Değeri) | Does the reader learn/gain something? | **[J]** | Rubric: concrete claim present, non-obvious, verifiable/actionable. | `xValueScore` |
| 8 | **Hook Strength** (Kanca Gücü) | First line earns the second? | **[J]** + **[D]** heuristics | Deterministic: first-line length band, curiosity-gap/number/tension markers. Judge: would-you-stop-scrolling binary. | `hookStrengthScore` |
| 9 | **Retention Potential** (Tutma) | Body/thread delivers on the hook? | **[J]** | Rubric: payoff matches hook, no filler, thread coherence. | `payoff`/`nextMove` in `detectLeaks` |
| 10 | **Save Potential** (Kaydetme) | Reference/evergreen worth bookmarking? | **[J]** | Rubric: reusable utility, list/framework/resource, not time-bound noise. | new (extends critic) |
| 11 | **Share Potential** (Paylaşım) | Confers social currency / identity to sharer? | **[J]** | Rubric: identity signal, useful-to-others, emotionally resonant. **Weight-capped** (anti-bait). | `viralScore` (partial) |
| 12 | **Discussion Potential** (Tartışma) | Invites genuine replies (not rage-bait)? | **[J]** | Rubric: clear stance / open question / debatable — **plus a bait/toxicity veto**. Weight-capped. | `viralScore` (partial) |
| 13 | **Production Feasibility** (Üretilebilirlik) | Can the operator ship it now? | **[D]** | Char count within limit, image-required?, external-asset deps, thread length sane. | `usedMock`, image flags |
| 14 | **Publication Readiness** (Yayına Hazır) | Passes all hard gates? | **[D]** gate | `detectLeaks == 0` AND lint pass AND edit-gate satisfiable AND format valid → else hard-fail regardless of other scores. | `publishScore`, `lintReport`, edit-gate |

**Aggregation:** publish-readiness (#14) is a **veto gate**, not a weighted term. A single "Genel" composite may be shown for sorting, computed from a **transparent, capped weighting** (Share/Discussion capped so the system can't chase bait), always rendered beside the 14 bars. **Never** collapse to "viral olabilir %X" alone.

**Cost shape:** #1,2,13,14 fully deterministic; #3,5,6 deterministic core + optional judge confirm; #4,7,8,9,10,11,12 judged — but **all judged checks go in ONE batched structured call** per candidate (opposing family), so cost ≈ today's single `viralJudge` step.

### 10.2 The learning loop (tied to existing tables)

```
Draft (draft-pipeline / growth-engine → one score object)
  → Offline evaluation
        • 14 sub-scores (deterministic + batched opposing-model judge)
        • EvalTest golden regression on prompt/model change (eval:run)
  → Human review
        • FeedbackEvent (approved/rejected/edited/reason)
        • NEW: normalized edit-distance(original, edited)  ← key cheap signal
        • edit-gate enforces operator ownership (already live)
  → Publication (MANUAL only → PublishLog)   [manual-publish invariant]
  → Performance snapshot (PerformanceSnapshot, scheduled post-publish)
  → Normalized performance
        • z-score vs CreatorBaseline · time-decay · cold-start floor
  → Pattern extraction (candidate lessons → ViralPattern[status=candidate])
  → Human / statistical validation  ← THE FALSE-LEARNING GATE
        • promote only if supportCount ≥ N AND normalized-lift CI excludes 0
        • brand veto: reject lessons that raise engagement but raise
          edit-distance / rejection / voice-drift
  → Memory update (report 02 memory + VoiceProfile + validated ViralPattern)
        → feeds grounding.ts back into the next Draft
```

**Calibration side-loop (weekly cron):** sample human-labeled drafts → compute judge–human **κ / TPR / TNR / Spearman** per sub-score → trust only sub-scores above the κ floor; auto-relax thresholds and flag for re-prompt otherwise. Store **judge model + prompt version** with every score so a model swap is attributable.

---

## 11. Test & acceptance criteria

**Scoring layer**
- [ ] Every deterministic sub-score (#1,2,6,13,14) has unit tests (Vitest) incl. boundary cases (empty source, over-length, leak present).
- [ ] Judge call is **one batched structured call**; output Zod-validated (extend the `runValidatedStage` pattern, baseline §3) with 1 repair retry.
- [ ] Registry test asserts **writer family ≠ judge family** for the active `MODEL_PROFILE`.
- [ ] UI test: draft card renders the 14-bar breakdown; **no path renders a lone virality number without its parts**.

**Judge trust (calibration)**
- [ ] On a human-labeled holdout, each trusted sub-score reaches **Cohen's κ ≥ 0.6** (or TPR ≥ 0.8 & TNR ≥ 0.8). Sub-scores below floor are shown as "düşük güven / unverified" and excluded from the composite.
- [ ] Judge is **order-randomized**; a position-swap test shows verdict stability within tolerance.

**Regression (`EvalTest`)**
- [ ] Golden set ≥ 50 cases (≥15 edge). `eval:run --all` is green before any prompt/model change ships; a case dropping below its `PASS:` line **blocks** the change.
- [ ] Golden set is partitioned; a rotating holdout confirms the judge generalizes (no memorization).

**Learning loop (false-learning defense)**
- [ ] A lesson **cannot** promote to a rule with `supportCount < N` or a normalized-lift CI that includes 0 — covered by a unit test that feeds a single lucky outlier and asserts *no promotion*.
- [ ] A synthetic "clickbait" lesson (high engagement, high edit-distance/rejection) is **rejected** by the brand veto — asserted in test.
- [ ] Edit distance is computed and stored for every `edited` FeedbackEvent; acceptance-rate KPI is derivable.

**Dashboard KPIs (folded into `costs`/settings, no new screen)**
- [ ] Acceptance rate, median edit-distance, judge–human κ, golden-set pass %, #candidate vs #validated lessons, cost-per-accepted-draft — all rendered; loading/empty/error states designed (baseline §2 gap: don't collapse error into empty).

---

## 12. Kaynakça (sources, accessed 2026-07-08)

**LLM-as-judge bias & calibration**
- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS 2023 — arXiv 2306.05685. (position/verbosity/self-enhancement bias — anchor)
- Panickssery, Bowman, Feng, *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — https://proceedings.neurips.cc/paper_files/paper/2024/file/7f1f0218e45f5414c79c0679633e47bc-Paper-Conference.pdf
- Wataoka et al., *Self-Preference Bias in LLM-as-a-Judge*, 2024 — arXiv 2410.21819.
- *CalibraEval: Calibrating Prediction Distribution to Mitigate Selection Bias in LLMs-as-Judges*, 2024 — arXiv 2410.15393.
- Adaline, *LLM-as-a-Judge: Why Frontier Models Fail 50%+ Bias Tests*, 2025 — https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias
- *Evaluating Scoring Bias in LLM-as-a-Judge*, 2025 — arXiv 2506.22316. `unverified` (future-dated ID).

**Pairwise vs pointwise**
- *Pairwise or Pointwise? Evaluating Feedback Protocols for Bias in LLM-Based Evaluation*, 2025 — arXiv 2504.14716. (35% vs 9% flip figure `unverified`)
- *The Comparative Trap: Pairwise Comparisons Amplify Biased Preferences of LLM Evaluators*, 2024 — arXiv 2406.12319.
- Cameron R. Wolfe, *Using LLMs for Evaluation*, 2024 — https://cameronrwolfe.substack.com/p/llm-as-a-judge

**Golden datasets / eval-driven dev**
- The Pragmatic Engineer, *A pragmatic guide to LLM evals for devs*, 2025 — https://newsletter.pragmaticengineer.com/p/evals (binary>Likert, TPR/TNR, partition, critique-as-material; §4+ paywalled)
- Getmaxim, *Building a "Golden Dataset" for AI Evaluation*, 2025 — https://www.getmaxim.ai/articles/building-a-golden-dataset-for-ai-evaluation-a-step-by-step-guide/
- Arize AI, *Golden Dataset: Role in Custom LLM Evals* — https://arize.com/resource/golden-dataset/
- Techment, *7 Proven Strategies for LLM Regression Testing (Golden Datasets vs Random Sampling)*, 2025 — https://www.techment.com/blogs/llm-regression-testing/

**Eval framework comparisons**
- Inference.net, *LLM Evaluation Tools: The Complete Comparison Guide (2026)* — https://inference.net/content/llm-evaluation-tools-comparison/
- Braintrust, *DeepEval Alternatives (2026)* — https://www.braintrust.dev/articles/deepeval-alternatives-2026
- Arize, *Comparing LLM Evaluation Platforms: Top Frameworks for 2025* — https://arize.com/llm-evaluation-platforms-top-frameworks/

**Human-preference / edit distance**
- *Assessing Human Editing Effort on LLM-Generated Texts via Compression-Based Edit Distance*, 2024 — arXiv 2412.17321.
- *From Model-centered to Human-Centered: Revision Distance as a Metric for Text Evaluation in LLMs-based Applications*, 2024 — arXiv 2404.07108.

**Virality prediction limits**
- *Predicting Social Media Engagement from Emotional and Temporal Features*, 2025 — arXiv 2508.21650.
- *Predicting Social Media Post Engagement and Virality Using GNN + Content Features* (Kinetik, 2025) — https://kinetik.umm.ac.id/index.php/kinetik/article/view/2686
- *Followers do not dictate the virality of news outlets on social media* (PMC, 2024) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11235336/

**False learning / engagement pathologies**
- *Clickbait vs. Quality: How Engagement-Based Optimization Shapes the Content Landscape*, 2024 — arXiv 2401.09804.
- *Denoising Implicit Feedback for Recommendation*, 2020 — arXiv 2006.04153.
- *What are you optimizing for? Aligning Recommender Systems with Human Values*, 2021 — arXiv 2107.10939.

> **`unverified` flags:** the 35%/9% pairwise-flip figure (2504.14716) is taken from a search summary, not the fetched paper; several 2025–2026 arXiv IDs surfaced by search are future-dated relative to real-world knowledge and may be search-engine artifacts — treat their exact IDs as `unverified` while the *findings* are corroborated across multiple 2023–2024 primary sources.
