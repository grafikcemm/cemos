# 02 — Agentic Memory & Personalization (CemOS V2 Research)

> **Baseline anchor:** [`_repo-baseline.md`](./_repo-baseline.md). Every finding below is framed **KEEP → gap → decision** against the *real* CemOS repo (branch `fix/audit-p1-stability`, audited 2026-07-08), never as greenfield.
> **North star (from baseline §7):** daily-use blockers are **focus + draft quality**. Memory exists to make drafts feel *"mine"* and cut editing — not to add surface area. Single operator, additive-only Neon DB, manual-publish invariant, Turkish UI, 2 X accounts (grafikcem + maskulenkod).
> **Access date for all web sources:** 2026-07. Model/pricing facts are point-in-time; re-verify at build.

---

## 1. Executive summary

CemOS already has the *skeleton* of an agent-memory system and does **not** need a framework bolt-on. `vector-memory.ts` implements the canonical **extract → embed → retrieve → inject** loop (OpenRouter embeddings + JS cosine + account-isolated RAG into the draft prompt), and the data model already carries the right primitives: `ContentEmbedding`, `TrainingExample.embeddingJson`, `FeedbackEvent`, `VoiceProfile`/`VisualStyleProfile`/`StyleProfile`. This is a **KEEP-and-harden** situation, not a rebuild.

The gaps that actually block "drafts feel mine" are behavioral, not architectural:

1. **No learning discipline.** Memory is retrieved but barely *written back* — `FeedbackEvent` exists yet isn't wired into a memory-write loop, and viral patterns are retrieved using the **256-dim local hash fallback, never real embeddings** (`vector-memory.ts:304`), so pattern similarity is near-noise.
2. **No confidence, no decay, no contradiction handling.** A single edit today is treated exactly like a repeated pattern; nothing ages out; nothing detects "this new fact contradicts a stored one." 2026 production data shows this is *the* failure mode: Mem0's benchmark 91–94 collapses to **49% effective accuracy after 30 days** once stale data and contradictions accumulate (mem0.ai, 2026).
3. **No identity/performance split.** Voice ("who Ali Cem is") and performance ("what got engagement") are mixed. They have opposite update dynamics — identity is slow + human-owned; performance is fast + data-driven — and conflating them is how voice drifts.
4. **No human-in-the-loop write gate.** Nothing prevents a mined external tweet or a one-off correction from silently becoming a permanent rule. This is both a *quality* risk (voice drift) and a *security* risk (memory poisoning, now **OWASP Agentic Top 10 ASI06**, 2026).

**Recommended shape:** a three-tier store — **Markdown "voice constitution" (human-owned, always in-context)** + **relational `MemoryFact`/DNA tables with confidence & temporal validity** + **vector index (keep JS cosine now, pgvector later)** — with a **proposed-update → approve → rollback** gate on all *identity* writes and a **≥3-observation or explicit-instruction** promotion threshold so no single correction becomes law. Keep JS-cosine brute force (correct and fast at this scale); defer pgvector to V2. Fix the pattern-embedding bug and wire `FeedbackEvent` first — those two alone move the quality needle.

---

## 2. CemOS current-state link (KEEP → gap)

Grounded in `src/lib/growth-engine/vector-memory.ts` and baseline §3/§5.

| Asset (KEEP) | What it does today | Gap |
|---|---|---|
| `createEmbedding()` | POST `openrouter.ai/api/v1/embeddings`, `openai/text-embedding-3-small`, 10 s timeout, graceful → `createLocalFallbackEmbedding` (256-dim feature hash) | Model **hardcoded**; weak on Turkish (see §3); no model/dim tag reconciliation on swap |
| `cosineSimilarity()` + `searchSimilarExamples()` | Account-isolated brute-force cosine over `TrainingExample` + `ViralPattern` | Loads **all** rows per query (`findMany` full scan); patterns use **local-hash embedding only** (`:304`) → similarity is essentially random for patterns |
| `buildMemoryContext()` / `buildMemoryPromptBlock()` | 4 labeled groups (positive / negative / edited / pattern) injected as Turkish in-context-learning block | Retrieval-only; **no write-back, no confidence weighting, no recency** |
| `TrainingExample.embeddingJson` | Write target for learned examples | No consolidation; duplicates accrue; no decay |
| `FeedbackEvent` (feedbackType/original/edited/reason) | Logged from DailyQueue feedback UI | **Not wired into memory** — it's an audit log, not an episodic memory source |
| `VoiceProfile`/`StyleProfile`/`VisualStyleProfile` | Per-account voice/style records (Monday re-distill cron) | No **Caption/Hashtag/Series DNA** granularity; no human-editable constitution; no confidence or version history |
| `ContentEmbedding` (Float[] + `searchableDoc`, JS cosine) | Content-intel semantic index | pgvector "future comment only" — fine for now (§5) |
| `wrapUntrustedData()` | Fences `<<<KAYNAK_VERI>>>` external text in prompts | Defends *generation*; **memory-write path has no provenance gate** (poisoning surface) |
| `EvalTest` table | test/expected/generated/score/failureReason | Not yet used for **memory-quality** eval (§11) |
| `costGate` + `getMonthlySpendByPurpose(prefix)` | Per-feature budget prefixes (`yt_`/`ig_`/`learn_`) | Ready to host a `mem_` prefix for extraction spend |

**Net:** the retrieval half exists and is decent; the *learning* half (write, score, age, adjudicate, approve) is the greenfield — but it's small, additive, and reuses existing tables.

---

## 3. Primary-source findings (dated, access 2026-07)

### 3.1 OpenRouter embeddings — current catalog & pricing
Source: [OpenRouter — Embedding Models collection](https://openrouter.ai/collections/embedding-models) and [Embeddings API reference](https://openrouter.ai/docs/api/reference/embeddings) (rankings page notes "updated July 2026").

OpenRouter **does** expose a unified `/api/v1/embeddings` endpoint (CemOS already calls it). Catalog as observed (price = input per M tokens):

| Model | Provider | Context | $/M in | Note |
|---|---|---|---|---|
| `openai/text-embedding-3-small` | OpenAI | 8K | $0.02 | **CemOS current** default |
| `openai/text-embedding-3-large` | OpenAI | 8K | $0.13 | Lags on European/non-English (see 3.2) |
| `qwen/qwen3-embedding-8b` | Qwen | 32K | $0.01 | **Best multilingual value** |
| `qwen/qwen3-embedding-4b` | Qwen | 33K | $0.02 | Smaller variant |
| `baai/bge-m3` | BAAI | 8K | $0.01 | Strong multilingual OSS |
| `google/gemini-embedding-001` | Google | 20K | $0.15 | API multilingual leader |
| `google/gemini-embedding-2` | Google | 8K | $0.20 (+audio) | Newer |
| `mistralai/mistral-embed-2312` | Mistral | 8K | $0.10 | — |
| `perplexity/embed-v1-0.6b` | Perplexity | 32K | $0.004 | Cheapest |
| `nvidia/llama-nemotron-embed-vl-1b-v2` | NVIDIA | 131K | Free | Multimodal |

**Rerankers on OpenRouter:** none listed on the embeddings collection page. `unverified` whether OpenRouter hosts a dedicated `/rerank` route — treat rerank as *not available via OpenRouter* and plan around it (§10).

### 3.2 Multilingual / Turkish quality
Sources: [Ailog — Embedding Models 2026](https://app.ailog.fr/en/blog/news/embedding-models-2026), [BentoML OSS embeddings 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models), [CodeSOTA MTEB 2026](https://www.codesota.com/benchmarks/mteb).

- **Qwen3-Embedding-8B** leads open multilingual (~70.6 MTEB avg reported); Google **Gemini Embedding** and **Cohere embed-v4** lead API options.
- **OpenAI text-embedding-3-large lags on European languages** — a documented weak spot. `unverified` for Turkish specifically, but the multilingual gap strongly implies CemOS's current `-3-small` is a **suboptimal choice for Turkish** voice/semantic matching.
- Practical read: for Turkish content, **Qwen3-8B (value) or Gemini-embedding-001 (API convenience)** > `text-embedding-3-*`.

### 3.3 Memory frameworks — architecture primitives
- **Mem0** ([Long-Term Memory blog](https://mem0.ai/blog/long-term-memory-ai-agents), [State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)): explicit **extract → consolidate → store → retrieve** loop; an LLM emits **ADD / UPDATE / DELETE / NOOP** ops to keep memory consistent (this is the write-discipline CemOS lacks). Dual store (vectors + entity graph). v3 (Apr 2026) went **single-pass ADD-only with cross-memory entity linking**; **treats agent-generated facts as first-class** (not only user-stated). Benchmarks LoCoMo **92.5** / LongMemEval **94.4** at ~6.9K tokens/query; ~90% token reduction vs full context.
- **Letta / MemGPT** ([Letta agent-memory blog](https://www.letta.com/blog/agent-memory/), [SurePrompts walkthrough](https://sureprompts.com/blog/letta-memgpt-walkthrough)): OS-inspired hierarchy — **core memory** (small, always in-context: persona + human blocks, self-edited), **recall** (conversation history), **archival** (cold vector store). Key idea CemOS should borrow narrowly: an **always-in-context, editable "core" block for identity** (maps to the Markdown constitution in §5/§10).
- **Zep / Graphiti** ([Zep TKG paper 2501.13956](https://arxiv.org/abs/2501.13956), [Neo4j Graphiti](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)): **temporal knowledge graph**, **bi-temporal** (tracks event-time vs ingest-time), every edge has validity interval `(t_valid, t_invalid)`. On conflict it **invalidates, does not delete** — preserving history. This is the model for CemOS **contradiction handling** without data loss.
- **LangMem** ([LangChain launch](https://www.langchain.com/blog/langmem-sdk-launch)): first-class **semantic (entity profiles)** + **procedural (prompt self-optimization)** memory; algorithms `prompt_memory`/`metaprompt`/`gradient`. Documented risk: **ungoverned self-modification → procedural drift** (arxiv [2606.23127](https://arxiv.org/pdf/2606.23127)). Directly justifies CemOS's **human-approval gate** on procedural writes.
- **CoALA taxonomy** ([Anatomy of Agentic Memory 2602.19320](https://arxiv.org/html/2602.19320v1), Atlan guides): formalizes Tulving — **episodic / semantic / procedural / working**; names **consolidation** (episodic→semantic via summarization/reflection) as the productivity mechanism. "Not remembering everything is a feature" via temporal decay + relevance scoring.

### 3.4 Memory poisoning (security primary sources)
Sources: [From Untrusted Input to Trusted Memory (2606.04329)](https://arxiv.org/pdf/2606.04329), [Memory Poisoning Attack & Defense (2601.05504)](https://arxiv.org/abs/2601.05504), [C. Schneider — persistent memory poisoning](https://christian-schneider.net/blog/persistent-memory-poisoning-in-ai-agents/), [BeyondScale defense guide](https://beyondscale.tech/blog/ai-agent-memory-poisoning-defense-guide).

- **Memory poisoning = OWASP Agentic AI Top 10 ASI06 (2026)** — a distinct persistent-state attack surface not covered by the LLM Top 10.
- **MINJA**: query-only, no privilege needed, **>95% injection / ~70% attack success** under ideal conditions. Persists across sessions (unlike single-shot prompt injection).
- "Time-bomb"/sleeper writes accumulate silently and trigger later; existing prompt-injection defenses give **incomplete** coverage for memory writes.
- **Direct relevance to CemOS:** it ingests *untrusted external text every day* (SourcePosts, news, competitor tweets). If any of that can write to identity/semantic memory, that's the exact ASI06 hole.

### 3.5 pgvector at CemOS scale
Sources: [Encore — you probably don't need a vector DB](https://encore.dev/blog/you-probably-dont-need-a-vector-database), [Instaclustr pgvector 2026](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/), [Google Cloud pgvector](https://cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes).

- **Brute-force exact scan is fine to ~10K vectors** (Postgres seq scan), and NumPy/JS brute force is fine **under ~100K vectors with infrequent queries**. CemOS (single operator, 2 accounts) is **orders of magnitude below** this.
- **HNSW is the 2026 pgvector default** (`<=>` = cosine distance), buildable before data exists; <20 ms at 1M vectors. Only needed **>~100K vectors or sub-100ms-at-scale**.
- **Verdict: JS-cosine status quo is correct for MVP/V1.** pgvector is a V2 "when the corpus grows" migration, not a now-problem.

---

## 4. Competitor / product patterns (what to borrow, what to skip)

| Pattern | Source | Borrow for CemOS? |
|---|---|---|
| Extract → **ADD/UPDATE/DELETE/NOOP** write ops | Mem0 | **Yes** — the missing write-discipline. Adapt to **propose**, not auto-apply, for identity. |
| Agent facts = first-class (not only user-stated) | Mem0 v3 | **Partial** — CemOS's own judge scores are trustworthy; external mined facts are *not*. Gate by provenance. |
| Always-in-context editable **core/persona block** | Letta | **Yes** — as a human-owned Markdown **voice constitution**. |
| Full self-editing memory (agent writes freely) | Letta | **No** — single-operator wants control; auto-writes = drift + poisoning risk. |
| **Bi-temporal validity + invalidate-not-delete** | Zep/Graphiti | **Yes (V1)** — for contradiction handling with rollback/history. |
| Full temporal **knowledge graph** engine | Zep/Graphiti | **No (defer)** — overkill for 2 accounts; revisit only if multi-hop reasoning becomes a need. |
| **Procedural memory = prompt self-optimization** | LangMem | **V2, gated** — powerful but drifts without governance; human-approve prompt changes. |
| Consolidation/reflection (episodic→semantic) | CoALA / MemP / TiMem | **Yes** — weekly consolidation cron (reuse existing 18:00 learn slot). |
| Decay / relevance scoring / "forget by design" | CoALA, Mem0 prod data | **Yes** — mandatory for performance memory. |

Framework-as-dependency (Mem0/Letta/Zep SDKs) is **not recommended**: they assume their own store, add a Python/service dependency, and CemOS already owns the primitives in Prisma + TS. Borrow the *ideas*, keep the *stack*.

---

## 5. Architecture options — Low / Med / High

### Taxonomy CemOS should adopt (maps CoALA → CemOS assets)

Split **identity memory** (who he is / voice) from **performance memory** (what performed) — opposite update dynamics:

| Memory type | Identity or Perf | CemOS home | Update dynamics | Write gate |
|---|---|---|---|---|
| **Preference** (rules he states: "no emojis", "no argo on maskulenkod") | Identity | Markdown constitution + `MemoryFact` | Slow, explicit | **Human** |
| **Semantic** (facts about voice/topics/entities) | Identity | `MemoryFact` + VoiceProfile | Slow, corroborated | **Human / ≥3 obs** |
| **Procedural** (how to write his hook, thread beats) | Identity | Caption/Series DNA + prompt templates | Slow, versioned | **Human** |
| **Episodic** (this draft was edited this way, this feedback) | Perf (raw) | `FeedbackEvent` (KEEP) + published log | Fast, append-only | System (append) |
| **Account-specific** (grafikcem vs maskulenkod) | Both | `accountId` scope (already isolated) | — | scoped |
| **Series-specific** (a recurring format's DNA + baseline) | Both | Series DNA + baselines | Mixed | perf auto / DNA human |

### Storage split decision (relational vs vector vs Markdown)
- **Markdown config** = **identity constitution** (voice constitution + hard preferences). Human-owned, git-tracked, always injected in-context (Letta-core idea). **This is the anti-poisoning anchor**: it can only be edited by Ali Cem, never by an agent or by mined text.
- **Relational (Neon/Prisma, additive)** = **source of truth for facts**: new `MemoryFact` (typed, confidence, temporal validity, provenance) + new DNA tables + KEEP `FeedbackEvent`/`PublishedPost`/`PerformanceSnapshot`. Confidence, decay, contradiction, approval all live here (structured, queryable, auditable).
- **Vector index** = **similarity recall only**: KEEP `ContentEmbedding` + `TrainingExample.embeddingJson` with JS cosine now; pgvector later. Vectors *find* candidate memories; the relational layer decides *whether to trust/apply* them.

### Option A — **Low** (MVP; days, additive-only)
- Fix the two bleaks: **persist real embeddings for patterns** (kill the `:304` local-hash path) and **wire `FeedbackEvent` → episodic memory** so edits/rejections actually feed retrieval.
- Add **`voice-constitution.md`** per account (human-owned) injected ahead of the existing memory block.
- Add **Caption DNA** (see §5-schemas) as an extension of `VoiceProfile`; inject into draft prompt.
- Confidence = **evidenceCount only**; a fact promotes to "active" at **≥3 corroborating observations** OR explicit operator instruction. Proposals surface in the *existing DailyQueue feedback UI* — no new screen.
- Storage: relational + existing JS-cosine vectors. **No pgvector, no graph.**

### Option B — **Med** (V1)
- Everything in A, plus **`MemoryFact`** table with **confidence sub-signals** (§ below), **temporal validity** (invalidate-not-delete, Graphiti-style), and **contradiction detection** on write (new fact vs active fact → propose supersede).
- **Hashtag DNA + Series DNA** tables; **decay/half-life** on performance memory.
- Dedicated **human-approval queue** surface (small, in Settings or Bugün) with **rollback**.
- **Embedding upgrade** to Qwen3-8B or Gemini-embedding-001 (store model+dims; re-embed migration); **LLM-as-reranker** on top-K.

### Option C — **High** (V2, only if evidence demands)
- **pgvector + HNSW** migration (trigger: corpus >10–50K vectors or retrieval latency felt).
- **Procedural memory / prompt self-optimization** (LangMem-style) behind a **governance gate** (human approves every prompt mutation; versioned).
- Optional **temporal graph** (Graphiti/`pgrouting`) if cross-entity multi-hop ("what did I say about X across series") becomes a real need.
- **BEAM-style** long-horizon eval harness.

### DNA schemas (concrete fields — load-bearing)
```
CaptionDna         # per account (identity/procedural)
  accountHandle, openingHookTypes[], lengthRange{min,max,median},
  sentenceRhythm, emojiPolicy(enum: none|sparse|free),
  ctaStyle, lineBreakPattern, signaturePhrases[], forbiddenPhrases[],
  toneVector[], languageRegister(formal|casual|argo_ok),
  confidence(0..1), evidenceCount, provenance(enum), lastUpdated, version

HashtagDna         # per account (+ optional seriesId) (performance-leaning)
  accountHandle, seriesId?, coreTags[], rotatingTags[],
  tagCountRange{min,max}, placement(inline|end|first_comment),
  casing, bannedTags[], perTagPerformance{tag -> avgEngagement, n},
  confidence, evidenceCount, decayHalfLifeDays, lastUpdated

SeriesDna          # recurring format identity + baseline (both)
  seriesId, name, accountHandle, format(thread|single|carousel|reel),
  cadence, structuralBeats[], hookFamily, visualStyleRef,
  recurringCta, exampleWinnerIds[], performanceBaseline{median,p90},
  confidence, evidenceCount, lastUpdated

MemoryFact         # typed atomic memory (relational source of truth)
  id, accountHandle?, type(preference|semantic|procedural),
  statement, embeddingRef?, confidence,
  evidenceCount, sourceProvenance(operator|own_metric|self_judge|external),
  status(proposed|active|superseded|rejected),
  tValid, tInvalid, supersedesId?, createdBy, approvedBy?, updatedAt
```

### Confidence scoring — decomposed sub-signals
```
confidence = w_rep*repetition + w_rec*recency + w_src*sourceAuthority − w_con*contradictionPenalty
  repetition        = min(1, evidenceCount / N_full)           # N_full ≈ 3–5
  recency           = 0.5 ^ (ageDays / halfLife)               # perf: short; identity: long/∞
  sourceAuthority   = operator(1.0) > own_metric(0.8) > self_judge(0.6) > external(0.0 for identity)
  contradictionPenalty = active conflicting facts present ? scaled : 0
```
**Threshold rule (single correction ≠ law):** any candidate enters as `proposed` with low confidence. It becomes an **active rule** only on **evidenceCount ≥ N_full** *or* **explicit operator instruction** (authority 1.0 bypasses repetition). One-off edits stay `proposed` and expire via recency decay if never corroborated.

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Memory poisoning** — mined external tweet/news writes into voice memory (ASI06) | **High** | Provenance gate: `external` authority = 0 for identity writes; only operator + own-metrics + self-judge may write; retrieved external memories stay fenced as data. |
| R2 | **Voice drift from single corrections** | High | ≥N_full-observation promotion; `proposed` state; recency decay of uncorroborated facts. |
| R3 | **Stale performance memory** (Mem0's 49%-after-30d failure) | High | Decay half-life on perf memory; weekly consolidation + staleness sweep. |
| R4 | **Embedding-model swap invalidates stored vectors** (dim/space mismatch) | Med | Store `model`+`dimensions` per vector (already in `EmbeddingVector`); gated re-embed migration; never mix spaces in one cosine call. |
| R5 | **Pattern retrieval is noise today** (`:304` local-hash) | Med (live bug) | Persist real embeddings for `ViralPattern`; MVP fix. |
| R6 | **Confidence miscalibration** (too rigid or too noisy) | Med | Tune `N_full`/weights on the eval set (§11); expose in Settings. |
| R7 | **Full-table-scan retrieval** won't scale | Low (now) | Fine <10K; pgvector trigger documented (§5-C). |
| R8 | **Contradiction between accounts** (grafikcem vs maskulenkod) | Low | Already `accountId`-scoped; enforce scope on every memory read/write. |
| R9 | **Over-engineering** (adopting a graph/framework for 2 accounts) | Med | Explicitly deferred; Low/Med options ship first. |

---

## 7. Cost & maintenance

- **Embedding spend: negligible.** Single operator → low-thousands of embeds/month. Qwen3-8B $0.01/M or `-3-small` $0.02/M → **cents/month**. Re-embed migration on model swap is a one-time low-thousands-of-rows job.
- **Extraction/consolidation LLM calls:** use `cheapWriter` (`gemini-2.5-flash`) with Zod-validated output; adjudicate contradictions with `qualityJudge`. Route through existing `costGate` under a **`mem_` purpose prefix** (`getMonthlySpendByPurpose` already supports per-feature budgets) so memory never blows the $10 monthly cap.
- **Rerank:** LLM-as-reranker reuses existing judge budget (no new vendor). Cohere/Voyage rerank only if precision insufficient (own key, ~$1–2/M — still trivial at this volume).
- **Ops/maintenance:** one **weekly consolidation cron** (reuse the 18:00 `/api/cron/learn` slot + `CronRun` heartbeat pattern): consolidate episodic→semantic, recompute decay, run staleness + contradiction sweep, emit a proposals digest. Human review ≈ **minutes/week** in the approval surface.
- **pgvector deferred = $0 infra now.** Neon already hosts everything; adding the extension later is additive.

---

## 8. Security / policy (poisoning / injection / GDPR)

- **Poisoning (ASI06, primary defense):** *external content may never auto-write identity/semantic/procedural memory.* Write paths accept `operator` (explicit), `own_metric` (own-account performance), and `self_judge` (CemOS's own critic scores) provenance only for identity; `external` provenance is capped to `performance`/episodic and can never promote to an active rule.
- **Prompt injection:** KEEP `wrapUntrustedData()` fences in generation; **extend the principle to retrieval** — any memory whose provenance is `external` is injected as *fenced data*, never as an instruction. A mined pattern is an *example to consider*, not a rule to obey.
- **Human-approved writes + rollback:** identity memory uses **proposed-update → approve/reject**; supersede-not-delete keeps a version chain (`supersedesId`, `tValid/tInvalid`) so any change is reversible. This satisfies both the drift threshold (R2) and the poisoning gate.
- **Contradiction detection:** on write, semantic/keyword match new fact vs active facts (Graphiti model); on conflict, **don't overwrite** — raise a supersede proposal for human review.
- **GDPR / personal data (low-risk, single-operator, but stated):** data = Ali Cem's own + his 2 accounts + *public* tweets/handles of others. Stance: store only public handles/content of third parties (no private PII); provide **memory inspection + export + cascade-delete-by-handle** in Settings (right-to-erasure by account); never persist secrets/tokens in memory (baseline §6 `IntegrationCredential` AES-GCM stays the only credential store). `unverified`: whether any EU-subject third-party data triggers formal obligations — document, treat as low-risk.

---

## 9. MVP / V1 / V2 placement

**MVP (ships with the focus+quality sprint — directly serves north star):**
- Fix `ViralPattern` embeddings (kill `:304` local-hash); persist real vectors.
- Wire `FeedbackEvent` → episodic memory feeding retrieval (approved/edited/rejected already exist as feedback types).
- `voice-constitution.md` per account (human-owned) + **Caption DNA** injected into draft prompt.
- Confidence = evidenceCount; **≥3-obs or explicit** promotion; proposals in existing DailyQueue feedback UI. No new screen, no pgvector.

**V1:**
- `MemoryFact` with confidence sub-signals + temporal validity + contradiction detection (supersede-not-delete).
- Hashtag DNA + Series DNA; decay/half-life on performance memory.
- Human-approval queue + rollback surface.
- Embedding upgrade (Qwen3-8B / Gemini-001, store model+dims, re-embed) + LLM-as-reranker.
- Memory-quality eval harness on `EvalTest` (§11).

**V2 (evidence-gated):**
- pgvector + HNSW (trigger: >10–50K vectors or latency felt).
- Procedural memory / prompt self-optimization behind governance gate.
- Optional temporal graph; BEAM-style long-horizon eval.

---

## 10. Recommended approach

1. **Keep the stack; harden the loop.** No Mem0/Letta/Zep dependency. Reuse `vector-memory.ts`, `FeedbackEvent`, `VoiceProfile`, `ContentEmbedding`, `costGate`, `CronRun`. Everything below is additive Prisma + TS.
2. **Three-tier store:** Markdown **voice constitution** (identity, human-owned, always in-context) + relational **`MemoryFact`/DNA** (confidence, validity, provenance, approval) + **JS-cosine vectors** for recall (pgvector deferred).
3. **Split identity vs performance memory** with opposite update dynamics and different write gates (identity = human/≥3-obs; performance = auto + decay).
4. **Write discipline (Mem0-style ADD/UPDATE/DELETE, but as *proposals*):** every learned candidate enters `proposed`; promotes only on repetition ≥ N_full or explicit operator authority; contradictions supersede-not-delete (Graphiti bi-temporal).
5. **Embeddings:** switch primary to **`qwen/qwen3-embedding-8b`** (best Turkish/value) — or `google/gemini-embedding-001` if you prefer a first-party API — with **`openai/text-embedding-3-small` as stable fallback** (already wired) and **`createLocalFallbackEmbedding` as final offline fallback**. Persist `model`+`dimensions`; add a re-embed migration; never compare across spaces.
6. **Rerank:** **LLM-as-reranker** on the top-8 candidates using the existing `qualityJudge`/`viralJudge` roles (no new vendor, reuses budget). Escalate to Cohere Rerank only if precision measurably lags. (OpenRouter hosts no reranker — see 3.1.)
7. **Extraction/consolidation:** `cheapWriter` + Zod validation for fact extraction; `qualityJudge` for contradiction adjudication; weekly consolidation cron in the 18:00 learn slot; all under `mem_` cost prefix.
8. **Security first-class:** provenance gate (external ⇒ never identity), fenced injection of external-origin memories, human-approve + rollback on identity, cascade-delete-by-handle.
9. **North-star metric:** track **edit ratio** (token diff between AI draft and what Ali Cem actually publishes). Memory is "working" only when that ratio **falls over time**. Everything else is secondary.

---

## 11. Test & acceptance criteria

**Eval dataset (build on `EvalTest`):** curate **~30–50 gold pairs per account** from Ali Cem's real edit/publish history: `(draft context / source) → expected memory to recall` and `(AI draft, published draft)` pairs. Small, real, his — not synthetic.

**Memory-quality metrics (decomposed):**
| Metric | Definition | Target (initial) |
|---|---|---|
| Retrieval **precision@k** | % of retrieved memories that are relevant | ≥ 0.7 @ k=5 |
| Retrieval **recall** | % of known-relevant memories surfaced | ≥ 0.8 |
| **Contradiction rate** | % of active memory pairs mutually contradictory | < 2% |
| **Human-approval acceptance** | % of proposals operator approves | tracked (calibration signal, not a target) |
| **Staleness rate** | % active perf-memories not corroborated in N days | < 15% |
| **Edit ratio (north star)** | token diff(AI draft → published), memory-on vs off | **downward trend** + memory-on < memory-off |

**Acceptance criteria (ship gate):**
1. Pattern retrieval uses **real** embeddings (no local-hash for stored patterns); regression test asserts `provider !== "local_fallback"` on persisted pattern vectors.
2. A **single** correction does **not** create an active rule (test: one edit → fact stays `proposed`; three corroborating edits → `active`).
3. An **external-provenance** candidate **cannot** promote to identity memory (poisoning test: inject adversarial SourcePost → assert no identity `MemoryFact` written).
4. Contradiction → **supersede, not delete** (test: conflicting fact creates `superseded` chain, old fact still queryable at its `tValid` interval; rollback restores it).
5. Memory-on drafts show **lower edit ratio** than memory-off on the gold set (A/B on the eval harness).
6. All memory LLM spend logged under `mem_` and bounded by `costGate` (test: budget-exceeded blocks extraction).
7. `prefers-reduced-motion` / Turkish UI / mobile parity preserved on any new approval surface (baseline §1/§2 states discipline).

---

## 12. Kaynakça (dated, access 2026-07)

**CemOS repo (primary, read-only):**
- `_repo-baseline.md` (branch `fix/audit-p1-stability`, 2026-07-08)
- `src/lib/growth-engine/vector-memory.ts` (embed/cosine/retrieve loop; pattern local-hash at `:304`)

**OpenRouter (models/pricing, "updated July 2026"):**
- OpenRouter — Embedding Models collection — https://openrouter.ai/collections/embedding-models
- OpenRouter — Embeddings API reference — https://openrouter.ai/docs/api/reference/embeddings
- OpenRouter — text-embedding-3-small / -large model pages — https://openrouter.ai/openai/text-embedding-3-small

**Embedding quality / multilingual (2026):**
- Ailog — Embedding Models 2026 — https://app.ailog.fr/en/blog/news/embedding-models-2026
- BentoML — Open-Source Embedding Models 2026 — https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models
- CodeSOTA — MTEB Leaderboard 2026 — https://www.codesota.com/benchmarks/mteb

**Memory frameworks:**
- Mem0 — Long-Term Memory for AI Agents — https://mem0.ai/blog/long-term-memory-ai-agents
- Mem0 — State of AI Agent Memory 2026 — https://mem0.ai/blog/state-of-ai-agent-memory-2026
- Mem0 — AI Memory Benchmarks 2026 (LoCoMo/LongMemEval/BEAM) — https://mem0.ai/blog/ai-memory-benchmarks-in-2026
- Letta — Agent Memory blog — https://www.letta.com/blog/agent-memory/
- SurePrompts — Letta (MemGPT) walkthrough 2026 — https://sureprompts.com/blog/letta-memgpt-walkthrough
- Zep — A Temporal Knowledge Graph Architecture for Agent Memory (arXiv 2501.13956) — https://arxiv.org/abs/2501.13956
- Neo4j — Graphiti: knowledge graph memory — https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/
- LangChain — LangMem SDK launch — https://www.langchain.com/blog/langmem-sdk-launch
- Managing Procedural Memory in LLM Agents (arXiv 2606.23127) — https://arxiv.org/pdf/2606.23127

**Taxonomy / consolidation:**
- Anatomy of Agentic Memory: Taxonomy & Empirical Analysis (arXiv 2602.19320) — https://arxiv.org/html/2602.19320v1
- Atlan — Types of AI Agent Memory (episodic/semantic/procedural) — https://atlan.com/know/types-of-ai-agent-memory/
- Atlan — Agent Memory Architectures: Patterns & Trade-offs (2026) — https://atlan.com/know/agent-memory-architectures/

**Security / poisoning:**
- From Untrusted Input to Trusted Memory (arXiv 2606.04329) — https://arxiv.org/pdf/2606.04329
- Memory Poisoning Attack and Defense on Memory-Based LLM-Agents (arXiv 2601.05504) — https://arxiv.org/abs/2601.05504
- C. Schneider — Persistent memory poisoning in AI agents — https://christian-schneider.net/blog/persistent-memory-poisoning-in-ai-agents/
- BeyondScale — AI Agent Memory Poisoning Defense Guide 2026 — https://beyondscale.tech/blog/ai-agent-memory-poisoning-defense-guide
- Vectorize — AI Memory Poisoning — https://vectorize.io/articles/ai-memory-poisoning

**pgvector / scale:**
- Encore — You probably don't need a vector database — https://encore.dev/blog/you-probably-dont-need-a-vector-database
- Instaclustr — pgvector key features 2026 — https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/
- Google Cloud — Faster similarity search with pgvector indexes — https://cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes

**`unverified` items:** (1) Turkish-specific ranking of the candidate embedding models (inferred from multilingual MTEB, not a Turkish-only benchmark); (2) whether OpenRouter exposes any dedicated reranker route (none seen on the embeddings collection page — planned around as unavailable); (3) exact per-model vector dimensions on OpenRouter (page omitted them — confirm before the re-embed migration); (4) whether any EU-subject third-party data creates formal GDPR obligations for this single-operator tool.
