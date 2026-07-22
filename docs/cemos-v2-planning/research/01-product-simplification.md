# 01 — Product Simplification & Daily UX (Focus)

> **Owner of North-Star root cause #1 — "Odak yok" (IA dispersion / no clear daily action list).**
> **Ground truth:** [`_repo-baseline.md`](./_repo-baseline.md). Every claim here is framed **KEEP → gap → decision** against the *real* repo — never greenfield. Scope: single operator, Turkish UI, 2 X accounts (grafikcem + maskulenkod; pixelspor = next phase), manual-publish invariant, additive-only DB.
> **Research window:** accessed 2026-07 (all external sources dated + tagged in §12). Playwright tour of Typefully product UI done 2026-07-08.

---

## 1. Executive summary

CemOS already **has** the daily surface it needs — `MorningDashboardTab` ("Bugün") is the default tab and is a real, DB-backed review hub, not a stub (baseline §2). The focus problem is **not a missing screen; it is dispersion and mis-ordering**: ~16 top-level screens, two parallel X-review surfaces (`morning` quick-review *and* `daily-queue` full-queue), three separate library screens, and four overlapping Twitter "intelligence/mining" screens all compete for attention the moment the app opens. On top of that, the one screen that should be pure action (Bugün) currently leads with **vanity stats and a health gate** before it shows the operator the drafts to approve.

The fix is **subtractive and re-ordering, not additive**: make **Bugün the single daily destination**, put the **review queue first**, demote everything that is *input* (radar/discovery/sources/news) or *archive* (libraries, full queue) behind progressive disclosure or a drill-down, and adopt three battle-tested patterns from the market — Typefully's **draft-pipeline sidebar + command bar**, Linear's **notify-by-consequence** (only interrupt when action is required), and Sunsama's **calm single-focus "today" framing**. The primary task — *review → approve/copy today's drafts for 2 X accounts* — becomes reachable in **≤2 steps** and completable **without leaving Bugün**.

Central opinion: **"One surface. One number. One action."** One surface = Bugün. One number = "N taslak seni bekliyor". One action = approve/copy-to-X. Everything else earns its place by feeding that action or gets demoted.

Highest-leverage, lowest-risk moves (MVP): (1) re-order Bugün to **queue-first**, (2) collapse the readiness/health gate to **appear only when unhealthy** (kill notification fatigue), (3) give feed/library screens **distinct error states** (baseline flags most collapse error into empty), (4) merge the 3 libraries and demote the 4 intelligence screens so top-level nav stops shouting. None of these touch the immutable store keys or require a migration.

---

## 2. CemOS current-state (cited baseline facts)

Everything below is a **KEEP** anchor — the report refines it, never rebuilds it.

- **Single-page tab app**, not multi-route. `switch(activeTab)` in `screenRegistry.tsx`; IA source = `navConfig.ts` with two synced reps (`NAV_GROUPS`, `PRIMARY_AREAS`). Default `activeTab:"morning"`. (baseline §1)
- **IA = 4 platform groups + utility**: **Bugün** (`morning`, `daily-queue`, `news-pool`) · **Twitter** (`flow-radar`, `discovery-engine`, `source-intelligence`, `viral-library`) · **Kütüphane** (`keyword-library`, `prompt-library`, `pattern-library`) · **Youtube** (`youtube` + flag-gated `learn-dashboard`) · **Araçlar** (`toolbox`, `costs`, `settings`). ~16 internal screens. (baseline §1)
- **`TAB_ALIASES`** maps every removed id → a live screen (e.g. `instagram`→`morning`, `content-intel`→`discovery-engine`, `library`→`viral-library`); unknown persisted id → `morning`. **Hiding/removing a tab must keep its alias** or persisted state 404s. (baseline §1)
- **Two X-review surfaces, both DB/API-backed, neither uses the Zustand queue slice** (baseline §2):
  - **A. Morning quick-review** — `ReviewQueue` + `DraftReviewCard`, `useDailyQueueData()` GET `/api/growth/daily-queue?status=active&dateRange=today`, grouped by account, progress bar, **edit-gate** (publish disabled until operator edits AI text), lightweight (no score UI).
  - **B. Full queue** — `DailyQueueTab`, full `CriticScores`, List + Kanban (Taslak/Onaylı/Planlandı/Yayınlandı/Reddedildi), feedback types, rescore, schedule.
- **State coverage**: strong loading/empty/success app-wide; **distinct error states only on the two review surfaces**; **most library/feed screens collapse error into empty (silent catch)** — an explicit gap. (baseline §2)
- **Mobile**: off-canvas drawer + hamburger; **single breakpoint `@media (max-width:640px)`**; `prefers-reduced-motion` handled; no tablet tier. (baseline §1)
- **Instagram**: backend-only pipelines real (comment/DM/insight, classify→variants→risk), **NO UI**, tab aliased to `morning`. (baseline §4)
- **Security**: single-operator, no auth tables, perimeter = Vercel Deployment Protection; same-origin guard is CSRF-class; **manual-publish invariant — no platform write APIs, system only drafts**. (baseline §6)
- **Confirmed root causes** (baseline §7): (1) **Odak yok** — opening CemOS yields no clear action list; ~16 screens + duplicate surfaces disperse attention. (2) Taslak kalitesi (owned by a sibling report). MVP targets focus + quality only.

---

## 3. Primary-source findings (dated)

Patterns extracted from real, currently-shipping daily command centers and approval queues. Each is mapped to a CemOS decision.

### 3.1 Typefully — draft-pipeline sidebar + command bar (product UI toured 2026-07-08)
A Playwright screenshot of the live app behind the marketing modal shows the actual product shell:
- **Left rail = a linear pipeline of exactly three states: `Drafts / Scheduled / Posted`** — not a sprawl of feature screens. `+ New draft` pinned at top.
- Each draft row = **preview text + destination-platform icons (X/LinkedIn/Threads/Bluesky) + colored status labels** ("in review", "idea", "milestone", "content").
- **Global `Schedule` / `Publish` actions live top-right**, always in the same place.
- Secondary nav (**Calendar, Analytics, Help, Settings**) is demoted to the **bottom** of the rail.
- Changelog (2026): new **Queue View kanban**, **drag-drop drafts sidebar → calendar**, monthly view shows **empty slots**; a **Command Bar** launch ("great commands and features"); collaboration = comments, @mentions, roles, Slack "ready for review" notifications. (Typefully changelog + homepage, accessed 2026-07)
- **CemOS takeaway:** the winning shape is a **pipeline (Taslak → Onaylı/Planlandı → Yayınlandı), not a feature menu**. CemOS's `daily-queue` Kanban already mirrors this; the gap is that this pipeline is *one tab among 16* instead of *the spine of the app*. Adopt the **fixed top-right primary action** and a **command bar** for keyboard-first approval.

### 3.2 Linear — notify by *consequence*, not by channel (design analysis, dated May 2026)
- Core reframe: users are **"not overwhelmed by volume. They're overwhelmed by decision-making."** The system should answer the implicit "what does this require of me?" instead of forcing continuous triage.
- **Three tiers by consequence:** **Interrupt** (assignments/mentions/blockers — break through) · **Ambient** (comments/status — in-panel, no push, seen when ready) · **Digest-only** (reactions/activity — collapsed by default).
- **Work-state routing:** Focus Mode (only Tier-1), Available (default), Review (batched). **Asymmetric friction** — one tap into calm, two taps out.
- Reported effect: routing low-value items to digest lifted **"signal clarity" from ~31% → ~70%** (single-source design essay — **unverified** as an independent metric). (Medium/Arjun, dated May 2026, accessed 2026-07)
- **CemOS takeaway:** the `OperatorReadinessGate` (worker/automation/budget health) is today shown **prominently every open** — that is a Tier-3 concern occupying Tier-1 space. **Show it only when unhealthy** (Interrupt-on-consequence); when healthy, collapse to a single green tick. This is the single biggest notification-fatigue fix on Bugün.

### 3.3 Sunsama — the calm daily *ritual* and "three priorities" (user manual, accessed 2026-07)
- Every morning walks the user through a **guided ritual**: review yesterday → **define the 3 biggest priorities for today** → schedule focus blocks → routine tasks. "Helps you focus on **just the work you need to do today**."
- **Time-aware:** after 3 PM it flips to **evening mode** and plans *tomorrow* instead.
- **CemOS takeaway:** Bugün should feel like a **finite, completable ritual with an end state** ("Bugünlük bitti ✓"), not an infinite dashboard. Cap the daily surface to a **bounded set** (today's drafts + a short "worth reacting to" list), and give the operator a clear **done** signal — the antidote to "open, feel busy, close, do nothing."

### 3.4 Buffer — the single queue + a dedicated Approvals tab (help center, accessed 2026-07)
- Scheduling primitives are minimal and legible: **Next Available / Prioritize (bump to top) / Set Date & Time**. Posts needing sign-off land in a **dedicated Approvals tab**; "simplest for solo creators."
- **CemOS takeaway:** approval should be a **first-class lane**, not a modal buried in a Kanban. CemOS's morning `ReviewQueue` already *is* an approvals lane — keep it, make it the top of Bugün, and borrow Buffer's **"Next up"** framing so the operator always knows the single next card.

### 3.5 Hypefury — automation-centric batch queue (comparison sources, accessed 2026-07)
- Optimizes for a **publishing machine** (batch schedule, repurpose, auto-plug). Contrast with Typefully's writing-first, review-first stance.
- **CemOS takeaway:** CemOS is deliberately **review-first + manual-publish** (baseline §6) — closer to Typefully than Hypefury. Do **not** drift toward automation/scheduling breadth; that would fight the manual-publish invariant and re-disperse focus. Keep the surface about *deciding*, not *automating*.

### 3.6 Dashboard-UX metrics (Smashing / general UX literature, accessed 2026-07)
- Reusable daily-surface metrics: **Time to insight**, **Task success rate**, **Click paths** (unnecessary steps), and **Time-to-First-Value (TTFV)** — "how fast a user reaches the meaningful-value moment."
- **CemOS takeaway:** operationalize focus as **Time-to-First-Approve** and **screens-touched-per-session** (§10, §11).

---

## 4. Competitor / product patterns worth copying (synthesis)

| Pattern | Source | Copy into CemOS as |
|---|---|---|
| **Pipeline as the app spine** (Drafts → Scheduled → Posted) | Typefully | Bugün = the spine; `daily-queue` Kanban becomes its drill-down, not a sibling tab |
| **Fixed top-right primary action** + command bar | Typefully | Persistent "Onayla / X'te aç" + `Cmd/Ctrl-K` keyboard approval |
| **Notify by consequence** (Interrupt/Ambient/Digest) | Linear | Readiness/health gate shows **only when unhealthy**; digests stay collapsed |
| **Overwhelmed by decisions, not volume** | Linear | Bugün answers "what do I do now?" with one number + one next card |
| **Bounded, completable daily ritual + end state** | Sunsama | "N taslak" counter → "Bugünlük bitti ✓" done state; optional evening flip |
| **First-class Approvals lane + "Next up"** | Buffer | Morning `ReviewQueue` promoted to top; always show the single next card |
| **Stay review-first, avoid automation sprawl** | Hypefury (anti-pattern) | Hold the line on manual-publish; don't add scheduling breadth |

Anti-patterns to avoid (all observed as failure modes): a feature-menu instead of a pipeline; health/vanity widgets above the action; infinite feeds with no "done"; error silently rendered as empty (CemOS's current gap).

---

## 5. Architecture options — Low / Med / High

All options are **additive-only** and preserve immutable keys (`useXAgentStore`, `"xagent-store"`, `XAgentApp.tsx`, `TAB_ALIASES`).

### Low — "Re-order & repair" (Bugün only, no nav change)
- **Reorder `MorningDashboardTab`**: `ReviewQueue` first; `MorningHeroStats` demoted to a one-line counter; `OperatorReadinessGate` collapsed unless unhealthy; `DigestSection` + editorial bento moved below the fold, collapsed by default.
- **Fix error states**: give feed/library screens a **distinct error block** (retry + reason) separate from empty (baseline §2 gap). Reuse the `ReviewQueue` retry pattern already in the repo.
- **Add a "Next up" affordance** + done state to `ReviewQueue`.
- No `navConfig` change, no data model change. **Ships focus root-cause fix in the smallest diff.**

### Med — "Consolidate the nav" (recommended core)
- Everything in Low, plus:
- **`daily-queue` demoted from top-level nav → drill-down** launched from Bugün ("Tümünü gör / Detaylı kuyruk"). Keep the route + alias; remove it from `PRIMARY_AREAS`.
- **Merge 3 libraries** (`keyword-library`, `prompt-library`, `pattern-library`) into **one "Kütüphane" screen with sub-tabs**; keep old ids as aliases.
- **Collapse the 4 Twitter intelligence screens** (`flow-radar`, `discovery-engine`, `source-intelligence`, `viral-library`) behind a single **"Radar/Kaynak"** entry with internal tabs — they are *inputs to the queue*, not daily destinations.
- **Keyboard single-card review** (`Cmd/Ctrl-K`, `A`=approve, `E`=edit, `J/K`=next/prev).
- **Instagram review lane**: reuse `DraftReviewCard` to render `IgReplyDraft` / `IgDmDraft` with a risk badge inside Bugün (or a light `instagram` tab that no longer aliases to morning). Mirrors X approval; no new paradigm.
- Result: top-level nav drops from ~16 to roughly **Bugün · Radar · Kütüphane · Youtube · Araçlar** — one destination + inputs + archive.

### High — "Unified review inbox" (V2 horizon)
- A single **consequence-tiered review inbox** abstraction over X + Instagram (+ future pixelspor): Interrupt lane (drafts to approve), Ambient lane (news/viral worth reacting to), Digest lane (health, costs, syncs). Command bar + per-account **Focus Mode**. Larger surface unification; still additive (read-state may need one additive table for "reviewed/snoozed"). Only after Med proves the focus thesis.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Removing a tab from nav breaks persisted `activeTab` | HIGH | **Never delete ids** — demote from `PRIMARY_AREAS` but keep the screen registered + its `TAB_ALIASES` entry; unknown id already falls back to `morning` (baseline §1). Add a regression test per alias. |
| State loss via renamed store/localStorage keys | CRITICAL | Immutable per AGENTS.md/baseline — reorder UI only, touch no keys. |
| Over-collapsing hides power-user surfaces (full scores, feedback, rescore) | MED | `daily-queue` stays reachable as a drill-down; nothing is deleted, only demoted. |
| Edit-gate friction (publish disabled until edited) slows approval | MED | Keep the gate (it serves quality root-cause #2) but make editing **one keystroke** inline; show *why* it's disabled ("düzenle → yayınla"). |
| Notification-fatigue fix hides a *real* failure (worker down) | MED | Consequence tiering must still **Interrupt** on unhealthy — collapse only the healthy state. |
| Mobile single 640px breakpoint mis-renders queue-first layout | MED | Verify queue-first Bugün at 320/375/640; stack cards single-column; test drawer. |
| Instagram lane invites scope creep toward auto-reply | HIGH | Manual-publish invariant: IG lane **drafts only**, no send API (baseline §6). |

---

## 7. Cost & maintenance impact

- **AI/compute cost: ~zero.** This is frontend re-ordering + component reuse; no new generation calls. Bugün already fetches `/api/growth/daily-queue`; demoting screens *reduces* incidental fetches.
- **Maintenance: net negative (good).** Merging 3 libraries → 1 and folding 4 intelligence screens → 1 shrinks the number of top-level surfaces to keep alive, and the dual `NAV_GROUPS`/`PRIMARY_AREAS` sync burden. Fewer entry points = fewer state combinations to test.
- **Reuse over build:** Instagram lane reuses `DraftReviewCard`/`ReviewQueue`; error blocks reuse the existing `ReviewQueue` retry component. No new dependencies.
- **DB:** Low/Med = **no migration** (additive-only respected; nothing new needed). High only *may* add one additive `reviewState`-style table for snooze/reviewed — deferred.

---

## 8. Security / policy impact

- **Manual-publish invariant preserved** — no option here adds a platform write API; system continues to *draft only* (baseline §6). Instagram lane is drafts + risk badge, never send.
- **No new external-input surface.** Demoting/merging screens changes rendering, not data ingress; injection defenses (`wrapUntrustedData`, `<<<KAYNAK_VERI>>>` fences) untouched.
- **Open-route posture unchanged** — the P1 branch already guards the previously-open GETs; this report adds no new public endpoint.
- **Perimeter reminder (carry-over, not this report's fix):** app is public until Vercel Deployment Protection is enabled (baseline §8). A more prominent daily surface makes that pending action *more* urgent, not less.
- **Policy:** keep review-first stance; do not adopt Hypefury-style automation that would require write scopes/tokens.

---

## 9. MVP / V1 / V2 placement

- **MVP (owns root cause #1):** Low option in full —
  1. Bugün **queue-first** reorder; vanity stats → one-line counter.
  2. `OperatorReadinessGate` **collapsed unless unhealthy** (Linear consequence-tiering).
  3. **Distinct error states** on feed/library screens (fix baseline §2 gap).
  4. **"Next up" + done state** on `ReviewQueue`; primary task ≤2 steps.
- **V1:** Med option — nav consolidation (libraries→1, intelligence→1, `daily-queue`→drill-down), keyboard single-card review, **Instagram review lane** reusing `DraftReviewCard`.
- **V2:** High option — unified consequence-tiered review inbox + command bar + per-account Focus Mode; onboard **pixelspor** as 3rd account within the same lane.

---

## 10. Recommended final approach (opinionated)

**Ship the MVP now; commit to V1 as the real focus release.** The thesis — *"One surface, one number, one action"* — is validated by all five products toured: the winners make **one daily place** where the operator **decides**, and demote everything else to *input* or *archive*.

Concrete Bugün wireframe-level IA (refine `MorningDashboardTab`, do **not** rebuild):

```
┌─ Bugün ────────────────────────────────────────────────┐
│  1. Greeting + THE NUMBER:  "3 taslak seni bekliyor"    │  ← replaces MorningHeroStats vanity block
│     (grafikcem 2 · maskulenkod 1)      [● sağlıklı]     │  ← readiness = 1 tick; expands ONLY if unhealthy
├─────────────────────────────────────────────────────────┤
│  2. REVIEW QUEUE (the action, above the fold)           │
│     ┌───────────────────────────────────────────────┐   │
│     │ NEXT UP · @grafikcem                          │   │
│     │ <draft text, inline-editable>                 │   │
│     │ [Düzenle→Yayınla]  [Kopyala]  [X'te aç]  ⋯     │   │  ← primary action fixed; overflow hides rest
│     └───────────────────────────────────────────────┘   │
│     progress: ●●○○○  2/5 onaylandı                       │
│     … remaining cards stacked, one focus at a time …    │
│     Tümünü/skorları gör → (drill into daily-queue)      │  ← full Kanban demoted to drill-down
├─────────────────────────────────────────────────────────┤
│  3. WORTH REACTING TO (bounded, ~3 items)  [v collapsed]│  ← news/viral/YT highlights, progressive disclosure
├─────────────────────────────────────────────────────────┤
│  4. Digest / editorial bento              [v collapsed] │  ← below fold, opt-in
└─────────────────────────────────────────────────────────┘
     End state when queue empty:  "Bugünlük bitti ✓"
```

**Top-3 daily tasks** (solo creator opening CemOS), primary reachable in **≤2 steps**:
1. **Review + approve/copy today's X drafts** (2 accounts) — *Open → card → Düzenle→Yayınla/Kopyala.* **Primary.**
2. **Skim "worth reacting to"** and optionally spin a draft — *expand section → "Taslak üret".*
3. **Capture an idea / check a YouTube brief** — *Youtube tab or command bar.*

**X approval flow simplification:** one card in focus at a time; inline edit satisfies the edit-gate in a keystroke; **collapse the button row to one primary + overflow**; `Cmd/Ctrl-K` command bar and `A/E/J/K` shortcuts (Typefully/Linear). Keep grouping-by-account and the progress bar (already present).

**Instagram flow (currently UI-less):** surface `IgReplyDraft`/`IgDmDraft` through the **same `DraftReviewCard`** with a risk badge, as an "Instagram" lane in Bugün — draft-only, mirrors X, zero new paradigm.

**Screen classification — every screen, one-line rationale:**

| Screen (id → component) | Decision | Rationale |
|---|---|---|
| `morning` → MorningDashboardTab | **KEEP (refine)** | The daily surface; reorder queue-first, demote stats/health. |
| `daily-queue` → DailyQueueTab | **MOVE** | From top-level nav → drill-down of Bugün ("Tümünü gör"); keep route+alias. |
| `news-pool` → RadarTab | **MOVE** | Highlights surface inside Bugün; full pool behind "Worth reacting to". |
| `flow-radar` → FlowRadarTab | **MERGE** | Fold into one "Radar/Kaynak" input surface; it feeds the queue, not a destination. |
| `discovery-engine` → DiscoveryEngineTab | **MERGE** | Council mining overlaps flow-radar/source-intel; merge into Radar. |
| `source-intelligence` → SourceIntelligenceTab | **MERGE** | Source input; sub-tab of Radar. |
| `viral-library` → ViralLibraryTab | **MERGE** | Reference archive; sub-tab of Radar or Kütüphane. |
| `keyword-library` → KeywordLibraryTab | **MERGE** | Static JSON; one of 3 libraries → single "Kütüphane". |
| `prompt-library` → PromptKutuphanesiTab | **MERGE** | Into unified Kütüphane (sub-tab). |
| `pattern-library` → PatternLibraryTab | **MERGE** | Into unified Kütüphane (sub-tab). |
| `youtube` → YouTubeTab | **KEEP** | Distinct mature platform; separate cadence from X. |
| `learn-dashboard` → LearnDashboardTab | **HIDE** | Already flag-gated (`NEXT_PUBLIC_LEARN_ENABLED`); keep hidden by default. |
| `toolbox` → ToolboxTab | **KEEP (demote)** | Utility; stays under Araçlar, out of daily path. |
| `costs` → CostsTab | **KEEP (demote)** | Budget/health = Digest tier; not a daily destination. |
| `settings` → SettingsTab | **KEEP (demote)** | Utility footer, as Typefully does. |
| Instagram (backend-only, aliased→morning) | **KEEP → BUILD lane** | Reuse DraftReviewCard as an IG review lane in Bugün; draft-only. |

Net: **~16 top-level surfaces → 5 groups** (Bugün · Radar · Kütüphane · Youtube · Araçlar), with Bugün as the sole daily destination.

---

## 11. Test & acceptance criteria

**Measurable UX success (define + instrument):**
- **Time-to-First-Approve** (open → first draft approved/copied) **< 60s** — primary focus metric.
- **Screens-touched-per-session for the primary task = 1** (operator never leaves Bugün to approve).
- **Clicks-to-publish ≤ 3** (card → edit → copy/open-X).
- **Healthy-state interruptions = 0** (readiness gate never expands when healthy).
- **% of today's drafts approved without opening `daily-queue`** trending up.
- **Daily-active usage** (the real north star) — did the operator open *and act* today.

**Acceptance criteria:**
- [ ] Bugün renders **ReviewQueue above the fold**; stats reduced to one-line counter; readiness collapsed to a single tick when healthy, expands only on failure.
- [ ] Primary task **reachable in ≤2 steps** — verified by click-path audit at 320/375/640/1440.
- [ ] **Every daily surface has distinct** loading / empty / **error** / success states; error ≠ empty on feed/library screens (baseline §2 gap closed) — asserted in tests.
- [ ] `daily-queue` reachable as a drill-down; its route + `TAB_ALIASES` entry intact; **regression test per alias** (removed id → live screen).
- [ ] No rename of `useXAgentStore` / `"xagent-store"` / `XAgentApp.tsx` / file paths (grep guard in CI).
- [ ] Instagram lane renders `IgReplyDraft`/`IgDmDraft` via `DraftReviewCard` with risk badge; **no send API** invoked (manual-publish assertion).
- [ ] Keyboard path (`Cmd/Ctrl-K`, `A/E/J/K`) works and respects `prefers-reduced-motion`.
- [ ] Mobile 640px: queue-first stacks single-column, no overflow, drawer intact.
- [ ] Vitest suite green (baseline ~994 cases) + `next build` clean (types surface via build; no `tsc` script).

---

## 12. Kaynakça

External (accessed **2026-07**):
- Typefully — homepage + live product shell (Playwright tour 2026-07-08): https://typefully.com/ · changelog: https://typefully.com/changelog
- Typefully vs Hypefury (workflow/queue comparison): https://hypefury.com/typefully/ · https://authoredup.com/blog/typefully-vs-hypefury
- Linear — "Notification system treats attention as abundant" (Arjun, Medium, **dated May 2026**; single-source design essay — the 31%→70% "signal clarity" figure is **unverified**): https://medium.com/@arjundesigns/linears-notification-system-treats-attention-as-abundant-it-isn-t-646f5f44b8ae
- Linear — Triage / Inbox / Notifications docs: https://linear.app/docs/triage · https://linear.app/docs/inbox · https://linear.app/docs/notifications
- Sunsama — Daily Planning (guided ritual, 3 priorities, evening mode): https://help.sunsama.com/docs/daily-planning · https://www.sunsama.com/blog/the-official-daily-planning-guide
- Akiflow vs Sunsama (keyboard-speed vs guided-ritual contrast): https://akiflow.com/blog/akiflow-vs-sunsama-comparison
- Buffer — Managing & approving draft posts / scheduling (Next Available, Prioritize, Approvals tab): https://support.buffer.com/article/665-managing-and-approving-draft-posts · https://support.buffer.com/article/642-scheduling-posts
- Dashboard UX + TTFV metrics: https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/ · https://medium.com/@mervin.jad/time-to-first-value-ttfv-the-ux-metric-that-decides-retention-f47e07977fa6

Internal ground truth:
- [`_repo-baseline.md`](./_repo-baseline.md) — CemOS repo baseline (branch `fix/audit-p1-stability`, 2026-07-08). Sections cited: §1 (IA/screens/aliases), §2 (Bugün + two review surfaces + state-coverage gap), §4 (Instagram backend-only), §6 (security/manual-publish), §7 (root causes), §8 (deploy state).

**Unverified tags:** Linear "signal clarity 31%→70%" figure (single design-essay source, not independently confirmed); external comparison blogs (AuthoredUp/Hypefury pages are vendor/affiliate-adjacent — treated as directional, not authoritative). All CemOS internal claims trace to `_repo-baseline.md`, itself a point-in-time audit ("line refs indicative"; whether pushed Neon matches `schema.prisma` is not statically verifiable per baseline §8).
