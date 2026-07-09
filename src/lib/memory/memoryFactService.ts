/**
 * MemoryFact servisi (Sprint 3 — FINAL-MEMORY-SPEC §4/§6).
 *
 * Tier-2 relational truth: proposal → (corroboration | operatör onayı) →
 * active → supersede zinciri. Kurallar:
 *  - Identity hafızası (preference/semantic/procedural) YAVAŞ + insan-eğilimli;
 *    "external" provenance HİÇBİR KOŞULDA MemoryFact yazamaz (§6.5 mutlak
 *    kural — memory poisoning savunmasının çekirdeği, AC-3).
 *  - Tek düzeltme kanun olmaz (§4.2): auto-promote yalnız type="semantic" ve
 *    evidenceCount ≥ PROMOTION_MIN_EVIDENCE; preference/procedural her zaman
 *    insan onayı bekler.
 *  - DELETE asla (§4.3): çelişki/güncelleme = supersede zinciri; rollback
 *    zinciri geri sarar.
 *  - Her read/write accountHandle scope'u zorlar (AC-7).
 */

import { prisma } from "@/lib/db/client";
import { foldTurkish, isKnownAccountHandle } from "@/lib/growth-engine/account-adapter";

export const MEMORY_FACT_TYPES = ["preference", "semantic", "procedural"] as const;
export type MemoryFactType = (typeof MEMORY_FACT_TYPES)[number];

export const MEMORY_PROVENANCES = ["operator", "own_metric", "self_judge", "external"] as const;
export type MemoryProvenance = (typeof MEMORY_PROVENANCES)[number];

/** §4.2 — corroborating observation eşiği. */
export const PROMOTION_MIN_EVIDENCE = 3;

/** §4.1 — başlangıç ağırlıkları (golden set ile kalibre edilecek). */
const W_REP = 0.4;
const W_REC = 0.2;
const W_SRC = 0.3;
const W_CON = 0.5;
const N_FULL = 3;

const SOURCE_AUTHORITY: Record<MemoryProvenance, number> = {
  operator: 1.0,
  own_metric: 0.8,
  self_judge: 0.6,
  external: 0.0,
};

export class MemoryProvenanceError extends Error {
  constructor(provenance: string) {
    super(
      `Memory poisoning koruması: "${provenance}" provenance'lı aday identity hafızasına (MemoryFact) yazılamaz.`
    );
    this.name = "MemoryProvenanceError";
  }
}

export class MemoryScopeError extends Error {
  constructor(handle: unknown) {
    super(`Geçersiz accountHandle scope'u: ${String(handle)}`);
    this.name = "MemoryScopeError";
  }
}

/** AC-7: her read/write öncesi zorunlu scope kontrolü. null = global (nadir). */
function assertScope(accountHandle: string | null): void {
  if (accountHandle === null) return;
  if (typeof accountHandle !== "string" || !isKnownAccountHandle(accountHandle)) {
    throw new MemoryScopeError(accountHandle);
  }
}

/** §6.5 mutlak kural: external → MemoryFact (identity) yazımı imkânsız. */
export function assertIdentityWriteAllowed(provenance: string): asserts provenance is Exclude<MemoryProvenance, "external"> {
  if (provenance === "external" || !MEMORY_PROVENANCES.includes(provenance as MemoryProvenance)) {
    throw new MemoryProvenanceError(provenance);
  }
}

/** §4.1 confidence formülü. */
export function computeConfidence(input: {
  evidenceCount: number;
  ageDays: number;
  decayHalfLifeDays: number | null;
  provenance: MemoryProvenance;
  hasContradiction: boolean;
}): number {
  const repetition = Math.min(1, input.evidenceCount / N_FULL);
  const recency =
    input.decayHalfLifeDays && input.decayHalfLifeDays > 0
      ? Math.pow(0.5, input.ageDays / input.decayHalfLifeDays)
      : 1.0; // identity: halfLife null → ≈∞
  const sourceAuthority = SOURCE_AUTHORITY[input.provenance] ?? 0;
  const contradictionPenalty = input.hasContradiction ? 1 : 0;

  const raw =
    W_REP * repetition + W_REC * recency + W_SRC * sourceAuthority - W_CON * contradictionPenalty;
  return Math.max(0, Math.min(1, Number(raw.toFixed(4))));
}

// ── Contradiction detection (§6.2 — write anında, keyword eşlemesi) ──────────

const NEGATION_MARKERS = ["yok", "yasak", "asla", "kullanma", "yazma", "degil", "olmaz", "birakma"];

function tokenize(statement: string): Set<string> {
  return new Set(
    foldTurkish(statement)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/** t fiilinin Türkçe olumsuz emir hali diğer kümede var mı ("sor" → "sorma")? */
function hasNegatedForm(token: string, other: Set<string>): boolean {
  return other.has(`${token}ma`) || other.has(`${token}me`);
}

/** İki ifade aynı konuyu işaret edip zıt yön (negation) taşıyorsa çelişki adayı. */
export function looksContradictory(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const shared = [...ta].filter((t) => tb.has(t) && !NEGATION_MARKERS.includes(t));
  if (shared.length < 2) return false;
  // 1) Açık negation marker asimetrisi ("yasak"/"asla"/"kullanma"...).
  const aNeg = NEGATION_MARKERS.some((m) => ta.has(m));
  const bNeg = NEGATION_MARKERS.some((m) => tb.has(m));
  if (aNeg !== bNeg) return true;
  // 2) Aynı fiil kökü zıt kutupta: "soru sor" ↔ "soru sorma" (olumsuz emir -ma/-me).
  const stemFlip =
    [...ta].some((t) => hasNegatedForm(t, tb)) || [...tb].some((t) => hasNegatedForm(t, ta));
  return stemFlip;
}

/** Aynı ifade (fold'lu) mi? Corroboration dedup'u için. */
export function isSameStatement(a: string, b: string): boolean {
  return foldTurkish(a).replace(/\s+/g, " ").trim() === foldTurkish(b).replace(/\s+/g, " ").trim();
}

// ── Yazım disiplini ──────────────────────────────────────────────────────────

export type ProposeFactInput = {
  accountHandle: string | null;
  type: MemoryFactType;
  statement: string;
  provenance: MemoryProvenance;
  createdBy: "operator" | "consolidation" | "feedback_pipeline";
  decayHalfLifeDays?: number | null;
};

export type ProposeFactResult =
  | { outcome: "created"; factId: string; supersedesId: string | null }
  | { outcome: "corroborated"; factId: string; evidenceCount: number; promoted: boolean }
  | { outcome: "skipped_empty" };

/**
 * Aday fact yazımı (§6.1). Aynı ifade zaten varsa corroboration (evidence++);
 * aktif bir fact ile çelişiyorsa supersede PROPOSAL'ı üretilir (overwrite YOK,
 * operatör onayına düşer). Her aday `proposed` girer.
 */
export async function proposeFact(input: ProposeFactInput): Promise<ProposeFactResult> {
  assertScope(input.accountHandle);
  assertIdentityWriteAllowed(input.provenance);
  if (!MEMORY_FACT_TYPES.includes(input.type)) {
    throw new Error(`Geçersiz MemoryFact tipi: ${input.type}`);
  }
  const statement = input.statement.trim();
  if (!statement) return { outcome: "skipped_empty" };

  const existing = await prisma.memoryFact.findMany({
    where: {
      accountHandle: input.accountHandle,
      type: input.type,
      status: { in: ["proposed", "active"] },
    },
  });

  // 1) Dedup → corroboration: aynı ifade tekrar gözlendi.
  const same = existing.find((f) => isSameStatement(f.statement, statement));
  if (same) {
    const evidenceCount = same.evidenceCount + 1;
    // §4.2: auto-promote yalnız semantic ve eşik dolunca; diğer tipler insan bekler.
    const promoted =
      same.status === "proposed" &&
      input.type === "semantic" &&
      evidenceCount >= PROMOTION_MIN_EVIDENCE;
    await prisma.memoryFact.update({
      where: { id: same.id },
      data: {
        evidenceCount,
        confidence: computeConfidence({
          evidenceCount,
          ageDays: 0,
          decayHalfLifeDays: same.decayHalfLifeDays,
          provenance: input.provenance,
          hasContradiction: false,
        }),
        ...(promoted ? { status: "active" } : {}),
      },
    });
    return { outcome: "corroborated", factId: same.id, evidenceCount, promoted };
  }

  // 2) Contradiction → supersede proposal'ı (aktif fact işaretlenir, dokunulmaz).
  const contradicted = existing.find(
    (f) => f.status === "active" && looksContradictory(f.statement, statement)
  );

  const created = await prisma.memoryFact.create({
    data: {
      accountHandle: input.accountHandle,
      type: input.type,
      statement,
      sourceProvenance: input.provenance,
      status: "proposed",
      evidenceCount: 1,
      confidence: computeConfidence({
        evidenceCount: 1,
        ageDays: 0,
        decayHalfLifeDays: input.decayHalfLifeDays ?? null,
        provenance: input.provenance,
        hasContradiction: Boolean(contradicted),
      }),
      createdBy: input.createdBy,
      decayHalfLifeDays: input.decayHalfLifeDays ?? null,
      supersedesId: contradicted?.id ?? null,
    },
  });
  return { outcome: "created", factId: created.id, supersedesId: contradicted?.id ?? null };
}

/**
 * Operatör onayı (§6.3): proposed → active. Fact bir aktif fact'i supersede
 * ediyorsa eski fact `superseded` + tInvalid=now olur (§4.3 — DELETE asla).
 */
export async function approveFact(factId: string, approvedBy = "operator"): Promise<void> {
  const fact = await prisma.memoryFact.findUnique({ where: { id: factId } });
  if (!fact) throw new Error(`MemoryFact bulunamadı: ${factId}`);
  if (fact.status !== "proposed") throw new Error(`Yalnız proposed onaylanır (durum: ${fact.status})`);

  if (fact.supersedesId) {
    await prisma.memoryFact.update({
      where: { id: fact.supersedesId },
      data: { status: "superseded", tInvalid: new Date() },
    });
  }
  await prisma.memoryFact.update({
    where: { id: factId },
    data: { status: "active", approvedBy },
  });
}

export async function rejectFact(factId: string): Promise<void> {
  await prisma.memoryFact.update({ where: { id: factId }, data: { status: "rejected" } });
}

/**
 * Rollback (§4.3): supersede zincirini geri sar — yeni fact `rejected`,
 * eski fact `active` + tInvalid=null.
 */
export async function rollbackFact(factId: string): Promise<void> {
  const fact = await prisma.memoryFact.findUnique({ where: { id: factId } });
  if (!fact) throw new Error(`MemoryFact bulunamadı: ${factId}`);
  await prisma.memoryFact.update({ where: { id: factId }, data: { status: "rejected" } });
  if (fact.supersedesId) {
    await prisma.memoryFact.update({
      where: { id: fact.supersedesId },
      data: { status: "active", tInvalid: null },
    });
  }
}

/** Aktif kurallar — retrieval enjeksiyonu için (scope zorunlu, AC-7). */
export async function getActiveFacts(
  accountHandle: string,
  type?: MemoryFactType
): Promise<Array<{ id: string; type: string; statement: string; sourceProvenance: string; confidence: number }>> {
  assertScope(accountHandle);
  const rows = await prisma.memoryFact.findMany({
    where: {
      status: "active",
      OR: [{ accountHandle }, { accountHandle: null }],
      ...(type ? { type } : {}),
    },
    orderBy: { confidence: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    statement: r.statement,
    sourceProvenance: r.sourceProvenance,
    confidence: r.confidence,
  }));
}

/** Onay kuyruğu: bekleyen proposal'lar (yeni → eski). */
export async function listProposals(accountHandle?: string) {
  if (accountHandle !== undefined) assertScope(accountHandle);
  return prisma.memoryFact.findMany({
    where: {
      status: "proposed",
      ...(accountHandle ? { accountHandle } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}
