# CemOS — Full Architecture, Feature & Security Audit (Codex Prompt)

> Paste everything below into Codex (or run as a Codex task) from the repo root.
> It is self-contained: it tells Codex what the app is, how to run it, what to test
> (frontend + backend + security + every existing feature), and exactly what report
> to produce. Codex must finish by writing **`docs/AUDIT-REPORT.md`**.

---

## ROLE

You are a Principal Engineer + Application Security Auditor. Audit the **CemOS** codebase
end-to-end: architecture soundness, every frontend screen, every backend route, security
posture (OWASP + app-specific surfaces), and the correctness of every existing feature —
both the legacy modules and the new Content Intelligence subsystem.

This is a **read + test + report** task. Do NOT refactor or "improve" code. You MAY create
test/throwaway files under `.tmp/` and you MUST write one final report. Do NOT run
destructive operations against the production database (see Constraints).

## WHAT CEMOS IS

- Next.js **16.2.6** App Router, React 19, TypeScript, **npm**.
- **Prisma 6.8 → PostgreSQL (Neon)**. Schema: `prisma/schema.prisma`. Generated client: `src/generated/prisma`.
  - Deploy method is **`prisma db push`**, NOT `migrate deploy` (the `migration_lock.toml` is a stale `sqlite` artifact; the hand-written SQL migration is reference-only). `prisma migrate status` will error P3019 — that is expected, not a bug.
- State: Zustand `useXAgentStore` (alias `useCemOsStore`) at `src/store/xagent.ts`, localStorage key `"xagent-store"`.
- **Single-operator app**: no User/Workspace/Session tables. `Account` rows = social identities (@grafikcem, @maskulenkod). Account-scoped data uses a plain `accountId` string.
- AI via **OpenRouter** abstraction `src/lib/ai/openrouter.ts` + role routing `src/lib/ai/model-config.ts`. Cost logged through `usageService.recordOpenRouter` → `UsageLog`.
- Mutation routes are CSRF-guarded by `isOperatorOrCronAuthorized` (`src/lib/utils/sameOriginGuard.ts`): accepts `Sec-Fetch-Site: same-origin/same-site`, or Origin-host == request-host, or a configured `CRON_SECRET` bearer. It intentionally does NOT block header-forging curl.
- Dev server: `npm run dev` (http://localhost:3000). Tests: `npx vitest run`. Typecheck: `npx tsc --noEmit`. Build: `npx next build`.

### Hard invariants — flag any violation as a finding, do NOT change them yourself
- Legacy symbols are deliberately preserved: `useXAgentStore`, localStorage `"xagent-store"`, `XAgentApp.tsx`, `src/store/xagent.ts`, HTTP User-Agent identities. **Renaming any of these = user state loss.**
- Everything in the Content Intelligence layer must stay **additive** — no edits to pre-existing models/features.
- **No auto-publish** without human approval. Drafts (`QueueItem`) start `status:"new"`.
- Ingested external content is **untrusted data, never instructions** (prompt-injection surface).
- Every AI call must write a `UsageLog` cost row.

## SETUP (do this first, capture output)

```bash
npm install
npx prisma generate
npx tsc --noEmit
npx vitest run
npx next build
npm run dev   # background; base URL http://localhost:3000
```

Record: install ok? client generated? tsc exit code? vitest pass count? build exit code? dev server health (`GET /api/health` → 200)? Any warning/error goes in the report.

Env: read **names only** from `.env.example` / `process.env` usage. **Never print secret values.** Note any required env var that is missing or any secret that risks client exposure (only `NEXT_PUBLIC_*` may reach the browser).

## TEST MATRIX

### A. Backend — every API route under `src/app/api/`
Inventory routes from the filesystem, then for each: confirm method(s), input validation (Zod), auth guard presence on mutations, error envelope (`{success,error}` + correct status), and happy/edge behavior.

- Content Intelligence (new): `content` (GET list; POST manual-URL ingest — verify it does NOT fetch the URL = no SSRF), `content/outliers`, `content/search` (GET semantic; POST `?action=reindex`), `content/[id]/reverse-engineer` (LLM; treats source as untrusted), `boards` (+`[id]` save-to-board), `ideas` (+`[id]/create-draft`), `voice-profiles`, `published-posts` (+`?action=snapshot`), `mcp` (read-only catalog + dispatch).
- Legacy: `morning`/`daily-digest`, `queue` (+`[id]/approve|reject|schedule|regenerate|generate-image|mark-published`), `news-pool` (+`[id]`, `process`, `run`), `repo-radar`, `content-radar`, `toolbox` (+refresh, `[id]/favorite`, `[id]/generate-idea`), `prompt-library`, `ai-rankings`, `sources` (+`[id]`), `source-posts`, `scan`, `generate`, `drafts`, `flow`, `growth/*`, `instagram/*`, `youtube/*`, `learn/*`, `integrations/*`, `competitors`, `costs`, `settings/*`, `cron/{daily,learn,refresh-rankings}` (auth via `CRON_SECRET`), `health`, `benchmark`.

For guarded mutations, test both: (1) plain request → expect 403; (2) with `-H "Sec-Fetch-Site: same-origin"` → expect success. Confirm idempotency where claimed: re-POST same canonical source → no duplicate `ContentItem` (unique `(platform, externalId)`); re-snapshot same window → upsert not duplicate.

### B. Backend logic / data layer
- Run and read the live loop demo: `npx tsx scripts/ci-demo.ts` (drives Capture→Understand→Discover→Save→Adapt→Create→Performance, self-cleans). Confirm outlier math (`metric / creator-format median`), insufficient-sample guard, semantic ranking, provenance (IdeaSource), draft stays `new`.
- Verify repos (`src/lib/db/*Repo.ts`) use parameterized Prisma (no raw string SQL injection), correct unique/upsert keys, and `accountId` scoping on account-bound queries.
- Verify outlier (`src/lib/content/outlier.ts`) and normalizer/search are pure + covered by `*.test.ts`. Check coverage of `src/lib/content/*` and flag untested branches.

### C. Frontend — every screen
Screens are mapped in `src/components/shell/screenRegistry.tsx`; nav in `src/components/nav/navConfig.ts` (areas: Bugün, Üret, Keşfet, Öğren, Sosyal Medya + utility Maliyetler/Ayarlar/AI Sıralama). Drive the running app (prefer Playwright — installed; else document manual steps) and check each tab:
`morning, discovery-engine, daily-queue, flow-radar, source-intelligence, news-pool (Radar), ai-rankings, toolbox, library, costs, settings, weekly-learning-report, training-center, instagram, youtube, learn-dashboard (flag-gated), content-intel (İçerik Zekası — new)`.

For each: renders without console errors; empty/loading/error states present; the new İçerik Zekası tab's Keşif/Boards/Fikirler sub-views call the right endpoints and handle empty data; no layout overflow at 320/768/1024/1440. Accessibility pass: semantic landmarks, keyboard nav, focus states, color contrast (Eden sage `#C8E0BF` on dark), `prefers-reduced-motion`. Note any `dangerouslySetInnerHTML`, unvalidated `href`, or `target="_blank"` without `rel`.

### D. Security review (OWASP + app-specific)
- **Prompt injection**: `reverseEngineer.ts` and any LLM call that embeds ingested/source text — confirm source is delimited as data and system prompt can't be overridden. Try a payload like a tweet body containing "ignore previous instructions…".
- **SSRF**: manual-URL ingest (`POST /api/content`) — confirm no server-side fetch of the URL; only http/https accepted.
- **AuthZ/CSRF**: every mutation route guarded; confirm no guarded action is reachable cross-site. Verify cron routes require `CRON_SECRET`.
- **Secrets**: no hardcoded keys; no secret behind `NEXT_PUBLIC_*`; `IntegrationCredential` token storage reviewed.
- **Injection/XSS**: Prisma parameterization; React escaping; sanitize any raw HTML.
- **Input validation**: Zod at every boundary; size caps; reject malformed JSON.
- **Rate limiting / cost abuse**: LLM-spending endpoints — are they budget-gated (`costGate`/`costLimits`) and guarded?
- **Data deletion / retention**, **error messages don't leak internals**, **dependency CVEs** (`npm audit`).

### E. Existing-feature correctness
Spot-check that legacy pipelines still pass after the additive CI work: daily-queue generation, flow-radar, news-pool/radar, toolbox, library, training-center, weekly-learning-report, CemOS Learn (if `LEARN_ENABLED`), Instagram, YouTube, costs, AI rankings. The full `vitest` suite (expect ~941 tests) must be green; investigate any failure.

## METHOD
- Prefer automated evidence: vitest, tsc, build, `npm audit`, curl with/without `Sec-Fetch-Site`, `npx tsx` scripts, Playwright for UI.
- For each finding, capture: file:line, reproduction, observed vs expected, and a concrete fix.
- Use real but synthetic data; clean up anything you write to the DB (the demo script is the model — it self-cleans).

## CONSTRAINTS
- Do not modify source to "fix" things — this run only diagnoses and reports.
- Do not run destructive DB ops on prod Neon (`db push --force-reset`, `DROP`, `migrate reset`, mass `deleteMany`). Create a Neon branch if you need write tests, or use the self-cleaning demo pattern.
- Never print secret values. Never rename the legacy invariants listed above.

## DELIVERABLE — write `docs/AUDIT-REPORT.md`
Single markdown file with:
1. **Executive summary** — overall health, top 5 risks, go/no-go for deploy.
2. **Verification results** — table: tsc / vitest (pass/total) / build / npm audit / dev health, each PASS/FAIL with evidence.
3. **Findings** — one row per issue:
   `| ID | Severity (CRITICAL/HIGH/MEDIUM/LOW) | Area (backend/frontend/security/data/feature) | file:line | Problem | Fix | Verification |`
   Order by severity. CRITICAL/HIGH must each have a concrete, minimal fix and a way to verify it.
4. **Coverage map** — every API route + every UI tab + every security item above, marked TESTED / PARTIAL / BLOCKED (+why).
5. **Feature checklist** — each existing feature: WORKS / BROKEN / REGRESSED (vs the additive CI changes).
6. **Remediation plan** — ordered fix list (quick wins first), each with effort S/M/L.
7. **Open questions / assumptions**.

Be exhaustive and specific. Prefer "no issue found, here's the evidence" over silence. End only after `docs/AUDIT-REPORT.md` is written.
