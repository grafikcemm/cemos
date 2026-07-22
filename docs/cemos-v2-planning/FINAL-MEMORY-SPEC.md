# FINAL — Memory Spec (CemOS V2)

> **Statü:** Implementable contract. [RESEARCH-SYNTHESIS §4-D4](./RESEARCH-SYNTHESIS.md) kararlarını uygular; kaynak araştırma: [research/02-agentic-memory.md](./research/02-agentic-memory.md); repo gerçeği: [research/_repo-baseline.md](./research/_repo-baseline.md).
> **Bağlayıcı rulinglar:** D4 (üç katman + write discipline), C4 (embedding fazlaması), C8 (`memory_` prefix + `cemos-memory` preset), §5 master placement (MVP = sıfır yeni tablo).
> Tarih: 2026-07-08. Model/fiyat referansları build anında yeniden doğrulanır.

---

## 1. Amaç & kapsam

Hafıza sistemi **tek bir şeye hizmet eder: taslak kalitesi** — taslakların "benim sesim" gibi hissetmesi ve düzenleme yükünün düşmesi (baseline §7 kök neden #2). Yüzey alanı eklemek, ajan çoğaltmak, framework almak kapsam dışıdır.

- **North-star metrik:** **edit ratio** = token diff(AI taslağı → yayınlanan metin). Hafıza yalnızca bu oran **zaman içinde düşüyorsa** çalışıyor sayılır (02 §10.9). Diğer tüm metrikler ikincil (§11).
- **Kapsam:** 2 X hesabı (grafikcem + maskulenkod, baseline §0), tek operatör, additive-only Neon/Prisma, manual-publish invariant. pixelspor kapsam dışı.
- **Non-goals:** Mem0/Letta/Zep SDK bağımlılığı (synthesis §3), temporal knowledge graph (süresiz ertelendi), pgvector-şimdi, ajan serbest self-editing memory.
- **KEEP zemini (baseline §3/§5, 02 §2):** `vector-memory.ts` extract→embed→retrieve→inject döngüsü, `ContentEmbedding`, `TrainingExample.embeddingJson`, `FeedbackEvent`, `VoiceProfile`/`VisualStyleProfile`, `costGate` + `getMonthlySpendByPurpose`, `wrapUntrustedData()`, 18:00 `/api/cron/learn` slotu, `CronRun` heartbeat. Bu spec **KEEP-and-harden**; hiçbir mevcut tabloyu yeniden inşa etmez.

---

## 2. Memory taxonomy

Kimlik (identity) ve performans (performance) hafızası **zıt update dinamiklerine** sahiptir ve asla karıştırılmaz (02 §5 — voice drift'in kök nedeni). CoALA taksonomisi CemOS varlıklarına şöyle oturur:

| Memory tipi | Identity / Perf | Storage home | Update dinamiği | Write gate |
|---|---|---|---|---|
| **Preference** (operatörün açık kuralları: "emoji yok", "maskulenkod'da argo yok") | Identity | `voice-constitution.md` + `MemoryFact(type=preference)` | Yavaş, explicit | **Human** (operator onayı) |
| **Semantic** (ses/konu/entity hakkında öğrenilmiş gerçekler) | Identity | `MemoryFact(type=semantic)` + `VoiceProfile` (KEEP) | Yavaş, corroborated | **Human onayı VEYA ≥3 obs** |
| **Procedural** (hook nasıl yazılır, thread beat'leri) | Identity | `CaptionDna` + prompt template'leri; self-optimization = V2 gated | Yavaş, versiyonlu | **Human** |
| **Episodic** (bu taslak şöyle düzenlendi, şu feedback geldi) | Performance (ham) | `FeedbackEvent` (KEEP, append-only) + `PublishedPost`/`PerformanceSnapshot` | Hızlı, append-only | System (append; gate yok) |
| **Account-specific** (grafikcem vs maskulenkod ayrımı) | Her ikisi | `accountHandle` scope — her read/write'ta zorunlu | — | Scope enforcement (test edilir) |
| **Series-specific** (tekrarlayan format DNA'sı + baseline) | Her ikisi | `SeriesProfile` → **FINAL-CONTENT-ENGINE spec'inde yaşar**, buradan yalnızca referans + `HashtagDna.seriesId?` | Karma | Perf alanları auto / DNA alanları human |

**Kural:** Identity hafızası yavaş + insan-sahipli; performance hafızası hızlı + data-driven + decay'li. Bir sinyalin hangi kolona yazılacağı belirsizse **identity varsayılır ve gate'ten geçer** (fail-closed).

---

## 3. Storage mimarisi — üç katman (D4, locked)

```
┌─ Tier 1: Markdown voice constitution ── identity anchor, human-owned
├─ Tier 2: Relational (Neon/Prisma)   ── truth: MemoryFact + DNA tabloları
└─ Tier 3: Vector index (JS cosine)   ── recall only; pgvector = V2 threshold
```

1. **Tier 1 — `voice-constitution.md` (per account, V1).** Ses anayasası + sert tercihler. Git-tracked, **yalnızca Ali Cem düzenler** — hiçbir ajan, hiçbir mined text yazamaz (Letta core-block fikri; 02 §5). Draft prompt'una mevcut memory bloğunun **önünde**, her zaman in-context enjekte edilir. **Bu anti-poisoning çapasıdır.**
2. **Tier 2 — Relational (source of truth).** Yeni additive tablolar: `MemoryFact`, `CaptionDna`, `HashtagDna` (§4). Confidence, temporal validity, provenance, approval, contradiction, rollback — hepsi burada (structured, queryable, auditable). KEEP: `FeedbackEvent`, `PublishedPost`, `PerformanceSnapshot`, `VoiceProfile`.
3. **Tier 3 — Vector recall.** KEEP: `ContentEmbedding` + `TrainingExample.embeddingJson`, JS brute-force cosine. Vektörler aday hafızayı **bulur**; güvenilip uygulanmayacağına **relational katman karar verir**. Brute-force bu ölçekte doğru tercihtir, taviz değil (02 §3.5: <100K vektörde exact scan yeterli).
   - **pgvector V2 tetiği (ölçülür, tahmin edilmez):** korpus **>~50k vektör** VEYA retrieval **p95 >150 ms**. O güne kadar $0 ek altyapı. HNSW + `<=>` cosine ile additive migration.

---

## 4. Şemalar (Prisma-style, additive-only — V1 `db:push`)

`SeriesProfile` bu spec'te DEĞİL — [FINAL-CONTENT-ENGINE](./FINAL-CONTENT-ENGINE.md) sahibidir (carousel/series DNA + performanceBaseline orada). Burada yalnızca `HashtagDna.seriesId?` ile referanslanır.

```prisma
model MemoryFact {
  id               String    @id @default(cuid())
  accountHandle    String?   // "grafikcem" | "maskulenkod"; null = global (nadir)
  type             String    // "preference" | "semantic" | "procedural"
  statement        String    // atomik tek cümle, Türkçe
  embeddingJson    String?   // Float[] JSON — recall için opsiyonel
  embeddingModel   String?   // §7: model+dims etiketi zorunlu
  embeddingDims    Int?
  confidence       Float     @default(0)   // §4.1 formülü ile hesaplanır
  evidenceCount    Int       @default(0)
  sourceProvenance String    // "operator" | "own_metric" | "self_judge" | "external"
  status           String    @default("proposed") // proposed | active | superseded | rejected
  tValid           DateTime  @default(now())
  tInvalid         DateTime? // supersede anında set edilir; DELETE asla
  supersedesId     String?   // versiyon zinciri (rollback bunu takip eder)
  createdBy        String    // "operator" | "consolidation" | "feedback_pipeline"
  approvedBy       String?   // identity promotion'da zorunlu
  decayHalfLifeDays Int?     // perf-leaning fact'lerde; identity'de null (≈∞)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([accountHandle, status])
  @@index([type, status])
}

model CaptionDna {           // per account — identity/procedural
  id                String   @id @default(cuid())
  accountHandle     String   @unique
  openingHookTypes  String   // string[] JSON
  lengthRange       String   // {min,max,median} JSON
  sentenceRhythm    String?
  emojiPolicy       String   // "none" | "sparse" | "free"
  ctaStyle          String?
  lineBreakPattern  String?
  signaturePhrases  String   // string[] JSON
  forbiddenPhrases  String   // string[] JSON
  toneVector        String?  // number[] JSON
  languageRegister  String   // "formal" | "casual" | "argo_ok"
  confidence        Float    @default(0)
  evidenceCount     Int      @default(0)
  provenance        String   // MemoryFact ile aynı enum
  version           Int      @default(1)
  updatedAt         DateTime @updatedAt
}

model HashtagDna {           // per account (+ opsiyonel seri) — performance-leaning
  id                 String   @id @default(cuid())
  accountHandle      String
  seriesId           String?  // → SeriesProfile (CONTENT-ENGINE spec)
  coreTags           String   // string[] JSON
  rotatingTags       String   // string[] JSON
  tagCountRange      String   // {min,max} JSON
  placement          String   // "inline" | "end" | "first_comment"
  casing             String?
  bannedTags         String   // string[] JSON
  perTagPerformance  String   // {tag: {avgEngagement, n}} JSON
  confidence         Float    @default(0)
  evidenceCount      Int      @default(0)
  decayHalfLifeDays  Int      @default(45)
  updatedAt          DateTime @updatedAt

  @@unique([accountHandle, seriesId])
}
```

### 4.1 Confidence formülü (sub-signal decomposed — 02 §5)

```
confidence = w_rep·repetition + w_rec·recency + w_src·sourceAuthority − w_con·contradictionPenalty

repetition           = min(1, evidenceCount / N_full)          # N_full = 3 (başlangıç; Settings'te ayarlanabilir)
recency              = 0.5 ^ (ageDays / halfLife)              # perf: 30-60 gün; identity: null → 1.0 (≈∞)
sourceAuthority      = operator 1.0 > own_metric 0.8 > self_judge 0.6 > external 0.0 (identity için)
contradictionPenalty = aktif çelişen fact varsa scaled ceza, yoksa 0
```

Başlangıç ağırlıkları `w_rep=0.4, w_rec=0.2, w_src=0.3, w_con=0.5`; golden set üzerinde kalibre edilir (§11, R6 mitigasyonu).

### 4.2 Promotion eşiği — tek düzeltme kanun olmaz

- Her öğrenilmiş aday `status="proposed"` + düşük confidence ile girer.
- `active`'e terfi yalnızca: **`evidenceCount ≥ 3`** (corroborating observations) **VEYA açık operatör talimatı** (authority 1.0 repetition'ı bypass eder, `approvedBy` set edilir).
- Corroborate edilmeyen one-off edit'ler `proposed`'da kalır ve recency decay ile sönümlenir.

### 4.3 Supersede-not-delete zinciri

Çelişki veya güncelleme **asla DELETE değildir** (Graphiti bi-temporal modeli, 02 §3.3): eski fact `status="superseded"` + `tInvalid=now()`; yeni fact `supersedesId` ile eskiyi işaret eder. Eski fact kendi `[tValid, tInvalid)` aralığında sorgulanabilir kalır; **rollback** = zinciri geri sarmak (yeni fact → `rejected`, eski fact → `active`, `tInvalid=null`).

---

## 5. Retrieval spec (D4, locked)

Pipeline (draft üretimi sırasında, `grounding.ts` entegrasyonu):

1. **Account-scoped cosine top-K.** Sorgu embed edilir; yalnızca `accountHandle` eşleşen vektörler taranır (scope her çağrıda zorunlu — R8). JS brute-force, K=20 başlangıç. Farklı `embeddingModel`/`embeddingDims` etiketli vektörler **asla aynı cosine çağrısında karşılaştırılmaz** (§7).
2. **LLM-as-reranker top-8.** Top-K aday, mevcut **judge preset'i** üzerinden tek batched çağrıyla relevance-rerank edilir → top-8 enjekte edilir. **Rerank vendor'ı yok** — OpenRouter'da reranker endpoint'i doğrulanmış şekilde mevcut değil (02 §3.1, synthesis D4); Cohere/Voyage escalation yalnızca precision@k ölçülür şekilde yetersizse (V2 kararı).
3. **Injection — fencing kuralı.** `buildMemoryPromptBlock()` (KEEP) genişletilir: `sourceProvenance="external"` olan her hafıza **`<<<KAYNAK_VERI>>>` fence içinde DATA olarak** enjekte edilir, asla talimat olarak değil. Mined bir pattern "değerlendirilecek örnek"tir, "uyulacak kural" değil (02 §8). `operator`/`own_metric` kaynaklı aktif kurallar fence dışında normal talimat bloğunda yer alabilir.
4. **Sıralama:** voice-constitution (Tier 1, her zaman) → aktif MemoryFact kuralları → CaptionDna/HashtagDna özeti → reranked top-8 recall → mevcut 4-grup örnek bloğu (positive/negative/edited/pattern, KEEP).
5. **Bütçe:** rerank çağrısı `memory_` prefix altında loglanır (§10); context sınırları D2'ye uyar (≤5 few-shot, kaynak compaction ≤900 char).

---

## 6. Write discipline

Mem0'ın ADD/UPDATE/DELETE/NOOP write-ops fikri, **proposal** olarak uyarlanır (auto-apply yok — 02 §4):

1. **Extraction (proposed yazımı).** Kaynaklar: `FeedbackEvent` (edit/reject/approve + reason), `PublishedPost`+`PerformanceSnapshot` (own_metric), judge skorları (self_judge). Extraction LLM'i (§10 preset) Zod-validated `{op, type, statement, provenance, evidence}` üretir; her aday `proposed` olarak `MemoryFact`'e yazılır.
2. **Contradiction detection (write anında).** Yeni fact ↔ aktif fact'ler semantic+keyword eşlemesi; çelişkide **overwrite YOK** — supersede proposal'ı üretilir, operatör onayına düşer.
3. **Approve akışı.** MVP'de proposal'lar mevcut DailyQueue feedback UI'ında görünür (yeni ekran yok); V1'de küçük approval queue yüzeyi (Settings içinde veya Bugün'de collapsed — C9 kuralı: yeni top-level ekran asla) + rollback butonu.
4. **Rollback.** §4.3 zinciri; her identity değişikliği geri alınabilir.
5. **Provenance gate (mutlak kural).** `sourceProvenance="external"` bir aday **hiçbir koşulda** identity hafızasına (`preference`/`semantic`/`procedural`) yazılamaz veya `active`'e terfi edemez; external, episodic/performance ile sınırlıdır. Kod seviyesinde assert + test (§11 AC-3). Identity yazabilenler yalnızca: `operator`, `own_metric`, `self_judge`.
6. **Consolidation cron (V1).** Haftalık, mevcut **18:00 `/api/cron/learn` slotuna** eklenir (yeni cron yok — D7): episodic→semantic konsolidasyon, decay yeniden hesaplama, staleness + contradiction sweep, operatöre proposals digest. `CronRun` heartbeat pattern'i KEEP.
7. **Expiry (D4):** performance hafızasında decay half-life; identity near-∞; staleness sweep haftalık aynı cron'da.

---

## 7. Embedding planı (C4 ruling — fazlı)

| Faz | Karar |
|---|---|
| **MVP** | **`openai/text-embedding-3-small` kalır** (wired + proven; vektör sayısı azken churn hiçbir şey kazandırmaz — C4). |
| **Sprint-1 LIVE BUG FIX** | `vector-memory.ts:304` — `ViralPattern` retrieval'ı **256-dim local-hash fallback ile çalışıyor**, similarity fiilen noise (02 §1, korpusun en değerli bulgusu). Fix: pattern'lere gerçek embedding persist et; regression test persisted pattern vektörlerinde `provider !== "local_fallback"` assert eder. |
| **V1 upgrade adayı** | **`qwen/qwen3-embedding-8b`** ($0.01/M, en iyi multilingual değer — 02 §3.1/3.2). Ön koşullar (hepsi zorunlu, C4): (a) her vektörde `model`+`dimensions` etiketi, (b) gated re-embed migration (one-time, düşük-binlerce satır), (c) **space'ler asla karıştırılmaz** — cosine yalnızca aynı model+dims içinde, (d) Türkçe üstünlük iddiası `unverified` (multilingual MTEB çıkarımı) → commit öncesi **golden set üzerinde küçük A/B** şart. |
| **Fallback zinciri** | Primary → `text-embedding-3-small` (stable fallback) → `createLocalFallbackEmbedding` (256-dim hash, **yalnızca final offline fallback**; asla persist edilip gerçek embedding gibi aranmaz). |
| **Dims doğrulama** | OpenRouter model sayfaları per-model dimension vermiyor (`unverified`) — re-embed migration öncesi teyit edilir. |

---

## 8. Security

- **Memory poisoning = OWASP Agentic Top 10 ASI06 (2026).** CemOS her gün untrusted external text yutar (SourcePost, news, competitor tweet) — MINJA sınıfı query-only saldırılar >%95 injection oranı gösteriyor (02 §3.4). Savunma katmanları: (1) provenance gate (§6.5 — external ⇒ identity yazımı imkânsız), (2) fenced retrieval injection (§5.3), (3) proposed→approve + rollback (§6), (4) ≥3-obs eşiği (tek zehirli gözlem kural olamaz), (5) Tier-1 constitution yalnızca-insan.
- **Prompt injection:** `wrapUntrustedData()` fence'leri KEEP; ilke retrieval'a genişletilir (§5.3). External-origin hafıza her zaman data, asla instruction.
- **Adversarial test (ship gate):** enjekte edilmiş adversarial SourcePost → hiçbir identity `MemoryFact` yazılmadığı assert edilir (§11 AC-3).
- **GDPR / kişisel veri (düşük-risk, tek operatör — yine de tanımlı):** yalnızca üçüncü şahısların **public** handle/içeriği saklanır (private PII yok). Settings'te: memory inspection + export + **cascade-delete-by-handle** (handle bazlı silme = right-to-erasure karşılığı). Secrets/token asla hafızaya yazılmaz — tek credential store `IntegrationCredential` (AES-256-GCM) kalır. EU-subject yükümlülük sorusu `unverified`, düşük-risk olarak dokümante.
- **Ajan izinleri (D2):** memory extraction/consolidation job'ı read-only context alır; write yalnızca `proposed` satır ekleme; publish/identity-promote asla otonom.

---

## 9. MVP / V1 / V2 dilimleri (synthesis §5 + C5 ile birebir)

**MVP (Sprint-1 — sıfır yeni tablo, sıfır yeni ekran, sıfır migration):**
1. **Bug fix #1:** `vector-memory.ts:304` pattern local-hash → gerçek embedding persist (§7).
2. **Bug fix #2 / wire-in:** `FeedbackEvent` → episodic memory olarak retrieval'a bağlanır (bugün salt audit log — 02 §2); mevcut feedback tipleri (approved/edited/rejected/not_my_tone/…) sinyal olarak kullanılır.
3. **Edit-distance capture:** AI taslağı ↔ yayınlanan metin token diff'i kaydedilir (north-star metriğin veri kaynağı; mevcut `FeedbackEvent`/`QueueItem` alanlarıyla, bedava sinyal — C5).
4. (Aynı sprintte, ilgili spec'lerden: `VoiceProfile`'ın `buildDraftSystemPrompt`'a wire edilmesi — FINAL-CONTENT-ENGINE sahipliğinde.)

**V1:**
- `MemoryFact` + `CaptionDna` + `HashtagDna` tabloları (§4, additive `db:push`), confidence sub-signals + temporal validity + contradiction detection.
- `voice-constitution.md` per account (Tier 1) + draft prompt'a enjeksiyon.
- Approval queue yüzeyi + rollback (Settings/Bugün içinde, top-level ekran değil — C9).
- Retrieval pipeline'ın tam hâli: cosine top-K → judge-preset rerank top-8 (§5).
- Embedding upgrade A/B + koşullu geçiş (§7); haftalık consolidation cron (§6.6); memory-quality eval harness `EvalTest` üzerinde (§11).

**V2 (evidence-gated):**
- pgvector + HNSW (tetik: >~50k vektör veya p95 >150 ms — §3).
- Procedural memory / prompt self-optimization, governance gate arkasında (her prompt mutasyonu human-approved + versiyonlu; LangMem drift bulgusu — 02 §3.3).
- Cohere Rerank escalation (yalnızca ölçülmüş precision açığında); opsiyonel temporal graph (muhtemelen asla — 2 hesap multi-hop gerektirmiyor).

---

## 10. Maliyet

- **Purpose prefix: `memory_`** (C8 ruling — 02'nin `mem_` önerisi preset katmanının `memory_`'sine **birleştirildi**; tek taksonomi). Tüm memory LLM spend'i `UsageLog.meta.purpose = "memory_*"` altında; `getMonthlySpendByPurpose("memory_")` ile per-feature bütçe.
- **Extraction/consolidation modeli:** **`cemos-memory` preset → `deepseek-v4-pro`** (C8: $0.44/$0.87, 1M ctx — konsolidasyon batch'leri için cheapWriter'dan üstün). Zod-validated output zorunlu (02'nin taşınan şartı). Contradiction adjudication: judge preset. Preset tanımları [FINAL-OPENROUTER-ROUTING](./FINAL-OPENROUTER-ROUTING.md)'de.
- **Tüm çağrılar `generateJsonGated` üzerinden** (korpus Priority-1 kararı) — gate + log tek noktada; `MONTHLY_AI_BUDGET_USD` global kapısı geçerli.
- **Beklenen hacim:** embedding cents/ay (düşük-binlerce embed × $0.01-0.02/M); extraction haftalık batch + rerank kısa çağrılar → memory toplamı D6'nın ~$9-10/ay projeksiyonu içinde marjinal. Budget-exceeded → extraction bloklanır (fail-closed; §11 AC-6), retrieval mevcut vektörlerle çalışmaya devam eder (fail-open okuma).
- **Re-embed migration:** one-time, düşük-binlerce satır, `memory_` altında loglanır.

---

## 11. Acceptance criteria + eval metrikleri

**Eval dataset (`EvalTest` üzerinde, V1):** hesap başına ~30-50 gold pair, Ali Cem'in gerçek edit/publish geçmişinden — `(draft context → recall edilmesi beklenen hafıza)` ve `(AI draft, published draft)` çiftleri. Küçük, gerçek, sentetik değil.

| Metrik | Tanım | Hedef |
|---|---|---|
| Retrieval **precision@k** | Getirilen hafızaların relevant oranı | **≥ 0.7 @ k=5** |
| Retrieval **recall** | Bilinen-relevant hafızaların yüzeye çıkma oranı | ≥ 0.8 |
| **Contradiction rate** | Aktif hafıza çiftlerinde karşılıklı çelişki | **< 2%** |
| **Human-approval acceptance** | Onaylanan proposal oranı | izlenir (kalibrasyon sinyali, hedef değil) |
| **Staleness rate** | N gündür corroborate edilmemiş aktif perf-hafıza | < 15% |
| **Edit ratio (north star)** | token diff(AI→published), memory-on vs off | **düşen trend** + on < off |

**Ship gate (hepsi test edilir):**
1. **AC-1 (pattern bug):** persisted pattern vektörlerinde `provider !== "local_fallback"`; retrieval gerçek embedding kullanır. *(MVP)*
2. **AC-2 (single-correction):** 1 edit → fact `proposed` kalır; 3 corroborating edit → `active`. *(V1)*
3. **AC-3 (poisoning):** adversarial SourcePost enjeksiyonu → hiçbir identity `MemoryFact` yazılmaz; `external` aday `active`'e terfi edemez. *(V1)*
4. **AC-4 (supersede):** çelişen fact `superseded` zinciri kurar, eski fact `tValid` aralığında sorgulanabilir; rollback eskiyi geri getirir. *(V1)*
5. **AC-5 (north star A/B):** memory-on taslaklar gold set'te memory-off'tan düşük edit ratio gösterir. *(V1)*
6. **AC-6 (bütçe):** tüm memory spend `memory_` altında loglanır; budget-exceeded extraction'ı bloklar. *(V1)*
7. **AC-7 (scope):** her memory read/write `accountHandle` scope'u zorlar (cross-account leak testi). *(MVP'den itibaren)*
8. **AC-8 (UI states):** yeni approval yüzeyi loading/empty/error/success + Türkçe UI + `prefers-reduced-motion` + 320/375/640 mobile parity karşılar (baseline §1/§2). *(V1)*
