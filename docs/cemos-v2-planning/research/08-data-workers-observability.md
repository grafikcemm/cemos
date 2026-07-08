# 08 — Data, Workers, Observability & Security

> **Scope.** Long jobs / cron / queue / retry / tracing / cost control / data & secrets for CemOS on Vercel + Next.js 16 + Neon Postgres + OpenRouter.
> **Grounding.** Frames every finding against [`_repo-baseline.md`](./_repo-baseline.md) as **KEEP → gap → decision**. Nothing here is greenfield: CemOS already ships a working worker+cron+trace+ledger stack.
> **North star.** Single operator. **Keep complexity LOW.** No Kafka, no heavy infra, additive-only DB, secrets referenced by NAME only.
> **Research window.** Primary sources fetched **2026-07-08**; Vercel doc `last_updated` dates cited inline. Anything not directly verified is tagged `unverified`.

---

## 1. Executive summary

CemOS already runs the *correct shape* for a solo operator: **Vercel Cron → GET route → heartbeat-first `CronRun` → time-budgeted, fail-open tick over DB state**, plus a **local `node-cron` worker** (`scripts/worker.ts`) that no-ops on Vercel. There is no durable queue; jobs are DB rows (`QueueItem`, `LearnProcessingJob`) advanced by cron ticks with heartbeat leases. Tracing is DB-native (`PipelineTrace`), cost is a single ledger (`UsageLog`), embeddings are JSON + JS-cosine (no pgvector).

The big platform change since this stack was designed: **Vercel now ships two managed durability primitives** — **Vercel Queues** (durable, at-least-once event streaming with idempotency keys, visibility timeouts, app-level DLQ; `last_updated` 2026-06-30) and **Vercel Workflows** (durable multi-step execution with `sleep()` for minutes-to-months, deterministic replay; `last_updated` 2026-06-17). **Fluid Compute is now default** (since 2025-04-23), raising practical function duration to **300 s default / 800 s max (Pro) / 1800 s extended-beta**, with `waitUntil` background processing and in-function concurrency.

**Recommendation for one operator: do NOT adopt Queues or Workflows for MVP/V1.** The CronRun heartbeat + DB-state ticker is sufficient and cheaper (zero extra billable operations). The genuinely valuable, low-risk upgrades are all *inside the existing stack*:

1. **Close the cost-attribution gap** — route the ~72 raw `generateJson` call sites through the existing `generateJsonGated` wrapper (gate + log in one place) and extend `UsageLog.meta.purpose`. This is the single highest-leverage change.
2. **Add idempotency keys** to the two ticks where a duplicate = duplicate LLM spend (morning generation, discovery), so a cron retry or double-invoke can't double-bill.
3. **Keep `PipelineTrace`** for MVP; treat Langfuse (self-host free / cloud free 50k units/mo) as an *optional* V2 analytics layer, not a dependency.
4. **Keep JS-cosine embeddings**; pgvector is a V2 lever with a clear threshold (~50k vectors or when p95 search > ~150 ms), and Neon supports it free when you need it.
5. **No RLS** — single-operator, no auth tables, no multi-tenant surface. Keep Deployment Protection + same-origin guard. The real data risk is **SSRF on outbound fetches** (owned by report 05) and prompt injection (already fenced via `wrapUntrustedData`).

Net: the target architecture is **~90% KEEP**. The work is *plumbing discipline* (one gate path, one purpose taxonomy, idempotency on two ticks), not new infrastructure.

---

## 2. CemOS current-state (worker + cron + trace reality)

From `_repo-baseline.md` §6, §5, §3:

**Two schedulers (KEEP both, understand the split):**
- **Local** `scripts/worker.ts` (`node-cron`, `npm run worker`, **no-ops on Vercel**): every-min `duePublishTick`, hourly `scanTick`, daily `pruneTick`. Not a durable queue — a cron ticker over DB state.
- **Vercel crons** `vercel.json` (all GET, `CRON_SECRET` bearer, **heartbeat-first `CronRun`**, time-budgeted / fail-open):
  - `0 4 * * *` `/api/cron/generate-morning` — drafts first
  - `0 6 * * *` `/api/cron/daily` — news + content-intel + light discover/generate
  - `0 12 * * *` `/api/cron/news` — light refresh
  - `0 18 * * *` `/api/cron/learn` — mining + engagement + YT + learn sweep + Monday voice re-distill + prune

**Job/lease model:** only DB "job" tables are `QueueItem` and `LearnProcessingJob` (resumable, **heartbeat lease**). No broker, no message log. `CronRun` (kind / startedAt / ok / partial / resultJson) is the heartbeat + lock + run log.

**Tracing:** `PipelineTrace` (`stagesJson`, `totalCostUsd`, pruned 30 d) via `pipeline-runner`. Council + draft pipeline emit stage traces.

**Cost ledger:** `UsageLog` (type / estimatedCostUsd / provider / model / `meta.{purpose}` / platform / date) — single spend source. Readers `getMonthlyCost` / `getMonthlyFalCost` / `getMonthlySpendByPurpose(prefix)` back per-feature budgets (`yt_` / `ig_` / `learn_`). Budget gate `assertGenerationAllowed()` throws `BudgetExceededError`.
  - **GAP (baseline §3):** `generateJsonGated` (gate+log in one place) has **~2 callers**; **~72 sites call raw `generateJson`** with manual/absent gating. News logs-after-only; growth-engine Sprint path neither gates nor logs.

**Embeddings:** `TrainingExample.embeddingJson`, `ContentEmbedding.embeddingJson` (Float[] + `searchableDoc`), JS cosine. **pgvector explicitly a future comment only.** Local fallback embedding (256-dim hashing) exists.

**Security posture:** single-operator. No auth/session tables. Perimeter = **Vercel Deployment Protection**; `sameOriginGuard` is CSRF-class not auth; `cronAuth` = `Bearer CRON_SECRET` fail-closed in prod. `IntegrationCredential` = AES-256-GCM (`CREDENTIAL_ENC_KEY`). Manual-publish invariant: **no platform write APIs** — system only drafts.

**Data retention:** prune jobs exist (`PipelineTrace` 30 d; learn sweep + prune in the 18:00 cron; news archives < 70 score).

---

## 3. Primary-source findings (dated)

### 3.1 Vercel Cron (`/docs/cron-jobs`, `/docs/cron-jobs/usage-and-pricing`, last_updated 2026-06-16)

| Fact | Value |
|---|---|
| Trigger | HTTP **GET** to production URL at `path`; UA `vercel-cron/1.0`; header `x-vercel-cron-schedule` carries the expression (lets one route serve multiple schedules) |
| Cron jobs per project | **100** (Hobby / Pro / Enterprise — same) |
| **Minimum interval** | **Hobby: once per day**; Pro / Ent: once per minute |
| **Scheduling precision** | **Hobby: per-hour (±59 min)**; Pro / Ent: per-minute |
| Timezone | Always **UTC**; no `MON`/`JAN` aliases; can't set day-of-month and day-of-week together |
| Retries | **None documented** — cron is fire-and-forget; a failed GET is not auto-retried by the scheduler |
| Cost | Billed as the underlying Function invocation (active CPU + provisioned memory) |

> **CemOS impact:** all 4 crons run **once per day** → **Hobby-legal**. But on Hobby the 04:00 draft cron may actually fire anywhere 04:00–04:59 (±59 min). The local `duePublishTick`/`scanTick` (per-minute / hourly) **cannot run on Vercel Hobby** — but CemOS already knows this (worker no-ops on Vercel) and the manual-publish invariant means per-minute publishing isn't needed anyway.

### 3.2 Fluid Compute (`/docs/fluid-compute`, last_updated 2026-07-01)

- **Default for new projects since 2025-04-23.** Node.js + Python get **in-function concurrency** (multiple invocations share one instance — ideal for I/O-bound LLM/DB/vector calls), automatic cold-start optimization (bytecode caching, Node 20+), cross-AZ failover, error isolation (one bad request won't crash siblings).
- **`waitUntil`** (from `@vercel/functions`) continues background work *after* the response is sent — cheap way to log/trace/emit without blocking the user.
- **Cost model:** pay **active CPU time** (I/O wait — LLM calls, DB — does **not** count) + provisioned memory time. This directly favors CemOS's LLM-heavy, mostly-waiting workloads.

### 3.3 Function limits (`/docs/functions/limitations`, last_updated 2026-07-01)

| Limit | Hobby | Pro | Enterprise |
|---|---|---|---|
| Max duration | 300 s default & max | 300 s default, **800 s max**, **1800 s extended (beta)** | same as Pro |
| Memory | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU | up to 4 GB / 2 vCPU |
| Concurrency | auto-scale ≤ 30,000 | ≤ 30,000 | 100,000+ |
| Bundle (uncompressed) | 250 MB (5 GB "large functions" beta) | same | same |
| Request/response body | **4.5 MB** | same | same |

> **CemOS impact:** the time-budgeted / fail-open tick pattern is *exactly* the right defense for the 300 s window. If any single tick (e.g. the 18:00 learn sweep or morning multi-account generation) approaches 300 s, the answer is **not** a queue — it's either (a) Pro's 800 s ceiling, or (b) the existing chunked/resumable pattern (`LearnProcessingJob` already does this), or (c) Vercel Workflows for the one job that genuinely needs to pause.

### 3.4 Vercel Queues (`/docs/queues`, `/docs/queues/concepts`, `/docs/queues/pricing`)

Durable, append-only topic log; consumer groups; **at-least-once** delivery; **3-AZ synchronous replication** before publish returns.
- **Retries:** automatic until ack or TTL; first 32 attempts honor configured delay, then forced exponential backoff.
- **DLQ:** **no built-in DLQ** — poisoned messages fall to lower priority (new messages prioritized) and you ack-to-drop via an app-level `retry` handler.
- **Idempotency:** publish with an idempotency key → dedup for the message's whole lifetime (up to TTL); duplicates silently dropped.
- **Visibility timeout:** default 60 s, 0–3600 s, extendable mid-flight.
- **Push mode:** consumer function is **air-gapped** (no public URL, only Vercel internal infra can invoke) via `queue/v2beta` trigger in `vercel.json` — so **no auth code needed on the consumer**. Poll mode uses OIDC.
- **Limits:** retention 60 s–7 d (default 24 h); delay ≤ 7 d; max message 100 MB; unlimited topics/consumer groups.
- **Pricing:** per-API-operation (Send/Receive/Delete/Visibility/Notify), metered in 4 KiB chunks; idempotent sends & max-concurrency pushes billed 2×; regionally priced. `last_updated` 2026-04-06. Exact per-operation $ = `unverified` (page defers to regional pricing table).
- **Ordering:** only *approximate write order*; **no FIFO**.

### 3.5 Vercel Workflows (`/docs/workflows`, last_updated 2026-06-17)

- Durable execution SDK (`'use workflow'` / `'use step'`); **resumable** (pause minutes→months, resume from exact point), **durable** (survive deploy/crash via deterministic replay), **observable** (built-in run tracing in dashboard). Built on Vercel Queues + managed persistence.
- `sleep()` for arbitrarily long waits — the documented answer for "delays longer than 7 days" and "workloads that require unlimited execution time" (vs the 800 s function cap).
- **Pricing:** usage-based on **Events, Data Written, Data Retained**. Exact rates + GA-vs-beta status = `unverified` (pricing page not fetched; Queues trigger is `v2beta`, so Workflows is plausibly still early — treat as **not-yet-stable** for a solo operator).

### 3.6 Neon pgvector (`neon.com/docs/extensions/pgvector`, fetched 2026-07-08)

- **Supported on all Neon tiers, no extra cost.** `CREATE EXTENSION IF NOT EXISTS vector;` (per-database).
- Index types: **HNSW** (better recall/latency, slower build, more memory; can build on empty table) and **IVFFlat** (faster build, needs data first). `vector` ≤ 2,000 dims; `halfvec` ≤ 4,000.
- **Default = exact (brute-force) nearest neighbor with perfect recall.** Neon's own guidance: **"For small datasets, brute-force queries may be preferable to avoid index overhead."** Build indexes *after* loading data; raise `maintenance_work_mem`.

> **CemOS impact:** validates the current JS-cosine choice at current scale. pgvector is a *drop-in* when scale demands it — additive `db:push` of a `vector` column + one index, no re-architecture.

### 3.7 Langfuse (`langfuse.com/pricing`, fetched 2026-07-08)

- LLM app / agent tracing & observability. **Open-source, self-hostable free** (Docker Compose / K8s). Cloud **Hobby free**: 50k units/mo, 30-day retention, 2 users, no card. Core $29/mo (100k units, 90 d), Pro $199/mo. Overage $8/100k → $6/100k at scale.
- (Well-known, `unverified` here: Langfuse ingests **OpenTelemetry** spans, so instrumenting via OTel keeps the vendor swappable.)

---

## 4. Competitor / product patterns (job & trace stacks)

| Pattern | Who uses it | Fit for solo CemOS |
|---|---|---|
| **DB-as-queue (ticker over rows + lease)** | Postgres-backed apps, `pg-boss`, Supabase cron, GitHub-style outbox | **Current CemOS.** Lowest ops, zero extra billing, one datastore. Best fit. |
| **Managed serverless queue** (Vercel Queues, SQS, Upstash QStash) | Teams decoupling web from workers | Overkill for one operator until real fan-out/backpressure exists. |
| **Durable workflow engine** (Vercel Workflows, Temporal, Inngest, Trigger.dev) | Multi-step agent/business flows needing pause/resume + replay | Only justified for **one** long, pausing, multi-day job — not the daily cron sweep. |
| **DB-native trace rows** (custom `PipelineTrace`) | Small teams, cost-sensitive | **Current CemOS.** Free, queryable, no vendor. Good enough for MVP. |
| **Managed LLM tracing** (Langfuse, LangSmith, Helicone, Phoenix/Arize) | Teams doing prompt experiments, eval dashboards, multi-model cost analytics | Nice-to-have V2; Langfuse self-host/free tier is the cheapest on-ramp. |
| **Vector: brute-force in app** → **pgvector** → **dedicated vector DB** (Pinecone/Qdrant) | Progressive scale ladder | CemOS is correctly at rung 1; pgvector (rung 2) is the *only* upgrade a solo op should consider. Rung 3 = never (for this scale). |

**Takeaway:** every "modern" competitor pattern is a step *up* the complexity ladder. CemOS is deliberately (and correctly) on the bottom rungs. The report's job is to say *when* to climb, not to climb now.

---

## 5. Architecture options — Low / Med / High

### Option LOW — "Plumbing discipline" (recommended for MVP/V1)
**Keep** cron + `CronRun` heartbeat + DB-state ticker + `PipelineTrace` + `UsageLog` + JS-cosine, **exactly as-is**. Add only:
- Route all LLM calls through `generateJsonGated` (gate+log). Extend `UsageLog.meta.purpose` taxonomy (`x_draft_`, `x_council_`, `news_`, `yt_brief_`, `learn_`, `ig_`, `embed_`).
- **Idempotency key** on the two spend-heavy ticks (morning generation, discovery): derive a deterministic key (e.g. `generate-morning:{yyyy-mm-dd}:{account}`) and skip if a `CronRun`/`QueueItem` for that key already exists → cron retry / double-invoke can't double-bill.
- **Confirm Fluid Compute is on** (default) so I/O-wait LLM time isn't billed as CPU; use `waitUntil` for post-response trace/ledger writes.
- Add a `typecheck` script (`tsc --noEmit`) so the CI gate isn't build-only (baseline: no typecheck script).

*Cost:* ~0 new infra, additive DB only. *Risk:* lowest. *Effort:* days.

### Option MED — "One managed primitive where it earns its keep" (V2, conditional)
Everything in LOW, plus **selectively** introduce **one** of:
- **Vercel Workflows** for a *single* genuinely long/multi-step job — the Learn transcript map-reduce or a future multi-day content plan — where pause/resume + replay removes the hand-rolled `LearnProcessingJob` heartbeat/resume code. Trigger: a job that (a) exceeds 800 s or (b) must pause for an external event.
- **pgvector** on `ContentEmbedding` when semantic search p95 > ~150 ms or vector count > ~50k. Additive: add `vector` column, backfill, HNSW index, swap the cosine query. Keep `embeddingJson` as fallback during migration.

*Cost:* usage-priced (Workflows: Events/Data; pgvector: free on Neon). *Risk:* medium — new failure modes, `v2beta` maturity. *Effort:* 1–2 weeks per lever, isolated.

### Option HIGH — "Full managed queue mesh" (NOT recommended)
Vercel Queues topics for every job type, push-mode air-gapped consumers, fan-out consumer groups, DLQ handlers, Workflows orchestration on top. This is the *correct* design for a multi-operator SaaS with bursty external ingest. **For one operator it adds billing surface, more moving parts, and at-least-once/idempotency burden with no user-visible benefit.** Documented here only as the ceiling — explicitly out of scope for CemOS's north star.

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Untracked LLM spend** — 72 raw `generateJson` sites bypass gate/log; Sprint path neither gates nor logs. A model-price change or loop silently burns budget. | **HIGH** | Option LOW #1 — single gate path + purpose taxonomy. This is the top priority. |
| R2 | **Duplicate spend on cron retry / double-invoke** — no idempotency on generation ticks; at-least-once semantics (if ever queued) or a manual re-hit doubles drafts + cost. | HIGH | Option LOW #2 — deterministic idempotency keys on spend-heavy ticks. |
| R3 | **Hobby cron ±59 min imprecision + once/day floor** — "morning" draft may land at 04:59; per-minute publish tick can't run on Vercel. | MED | Accept on Hobby (manual-publish invariant makes it moot); if precise timing matters, Pro plan. Document the expectation. |
| R4 | **Tick exceeds 300 s** on Hobby (multi-account morning gen, learn sweep) → 504, partial run. | MED | Already fail-open + `partial` flag in `CronRun`; keep chunking; Pro 800 s as ceiling; Workflows only if a job truly can't be chunked. |
| R5 | **Neon schema drift** — `db:push` additive, migrations stale after 2026-06-22; whether Neon matches `schema.prisma` is not statically verifiable (baseline §8). | MED | Adopt a lightweight drift check (`prisma migrate diff` schema↔db in CI, read-only) before each deploy. Additive-only discipline stays. |
| R6 | **Adopting Queues/Workflows prematurely** adds billable ops + at-least-once idempotency burden + `v2beta` instability for zero solo-operator benefit. | MED | Option LOW default; MED only on the documented trigger conditions. |
| R7 | **SSRF on outbound fetches** (news, YT, repo radar, transcript providers, image gen) — the real external-input risk for a single-operator app. | HIGH | Owned by **report 05** (outbound verification). Cross-ref only; enforce allowlist + no internal-IP fetch. |
| R8 | **Prompt injection** via mined SourcePosts / fetched articles fed to LLM. | MED | KEEP `wrapUntrustedData()` `<<<KAYNAK_VERI>>>` fences; treat all fetched content as data; never let it reach a tool-invocation path. |
| R9 | **`CREDENTIAL_ENC_KEY` / secrets not set in prod** (baseline pending user actions) → `IntegrationCredential` decrypt fails or tokens exposed. | HIGH | Startup assertion that required secrets exist (fail fast); referenced by NAME only; rotate if ever exposed. |
| R10 | **Trace/ledger unbounded growth** if prune jobs silently fail. | LOW | `PipelineTrace` 30 d + `UsageLog` retention policy; alert if a prune `CronRun` reports `!ok`. |

---

## 7. Cost & maintenance

- **Compute:** Fluid Compute bills active CPU (not I/O wait) + memory-time. CemOS's LLM/DB-bound ticks are mostly *waiting* → cheap. Four once-daily crons ≈ negligible invocation cost. Staying on **Hobby** is viable *if* per-minute scheduling and 800 s aren't needed; the manual-publish invariant means they aren't (today).
- **LLM/API:** dominant cost. The `MONTHLY_AI_BUDGET_USD` gate + `UsageLog` per-purpose readers are the right control — but **only if every call is gated/logged** (R1). Closing that gap is the highest-ROI maintenance task.
- **Queues (if ever adopted):** per-operation, 4 KiB chunks, idempotent sends 2×. For daily solo volumes this is pennies — but it's *new* billing surface for no benefit at MVP.
- **Workflows (if ever adopted):** Events + Data Written + Data Retained (`unverified` rates). Justified only to *delete* hand-rolled resume code, not to add capability.
- **pgvector:** **free on Neon.** Cost is engineering (backfill + index tuning), not $.
- **Langfuse:** self-host = infra time; cloud Hobby free (50k units/mo). For one operator, PipelineTrace stays $0 and Langfuse is opt-in.
- **Maintenance burden ranking (low→high):** DB-ticker (current) < pgvector column < Langfuse self-host < Vercel Workflows < Vercel Queues mesh. Every rung up is more to keep alive during a solo operator's quiet weeks.

---

## 8. Security / policy (RLS / secrets / SSRF / injection)

- **RLS: NOT needed.** Single operator, no auth/session tables, no multi-tenant rows, no user-facing data isolation boundary. Adding RLS would be complexity with no threat it mitigates. **Decision: skip RLS**; perimeter stays **Vercel Deployment Protection** (must be ON — app is otherwise public) + `sameOriginGuard` (CSRF-class) + `cronAuth` (`CRON_SECRET`, fail-closed).
- **Secrets:** reference by **NAME only** (baseline §6 list). Add a **startup assertion** for required secrets (`DATABASE_URL`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `CREDENTIAL_ENC_KEY`). Never log/quote values into `CronRun.resultJson`, `PipelineTrace.stagesJson`, or reports. Rotate anything exposed. `IntegrationCredential` AES-256-GCM stays.
- **SSRF (primary external risk):** all outbound fetches (news sources, YT API, repo radar, transcript providers, image gen, feed-the-goat) must enforce an **allowlist + block internal/link-local IPs + timeout**. **Detailed enforcement is report 05's deliverable** — this report flags it as the top data-plane risk and defers.
- **Prompt injection:** KEEP `wrapUntrustedData()` fences on every mined/fetched string reaching an LLM. Invariant: fetched content is **DATA, never instructions**; no fetched content may trigger a tool/side-effect. The manual-publish invariant (no platform write APIs) is itself a strong injection blast-radius limiter — preserve it.
- **Tool sandboxing:** MCP catalog route is static/read-only; keep it that way. No agent path should gain a network-write or shell capability without an explicit gate.
- **Consumer security (if Queues ever adopted):** push-mode consumers are air-gapped by Vercel — no auth code needed, but that's a *future* note, not a current requirement.

---

## 9. MVP / V1 / V2 placement

| Item | MVP | V1 | V2 |
|---|---|---|---|
| Keep cron + `CronRun` heartbeat + DB ticker | ✅ | ✅ | ✅ |
| Route all LLM calls via `generateJsonGated` + purpose taxonomy | ✅ | — | — |
| Idempotency keys on spend-heavy ticks | ✅ | — | — |
| Startup secret assertion + confirm Deployment Protection ON | ✅ | — | — |
| Add `typecheck` script to CI gate | ✅ | — | — |
| Prisma schema↔db drift check in CI | — | ✅ | — |
| Prompt versioning (`PROMPT_VERSION`) on X/news prompts (baseline: only learn/reverse versioned) | — | ✅ | — |
| Alert when a prune/generation `CronRun` reports `!ok` | — | ✅ | — |
| pgvector on `ContentEmbedding` (threshold-gated) | — | — | ✅ (conditional) |
| Vercel Workflows for one long/pausing job | — | — | ✅ (conditional) |
| Langfuse (self-host/free) analytics layer | — | — | ✅ (optional) |
| Vercel Queues mesh | ❌ never (for this scale) |

---

## 10. Recommended approach (minimal for one operator)

**Adopt Option LOW now. Treat MED as a menu, not a plan.**

1. **One gate path.** Make `generateJsonGated` the *only* sanctioned way to call OpenRouter; migrate the ~72 raw sites incrementally (start with the un-logged Sprint/growth-engine path). Every call carries a `meta.purpose` from a small enum. This fixes R1 (top risk) and makes the existing budget gate actually authoritative.
2. **Idempotency on the two ticks that spend.** Deterministic key per (job, day, account); skip if already produced. Fixes R2. No queue required — a `CronRun`/`QueueItem` existence check is enough.
3. **Keep the heartbeat cron model.** It is the *documented-appropriate* pattern for once-daily, fail-open, single-operator jobs on Vercel. Do not replace with Queues/Workflows.
4. **Keep `PipelineTrace` + `UsageLog`.** They already give you per-run stage traces and per-purpose spend. Add a `!ok`-run alert (R10) and prompt versioning on the unversioned engines (R? / baseline gap).
5. **Keep JS-cosine.** Write down the pgvector trigger (~50k vectors or p95 > ~150 ms) so V2 is a decision, not a rewrite. Neon makes it a free, additive drop-in when the day comes.
6. **Security = do less, correctly.** No RLS. Deployment Protection ON, secrets asserted at startup by name, SSRF enforced (report 05), injection fences kept, manual-publish invariant preserved.

**Target architecture (described):**
```
                 ┌───────────────────────── Vercel (Fluid Compute, default) ─────────────────────────┐
  Vercel Cron ──GET──▶ /api/cron/{generate-morning, daily, news, learn}
  (4× once/day)         │  1. write CronRun heartbeat (kind, startedAt)           [KEEP]
                        │  2. acquire lease / check idempotency key               [ADD: idem key]
                        │  3. time-budgeted, fail-open tick over DB rows          [KEEP]
                        │        QueueItem / LearnProcessingJob (heartbeat lease) [KEEP]
                        │  4. every LLM call ▶ generateJsonGated ─▶ budget gate   [FIX: all sites]
                        │                          │                └─▶ UsageLog (meta.purpose)  [KEEP+extend]
                        │                          └─▶ pipeline-runner ─▶ PipelineTrace          [KEEP]
                        │  5. waitUntil(...) for post-response trace/ledger writes [ADD, optional]
                        │  6. mark CronRun ok/partial + resultJson                 [KEEP]
                        └── Neon Postgres: 61 models, additive db:push, embeddingJson+JS-cosine [KEEP]
  Local only: scripts/worker.ts (node-cron) — dev convenience, no-ops on Vercel                  [KEEP]

  V2 conditional (NOT MVP): pgvector column on ContentEmbedding ▪ Vercel Workflows for 1 long job ▪ Langfuse OTel export
```

**Job taxonomy (for `meta.purpose` + CronRun.kind):**
| Kind | Trigger | Spend-heavy? | Idempotency key |
|---|---|---|---|
| `generate-morning` | 04:00 cron | **yes** (drafts per account) | `gen-morning:{date}:{account}` |
| `daily` | 06:00 cron | yes (discover/generate) | `daily:{date}` |
| `news` | 12:00 cron | low | `news:{date}:{hour}` |
| `learn` | 18:00 cron | yes (mining/YT/voice) | `learn:{date}` |
| `duePublishTick` | local only | no (manual publish) | n/a on Vercel |
| `scanTick` / `pruneTick` | local / folded into crons | no | `prune:{date}` |

**Health dashboard spec (extends existing `OperatorReadinessGate` + `CostsTab`):**
- Last run per cron kind: `ok / partial / failed` + age (from `CronRun`); red if last expected run missing or `!ok`.
- Month-to-date spend vs `MONTHLY_AI_BUDGET_USD`, broken down by `meta.purpose` (already have `getMonthlySpendByPurpose`).
- Untracked-call counter: assert 0 raw `generateJson` sites remain (regression guard).
- Trace tail: last N `PipelineTrace` with `totalCostUsd` + any stage error.
- Secret presence check (names only, boolean).

**Backup / recovery plan:**
- **DB:** rely on **Neon branching + PITR** (`unverified` retention window on current plan — confirm). Recovery = branch from a timestamp, verify additively, promote. No destructive prod migration ever (banned by policy).
- **Idempotent replay:** because ticks are idempotent (post-change) and jobs are DB rows with leases, recovery from a crashed run = re-invoke the cron route; it resumes from `QueueItem`/`LearnProcessingJob` state.
- **Secrets:** stored in Vercel env; rotation runbook references NAMES only.
- **No queue = no separate broker backup** — one less thing to recover. (A point *for* staying on the DB-ticker.)

---

## 11. Test & acceptance criteria

1. **No untracked LLM spend:** static check (grep/CI) confirms **0** direct `generateJson` imports outside `generateJsonGated`; every OpenRouter call produces a `UsageLog` row with a non-empty `meta.purpose`. *Accept:* new call site without a purpose fails CI.
2. **Budget gate authoritative:** with `MONTHLY_AI_BUDGET_USD` set below MTD spend, every engine (incl. Sprint/growth-engine + news) throws `BudgetExceededError` — verified per engine, not just the two current callers.
3. **Idempotency:** invoking `/api/cron/generate-morning` twice for the same date+account produces drafts **once**; the second run records a skipped `CronRun` and **no** new `UsageLog` spend.
4. **Fail-open under time budget:** a tick that would exceed 300 s marks `CronRun.partial=true` and leaves resumable job state; a re-invoke completes it. No 504 leaves an inconsistent row.
5. **Trace integrity:** each generation emits a `PipelineTrace` with stage list + `totalCostUsd` matching the summed `UsageLog` rows for that run (±rounding).
6. **Secret assertion:** boot with a required secret unset → app fails fast with a NAME-only error (no value leaked to logs).
7. **RLS decision documented:** confirm no code path assumes per-user isolation; no RLS regression expected.
8. **pgvector readiness (V2 gate only):** a benchmark harness reports vector count + p95 cosine-search latency so the ~50k / ~150 ms threshold is measured, not guessed, before any migration.
9. **Drift check:** `prisma migrate diff` (schema↔Neon, read-only) reports no non-additive drift pre-deploy.
10. **Prune health:** a failed prune run surfaces as `!ok` in the health dashboard and does not silently grow `PipelineTrace`/`UsageLog`.

---

## 12. Kaynakça

Primary sources fetched **2026-07-08**; Vercel `last_updated` dates as shown on each doc.

1. Vercel — Cron Jobs. `https://vercel.com/docs/cron-jobs` (last_updated 2026-06-16).
2. Vercel — Cron Jobs Usage & Pricing. `https://vercel.com/docs/cron-jobs/usage-and-pricing` (2026-06-16).
3. Vercel — Fluid Compute. `https://vercel.com/docs/fluid-compute` (2026-07-01).
4. Vercel — Functions Limits. `https://vercel.com/docs/functions/limitations` (2026-07-01).
5. Vercel — Workflows. `https://vercel.com/docs/workflows` (2026-06-17).
6. Vercel — Queues. `https://vercel.com/docs/queues` (2026-06-17).
7. Vercel — Queues Concepts (delivery/retry/idempotency/DLQ). `https://vercel.com/docs/queues/concepts` (2026-06-30).
8. Vercel — Queues Pricing & Limits. `https://vercel.com/docs/queues/pricing` (2026-04-06).
9. Neon — pgvector extension. `https://neon.com/docs/extensions/pgvector` (fetched 2026-07-08).
10. Langfuse — Pricing. `https://langfuse.com/pricing` (fetched 2026-07-08).
11. CemOS — Repo Baseline. `./_repo-baseline.md` (branch `fix/audit-p1-stability`, 2026-07-08).

**`unverified` items (not directly fetched / not statically confirmable):**
- Vercel Queues exact per-operation $ rates (defers to regional-pricing table).
- Vercel Workflows exact pricing (Events/Data Written/Data Retained rates) and GA-vs-beta status (Queues trigger is `v2beta` → Workflows likely still early).
- Langfuse OpenTelemetry ingestion path (well-known, not re-verified this session).
- Neon branching / PITR retention window on CemOS's current Neon plan.
- Whether Neon's live schema matches `schema.prisma` (baseline §8: not statically verifiable).
- Cron scheduler retry-on-failure behavior (docs describe no retry; absence-of-doc, not an explicit "no retries" statement).
