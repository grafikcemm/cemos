# CemOS — Repo Baseline (Grounding Anchor)

> **Purpose.** Single source of truth for *what already exists* in CemOS. Every research report in `docs/cemos-v2-planning/research/` MUST link here and frame findings as **KEEP → gap → decision**, never greenfield planning of things that already ship.
> **Method.** Read-only 3-agent audit of the repo at branch `fix/audit-p1-stability` (2026-07-08). Line refs are indicative anchors at audit time.
> **Immutable.** `useXAgentStore` / `useCemOsStore` alias / localStorage `"xagent-store"` / `XAgentApp.tsx` / `src/store/xagent.ts` / HTTP User-Agent identities — **do not rename** (state-loss / identity risk).

---

## 0. Stack & infra facts

| Fact | Value |
|---|---|
| Framework | **Next.js 16.2.6**, React 19.2.4, `--webpack` (Turbopack opted out in dev+build) |
| Language/tooling | TypeScript, Zod 3.25, Zustand 5, Tailwind 4, Prisma 6.19.3 |
| DB | **Neon PostgreSQL** via `DATABASE_URL`; Prisma client output → `src/generated/prisma` (bundled via `next.config.ts outputFileTracingIncludes`) |
| Migration style | **`prisma db push`, additive** (`package.json db:push`; no `migrate` script). Migrations dir **stale after 2026-06-22** — ~36 of 61 models have no migration file; `schema.prisma` is source of truth. **pgvector NOT used** (embeddings = JSON + JS cosine). |
| Tests | **Vitest 3.2.6**, ~109 files / ~994 cases, MSW 2.7 mocks; Playwright 1.60 e2e (`tests/e2e/`, 2 specs, data-independent). **No `typecheck`/`tsc` script** — types surface via `next build`. |
| Scripts | `test`=`vitest run`, `test:e2e`=`playwright test`, `lint`=`eslint`, `build`=`prisma generate && next build --webpack`, `worker`, `dev:all` (dev+worker), `eval:run`=`scripts/run-eval-tests.ts` |
| Middleware | **None** (`middleware.ts` absent). Access control = per-route guard + Vercel Deployment Protection. |
| Package name | `grafikcem_xagent` v0.1.0 (brand = CemOS, legacy lineage = XAgent). |

**Accounts (locked scope):** 2 X channels wired — **grafikcem + maskulenkod** (Sidebar footer selector, `activeChannel`). **pixelspor is NOT wired → "next phase".**

---

## 1. App shape & IA (**KEEP** — do not rebuild)

- **Single-page tab-switched app**, not multi-route. `src/app/page.tsx` mounts `XAgentApp` → `AppShell`; screens selected by `switch(activeTab)` in `src/components/shell/screenRegistry.tsx`. Only real page routes: `/` + 4 deep-links `/dashboard/{daily-queue,flow-radar,source-intelligence,pattern-library}` (thin `AppShell initialTab=...` seeds).
- **IA = platform 4-group + utility**, single source `src/components/nav/navConfig.ts` — **two parallel reps kept in sync**: `NAV_GROUPS` (group→tabs) and `PRIMARY_AREAS` (rendered, adds icons). Rendered sidebar (`Sidebar.tsx`), no accordion (all expanded), collapsible icon rail (pref key `cemos-ui-collapsed`, separate from store).
  - **Bugün**: `morning`, `daily-queue`, `news-pool`
  - **Twitter**: `flow-radar`, `discovery-engine`, `source-intelligence`, `viral-library`
  - **Kütüphane**: `keyword-library`, `prompt-library`, `pattern-library`
  - **Youtube**: `youtube` (+ `learn-dashboard` iff `NEXT_PUBLIC_LEARN_ENABLED==="true"`)
  - **Araçlar** (utility): `toolbox`, `costs`, `settings`
- **~16 internal screens** total. `TAB_ALIASES` (`navConfig.ts`) maps every removed id to a live screen (e.g. `instagram`→`morning`, `content-intel`→`discovery-engine`, `library`→`viral-library`, `ai-rankings`→`toolbox`); unknown persisted id → `morning`.
- **Mobile**: off-canvas drawer + hamburger (`AppShell.tsx`, `TopStrip.tsx`); one breakpoint `@media (max-width:640px)` (`globals.css`); `prefers-reduced-motion` handled. No tablet tier.

**Screen map (id → component → purpose):** `morning`→`MorningDashboardTab` (Bugün hub) · `daily-queue`→`DailyQueueTab` (full draft queue) · `news-pool`→`RadarTab`(`NewsPoolTab`/`RepoRadarTab`) · `flow-radar`→`FlowRadarTab` (viral candidates) · `discovery-engine`→`DiscoveryEngineTab` (council mining) · `source-intelligence`→`SourceIntelligenceTab` · `viral-library`→`ViralLibraryTab` · `keyword-library`→`KeywordLibraryTab` (static JSON) · `prompt-library`→`PromptKutuphanesiTab` · `pattern-library`→`PatternLibraryTab` · `youtube`→`YouTubeTab` · `learn-dashboard`→`LearnDashboardTab` (flag-gated) · `toolbox`→`ToolboxTab` · `costs`→`CostsTab` · `settings`→`SettingsTab`.

---

## 2. "Bugün" & X review flow (**KEEP** — the daily surface)

- **Bugün EXISTS and is default** (`store activeTab:"morning"`). `MorningDashboardTab` = `PageHeader` "Bugün" ("~5 dk" subtitle) + `MorningHeroStats` + `OperatorReadinessGate` (worker/automation/budget health) + `ReviewQueue` + `DigestSection` (collapsible, `/api/daily-digest`) + editorial bento (`YouTubeHighlights`/`NewsHighlights`/`RepoHighlights`). Not a stub.
- **X review flow exists in TWO surfaces (both DB/API-backed, neither uses the Zustand queue slice):**
  - **A. Morning quick-review** — `ReviewQueue` + `DraftReviewCard`. Hook `useDailyQueueData()` GETs `/api/growth/daily-queue?status=active&dateRange=today`, groups by account (both shown), progress bar. **Edit-gate**: Publish disabled until operator changes AI text (`if(!isEdited)return`). Actions: Save (PATCH content), Copy, open-on-X intent, Generate image (`/api/queue/[id]/generate-image`), mark manually published. No score UI (lightweight lane).
  - **B. Full queue** — `DailyQueueTab` (tab `daily-queue`). Full critic scores (`CriticScores`: publishScore, personaMatch, hookStrength, clarity, virality, novelty, risk, recommendation, angle, reasoning, leaks, payoff/next-move, model). List + Kanban (Taslak/Onaylı/Planlandı/Yayınlandı/Reddedildi). Actions via `/api/growth/daily-queue/[id]` PATCH + `/feedback` (types: approved/rejected/edited/not_my_tone/hook_weak/too_ai/make_stronger/make_clearer) + `/rescore`; schedule; copy+open-X.
- **State coverage**: strong loading/empty/success app-wide; **distinct error states only on the two review surfaces** (`DailyQueueTab` toasts, `ReviewQueue` retry block). Most library/feed screens **collapse error into empty** (silent catch) — a real gap.

---

## 3. AI layer (**KEEP registry & gate; SIMPLIFY the two engines**)

- **OpenRouter client** `src/lib/ai/openrouter.ts`: hand-rolled fetch, `generateJson<T>({role,system,user,temperature,maxTokens,deadlineMs})` → `POST /chat/completions` with `response_format:{type:"json_object"}`, `usage:{include:true}`. **No schema validation at this layer** (cast `as T`). Real cost from `usage.cost` when present.
- **Model registry EXISTS** `src/lib/ai/model-config.ts`: `ModelRole = cheapWriter|qualityJudge|premiumCreative|creativeWriter|viralJudge|finalEditor`; `resolveModel(role)` profile-driven via `MODEL_PROFILE` (default `operator_quality`; also `premium`,`dev`); per-role env override; `estimateCost()` from **hand-maintained/stale** per-role prices; `getJudgeMode(handle)`. **Keyed by ROLE, not task/preset.**
  - operator_quality routing: creativeWriter→`google/gemini-2.5-pro`, finalEditor→`anthropic/claude-sonnet-4-5`, cheapWriter+viralJudge→`google/gemini-2.5-flash`, qualityJudge→`google/gemini-2.5-pro`, premiumCreative→`anthropic/claude-sonnet-4-5`. Defaults `deepseek/deepseek-chat:free`.
  - **Models referenced:** `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4-5`, `deepseek/deepseek-chat(:free)`, `openai/gpt-4o(-mini)` (premium profile), `openai/text-embedding-3-small` (hardcoded in vector-memory), native `gemini-2.5-flash` (learning transcripts), `fal-ai/nano-banana-pro` / `fal-ai/gemini-25-flash-image` (images).
- **Fallback EXISTS (layered):** cross-provider `getFallbackModels(baseModel)` try-list in `generateJson`; role fallback `premiumCreative→qualityJudge` unless `ENABLE_PREMIUM_MODEL`; `pipeline-runner.runStage({roleFallback})`; pipeline-level mock fallbacks; embeddings `createLocalFallbackEmbedding` (256-dim hashing). 400/422 auto-retry stripping `response_format`.
- **Budget gate EXISTS** `src/lib/config/costGate.ts`: `assertGenerationAllowed()` throws `BudgetExceededError`; `getBudgetStatus()` vs `MONTHLY_AI_BUDGET_USD` (default $10); separate `getFalBudgetStatus()`. Ledger `UsageLog` via `src/lib/services/usageService.ts` (`recordOpenRouter`/`recordGeneration`/`recordScan`/`recordImage`, `meta.purpose`), readers `getMonthlyCost`/`getMonthlyFalCost`/**`getMonthlySpendByPurpose(prefix)`** (per-feature budgets `yt_`/`ig_`/`learn_`).
  - **GAP:** wrapper `generateJsonGated` (`src/lib/ai/generateGated.ts`, does gate+log in one place) has **only ~2 callers**; ~72 call sites use raw `generateJson` with manual/absent gating. **News logs-after-only; growth-engine Sprint path neither gates nor logs.**
- **Two parallel X engines + two account-profile systems (the SIMPLIFY target):**
  - **LIVE** (used by `draftService.generateDraft`): `src/lib/accounts` + `src/lib/ai/prompts.ts` + `draft-pipeline.ts` — grounding (`grounding.ts`: mined patterns + hot SourcePosts≥40 + voice profile + banned phrases + semantic memory) → Phase1 multi-angle writer (creativeWriter, temp 0.9) → Phase2 viral judge (viralJudge, top-3) → Phase3 optional finalEditor; `judgeMode` fast-paths; `detectLeaks` + quality lint.
  - **Sprint** (older): `src/lib/growth-engine/*` + own `account-profiles.ts` — `draft-generator.ts` (safe/strong/provocative variants), `scorer.ts` (`calculateOpportunityScore`, `calculatePublishScore`, 11-factor `SourcePostScore`), `pattern-extractor`, `viral-analysis`, `vector-memory`, `feedback-service`. Calls `generateJson` directly, **no gate/log**.
- **Agents** `src/lib/agents/`: `router.routeItem(text)` (content→account, cheapWriter, fail-open) · `council.deliberate(text,handle)` (4 lens-agents hook/persona/risk/novelty → weighted `CouncilVerdict`, config in `council-config.ts`) · `pipeline-runner` (traced `generateJson` wrapper w/ roleFallback → `PipelineTrace`).
- **Prompts:** plain exported string-builders **by task, scattered**; per-account catalogs keyed by handle in `prompts.ts`. **Prompt versioning only in learning (`PIPELINE_VERSION`/`PROMPT_VERSION`) + `reverseEngineer` (`PROMPT_VERSION`)** — X/news/IG prompts unversioned. Injection defense `untrustedData.wrapUntrustedData()` (`<<<KAYNAK_VERI>>>` fences).
- **Structured output:** true Zod-gate only in learning `runValidatedStage` (safeParse + 1 repair retry) + growth-engine Zod types; elsewhere hand-rolled normalizers/clamps. Inconsistent.

---

## 4. Content engines maturity

| Engine | Status | Notes |
|---|---|---|
| **News** `src/lib/news/` | MATURE | Chunked idempotent `runPipelineTick`; raw→translated→analyzed; 5-criteria `scoreNews` (`viralScore`/`xValueScore`/`whyPeopleCare`/`tweetAngle`, archives <70); deterministic **`buzzScore`** (recency half-life 18h + corroboration + source-quality + HN/Reddit). Not budget-gated. |
| **X / growth-engine** | MATURE (×2, see §3) | Rich scoring already: opportunityScore/publishScore/11-factor SourcePostScore, council verdict, detectLeaks payoff/leaks, NextMove. |
| **YouTube** `src/lib/youtube/` | MATURE | `syncCompetitors` (quota-bounded, LLM-free) → `outlierScore` (vpd/median×recency); on-demand `briefForVideo` = 5-stage council brief, gated `yt_` budget + daily limit, traced. |
| **Instagram** `src/lib/instagram/` | **BACKEND-ONLY, NO UI** | `comment-pipeline`/`dm-pipeline`/`insight-pipeline` real (classify→variants→risk), `instagramService`, all spend logged `platform:"instagram"`. UI tab aliased to `morning`. |
| **Learn** `src/lib/learning/` | MATURE, flag-gated | Map-reduce transcript pipeline, Zod-validated stages, versioned+cached `LearnPack`, FSRS-lite SRS, resumable `LearnProcessingJob`. |

**Genuine gaps (barely/not built):** Instagram **UI**, competitor intelligence, Reels/monthly planner, website verifier, task/preset OpenRouter layer, prompt versioning (broad), current model catalog.

---

## 5. Data model (61 Prisma models — additive-only)

- **Core content/queue/accounts:** `Account`, `StyleProfile`, `Source`, `SourcePost` (dedup `tweetId`, `viralScore`/`opportunityScore`), **`QueueItem`** (the draft: `content`/`editedContent`/`status`/`scores`(JSON string)/`candidatesJson`/`estimatedCostUsd`/`usedMock`/`lintReport`/image urls), `Schedule`, `ScanRun`, `GenerationRun` (`estimatedCostUsd`), `PublishLog`.
- **Cost ledger:** **`UsageLog`** (`type`, `estimatedCostUsd`, `provider`, `model`, `meta`(JSON `{purpose}`), `platform`, `date`) — single spend source.
- **Scoring/intel:** `ViralPattern`, `TrainingExample` (**`embeddingJson`**), **`EvalTest`** (evaluation: testName/expectedBehavior/generatedOutput/score/failureReason), **`FeedbackEvent`** (feedbackType/original/edited/reason).
- **Trace/jobs:** **`PipelineTrace`** (`stagesJson`, `totalCostUsd`, pruned 30d), **`CronRun`** (kind/startedAt/ok/partial/resultJson — heartbeat/lock/log).
- **News:** `NewsSource`, `NewsItem` (viral/xValue/buzz/hnPoints/redditScore, processingStatus), `ContentOpportunity`, `RepoRadarItem`, `ToolboxResource`, `PromptTemplate`, `KeywordEntry`, `PromptFormula`, `AiModelSnapshot`, `DailyDigest`.
- **YouTube:** `YtChannel`, `YtVideo` (`outlierScore`,`viewsPerDay`), `YtBrief`.
- **Instagram:** `IgMedia`, `IgComment`, `IgReplyDraft`, `IgConversation`, `IgMessage`, `IgDmDraft`, `IgInsightSnapshot`; **`IntegrationCredential`** (AES-256-GCM encrypted token store, `CREDENTIAL_ENC_KEY`).
- **Learn:** `LearnSource`, `LearnTranscript`, `LearnChunk`, `LearnPack` (cache key `sourceId+pipelineVersion`), `LearnConcept`, `LearnItem`, `LearnReviewSchedule` (FSRS-lite), `LearnReviewAttempt`, **`LearnProcessingJob`** (resumable, heartbeat lease).
- **Content Intelligence (Eden-inspired):** `ContentItem` (unified, `@@unique[platform,externalId]`), `Creator`, `CreatorBaseline`, `ContentOutlierScore`, `Board`/`BoardSection`/`BoardItem`, `Idea`/`IdeaSource`, `VoiceProfile`, `VisualStyleProfile`, `PublishedPost`, `PerformanceSnapshot`, `SavedViralTweet`, **`ContentEmbedding`** (`embeddingJson` Float[] + `searchableDoc`, JS cosine, pgvector = future comment only).

**Scores live inline as JSON strings** (`QueueItem.scores`, `Idea.scoresJson`) or int columns — no separate scores table.

---

## 6. API, workers, crons, security

- **API** ~96 route handlers under `src/app/api/`. Guard utils: `src/lib/utils/cronAuth.ts` (`isCronAuthorized` = `Bearer CRON_SECRET`, fail-closed in prod) + `src/lib/utils/sameOriginGuard.ts` (`isOperatorOrCronAuthorized` = same-origin **OR** cron bearer; **CSRF-class, NOT auth**). Applied on all mutations + data GETs. **Genuinely open (5 GETs):** `health`, `mcp` (static catalog), `youtube/channels`, `learn/sources` (flag-gated), `integrations/feed-the-goat/snapshot` (own token). Route groups: `growth/*`, `queue/[id]/*`, `news`/`news-pool/*`, `youtube/*`, `learn/*`, `settings/*`, `content/*`, `boards`/`ideas`/`voice-profiles`, `costs`, `viral-library`, `cron/*`.
- **Workers — two schedulers:**
  - **Local** `scripts/worker.ts` (`node-cron`, `npm run worker`, no-ops on Vercel): every-min `duePublishTick`, hourly `scanTick`, daily `pruneTick`. **Not a durable queue** — cron ticker over DB state. Only DB "job" tables: `QueueItem`, `LearnProcessingJob`.
  - **Vercel crons** `vercel.json` (all GET, cron-secret, heartbeat-first `CronRun`, time-budgeted/fail-open): `0 4 * * *` `/api/cron/generate-morning` (drafts first) · `0 6 * * *` `/api/cron/daily` (news+content-intel+light discover/generate) · `0 12 * * *` `/api/cron/news` (light refresh) · `0 18 * * *` `/api/cron/learn` (mining+engagement+YT+learn sweep+Monday voice re-distill+prune).
- **Security model = single-operator.** No auth/session tables. Real perimeter = **Vercel Deployment Protection** (app is otherwise public). Same-origin guard is CSRF-only. **Manual-publish invariant**: no platform write APIs — system only drafts.
- **Env var NAMES** (values never quoted): `DATABASE_URL`, `OPENROUTER_API_KEY` + `OPENROUTER_{CHEAP,JUDGE,PREMIUM}_MODEL`, `MODEL_PROFILE`, `ENABLE_{FREE_MODELS,PREMIUM_MODEL,JUDGE,FINAL_EDITOR,LLM_LINT}`, `GEMINI_API_KEY`, `SUPADATA_API_KEY`, `SOCIALDATA_API_KEY`, `CRON_SECRET`, `CREDENTIAL_ENC_KEY`, `XAGENT_SNAPSHOT_TOKEN`, `MONTHLY_AI_BUDGET_USD`, `FAL_KEY`/`FAL_MONTHLY_BUDGET_USD`, `YT_BRIEF_MONTHLY_BUDGET_USD`, `IG_MONTHLY_BUDGET_USD`, `LEARN_MONTHLY_BUDGET_USD`, `YOUTUBE_API_KEY`, `META_{APP_ID,APP_SECRET,IG_USER_ID,PAGE_ID,ACCESS_TOKEN,GRAPH_VERSION}`, `LEARN_ENABLED`/`NEXT_PUBLIC_LEARN_ENABLED`, `OBSIDIAN_*`, `GITHUB_*`. Only client-exposed: `NEXT_PUBLIC_LEARN_ENABLED`.

---

## 7. Why not used daily (user-confirmed root causes → north star)

1. **Odak yok (IA dispersion):** opening CemOS doesn't yield a clear action list; ~16 screens + duplicate library/engine surfaces disperse attention.
2. **Taslak kalitesi (drafts not publish-ready):** tweets need too much editing / don't feel "mine".

Freshness and reliability are **secondary**. MVP + first sprint target **focus + quality** only.

---

## 8. Known deploy state (from prior sessions / memory)

- Prod HEALTHY; "stuck loading" symptom was stale/not reproducing. Branch `fix/audit-p1-stability` shipped P1 fixes (safeFetch timeout + error state; guarded ~17 open GET routes); **not yet deployed**. User actions pending: enable Vercel Deployment Protection (app public) + deploy; set `CREDENTIAL_ENC_KEY`; add `SUPADATA_API_KEY`; OpenRouter credit.
- Additive Neon `db:push` outstanding for various shipped-but-not-pushed models across sessions (news, YT, IG, learn, content-intel). Whether pushed Neon matches `schema.prisma` is **not statically verifiable**.
