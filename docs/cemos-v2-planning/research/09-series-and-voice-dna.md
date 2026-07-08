# 09 — Content Series DNA & Creator Voice

> **Corpus:** CemOS V2 planning research. **Baseline anchor:** [`_repo-baseline.md`](./_repo-baseline.md) — every finding below is framed **KEEP → gap → decision**, never greenfield.
> **North star:** root cause #2 = **Taslak kalitesi**. Series DNA + Voice DNA exist for one reason: make generated carousels + captions (and X drafts) feel *authentically Ali Cem*, so he edits less and publishes more.
> **Constraints:** single operator; Turkish UI; **additive-only** Neon `db:push` (no destructive migrations); JSON-string arrays are the project pattern; embeddings = JS cosine (no pgvector); do not rename immutable symbols.
> **Method:** read-only repo grounding (`schema.prisma`, `src/lib/ai/prompts.ts`) + primary-source web research. Access date **2026-07-08**. Items I could not verify are tagged `unverified`.

---

## 1. Executive summary

CemOS already ships **most of the Voice-DNA machinery** — it is just (a) partly hardcoded in `prompts.ts`, (b) X-tweet-shaped, and (c) missing the *Series* dimension entirely.

- **KEEP (already built, do not rebuild):** `VoiceProfile` (rich, 17 fields, versioned, `isActive`), `VisualStyleProfile` (carousel-shaped: colors/typography/layout/motifs/CTA), `StyleProfile` (per-account tone/format/forbidden/modes), `TrainingExample` (few-shot store with `embeddingJson`), `FeedbackEvent` (the raw material for edit-diff learning), `EvalTest` (the voice-match eval table already exists), prompt-versioning precedent (`PROMPT_VERSION` / `PIPELINE_VERSION` in learning + `reverseEngineer`).
- **THE GAP:** there is **no first-class "Series" concept** anywhere in the schema or engine. Ali Cem's real output is *series-driven* (Best AI Tools, Premium Colors, Color Combos, Freepik Keywords, Designer Websites…), each with its own cover formula, slide archetypes, caption pattern and repetition ban. Today a "Premium Colors" carousel and a "Best AI Tools" carousel would be generated from the *same* account-level profile — which is exactly why drafts feel generic.
- **Secondary gaps:** few-shot examples are **hardcoded** (`GOLD_EXAMPLES` in `prompts.ts`) not DB-editable; `FeedbackEvent` edits are **captured but never fed back** into generation; prompt versioning is **absent on the X/IG paths**; there is **no voice-match scoring loop** turning `EvalTest` into a real acceptance gate; no style-drift alarm.
- **Recommended shape:** one new additive table `SeriesProfile` (Series DNA) + reuse `VoiceProfile`/`VisualStyleProfile` unchanged for the cross-series voice/visual layer + a thin `SeriesExample` role on the existing `TrainingExample` (few-shot per series) + wire `FeedbackEvent` → nightly rule-extraction. Give Ali Cem one **edit screen** in Settings and a **10-30 case voice-match eval set** per series.
- **Overfitting is the primary risk**, not underfitting: primary sources converge on **2-5 few-shot examples** with diminishing/negative returns past ~8. The system must *retrieve* a small diverse example set per generation, not dump the whole catalog.

---

## 2. CemOS current-state link (what already exists)

Grounded in `prisma/schema.prisma` and `src/lib/ai/prompts.ts` at branch `fix/audit-p1-stability`.

### 2.1 `VoiceProfile` (schema L1162) — **KEEP, this is Voice DNA already**
Faz CI-4 already migrated hardcoded voice into DB. Fields present:
`mission, pointOfView, coreIdeasJson, audience, personality, vocabularyJson, toneTagsJson, rhythm, formatHabitsJson, preferredJson, avoidJson, anchorStories, writingSamples, notes, mode (personal|brand|client), version, isActive, sourceAttribution`.
→ This covers ~80% of the "Voice DNA schema" the task asks for. **Gap:** no sentence-length / directness / emoji-policy / punctuation / claim-evidence fields as *discrete* columns (they live implicitly in `toneTags`/`formatHabits` free text), and it is **not yet consumed** by the live `prompts.ts` builder (which still reads hardcoded `AccountProfile` + `GOLD_EXAMPLES`).

### 2.2 `VisualStyleProfile` (schema L1190) — **KEEP, this is the carousel visual layer**
`brandColorsJson, typography, layoutPatternsJson, aspectRatiosJson, textDensity, headlineLength, imageStyle, motifsJson, ctaStyle, forbiddenJson, referencesJson, version, isActive`.
→ Directly maps to the "visual language / typography / color logic / image diversity" half of Series DNA. **Gap:** it is *account-scoped*, not *series-scoped* — Premium Colors and Best AI Tools would collide.

### 2.3 `StyleProfile` (schema L40) — **KEEP (legacy account tone), do not duplicate**
`toneRules, formatRules, forbiddenRules, modes` (all `String`, one row per account, `@unique accountId`). This is the *older* per-account tone system consumed by `buildDraftSystemPrompt`. VoiceProfile supersedes it conceptually but both are live (baseline §3 "two account-profile systems = SIMPLIFY target"). **Decision:** do not extend `StyleProfile`; treat it as the account-level fallback and layer Series DNA above it.

### 2.4 `prompts.ts` — the hardcoded few-shot reality (**the thing to externalize**)
Per-handle catalogs keyed by handle: `ANGLES`, `GOLD_EXAMPLES` (few-shot gold posts), `VIRAL_PATTERNS`, `ACCOUNT_WRITING_RULES`, `MASKULEN_PILLARS/CLOSINGS`. `buildDraftSystemPrompt` assembles these into the system prompt with an explicit *"stili ve yoğunluğu yakala, BİREBİR KOPYALAMA"* instruction — i.e. **style-transfer-not-copy is already the design intent**. **Gap:** these are compile-time constants; Ali Cem cannot edit them, they are not versioned, and there is no series axis.

### 2.5 Learning substrate — **KEEP, reuse as-is**
- `TrainingExample` (L240): `inputType, sourceContent, outputContent, label, reason, metricsJson, embeddingJson` — a ready-made **DB-backed few-shot store** with embeddings for retrieval.
- `FeedbackEvent` (L257): `feedbackType, originalContent, editedContent, reason` — the raw **edit-diff** signal (already written by the Full-Queue feedback API per baseline §2). **Never read back into generation today.**
- `EvalTest` (L271): `testName, expectedBehavior, generatedOutput, score, failureReason` — the **voice-match eval table already exists** and has an `eval:run` script (`scripts/run-eval-tests.ts`, baseline §0).
- `Idea` (L1118) already carries `voiceProfileId` + `promptVersion` — the wiring hooks are pre-drilled.

**Net:** CemOS does not need a new voice system. It needs a **Series** layer, an **edit screen**, an **edit-diff feedback loop**, and **versioning + eval** on the paths that lack them.

---

## 3. Primary-source findings (dated; access 2026-07-08)

**F1 — Few-shot count: 2-5, hard ceiling ~8; more hurts.** PromptHub's few-shot guide (accessed 2026-07-08): *"research shows diminishing returns after two to three examples… two to five examples are good, we recommend not going beyond eight."* A bug-fix study showed *more examples degraded* outcomes. The 2025 paper *"The Few-shot Dilemma: Over-prompting Large Language Models"* (arXiv 2509.13196) formalizes that excess domain examples can *reduce* performance. → **Design rule:** retrieve **≤5 diverse** examples per generation, never the whole `GOLD_EXAMPLES` catalog.

**F2 — Overfitting = mimicry.** Same source: overfitting is *"where the model fails to generalize and creates outputs that mimic the examples too closely."* This is precisely the failure mode a designer notices ("this reads like a template"). → **Design rule:** examples must be *diverse*, and a novelty/repetition check must run against `past topics` (Series DNA field).

**F3 — Example diversity & ordering matter more than volume.** PromptHub: *"each example contributed uniquely"*; ordering caused predictions to swing from *near-SOTA to near-chance*; recommended putting the **most critical example last** (recency weighting). → **Design rule:** dedupe examples by archetype; order retrieved examples with the strongest/most-recent gold last.

**F4 — Style transfer via descriptors + pseudo-parallel pairs (STYLL / TinyStyler).** *Text Style Transfer overview* (arXiv 2407.14822) and *TinyStyler* (arXiv 2406.15586, 2024) show SOTA unsupervised authorship transfer = **target-style descriptors + few-shot exemplars + authorship embeddings**. Long-text transfer (arXiv 2505.07888, 2025) warns LLMs suffer **"style fragmentation" at paragraph level** and miss *author-specific argumentation logic / rhetorical preference*. → **Implication for carousels:** a multi-slide carousel is a "long text"; per-slide generation without a **series-level structural contract** (cover formula, slide archetypes) will fragment. Series DNA is the structural anchor that prevents this.

**F5 — Learning from user edits (PRELUDE / CIPHER).** *"Aligning LLM Agents by Learning Latent Preference from User Edits"* (arXiv 2404.15269, **NeurIPS 2024**). Framework **PRELUDE** infers a *description of latent preference* from historic edits and folds it into the prompt policy — **no fine-tuning**, uses **edit distance** as the cost to minimize. → **This is the blueprint for CemOS edit-diff learning:** turn `FeedbackEvent.originalContent → editedContent` diffs into inferred *rules* appended to the Series/Voice prompt, and track edit-distance as the north-star quality metric over time. Fine-tuning-free = perfect for a single-operator, budget-gated app.

**F6 — Personalization via reward factorization (2025).** arXiv 2503.06358 models a user as a latent vector; reward = distance from that point. Heavier than CemOS needs, but validates the **"single latent preference per surface"** framing and the idea of a per-series preference vector (feasible cheaply as an embedding centroid over accepted posts using existing JS-cosine infra).

**F7 — Prompt versioning is non-negotiable for debuggability.** Braintrust and Latitude guides (accessed 2026-07-08): prompts are part of the *system* (prompt + examples + config); *"if you cannot reconstruct what was running when a user reported a bad response, you cannot debug it."* Use a **golden dataset of 50-200 cases, version-controlled alongside prompts**, feature-flag + checkpoint for fast revert. → CemOS already does this in `learning` (`PROMPT_VERSION`); extend the pattern to Series/Voice. (For a single operator, 10-30 cases/series is a pragmatic scale-down — see §11.)

**F8 — Style/voice drift is a monitorable metric.** LLM-monitoring sources (Leanware, Braintrust, Galileo, accessed 2026-07-08): **LLM-as-judge** can score *User-Profile Consistency* (does output match established communication style) on a multi-dimensional scale; **output drift** = responses shifting for similar prompts. → CemOS can reuse its existing judge role (`viralJudge`/`qualityJudge`) to emit a **voiceMatch score 0-100** and alarm when the rolling mean drops (model swap, prompt regression, or a bad example poisoning retrieval).

---

## 4. Competitor / product patterns (brand-voice tools)

All accessed 2026-07-08. Pattern extraction, not endorsement.

| Product | Voice-capture mechanism | Pattern worth stealing | Anti-pattern to avoid |
|---|---|---|---|
| **Jasper Brand Voice** | Two features: **Memory** (facts/products/audience) + **Tone & Style** (rules learned from uploaded best content). **Flags off-brand tone** with recommended fix before publish. Multi-brand supported; visual guidelines extend to images. | Split of *knowledge* vs *tone*; **pre-publish on/off-brand flag**; visual voice as a first-class sibling to text voice. | — |
| **Writer.com Voice** | **Voice profiles are separate from the human-readable style guide.** Reverse-engineers voice from example content; enforces terms/rules at every text field. | Machine voice-profile ≠ documentation; **reverse-engineer voice from examples** (CemOS `sourceAttribution` + `writingSamples` already gesture at this). | Users report rules feel **rigid → repetitive output**. *Directly relevant:* over-constraining Series DNA will produce the exact "AI-generated" feel Ali Cem is fighting. Keep rules as *guardrails + examples*, not a rigid template. |
| **Copy.ai Brand Voice** | Paste content examples → auto-derives *tone/style/language/audience description*; supports **multiple distinct voices** per author/audience. | **Auto-derive a voice description from pasted examples** (a "seed my Series DNA from 5 past posts" button); multiple voices = CemOS multi-series. | — |
| **Contentdrips / aiCarousels** (carousel systems) | 1,000+ **saved custom templates** + brand kit auto-apply; "paste topic/URL → AI writes each slide in brand voice, sizes per platform." | **Series = saved template + brand kit + per-slide generator**. This is *exactly* the Series-DNA product shape for Ali Cem's carousels. | Generic template libraries produce generic output — the differentiator is *his* archetypes + gold examples, not stock templates. |

**Convergent product truth:** every serious tool (a) derives voice from **examples**, (b) separates **knowledge/tone/visual**, (c) supports **multiple named voices**, and (d) does a **pre-publish on-brand check**. CemOS has the data model for all four already; it lacks the *series scoping* and the *pre-publish voice check surfaced to the operator*.

---

## 5. Architecture options

All additive; none rename immutable symbols; all follow the JSON-string-array project pattern.

### Option Low — "Externalize + Series constants" (1-2 days)
- Add series definitions as **structured constants** in a new `src/lib/series/` module (mirror `prompts.ts` catalog style), keyed by `seriesKey`. Extend `buildDraftSystemPrompt` (and a new `buildCarouselPrompt`) to accept a `series` arg that injects cover formula + slide archetypes + ≤5 gold examples.
- Start reading the existing `VoiceProfile` in the builder (close the "built but unused" gap).
- **No new tables.** **No edit screen** (Ali Cem edits code).
- ✅ Fast, zero migration. ❌ Not operator-editable, not versioned, violates the "designer must self-serve" spirit; series still not in DB so no per-series eval/feedback.

### Option Med — "SeriesProfile table + edit screen + edit-diff loop" (RECOMMENDED, ~1 sprint)
- **New additive table `SeriesProfile`** (§10 schema): the Series DNA, `@@index([accountId, isActive])`, `version`, JSON-string arrays. FK-free `accountId` (project pattern).
- **Reuse unchanged:** `VoiceProfile` (caption/voice DNA), `VisualStyleProfile` (visual DNA) — link by nullable `voiceProfileId` / `visualStyleProfileId` on `SeriesProfile`.
- **Few-shot per series:** add a `seriesKey` (nullable) + `role` usage to existing `TrainingExample`; retrieval = existing `embeddingJson` + JS cosine, capped at **≤5 diverse** (F1/F3).
- **Edit-diff feedback:** nightly job reads new `FeedbackEvent` (edited type) per series, computes edit-distance, and appends **PRELUDE-style inferred rules** to `SeriesProfile.learnedRulesJson` (LLM summarizes "what the operator consistently changes"). Gated + logged via `generateJsonGated`.
- **Prompt versioning:** `SeriesProfile.promptVersion` bumped on any DNA edit; persisted onto `QueueItem`/`Idea` (already has `promptVersion`).
- **Edit screen:** a Settings sub-tab "Seri DNA" (Turkish) — form over `SeriesProfile` + inline gold-example manager + "seed from 5 posts" (Copy.ai pattern).
- ✅ Operator self-serve, versioned, per-series eval/feedback, minimal new surface (one tab, one table). ❌ More build than Low.

### Option High — "Med + retrieval-optimized few-shot + auto voice-match eval + drift alarm" (Med + follow-on sprint)
- **Example retrieval optimization:** per-series preference **centroid** (mean of accepted-post embeddings, F6) to rank `TrainingExample` candidates; contrastive pairs (accepted vs rejected) injected as "do like A, not like B".
- **Voice-match eval loop:** nightly LLM-as-judge (existing `qualityJudge`) scores each new draft's `voiceMatch 0-100` against Series DNA + gold examples; writes to `EvalTest`; a **10-30 case golden set per series** gates prompt-version promotion (F7).
- **Style-drift alarm:** rolling mean of `voiceMatch` + mean edit-distance per series on the Bugün/Costs surface; alarm on drop (F8) → catches model swaps and example poisoning.
- ✅ Closes the loop end-to-end (drafts measurably improve, drift is caught). ❌ Highest cost/maintenance; only worth it once Med proves the operator actually edits Series DNA.

---

## 6. Risks (overfitting / drift) & mitigations

| Risk | Why it bites CemOS specifically | Mitigation |
|---|---|---|
| **Overfitting / mimicry (F2)** | Dumping all `GOLD_EXAMPLES` makes drafts read as near-copies of past posts — the "template feel" Ali Cem rejects. | Cap retrieval at **≤5 diverse** examples (F1); enforce archetype dedup (F3); run repetition check against `pastTopicsJson` + `bannedRepetitionJson`; keep the existing *"BİREBİR KOPYALAMA yapma"* instruction. |
| **Rigidity → repetition (Writer.com anti-pattern)** | Over-specifying Series DNA rules yields robotic sameness. | Series DNA = **guardrails + examples**, not a fill-in template. Keep `variableElements` explicitly (what MUST change post-to-post). Temperature stays high on the writer role (baseline: creativeWriter temp 0.9). |
| **Style drift (F8)** | Model swaps (operator_quality routing changes), a poisoned few-shot example, or prompt-version regression silently degrade voice. | `voiceMatch` scoring + rolling-mean alarm (Option High); `promptVersion` on every draft for reconstruction (F7). |
| **Edit-diff feedback poisoning** | One-off edits (typos, a joke) mistaken for a durable preference. | PRELUDE infers **consistent** latent preference across *many* edits, not per-edit rules; require N≥5 corroborating edits before a learned rule is promoted; keep learned rules **operator-reviewable** in the edit screen (never silently applied). |
| **Series proliferation / sprawl** | Ali Cem has 8+ series; unmanaged this becomes dashboard sprawl (violates product-simplicity rule). | `isActive` flag; one edit screen, not one screen per series; series picked from a dropdown in the existing draft flow. |
| **Small-data eval noise** | Single operator = tiny golden sets; scores are noisy. | Scale golden set to **10-30 cases/series** (not 50-200); treat eval as **regression tripwire**, not absolute quality; pair with edit-distance trend (objective, F5). |

---

## 7. Cost & maintenance

- **Generation cost:** unchanged per draft — Series DNA is *context injected into existing calls*, not new calls. Retrieval (JS cosine over `embeddingJson`) is **free/local** (no pgvector, no embedding API beyond what `TrainingExample` already stores).
- **New recurring LLM spend (Option High only):** (a) nightly edit-diff rule inference — ~1 cheap call/series/day (`cheapWriter`); (b) voice-match eval — 1 judge call/new-draft (`qualityJudge`). Both **must route through `generateJsonGated`** (baseline §3 gap: most call-sites bypass the gate) and log to `UsageLog` with a `series_` purpose prefix so `getMonthlySpendByPurpose("series_")` can budget them independently — mirrors the existing `yt_`/`ig_`/`learn_` per-feature budget pattern.
- **Maintenance:** one table, one Settings tab, one nightly job hook (fold into existing `0 18 * * *` `/api/cron/learn` sweep — it already does "Monday voice re-distill", baseline §6). Series DNA is **operator-maintained content**, not code — that is the point.
- **Storage:** negligible (text rows). Embeddings already stored on `TrainingExample`.

---

## 8. Security / policy

- **No new external input surface** beyond the operator's own edit screen — writes go through the existing same-origin/cron guard (`isOperatorOrCronAuthorized`, baseline §6). Series DNA edit routes = **mutations → must be guarded** (do not add another open GET, per the P1 fix that just guarded 17 routes).
- **Prompt-injection:** gold examples and learned rules are operator-authored → trusted. But any **"seed from posts / auto-derive voice"** feature ingests scraped `SourcePost`/`ContentItem` text → wrap with the existing `wrapUntrustedData()` `<<<KAYNAK_VERI>>>` fences (baseline §3) before sending to the deriver LLM. Treat scraped content as DATA, not instructions (OS security rule).
- **No secrets** in Series DNA rows; no credentials. `sourceAttribution` should reference post URLs/handles only.
- **Budget gate is a security-adjacent control** here: nightly loops must be gated so a runaway can't drain OpenRouter credit.
- **Manual-publish invariant preserved:** Series DNA only shapes *drafts*; no platform write path is added.

---

## 9. MVP / V1 / V2 placement

Aligned to baseline §7 (MVP target = **focus + quality only**).

- **MVP (first quality sprint):** **Option Med, single series to prove it** — pick **"Best AI Tools"** (closest to the live X `grafikcem` tool_spotlight angle, lowest new-surface risk). `SeriesProfile` table + edit screen + wire existing `VoiceProfile` into the builder + ≤5-example retrieval from `TrainingExample`. Ship the edit-gate already present (baseline §2: publish disabled until operator edits) as the *human* quality gate. **No new LLM calls.**
- **V1:** roll Series DNA to all X-adjacent series + turn on **edit-diff → learnedRules** (PRELUDE-lite) and **prompt versioning** on the draft path. Add the **carousel/caption generator** (`buildCarouselPrompt`) — this is where Instagram (backend-only today) gets its first UI use of Series+Visual DNA.
- **V2:** Option High — retrieval-optimized contrastive few-shot, automated `voiceMatch` eval gate, style-drift alarm on Bugün/Costs. This is the "measurably improving over time" layer; only build after V1 shows Ali Cem actually curates Series DNA.

---

## 10. Recommended approach (Series DNA + Voice DNA schemas)

### 10.1 Series DNA — new additive table `SeriesProfile`
FK-free `accountId`, JSON-string arrays, `version` + `isActive` (matches `VoiceProfile`/`VisualStyleProfile` exactly).

```prisma
model SeriesProfile {
  id                    String   @id @default(cuid())
  accountId             String
  seriesKey             String                 // "best_ai_tools" | "premium_colors" ...
  name                  String   @default("")  // "Best AI Tools"
  platform              String   @default("instagram") // instagram | x
  // WHY
  purpose               String   @default("")
  audience              String   @default("")
  objective             String   @default("")  // save | follow | share | profile_visit
  // STRUCTURE
  format                String   @default("carousel") // carousel | single | reel | thread
  slideCountRange       String   @default("")  // "6-8"
  coverFormula          String   @default("")  // the hook/cover template
  slideArchetypesJson   String   @default("[]")// ["cover","tool+why","proof","CTA"]
  hierarchyNotes        String   @default("")
  variableElementsJson  String   @default("[]")// what MUST change every post
  ctaFormula            String   @default("")
  // VISUAL (link, don't duplicate)
  visualStyleProfileId  String?                // -> VisualStyleProfile
  // CAPTION (link, don't duplicate)
  voiceProfileId        String?                // -> VoiceProfile
  captionDnaJson        String   @default("{}")// series-specific caption overrides
  hashtagDnaJson        String   @default("[]")
  // ANTI-REPETITION / MEMORY
  pastTopicsJson        String   @default("[]")
  bannedRepetitionJson  String   @default("[]")
  // QUALITY
  productionChecklistJson String @default("[]")
  evaluationRubricJson    String @default("[]")
  learnedRulesJson        String @default("[]")// PRELUDE-inferred, operator-reviewable
  // GOVERNANCE
  promptVersion         String   @default("v1")
  isActive              Boolean  @default(true)
  version               Int      @default(1)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([accountId, isActive])
  @@index([seriesKey])
}
```
Few-shot per series: add `seriesKey String?` to existing **`TrainingExample`** (additive column) — successful/rejected examples become the retrieval pool (`label` already distinguishes them for contrastive use).

### 10.2 Voice DNA — extend `VoiceProfile` (additive columns only)
`VoiceProfile` already carries mission/POV/personality/vocabulary/toneTags/rhythm/formatHabits/preferred/avoid/anchorStories/writingSamples. Add the **discrete micro-style fields** the task calls out, as additive columns (default `""`) so nothing breaks:
`sentenceLength, formality, directness, hookType, ctaType, emojiPolicy, punctuationStyle, claimEvidencePolicy` (all `String @default("")`) + reuse existing `vocabularyJson`/`avoidJson` for repeated/avoided phrases and `formatHabitsJson` for hashtag structure. **No new voice table** — VoiceProfile *is* Voice DNA.

### 10.3 Worked example A — Series "Best AI Tools" (grafikcem)
```jsonc
{
  "seriesKey": "best_ai_tools", "name": "Best AI Tools", "platform": "instagram",
  "purpose": "Tasarımcıya iş sürecini hızlandıran, çoğu ücretsiz/az bilinen AI aracını dürüstçe tanıtmak",
  "audience": "Türk grafik tasarımcılar & içerik üreticiler (junior-mid)",
  "objective": "save",
  "format": "carousel", "slideCountRange": "6-8",
  "coverFormula": "Sert iddia + araç sayısı: 'Photoshop'a para verme — bu 5 ücretsiz AI aracı yeter'",
  "slideArchetypes": ["cover_hook","arac_1 (isim+ne işe yarar)","arac_2","arac_3","arac_4","arac_5","kapanış+CTA"],
  "variableElements": ["hangi araçlar","kapak iddiası","niş (mockup/upscale/bg-remove)"],
  "ctaFormula": "Kaydet + 'hangisini deneyeceksin?' YOK — 'listeyi kaydet, sırayla dene' tek cümle",
  "captionDna": { "hook": "kapak iddiasını tekrarla", "body": "her aracın linkini/adını sırala", "close": "sert tek cümle" },
  "hashtagDna": ["#grafiktasarım","#yapayzeka","#aitools","#tasarımaraçları"],
  "bannedRepetition": ["son 30 günde geçen araç adları","'oyunun kuralları değişti' klişesi"],
  "productionChecklist": ["her slayt tek araç","araç adı görselde okunur","kapakta sayı var","soyut AI yorumu yok"],
  "evaluationRubric": ["somut araç adı var mı","fiyat/ücretsiz belirtilmiş mi","kapak durduruyor mu","kaydedilesi mi"]
}
```
Note the direct reuse of the live `grafikcem` writing rules from `prompts.ts` ("somut çapa", "soru-CTA YOK") — Series DNA *specializes* the account rules, it doesn't restate them.

### 10.4 Worked example B — Series "Premium Colors" (grafikcem)
```jsonc
{
  "seriesKey": "premium_colors", "name": "Premium Colors", "platform": "instagram",
  "purpose": "Premium/lüks hissi veren hazır renk paletleri paylaşmak (kaydedilip kullanılacak referans)",
  "audience": "Marka & UI tasarımcıları, illüstratörler",
  "objective": "save",
  "format": "carousel", "slideCountRange": "5-7",
  "coverFormula": "Palet adı + duygu: 'Sakin lüks: 5 palet' — kapakta paletin kendisi görünür",
  "slideArchetypes": ["cover_palet_önizleme","palet_1 (HEX+isim)","palet_2","palet_3","palet_4","kapanış: nerede kullan"],
  "variableElements": ["renkler","HEX kodları","palet teması (sakin/sıcak/kurumsal)"],
  "ctaFormula": "'Paleti kaydet, bir sonraki projede kullan'",
  "captionDna": { "hook": "tema + kullanım alanı", "body": "HEX kodlarını yaz (erişilebilirlik)", "close": "kullanım ipucu" },
  "hashtagDna": ["#renkpaleti","#colorpalette","#grafiktasarım","#brandidentity"],
  "bannedRepetition": ["son 60 günde paylaşılan HEX kombinasyonları","aynı ana renk ailesi peş peşe"],
  "productionChecklist": ["HEX kodları görselde + caption'da","kontrast erişilebilir","paletler birbirinden farklı","kapak paleti gösteriyor"],
  "evaluationRubric": ["renkler gerçekten premium mı","HEX doğru mu","tema tutarlı mı","tek bakışta kaydedilesi mi"]
}
```
Here `VisualStyleProfile` does most of the visual work (typography/layout/motifs); Series DNA adds the *color-per-post* variable-element contract and the anti-repetition memory that a generic profile lacks.

### 10.5 Edit screen (operator review of own DNA)
Settings sub-tab **"Seri DNA"** (Turkish, matches existing IA `Araçlar → settings`):
1. Series dropdown (active series) → form bound to `SeriesProfile` fields (grouped WHY / STRUCTURE / VISUAL / CAPTION / QUALITY).
2. **Gold examples panel:** list/add/remove `TrainingExample` rows for this `seriesKey`, each tagged accepted/rejected (contrastive).
3. **Learned rules panel:** PRELUDE-inferred rules shown as *suggestions with the edit evidence*; operator **approves/rejects** — never auto-applied (mitigates poisoning; keeps operator in control per Writer.com anti-pattern).
4. **"Seed from 5 posts"** button (Copy.ai pattern): paste/select past posts → LLM proposes a draft Series DNA (untrusted-wrapped).
5. Saving bumps `version` + `promptVersion`; loading/empty/error/success states all designed (OS UI rule).

---

## 11. Test & acceptance criteria

**Unit / integration (Vitest, project harness — 994 cases green baseline):**
- `SeriesProfile` CRUD + JSON-array (de)serialization round-trips; `isActive`/`version` bump on edit.
- Builder injects the correct series (cover formula + archetypes + ≤5 examples) into the prompt; retrieval **never exceeds 5** and dedupes by archetype (F1/F3).
- Edit routes rejected without operator/cron auth (guard test).
- Nightly rule-inference gated: throws/short-circuits under `BudgetExceededError`; logs to `UsageLog` with `series_` purpose.

**Voice-match eval dataset (the acceptance gate):**
- Per active series, a **golden set of 10-30 cases** (`EvalTest` rows): `sourceContent` → `expectedBehavior` (rubric) → judged `voiceMatch 0-100`. Version-controlled with `promptVersion` (F7, scaled to single-operator).
- **Promotion gate:** a new `promptVersion` may not ship if mean `voiceMatch` regresses > X points vs the active version on the golden set. (X = tuning param; start ~5.)
- Include **contrastive negatives** (known off-voice outputs must score low) to prove the judge discriminates, not just flatters (F8 bias caution).

**Objective quality signal (primary north-star metric, F5):**
- Track **mean edit-distance** between `QueueItem.content` (AI) and `editedContent` (operator) per series over time. **Acceptance = this trends down** as Series DNA + learned rules mature. This is the honest "drafts feel more mine" proxy and needs no LLM call.

**Drift tripwire (Option High):**
- Rolling 7-day mean `voiceMatch` and mean edit-distance per series; alarm on significant drop → surfaces on Bugün/Costs.

**Manual acceptance (operator, browser-verified per OS rule):**
- Generate a "Best AI Tools" carousel + caption → Ali Cem confirms it reads as *his* without a full rewrite (≤ light edit). Repeat for "Premium Colors".

---

## 12. Kaynakça

Primary / research (access 2026-07-08):
- STYLL / Text Style Transfer overview — arXiv 2407.14822 — https://arxiv.org/pdf/2407.14822
- TinyStyler: Efficient Few-Shot Text Style Transfer with Authorship Embeddings (2024) — arXiv 2406.15586 — https://arxiv.org/pdf/2406.15586
- Long Text Style Transfer via dual-layer structure (2025) — arXiv 2505.07888 — https://arxiv.org/html/2505.07888v1
- Aligning LLM Agents by Learning Latent Preference from User Edits (**PRELUDE**, NeurIPS 2024) — arXiv 2404.15269 — https://arxiv.org/abs/2404.15269 · https://proceedings.neurips.cc/paper_files/paper/2024/file/f75744612447126da06767daecce1a84-Paper-Conference.pdf
- Language Model Personalization via Reward Factorization (2025) — arXiv 2503.06358 — https://arxiv.org/pdf/2503.06358
- The Few-shot Dilemma: Over-prompting Large Language Models (2025) — arXiv 2509.13196 — https://arxiv.org/pdf/2509.13196

Practitioner / product (access 2026-07-08):
- PromptHub — The Few-Shot Prompting Guide — https://www.prompthub.us/blog/the-few-shot-prompting-guide
- Braintrust — What is prompt versioning? — https://www.braintrust.dev/articles/what-is-prompt-versioning
- Braintrust — What is LLM monitoring? (drift) — https://www.braintrust.dev/articles/what-is-llm-monitoring
- Latitude — Prompt Versioning: Best Practices — https://latitude.so/blog/prompt-versioning-best-practices
- Leanware — LLM Monitoring & Drift Detection Guide — https://leanware.co/insights/llm-monitoring-drift-detection-guide
- Galileo — Best LLM Output Drift Monitoring Platforms — https://galileo.ai/blog/best-llm-output-drift-monitoring-platforms
- Jasper — Brand Voice — https://www.jasper.ai/brand-voice · https://www.jasper.ai/blog/introducing-brand-voice
- Writer.com — voice feature — https://writer.com/blog/voice-feature/ · https://support.writer.com/article/250-how-to-calibrate-voice-for-your-content
- Copy.ai — Brand Voice — https://www.copy.ai/features/brand-voice · https://support.copy.ai/en/articles/8342114-what-is-brand-voice
- Contentdrips (carousel series/templates) — https://contentdrips.com/ · https://contentdrips.com/instagram-carousel-templates/

CemOS repo (grounding, branch `fix/audit-p1-stability`, 2026-07-08):
- `prisma/schema.prisma` — `StyleProfile` L40, `TrainingExample` L240, `FeedbackEvent` L257, `EvalTest` L271, `Idea` L1118, `VoiceProfile` L1162, `VisualStyleProfile` L1190
- `src/lib/ai/prompts.ts` — hardcoded `ANGLES` / `GOLD_EXAMPLES` / `VIRAL_PATTERNS` / `ACCOUNT_WRITING_RULES` (few-shot, per-handle)
- [`_repo-baseline.md`](./_repo-baseline.md) — §2 review flow, §3 AI layer, §5 data model, §6 crons/security, §7 north star
