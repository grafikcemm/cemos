# 04 — Instagram Competitor Intelligence

> **Baseline anchor:** [`_repo-baseline.md`](./_repo-baseline.md). Frame = **KEEP → gap → decision**, never greenfield.
> **North star:** single-operator, additive-only DB, **manual (no ToS-violating scraping)**, Turkish UI. This is a **V1** feature — not the daily-focus MVP. Keep it policy-safe and lean.
> **Access date for all web sources:** 2026-07-08. Primary sources = Meta for Developers + Meta Transparency Center. `unverified` = not confirmed against a primary source.

---

## 1. Executive summary

CemOS already ships a **real Instagram backend with no UI** (`src/lib/instagram/*`: comment/dm/insight pipelines, `instagramService`, `Ig*` tables, AES-GCM `IntegrationCredential` token store, `META_*` env vars). The competitor-intelligence ask is therefore an **additive read layer + one UI surface**, not a new subsystem.

The policy-safe reality is narrow but usable:

- **Meta's official `business_discovery` endpoint** legitimately returns a competitor's *public professional-account* profile counts **and per-media engagement** (`like_count`, `comments_count`, `view_count`, caption, timestamp) — enough to compute an outlier/benchmark signal exactly like the existing YouTube `syncCompetitors` engine does. This is the single most valuable KEEP-aligned capability and it reuses infra already in the repo.
- Everything *beyond* profile + own-media-metrics (follower lists, audience demographics of others, unrestricted hashtag firehose, direct media-object GET) is **not available** through the API. The gap must be filled by **operator-driven manual capture** (paste a URL / screenshot), **not scraping** — scraping Instagram violates Meta Platform Terms and is explicitly out of scope per north star.
- **CrowdTangle is dead** (shut 2024-08-14) and its replacement **Meta Content Library is restricted to vetted academic/non-profit researchers** — unavailable to a commercial single operator. Do not design around it.
- Licensed compliant third-party (Phyllo, ~$199/mo, creator-permissioned) exists but is overkill for one operator tracking a handful of accounts. Scraper marketplaces (Apify) are cheap but ToS-gray → **not the default recommendation**.

**Recommended shape:** a **manual watchlist** of 5–20 competitor/inspiration handles + a **daily `business_discovery` sync** (LLM-free, quota-cheap) → outlier scoring reusing the YouTube pattern, + an **operator "swipe-file" capture** flow (paste URL or drop screenshot/video → multimodal LLM structures it into a `CompetitorContentItem`). This lands in **V1**; a scalable licensed-data tier is a deferred **V2**.

---

## 2. CemOS current-state link (backend exists, no UI)

| Asset (KEEP) | Location | Relevance to competitor intel |
|---|---|---|
| Instagram pipelines | `src/lib/instagram/` (comment/dm/insight) | Proven Meta Graph call plumbing, spend logged `platform:"instagram"` |
| `instagramService` | `src/lib/instagram/` | Existing service boundary to extend with a `businessDiscovery()` read |
| Token store | `IntegrationCredential` (AES-256-GCM, `CREDENTIAL_ENC_KEY`) | Where the long-lived Meta user token already lives — reuse, don't re-invent |
| Env | `META_{APP_ID,APP_SECRET,IG_USER_ID,PAGE_ID,ACCESS_TOKEN,GRAPH_VERSION}` | All present; business_discovery needs only these + your own IG pro account |
| Budget ledger | `UsageLog` + `getMonthlySpendByPurpose("ig_")` | Per-feature `ig_` budget already wired (`IG_MONTHLY_BUDGET_USD`) |
| **YouTube competitor engine** | `src/lib/youtube/` `syncCompetitors` → `outlierScore` (vpd/median×recency) | **The exact pattern to clone**: quota-bounded, LLM-free sync → outlier score. IG is the same problem with a different API. |
| Content-intel tables | `ContentItem` (`@@unique[platform,externalId]`), `Creator`, `CreatorBaseline`, `ContentOutlierScore`, `Board`/`Idea`, `ContentEmbedding` | **Already designed for exactly this.** `platform:"instagram"` rows + `Creator`/`CreatorBaseline` give competitor storage + baseline for free. |
| UI slot | IG tab currently aliased → `morning` (`TAB_ALIASES`) | The missing surface. A real `instagram` (or `ig-radar`) screen replaces the alias. |

**Decision framing:** The DB and service layers are ~80% present. The genuine gaps are (a) a `business_discovery` read method, (b) a `CompetitorAccount`/watchlist concept, (c) an operator capture flow, and (d) one Turkish UI screen. `ContentItem`+`Creator`+`CreatorBaseline`+`ContentOutlierScore` should be **reused, not duplicated** — a new IG-specific table is only justified for watchlist/capture metadata that doesn't fit.

---

## 3. Primary-source findings (Meta policy / API) — dated 2026-07-08

### 3.1 `business_discovery` — the one sanctioned competitor read
Source: [Business Discovery — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/) (accessed 2026-07-08).

- **Returns for a target public professional account:** `followers_count`, `media_count`, plus profile metadata (`username`, `name`, `biography`, `website` per the endpoint's field set) and a nested **`media` edge**.
- **Per-media (nested) fields:** `comments_count`, `like_count`, `view_count` (paid + organic combined), media IDs, and standard media fields (caption, timestamp, media_type, permalink) `unverified` on the exact per-field allowlist beyond the three engagement metrics — confirm against live field expansion.
- **Requirements:** the *app user* (you) must have an **Instagram professional (Business/Creator) account** linked to a Facebook Page + a user access token; the **target** must also be a **public professional account**.
- **Hard limits (documented):** "Data about **age-gated** Instagram professional accounts will not be returned." Returned media **cannot be fetched directly** — "performing a GET on any returned IG Media will fail due to insufficient permissions." No follower/following lists, no audience demographics of *other* accounts.
- **Rate limits:** not stated on this page (`unverified`). Instagram Platform uses a platform-wide rate-limit budget; treat a daily sync of ≤20 accounts as safe and gate it like the YouTube quota guard.

**Interpretation:** This is enough to build a legitimate **outlier/benchmark engine** (per-post like/comment/view vs the account's own median) — the same math as YouTube `outlierScore`. It is *not* enough for audience or growth-attribution analytics.

### 3.2 Instagram Platform overview
Source: [Instagram Platform — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/) (accessed 2026-07-08).

- Own account: publish media, manage/reply comments, messaging, **`@mentions` discovery**, insights.
- Other accounts: **Business Discovery** (basic metadata + metrics), **Hashtag Search** (find hashtagged media), public comments/mentions.
- All require an IG **Business or Creator** account; several features additionally require a linked **Facebook Page**.

### 3.3 Hashtag Search — narrow, and privacy-limited
Sources: [IG Hashtag Search reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search/) (accessed 2026-07-08); corroborated by developer guides below.

- **30 unique hashtags per rolling 7-day period, per IG account.** Re-querying the same tag inside the window doesn't reset or add to the count.
- Returns a **hashtag ID**; `recent_media`/`top_media` edges then return media — **but the poster's username / profile is NOT returned** (documented privacy restriction). Sensitive/offensive queries are filtered.
- **Decision:** hashtag search is useful for *topic/trend discovery* but **useless for account-level competitor tracking** (no attribution to a handle). Keep it as an optional discovery add-on, not the core.

### 3.4 Deprecations that constrain design
- **Instagram Basic Display API reached end-of-life 2024-12-04** — no longer functions. All integrations must use Instagram Graph API / Instagram API with Facebook or Instagram Login. (CemOS already uses the Graph path — no action, just don't regress.) Source: [SociaVault 2026 guide](https://sociavault.com/blog/instagram-api-deprecated-alternative-2026) (secondary; corroborated by Meta changelog references).
- Some Insights metrics deprecated from Graph API **v21 (2025-01-08)** `unverified` on which specific metrics still return for business_discovery media.

### 3.5 Scraping is prohibited by Meta terms (do not default to it)
Sources: [Facebook Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms); Meta Platform/Instagram Terms as summarized by [SociaVault: Is Instagram Scraping Legal 2025](https://sociavault.com/blog/instagram-scraping-legal-2025) (accessed 2026-07-08).

- Meta Terms prohibit "collecting information in an automated way without our express permission," naming scrapers, bots, crawlers, spiders.
- Meta blocks billions of scraping attempts/day and pursues account disabling + data-deletion demands.
- **Legal nuance (not a green light):** *Meta v. Bright Data* (N.D. Cal., Jan 2024) held that **logged-off** scraping of *public* data isn't governed by the ToS (which binds logged-in account holders). This is a litigation outcome about contract scope — **it does not make scraping safe or policy-compliant**, and does not touch copyright, PII, or IP-block risk. Source: [FBM analysis](https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/).
- **North-star ruling:** CemOS **must not** ship a default scraping path. Operator-initiated manual capture (the operator opens IG themselves, copies a URL / takes a screenshot) is a *human action*, not automated collection, and is the policy-safe substitute.

### 3.6 CrowdTangle / Meta Content Library — unavailable to CemOS
Sources: [Meta Content Library — Transparency Center](https://transparency.meta.com/researchtools/meta-content-library/); [CrowdTangle — Transparency Center](https://transparency.meta.com/researchtools/other-data-catalogue/crowdtangle/) (accessed 2026-07-08).

- **CrowdTangle shut down 2024-08-14.**
- **Meta Content Library (MCL)** replaces it but is **access-restricted to vetted academic and non-profit researchers** (ICPSR application). A commercial single operator **does not qualify**. Also: no data export, no per-post-over-time tracking, no direct post links.
- **Decision:** do not design around MCL. Note it only as "the door Meta closed."

---

## 4. Competitor / product patterns (swipe-file & inspiration tools)

| Pattern | Real examples | What CemOS should borrow / avoid |
|---|---|---|
| **Own-account + benchmark analytics** | Iconosquare, Sprout Social, Later, Hootsuite | They lean on official Graph/business_discovery for *counts*. Borrow the "benchmark vs your median" framing; CemOS already has `CreatorBaseline`. |
| **Creator-permissioned data API** | **Phyllo** (~$199/mo, custom), Modash | ToS-compliant, but requires the creator to *connect their account*. Works for *your own* accounts, not for tracking arbitrary competitors who won't connect. → not a fit for competitor intel. |
| **Scraper marketplaces** | **Apify** IG scrapers (~$0.005/query + $0.0005/post), apidojo | Cheap, ToS-gray, IP/ban risk, PII exposure. **Excluded from default**; may be an *operator-consented, operator-run* escape hatch only, clearly labeled. |
| **Swipe-file / inspiration capture** | Notion/Milanote boards, Later's "Saved", browser-extension savers | This is the KEEP-aligned model: operator *saves* a post they saw → system structures it. Maps directly onto existing `Board`/`BoardSection`/`BoardItem` + `Idea`/`IdeaSource`. |
| **Reverse-engineer → idea** | (internal to CemOS) `reverseEngineer` (`PROMPT_VERSION`) already exists for tweets | Reuse the same reverse-engineer prompt shape for an IG post → hook/structure/CTA breakdown. |

**Takeaway:** CemOS's competitive edge is **not** raw data volume (it can't win that policy-safely) — it's **structuring + judging** captured inspiration with its existing council/scoring/voice stack. Position competitor intel as a *swipe-file that thinks*, not a scraper.

---

## 5. Architecture options (Low / Med / High)

### Option A — LOW: "Manual watchlist + business_discovery sync" (recommended MVP)
- Operator adds handles to a **watchlist** (Turkish UI: "İzleme Listesi"). Store as `Creator` rows (`platform:"instagram"`) + a thin `IgWatchAccount` join for watchlist-specific flags (isInspiration/isCompetitor, notes, addedAt).
- **Daily LLM-free sync** (`syncIgCompetitors`, cloned from YouTube `syncCompetitors`): for each watched handle call `business_discovery` → upsert `ContentItem` (`@@unique[platform,externalId]`) per media with `like_count`/`comments_count`/`view_count`/timestamp/caption; update `CreatorBaseline` (median engagement); compute `ContentOutlierScore` (post engagement ÷ account median × recency half-life).
- **Operator capture (swipe-file):** paste an IG URL or drop a screenshot/short clip → multimodal LLM (see §5-multimodal) extracts the competitor content schema (§ below) → `BoardItem` + `Idea`/`IdeaSource`.
- Cost: sync is API-only (no LLM) → ~$0 LLM. Capture spends only when the operator triggers it, gated `ig_` budget.

### Option B — MED: A + hashtag topic radar + scheduled multimodal digests
- Add optional **Hashtag Search** topic radar (≤30 tags/7d budget), surfaced as "konu sinyalleri" — trends only, no handle attribution.
- **Weekly multimodal digest cron** (extend `/api/cron/learn` 18:00 sweep): batch-analyze the week's top-outlier watched posts → a "rakip özeti" (hook patterns, format mix, novelty) using `qualityJudge`/`creativeWriter` roles. Gated + traced (`PipelineTrace`).
- Cost: bounded weekly LLM batch; per verified catalog (§ below) a weekly ~20-post multimodal pass on `gemini-2.5-flash` is well within a few cents.

### Option C — HIGH: A + B + licensed data tier + semantic gap detection (V2, deferred)
- Optional **Phyllo/licensed** connector for richer, still-compliant data on *consented* accounts.
- **Content-gap engine:** embed captured competitor items (`ContentEmbedding`, existing JS-cosine) vs your own `PublishedPost` corpus → surface topics competitors cover that you don't ("içerik boşluğu"). pgvector remains a *future* comment per baseline; JS cosine is fine at this scale.
- **Excluded by default:** any scraping actor. Only an operator-consented, operator-run, clearly-labeled escape hatch.

**Recommendation:** ship **Option A** as V1; keep **B** as fast-follow (small cron + UI additions); treat **C** as V2.

### Multimodal analysis stack (verified against baseline model catalog)
Per `_repo-baseline.md §3`, CemOS's live catalog includes **vision-capable** models already wired via OpenRouter roles:
- `google/gemini-2.5-flash` (cheap multimodal — screenshots/frames/OCR; role `cheapWriter`/`viralJudge`).
- `google/gemini-2.5-pro` (multimodal, deeper — role `creativeWriter`/`qualityJudge`).
- `anthropic/claude-sonnet-4-5` (multimodal — role `finalEditor`/`premiumCreative`).
- Native `gemini-2.5-flash` already used for **transcripts** in Learn → reuse for Reel audio→text.
- `fal-ai/nano-banana-pro` / `fal-ai/gemini-25-flash-image` = image *generation*, not analysis — not needed here.

Pipeline: **screenshot → gemini-2.5-flash (OCR on-screen text + scene description)**; **short clip → native gemini transcript + frame sampling**; structure via `generateJsonGated` (reuse the gated wrapper, don't call raw `generateJson`) with a Zod schema (follow Learn's `runValidatedStage` pattern). **No new model dependency** — everything maps to the existing registry/roles.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Treating scraping as default | CRITICAL (ToS) | Ship **no** automated scraper. Manual capture = human action; business_discovery = sanctioned API. |
| Target must be *public professional* | HIGH (coverage) | Watchlist add-flow validates via a business_discovery probe; personal/private/age-gated handles are flagged "API'den alınamıyor — manuel ekle". |
| Copy-risk / imitation | HIGH | Store a **`copyRisk`** field per captured item; reverse-engineer to *structure/archetype* (hook shape, pacing), never verbatim caption reuse. Surface a "ilham al, kopyalama" gate. |
| business_discovery field/limit drift | MED | Version the IG prompt/adapter; fail-open sync (heartbeat `CronRun` pattern); mark `unverified` limits for live re-check. |
| Hashtag 30/7d budget exhaustion | MED | Counter in DB; refuse over-budget queries (mirror `assertGenerationAllowed`). |
| PII in captured screenshots (commenters, DMs) | MED | Capture flow strips/does-not-store commenter handles; store only the creator + post-level metrics. |
| LLM cost creep on capture | LOW-MED | Gate every capture through `ig_` budget; default to `gemini-2.5-flash`; escalate to pro only on operator request. |
| Rate-limit ban on own token | MED | Bound daily sync to ≤20 accounts; back off on 4/17/32 error codes `unverified` on exact codes. |

---

## 7. Cost & maintenance

- **business_discovery sync:** API-only, **no LLM cost**. Fits inside existing Meta app rate budget. Maintenance = same as YouTube sync (adapter + quota guard).
- **Multimodal capture (per verified catalog):** a single screenshot analysis on `gemini-2.5-flash` is a fraction of a cent; a weekly ~20-post digest a few cents. All logged to `UsageLog` under `meta.purpose:"ig_competitor"` and gated by `IG_MONTHLY_BUDGET_USD`. Exact per-call cost `unverified` (baseline notes per-role prices are hand-maintained/stale — reconcile against a fresh OpenRouter price pull before quoting numbers).
- **Job cadence:**
  - **Daily** — business_discovery sync + outlier recompute (LLM-free), fold into `/api/cron/daily` (06:00) heartbeat-first pattern.
  - **Weekly** — multimodal "rakip özeti" digest, fold into `/api/cron/learn` (18:00, Monday) alongside voice re-distill.
  - **Monthly** — baseline recalibration + prune stale watched-post rows (mirror `pruneTick`).
- **Third-party tiers (reference, not recommended for V1):** Phyllo ~$199/mo custom (compliant, creator-permissioned); Apify ~$0.005/query + $0.0005/post (scraping, ToS-gray). Both add vendor + ToS surface; defer to V2.

---

## 8. Security / policy (Meta ToS, copyright, PII)

- **Meta ToS:** only official endpoints (business_discovery, hashtag search, mentions) + operator-initiated manual capture. No automated scraping, ever, by default. Reuse `IntegrationCredential` (AES-GCM) for the Meta token — never log token values; reference `META_*` names only.
- **Copyright / imitation boundary:** competitor media is **reference, not asset**. Do not persist full-res downloaded media as reusable content; store metrics + operator's own screenshot/notes + an LLM-derived *structural* breakdown. Reverse-engineering produces an **archetype** (hook type, scene structure, CTA pattern), not a copyable draft. A `copyRisk` + "novelty" score gates how close a derived idea sits to the source.
- **PII:** competitor *creator* handle is public professional data (fine). **Commenter handles, DM content, private-account data = do not collect/store.** Capture flow must scope to post-level, creator-level fields only.
- **Access control:** new IG routes follow baseline guard pattern — `isOperatorOrCronAuthorized` on GET data + mutations; sync route behind `CRON_SECRET`. No new public routes.
- **Legal note:** the *Bright Data* ruling is **not** a basis to relax any of the above; it's a contract-scope holding, not a compliance safe-harbor.

---

## 9. MVP / V1 / V2 placement

- **NOT in daily-focus MVP.** The MVP is focus + draft quality (baseline §7). Competitor intel is explicitly a **V1** feature.
- **V1 (this feature):** Option A — watchlist (`Creator`+`IgWatchAccount`) + daily business_discovery sync → `ContentItem`/`CreatorBaseline`/`ContentOutlierScore` reuse + operator swipe-file capture (multimodal → `Board`/`Idea`) + **one Turkish UI screen** replacing the `instagram`→`morning` alias.
- **V1.1 fast-follow:** Option B — hashtag topic radar + weekly multimodal "rakip özeti" digest cron.
- **V2 (deferred):** Option C — content-gap/semantic engine (embeddings vs own posts), optional licensed (Phyllo) tier, optional operator-run scraper escape hatch (clearly labeled, off by default).

---

## 10. Recommended approach

1. **Reuse, don't rebuild.** Clone the YouTube competitor engine shape (`syncCompetitors`→`outlierScore`) into `src/lib/instagram/competitor/`. Store in existing `Creator`/`CreatorBaseline`/`ContentItem`/`ContentOutlierScore` with `platform:"instagram"`. Add only a thin **`IgWatchAccount`** table for watchlist metadata (flags/notes/probe-status) — additive `db:push`.
2. **Sanctioned data path only.** `instagramService.businessDiscovery(handle)` → daily LLM-free sync; validate watched handles are public professional accounts on add.
3. **Operator swipe-file capture.** Paste URL / drop screenshot or clip → `gemini-2.5-flash` (OCR + scene) via `generateJsonGated` + Zod (Learn's validated-stage pattern) → structured `CompetitorContentItem` → `BoardItem`/`Idea`/`IdeaSource`. Human-initiated = policy-safe.
4. **One Turkish screen** (`ig-radar` / "Instagram Rakip Radarı") replacing the `instagram` alias: watchlist, outlier feed ("öne çıkanlar"), swipe-file board, "ilham → fikir" action. Design all four states (loading/empty/error/success — baseline flags most feed screens collapse error into empty; do NOT repeat that here).
5. **Gate + trace everything** through `UsageLog`/`ig_` budget + `PipelineTrace`; fold sync into `/api/cron/daily`, digest into `/api/cron/learn`.
6. **Explicitly exclude** scraping and MCL from V1. Note Phyllo/Apify only as deferred options with ToS/cost caveats.

### Competitor content schema (concrete `CompetitorContentItem` fields)
Reuse `ContentItem` where possible; capture-specific fields go in an additive column set or JSON:
```
account (handle, → Creator)        url (permalink)              publishedAt
format (reel|carousel|image|story) durationSec (reels)          topic
hook (opening line/visual)         cta (call-to-action)         sceneStructure (ordered beats)
onScreenText (OCR)                 transcript (reel audio)      visibleEngagement { likes, comments, views }
archetype (pattern label)          novelty (0-1)                adaptability (0-1, fit to my voice)
copyRisk (low|med|high)            contentGap (topic I don't cover?)   sourceScreenshotUrl
capturedBy ("api"|"manual")        expiry (freshness TTL)       notes (operator)
```
`visibleEngagement` = only what business_discovery/manual view exposes; **no audience/demographic fields** (unavailable + PII).

---

## 11. Test & acceptance criteria

- **Unit:** `businessDiscovery()` adapter parses fields + handles missing/age-gated/private targets (returns typed "unavailable" not throw); outlier math matches YouTube engine expectations; hashtag-budget counter refuses the 31st unique tag in 7d.
- **Integration (MSW-mocked Meta responses):** daily sync upserts `ContentItem` idempotently on `@@unique[platform,externalId]`; `CreatorBaseline` median recomputes; over-`ig_`-budget capture is refused with `BudgetExceededError`; all spend rows land in `UsageLog` with `meta.purpose` prefix `ig_`.
- **Multimodal capture:** screenshot → structured item validates against Zod schema; repair-retry path (Learn pattern) covered; `copyRisk`/`novelty` populated.
- **Policy guards:** no code path performs unauthenticated/automated scraping; watched-handle add rejects personal/private with a Turkish message; commenter handles never persisted.
- **UI (Playwright, both breakpoints incl. 320px):** watchlist add/remove; outlier feed renders loading/empty/**error**/success (error state is a real block, not silent-empty); "ilham → fikir" creates an `Idea`.
- **Acceptance:** operator can add ≤20 handles, see a daily-refreshed outlier feed of their public posts, capture an inspiration post into a structured, copy-risk-scored idea — with **zero** ToS-violating data access and all cost inside `IG_MONTHLY_BUDGET_USD`.

---

## 12. Kaynakça (sources, accessed 2026-07-08)

**Primary (Meta):**
1. Business Discovery — Meta for Developers — https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/
2. Instagram Platform overview — Meta for Developers — https://developers.facebook.com/docs/instagram-platform/
3. IG Hashtag Search reference — Meta for Developers — https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search/
4. Facebook Automated Data Collection Terms — https://www.facebook.com/legal/automated_data_collection_terms
5. Meta Content Library — Transparency Center — https://transparency.meta.com/researchtools/meta-content-library/
6. CrowdTangle — Transparency Center — https://transparency.meta.com/researchtools/other-data-catalogue/crowdtangle/
7. Meta Content Library & API changelog — https://developers.facebook.com/docs/content-library-and-api/changelog/

**Secondary / corroborating:**
8. SociaVault — Is Instagram Scraping Legal? 2025 Guide — https://sociavault.com/blog/instagram-scraping-legal-2025
9. SociaVault — Instagram API Deprecated Again? 2026 — https://sociavault.com/blog/instagram-api-deprecated-alternative-2026
10. keyapi.ai — Instagram Business Discovery API: What Can You Actually Get — https://www.keyapi.ai/blog/instagram-business-discovery-api/
11. FBM — Meta Platforms v. Bright Data analysis — https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/
12. Zyte — California Court Meta Ruling (Bright Data) — https://www.zyte.com/blog/california-court-meta-ruling/
13. Phyllo — Instagram API Pricing 2026 — https://www.getphyllo.com/post/instagram-api-pricing-explained-iv
14. Apify — Instagram API Scraper (pricing/ToS) — https://apify.com/apify/instagram-api-scraper
15. CJR — Meta Is Getting Rid of CrowdTangle — https://www.cjr.org/tow_center/meta-is-getting-rid-of-crowdtangle.php
16. Emplifi — Instagram Hashtag Limitation FAQ — https://docs.emplifi.io/platform/latest/home/instagram-hashtag-limitation-faq

**`unverified` items (need live re-check before build):** exact per-media field allowlist beyond like/comment/view on business_discovery; business_discovery rate-limit numbers; which Insights metrics deprecated at Graph v21 still return; exact IG error codes for rate-limit backoff; current OpenRouter per-call multimodal prices (baseline notes the in-repo price table is stale).
