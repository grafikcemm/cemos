# FINAL — Data Architecture, Workers & Observability

> **Status:** SPEC (binding). Implements locked decision **D7** (+ rulings **C9**, **C10**, **C11**) from [`RESEARCH-SYNTHESIS.md`](./RESEARCH-SYNTHESIS.md).
> **Sources:** [`research/08-data-workers-observability.md`](./research/08-data-workers-observability.md) · [`research/_repo-baseline.md`](./research/_repo-baseline.md) (ground truth: 61 Prisma models, 4 Vercel crons, local worker).
> **Thesis:** the target architecture is **~90% KEEP**. This spec adds plumbing discipline (one gate path, one purpose taxonomy, idempotency on two ticks) — **no new infrastructure**. NO Vercel Queues, NO Workflows, NO pgvector, NO Langfuse, NO RLS at MVP/V1.

---

## 1. Target architecture

```
                 ┌───────────────────────── Vercel (Fluid Compute, default) ─────────────────────────┐
  Vercel Cron ──GET──▶ /api/cron/{generate-morning, daily, news, learn}        (Bearer CRON_SECRET)
  (4× once/day,         │  1. write CronRun heartbeat (kind, startedAt)                       [KEEP]
   Hobby ±59min)        │  2. acquire lease / CHECK IDEMPOTENCY KEY → skip if already produced [ADD·MVP]
                        │  3. time-budgeted, fail-open tick over DB rows                      [KEEP]
                        │        QueueItem / LearnProcessingJob (heartbeat lease, resumable)  [KEEP]
                        │  4. every LLM call ▶ generateJsonGated ─▶ budget gate               [FIX·waves]
                        │           │                      └─▶ UsageLog (meta.purpose enum)   [KEEP+extend]
                        │           └─▶ pipeline-runner ─▶ PipelineTrace (stages, totalCost)  [KEEP]
                        │  5. waitUntil(...) post-response trace/ledger writes                [ADD·optional]
                        │  6. mark CronRun ok/partial + resultJson                            [KEEP]
                        └── Neon Postgres: 61 models (+8 additive V1), db:push additive-only,
                            embeddingJson + JS-cosine (pgvector = V2 threshold-gated)         [KEEP]

  Local only: scripts/worker.ts (node-cron) — duePublishTick / scanTick / pruneTick;
              no-ops on Vercel; V1: hosts the Reels verifier RENDER tier (C10)               [KEEP+role]

  Readiness surface: OperatorReadinessGate (Bugün, collapsed unless unhealthy) + CostsTab
                     — cron !ok, budget, untracked-call counter, secret presence (C9)        [EXTEND]

  V2 conditional menu (NOT a plan): pgvector column ▪ Vercel Workflows for ONE long job ▪
                                    Langfuse OTel export ▪ per-call escalation gate
```

Invariants carried from D2/D7: manual-publish (no platform write APIs, ever) · fetched content is DATA never instructions (`wrapUntrustedData` fences) · verifier is the only outbound-fetch component and is SSRF-guarded, non-LLM.

---

## 2. Database

### 2.1 Engine & migration discipline
- **Neon Postgres**, Prisma 6.x, client output `src/generated/prisma`. `schema.prisma` is the source of truth (migrations dir stale since 2026-06-22 — leave it stale; do not resurrect `prisma migrate deploy`).
- **`db:push`, additive-only, continues.** Banned forever: column drops/renames, type narrowing, destructive prod migrations, `prisma db push --accept-data-loss`.
- **Drift check (V1):** read-only `prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url $DATABASE_URL` in CI, pre-deploy. Fails the pipeline on **non-additive** drift; additive-only drift warns. This finally makes "does Neon match schema.prisma" statically answerable (baseline §8 gap). `unverified`: current Neon live schema ≡ `schema.prisma` — the first CI run is the confirmation.

### 2.2 New tables by phase (all additive)

| Phase | Table | Owner spec (field detail lives there) |
|---|---|---|
| **MVP** | **none** — sprint 1 requires **zero migrations**; scorer sub-signals land in existing `QueueItem.scores` JSON | FIRST-SPRINT.md |
| V1 | `MemoryFact` (confidence, temporal validity, provenance, approval) | FINAL — Hafıza (D4 spec) |
| V1 | `CaptionDna`, `HashtagDna` | FINAL — Hafıza (D4 spec) |
| V1 | `SeriesProfile` (single-table series DNA; first series = Best AI Tools) | FINAL — İçerik Motorları (D5 spec) |
| V1 | `IgWatchAccount` (manual watchlist, business_discovery sync) | FINAL — İçerik Motorları (D5 spec) |
| V1 | `WebsiteVerification` (HTTP-tier evidence, expiry, re-verify) | FINAL — İçerik Motorları (D5 spec, verifier module) |
| V1 | `ReelDossier` | FINAL — İçerik Motorları (D5 spec) |
| V1 | `ReelPlan` + `ReelPlanSlot` (monthly assembler: pillars 3-5, 60/25/15) | FINAL — İçerik Motorları (D5 spec) |

Rules for every new table: additive `db:push`; no FK cascade deletes onto existing hot tables; scores/evidence as JSON columns per the repo's existing inline-JSON pattern; each ships with its owning feature, never ahead of it.

### 2.3 Embeddings & the pgvector threshold (V2, conditional)
- **KEEP:** `embeddingJson` (Float[]) + `searchableDoc` + exact JS-cosine scan. Per Neon's own guidance, brute-force is *preferable* at small scale — this is correct, not a compromise.
- **V1 precondition (from ruling C4):** every vector row stores `model` + `dimensions`; never mix embedding spaces; any model swap = gated re-embed migration.
- **Trigger to migrate (measured, not guessed):** vector count > **~50k** OR cosine-search **p95 > ~150 ms** — reported by a small benchmark harness (acceptance #8) run from the eval script, not eyeballed.
- **Migration recipe sketch (additive, zero-downtime):**
  1. `CREATE EXTENSION IF NOT EXISTS vector;` (free on all Neon tiers).
  2. Add nullable `embedding vector(1536)` column to `ContentEmbedding` (additive `db:push`; `halfvec` if dims > 2000).
  3. Backfill from `embeddingJson` in batches; keep JSON as fallback during cutover.
  4. Build **HNSW** index *after* backfill (raise `maintenance_work_mem` for the build).
  5. Swap the read path (cosine query → `<=>` operator) behind a flag; verify parity on the golden set; retire the JS scan. `embeddingJson` stays until one full retention cycle passes clean.

---

## 3. Workers & cron

### 3.1 Schedulers (KEEP both)
- **4 Vercel crons** (`vercel.json`, all GET, `CRON_SECRET` bearer, heartbeat-first `CronRun`, time-budgeted / fail-open). Hobby-legal (once/day each).
- **Local worker** `scripts/worker.ts` (`node-cron`, `npm run worker`) — no-ops on Vercel. KEEP as dev convenience **and V1 render-tier host** for the website verifier (ruling C10: Playwright render escalation runs here; a Vercel slim-chromium spike is a separate V1 go/no-go).
- **NOT adopted — Vercel Queues / Workflows.** Menu conditions to reopen (V2, per-job, one primitive max):
  - **Workflows:** a single job that (a) genuinely exceeds Pro's 800 s ceiling AND cannot be chunked with the existing `LearnProcessingJob` resume pattern, or (b) must pause for an external event (days). Adoption must *delete* hand-rolled resume code, not add capability. `unverified`: Workflows pricing + GA status (Queues trigger is `v2beta`).
  - **Queues:** real fan-out or backpressure from more than one operator. For CemOS: **never at this scale.**

### 3.2 Cron slots & C11 ruling

| UTC | Route | Content | Change |
|---|---|---|---|
| **`0 3 * * *`** | `/api/cron/generate-morning` | drafts per account | **MOVED from 04:00 (C11):** Hobby precision is ±59 min; 03:00 UTC guarantees drafts land 06:00–07:00 Istanbul (UTC+3) even at +59 min drift. Expectation moved, not infra; revisit Pro only if it ever bites. |
| `0 6 * * *` | `/api/cron/daily` | news + content-intel + light discover/generate + **V1 fold-in: IG business_discovery sync** (LLM-free) | fold-in, no new cron |
| `0 12 * * *` | `/api/cron/news` | light refresh | KEEP |
| `0 18 * * *` | `/api/cron/learn` | mining + engagement + YT + learn sweep + Monday voice re-distill + prune + **V1 fold-ins: memory consolidation/staleness sweep, eval sweep (edit-distance rollup, κ-calibration when it lands)** | fold-in, no new cron |

Rule: **new work folds into existing slots** (one route may serve several sub-jobs via `x-vercel-cron-schedule` / internal dispatch). A 5th cron requires a written justification in this file. All schedules UTC; no day-of-month + day-of-week combos; the scheduler does **not** retry a failed GET (fire-and-forget — durability lives in §4).

### 3.3 Job taxonomy (CronRun.kind + idempotency keys)

| Kind | Trigger | Spend-heavy? | Idempotency key | Phase |
|---|---|---|---|---|
| `generate-morning` | 03:00 cron | **yes** | `gen-morning:{yyyy-mm-dd}:{account}` | **MVP** |
| `daily` (discover/generate) | 06:00 cron | **yes** | `daily:{yyyy-mm-dd}` | **MVP** |
| `news` | 12:00 cron | low | `news:{yyyy-mm-dd}:{hour}` | MVP (cheap, take it) |
| `learn` | 18:00 cron | yes | `learn:{yyyy-mm-dd}` | MVP (cheap, take it) |
| `ig-sync` (V1) | folded into 06:00 | no (LLM-free) | `ig-sync:{yyyy-mm-dd}` | V1 |
| `memory-sweep` / `eval-sweep` (V1) | folded into 18:00 | low | `memory-sweep:{yyyy-mm-dd}` / `eval-sweep:{yyyy-mm-dd}` | V1 |
| `prune` | folded into 18:00 | no | `prune:{yyyy-mm-dd}` | KEEP |
| `duePublishTick` / `scanTick` | local worker only | no (manual publish) | n/a on Vercel | KEEP |
| `verify-render` (V1) | local worker | no | `verify:{url-hash}:{yyyy-mm-dd}` | V1 |

Mechanics: key derived deterministically at tick start; existence check against `CronRun` (or the produced `QueueItem` rows) — **no queue required**. A duplicate invoke records a skipped `CronRun` (`resultJson.skipped: "idempotent"`) and spends **zero** LLM budget.

---

## 4. Durability (dead-letter equivalent, no broker)

- **Idempotency keys (MVP)** on the two spend-heavy ticks — `generate-morning` + `daily` discovery — kill the R2 double-spend risk from cron re-hits or manual double-invokes. (Cheap to extend to `news`/`learn` in the same change; do so.)
- **Fail-open + `partial` + resumable rows = the dead-letter equivalent.** A tick that hits its time budget marks `CronRun.partial=true` and leaves job state (`QueueItem` status, `LearnProcessingJob` lease/cursor) resumable; the next invoke (scheduled or manual re-hit of the GET route) continues from DB state. Poisoned items stay visible as stuck rows in their own table — queryable, not lost in a broker.
- **Recovery from a crashed run = re-invoke the cron route.** Because ticks are idempotent (post-MVP) and jobs are DB rows with heartbeat leases, replay is always safe.
- **`!ok` alerting (V1):** last expected run per `CronRun.kind` missing or `!ok` → red line item in `OperatorReadinessGate` (collapsed tick expands only when unhealthy, per C9/D1). No email/pager — the operator opens Bugün daily; the gate IS the alert channel.
- **300 s window defense:** the time-budgeted tick pattern is the primary defense (Hobby max = 300 s). If a single tick chronically approaches it: (a) chunk further via the existing resumable pattern, (b) Pro 800 s ceiling, (c) only then the Workflows menu (§3.1). In that order.

---

## 5. Observability

### 5.1 Tracing
- **`PipelineTrace` KEEP (MVP):** `stagesJson` + `totalCostUsd`, written via `pipeline-runner`, pruned at 30 d. All new V1 pipelines (memory extraction, IG lanes, reel dossier, series) emit stage traces through the same runner — no parallel trace mechanism.
- **Langfuse = optional V2**, not a dependency. If ever adopted: instrument via OpenTelemetry spans so the vendor stays swappable (`unverified`: Langfuse OTel ingestion path); cloud Hobby free tier (50k units/mo) or self-host. `PipelineTrace` remains the system of record either way.

### 5.2 UsageLog purpose taxonomy (the enum)
Every gated call carries `meta.purpose = "<prefix><task>"`. **Prefix enum (closed set, enforced by type + CI):**

```
writer_   judge_    extract_   prefilter_  research_
audit_    memory_   strategy_  image_      reel_
ig_       yt_       learn_     series_     news_
```

- Prefixes are owned by **presets** (FINAL-OPENROUTER-ROUTING, D3/D6): the preset stamps the prefix; call sites supply only the task suffix. `getMonthlySpendByPurpose(prefix)` backs per-feature budget slices (`MONTHLY_AI_BUDGET_USD` global gate on top; normal projection ≈ $9-10/mo).
- Per ruling C8: memory extraction uses **`memory_`** (the `mem_` variant from report 02 is dead — do not introduce it).
- A call with an empty or out-of-enum purpose is a CI failure (acceptance #1).

### 5.3 Reconciliation test (trace-cost ≡ ledger-sum)
Standing integration test: for each generation run, `PipelineTrace.totalCostUsd` **must equal** the sum of that run's `UsageLog.estimatedCostUsd` rows (±rounding tolerance, e.g. $0.001). Runs in CI against a seeded run and as a nightly assertion inside the 18:00 eval sweep (V1). Divergence = a call escaped the gate or a trace stage under-reported — both are bugs, never "drift to accept".

### 5.4 Health dashboard (extends existing surfaces — **no new screen**, per C9)
- **`OperatorReadinessGate`** (Bugün, collapsed unless unhealthy) — the *signal*: last run per cron kind `ok/partial/failed` + age; budget breach; secret-presence booleans (names only); untracked-call counter > 0.
- **`CostsTab`** (under Araçlar) — the *detail*: MTD spend vs `MONTHLY_AI_BUDGET_USD` broken down by purpose prefix; trace tail (last N `PipelineTrace` with `totalCostUsd` + stage errors); per-cron run history; untracked-call counter ("raw `generateJson` sites remaining" — must read 0 post-migration, then becomes a regression guard); prune health.
- Eval KPIs (edit-distance trend, judge scores) join CostsTab in V1 per ruling C9 — same rule, no new top-level surface.

---

## 6. Plumbing (MVP)

1. **`generateJsonGated` = sole OpenRouter entry point** — the #1 cross-corpus action (6/9 reports). Migration in waves:
   - **Wave 1 (MVP / sprint 1):** hot paths — writer, judge, news-extract — plus the entirely un-logged **Sprint/growth-engine path** (worst offender: neither gates nor logs). Every migrated call gets a preset + purpose.
   - **Wave 2 (V1):** the remaining ~72 raw `generateJson` sites, engine by engine (news log-after-only fixed here), until the static counter reads 0.
   - **Enforcement:** CI grep/lint — direct `generateJson` import outside `generateGated.ts` fails the build once Wave 2 completes; until then the counter is tracked on CostsTab and must be monotonically decreasing.
2. **Startup secret assertion (MVP):** boot-time check that `DATABASE_URL`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `CREDENTIAL_ENC_KEY` exist → fail fast with a **NAME-only** error. Values never logged, never quoted into `CronRun.resultJson` / `PipelineTrace.stagesJson` / reports.
3. **`typecheck` script (MVP):** add `"typecheck": "tsc --noEmit"` to `package.json`; CI gate = typecheck + lint + tests + build (baseline gap: types currently surface only via `next build`).
4. **Fluid Compute:** confirmed default — active-CPU billing means I/O-wait (LLM/DB) is effectively free; CemOS ticks are mostly waiting. No action beyond confirming the project setting.
5. **`waitUntil`** (`@vercel/functions`, optional MVP): move post-response trace/ledger writes out of the response path on operator-facing routes. Never used for the spend itself — only for writes that must not block.

---

## 7. Backup / recovery

- **DB:** Neon **branching + PITR** is the backup plan — no separate dump pipeline. Recovery = create a branch at a pre-incident timestamp, verify additively, promote/repoint. **`unverified`: PITR retention window on the current Neon plan — confirm before relying on >24 h recovery and record the number here.** Destructive prod migration remains banned by policy regardless.
- **Idempotent replay recipe:** crashed/partial run → re-invoke the cron GET route → idempotency key skips completed work, resumable rows (`QueueItem`, `LearnProcessingJob` lease) continue the rest. No state outside Postgres needs restoring.
- **No-broker advantage (explicit):** because there is no queue, there is no broker log to back up, replay-order to reason about, or DLQ to drain — one datastore, one recovery story. This is a standing argument *for* the DB-ticker at every future "should we add a queue" discussion.
- **Secrets:** live only in Vercel env; rotation runbook references NAMES only; anything ever exposed gets rotated, never grandfathered.

---

## 8. Retention

| Data | Policy | Mechanism |
|---|---|---|
| `PipelineTrace` | 30 days | existing prune (18:00 cron) — KEEP |
| `UsageLog` | keep current + 12 prior months (budget history), prune older | extend prune job (V1) |
| `CronRun` | 90 days | extend prune job (V1) |
| `NewsItem` | archive < 70 score | existing — KEEP |
| Learn artifacts | learn sweep + prune | existing (18:00) — KEEP |
| `MemoryFact` (V1) | decay half-life on performance memory; identity memory near-∞; weekly staleness sweep (18:00) | D4 spec |
| `WebsiteVerification` (V1) | evidence expiry + re-verify window | D5 verifier spec |
| `FeedbackEvent` / `EvalTest` | keep (small, high-signal training/eval data) — revisit only if row counts bite | none needed now |

Prune health is monitored: a prune sub-job reporting `!ok` surfaces through the readiness gate (§4) so tables can't grow silently (R10).

---

## 9. Acceptance criteria

1. **No untracked LLM spend:** CI static check reports **0** direct `generateJson` imports outside `generateGated.ts` (post-Wave-2; monotonically decreasing counter until then). Every OpenRouter call writes a `UsageLog` row whose `meta.purpose` matches `^(writer_|judge_|extract_|prefilter_|research_|audit_|memory_|strategy_|image_|reel_|ig_|yt_|learn_|series_|news_)`. A new call site with a missing/out-of-enum purpose **fails CI**.
2. **Budget gate authoritative:** with `MONTHLY_AI_BUDGET_USD` set below MTD spend, **every** engine (incl. migrated Sprint/growth-engine + news) throws `BudgetExceededError` — asserted per engine in tests, not just the historical 2 callers.
3. **Idempotency:** invoking `/api/cron/generate-morning` twice for the same date+account produces drafts **once**; the second run records a skipped `CronRun` and adds **zero** `UsageLog` spend. Same assertion for `daily`.
4. **Fail-open under time budget:** a tick exceeding its budget marks `CronRun.partial=true` and leaves resumable job state; a re-invoke completes it; no 504 leaves an inconsistent or half-written row.
5. **Trace ≡ ledger:** each generation's `PipelineTrace.totalCostUsd` equals the summed `UsageLog` rows for that run within ±$0.001 — enforced by a standing test, checked in CI and the nightly eval sweep.
6. **Secret assertion:** boot with any required secret unset → fail fast with a NAME-only error; grep of logs/`resultJson`/`stagesJson` finds no secret values.
7. **No RLS regression:** documented decision — no code path assumes per-user row isolation; adding auth later triggers a fresh review, not a silent assumption.
8. **pgvector gate is measured:** the benchmark harness prints vector count + p95 cosine-search latency; migration may not start unless >~50k vectors or p95 >~150 ms is *observed*.
9. **Drift check green:** `prisma migrate diff` (schema ↔ Neon, read-only) runs in CI pre-deploy; non-additive drift fails; the first run resolves the `unverified` schema-parity question.
10. **Prune health visible:** a failed prune surfaces as `!ok` in the readiness gate within one daily cycle; `PipelineTrace`/`UsageLog`/`CronRun` row counts stay within retention bounds across a full cycle.
11. **C11 verified in prod:** after the schedule move, 7 consecutive days of `generate-morning` `CronRun.startedAt` fall within 03:00–04:00 UTC (i.e. drafts ready before 07:00 Istanbul).

---

*Unverified carried in this spec:* Neon PITR retention on current plan (§7) · Neon live schema ≡ `schema.prisma` (resolved by first CI drift run, §2.1/#9) · Vercel Workflows pricing/GA status (§3.1) · Langfuse OTel ingestion path (§5.1) · cron scheduler retry behavior (docs describe none; absence-of-doc).
