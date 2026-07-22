/**
 * MemoryFact servisi (Sprint 3 çekirdeği + Faz 2B ADR-029 governance).
 *
 * Tier-2 relational truth: proposal → (corroboration + kanıt defteri) →
 * İNSAN ONAYI → active → supersede zinciri. Kurallar:
 *  - "external" provenance HİÇBİR KOŞULDA MemoryFact yazamaz (§6.5 mutlak
 *    kural — memory poisoning savunmasının çekirdeği, AC-3).
 *  - ADR-029: feedback/self-judge/consolidation/own-metric kaynaklı HİÇBİR
 *    fact OTOMATİK aktifleşemez. ≥3 distinct kanıt yalnız "incelemeye hazır"
 *    yapar; aktifleşme operatör onayı ister. Yalnız operatörün kendi yazdığı
 *    kural (createdBy="operator") anında aktif olabilir.
 *  - Kanıt = MemoryEvidence defteri; aynı olayın retry'ı kanıt sayısını
 *    ARTIRAMAZ (distinct unique). evidenceCount defterli fact'te defter
 *    özetidir; eski (defter-öncesi) sayılar korunur, sahte kaynak backfill
 *    EDİLMEZ.
 *  - DELETE asla (§4.3): çelişki/güncelleme/düzenleme = supersede zinciri;
 *    revise yerinde mutate ETMEZ; rollback zinciri tek transaction'da geri sarar.
 *  - Her read/write accountHandle scope'u zorlar (AC-7); fact-id mutasyonları
 *    beklenen hesap bağlamıyla doğrulanabilir (cross-account koruması).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { foldTurkish } from "@/lib/growth-engine/account-adapter";
import { isKnownAccountHandleDb } from "@/lib/accounts/profileRepository";

export const MEMORY_FACT_TYPES = ["preference", "semantic", "procedural"] as const;
export type MemoryFactType = (typeof MEMORY_FACT_TYPES)[number];

export const MEMORY_PROVENANCES = ["operator", "own_metric", "self_judge", "external"] as const;
export type MemoryProvenance = (typeof MEMORY_PROVENANCES)[number];

/** §4.2 — distinct kanıt eşiği: ADR-029'da "incelemeye hazır" eşiğidir (otomatik aktifleşme DEĞİL). */
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

export type MemoryGovernanceCode =
  | "not_found"
  | "invalid_state"
  | "insufficient_evidence"
  | "account_mismatch"
  | "duplicate_statement";

/** ADR-029: yanlış-durum/yetersiz-kanıt/yanlış-hesap mutasyonları typed reddedilir. */
export class MemoryGovernanceError extends Error {
  readonly code: MemoryGovernanceCode;
  constructor(code: MemoryGovernanceCode, message: string) {
    super(message);
    this.name = "MemoryGovernanceError";
    this.code = code;
  }
}

/**
 * AC-7 + ADR-031: her read/write öncesi zorunlu scope kontrolü — DB-otoriteli,
 * fail-closed (bilinmeyen/inaktif handle ya da DB-erişilemezliği yazma/okuma
 * yetkisi VERMEZ; tohumlu iki hesap bağlantı kesintisinde bootstrap'tan
 * doğrulanır). null = global (nadir).
 */
async function assertScope(accountHandle: string | null): Promise<void> {
  if (accountHandle === null) return;
  if (typeof accountHandle !== "string" || !(await isKnownAccountHandleDb(accountHandle))) {
    throw new MemoryScopeError(accountHandle);
  }
}

/** §6.5 mutlak kural: external → MemoryFact (identity) yazımı imkânsız. */
export function assertIdentityWriteAllowed(provenance: string): asserts provenance is Exclude<MemoryProvenance, "external"> {
  if (provenance === "external" || !MEMORY_PROVENANCES.includes(provenance as MemoryProvenance)) {
    throw new MemoryProvenanceError(provenance);
  }
}

/** Cross-account koruması: fact-id mutasyonu beklenen hesapla eşleşmeli (global fact serbest). */
function assertAccountMatch(factHandle: string | null, expected?: string | null): void {
  if (expected === undefined || expected === null) return;
  if (factHandle === null) return; // global fact her hesap bağlamından yönetilebilir
  if (factHandle !== expected) {
    throw new MemoryGovernanceError(
      "account_mismatch",
      `Bu kural @${factHandle} hesabına ait — @${expected} bağlamından değiştirilemez.`
    );
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

/**
 * ADR-029: ifade kimliği — account+type+fold'lanmış statement hash'i.
 * MemoryFact.canonicalKey nullable UNIQUE kolonuna yazılır; eşzamanlı aynı
 * sinyalin iki proposal üretmesini DB düzeyinde keser.
 */
export function canonicalStatementKey(
  accountHandle: string | null,
  type: MemoryFactType,
  statement: string
): string {
  const folded = foldTurkish(statement).replace(/\s+/g, " ").trim();
  const hash = createHash("sha256").update(folded).digest("hex").slice(0, 24);
  return `${accountHandle ?? "global"}:${type}:${hash}`;
}

// ── Kanıt defteri (ADR-029) ──────────────────────────────────────────────────

export const MEMORY_EVIDENCE_SOURCE_TYPES = [
  "feedback_event",
  "operator_assertion",
  "operator_revision",
  "validated_pattern",
  "legacy_unattributed",
] as const;
export type MemoryEvidenceSourceType = (typeof MEMORY_EVIDENCE_SOURCE_TYPES)[number];

export const MEMORY_EVIDENCE_DIRECTIONS = ["positive", "negative", "edit", "performance", "operator"] as const;
export type MemoryEvidenceDirection = (typeof MEMORY_EVIDENCE_DIRECTIONS)[number];

export const MEMORY_EVIDENCE_METADATA_VERSION = "1";
export const MemoryEvidenceMetadataSchema = z
  .object({ schemaVersion: z.literal(MEMORY_EVIDENCE_METADATA_VERSION) })
  .passthrough();

const EXCERPT_MAX = 280;

export type MemoryEvidenceInput = {
  sourceType: MemoryEvidenceSourceType;
  sourceId: string;
  signalType: string;
  direction: MemoryEvidenceDirection;
  excerpt?: string;
  metadata?: Record<string, unknown>;
  observedAt?: Date;
};

type Tx = Prisma.TransactionClient;

/**
 * Kanıt satırını idempotent ekler (distinct unique). Döner: gerçekten yeni
 * satır eklendi mi. Aynı olayın retry'ı false döner — kanıt sayısı artmaz.
 */
async function attachEvidence(tx: Tx, memoryFactId: string, ev: MemoryEvidenceInput): Promise<boolean> {
  if (!MEMORY_EVIDENCE_SOURCE_TYPES.includes(ev.sourceType)) {
    throw new MemoryGovernanceError("invalid_state", `Tanımsız kanıt kaynağı türü: ${ev.sourceType}`);
  }
  const metadata = MemoryEvidenceMetadataSchema.parse({
    schemaVersion: MEMORY_EVIDENCE_METADATA_VERSION,
    ...(ev.metadata ?? {}),
  });
  const existing = await tx.memoryEvidence.findUnique({
    where: {
      memoryFactId_sourceType_sourceId_signalType: {
        memoryFactId,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        signalType: ev.signalType,
      },
    },
  });
  if (existing) return false;
  await tx.memoryEvidence.create({
    data: {
      memoryFactId,
      sourceType: ev.sourceType,
      sourceId: ev.sourceId,
      signalType: ev.signalType,
      direction: ev.direction,
      excerpt: (ev.excerpt ?? "").slice(0, EXCERPT_MAX),
      metadataJson: JSON.stringify(metadata),
      observedAt: ev.observedAt ?? new Date(),
    },
  });
  return true;
}

/** Fact'in defterdeki distinct kanıt sayısı (review-eligibility bunun üstünden). */
export async function distinctEvidenceCount(memoryFactId: string): Promise<number> {
  return prisma.memoryEvidence.count({ where: { memoryFactId } });
}

/** Kanıt listesi (yeni → eski) — kaynaklı read model / evidence drawer için. */
export async function listEvidence(memoryFactId: string, limit = 20) {
  return prisma.memoryEvidence.findMany({
    where: { memoryFactId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

// ── Yazım disiplini ──────────────────────────────────────────────────────────

export type ProposeFactInput = {
  accountHandle: string | null;
  type: MemoryFactType;
  statement: string;
  provenance: MemoryProvenance;
  createdBy: "operator" | "consolidation" | "feedback_pipeline";
  decayHalfLifeDays?: number | null;
  /** ADR-029: sinyal kaynağı — verilirse deftere idempotent işlenir. */
  evidence?: MemoryEvidenceInput;
};

export type ProposeFactResult =
  | { outcome: "created"; factId: string; supersedesId: string | null; reviewReady: boolean }
  | { outcome: "corroborated"; factId: string; evidenceCount: number; reviewReady: boolean }
  | { outcome: "skipped_empty" };

/**
 * Aday fact yazımı (§6.1 + ADR-029). Aynı ifade zaten varsa corroboration
 * (kanıt defterine idempotent ekleme); aktif bir fact ile çelişiyorsa
 * supersede PROPOSAL'ı üretilir (overwrite YOK). Her aday `proposed` girer ve
 * ORADA KALIR — otomatik aktifleşme YOKTUR (eski semantic auto-promote
 * kaldırıldı). ≥3 distinct kanıt yalnız reviewReady=true yapar; aktifleşme
 * approveFact (insan onayı) ister.
 */
export async function proposeFact(input: ProposeFactInput): Promise<ProposeFactResult> {
  await assertScope(input.accountHandle);
  assertIdentityWriteAllowed(input.provenance);
  if (!MEMORY_FACT_TYPES.includes(input.type)) {
    throw new Error(`Geçersiz MemoryFact tipi: ${input.type}`);
  }
  const statement = input.statement.trim();
  if (!statement) return { outcome: "skipped_empty" };

  const canonicalKey = canonicalStatementKey(input.accountHandle, input.type, statement);

  const existing = await prisma.memoryFact.findMany({
    where: {
      accountHandle: input.accountHandle,
      type: input.type,
      status: { in: ["proposed", "active"] },
    },
  });

  // 1) Dedup → corroboration: aynı ifade tekrar gözlendi.
  const same = existing.find((f) => isSameStatement(f.statement, statement));
  if (same) return corroborate(same.id, input, canonicalKey);

  // 2) Contradiction → supersede proposal'ı (aktif fact işaretlenir, dokunulmaz).
  const contradicted = existing.find(
    (f) => f.status === "active" && looksContradictory(f.statement, statement)
  );

  try {
    const { factId, ledgerCount } = await prisma.$transaction(async (tx) => {
      const created = await tx.memoryFact.create({
        data: {
          accountHandle: input.accountHandle,
          type: input.type,
          statement,
          sourceProvenance: input.provenance,
          status: "proposed",
          evidenceCount: 1,
          canonicalKey,
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
      let count = 0;
      if (input.evidence) {
        await attachEvidence(tx, created.id, input.evidence);
        count = 1;
      }
      return { factId: created.id, ledgerCount: count };
    });
    return {
      outcome: "created",
      factId,
      supersedesId: contradicted?.id ?? null,
      reviewReady: reviewEligible(input.createdBy, ledgerCount),
    };
  } catch (e) {
    // Eşzamanlı aynı-ifade yarışı: canonicalKey unique — kaybeden kazanan
    // satıra corroborate olur (ikinci proposal İMKÂNSIZ).
    if ((e as { code?: string }).code === "P2002") {
      const winner = await prisma.memoryFact.findUnique({ where: { canonicalKey } });
      if (winner) return corroborate(winner.id, input, canonicalKey);
    }
    throw e;
  }
}

function reviewEligible(createdBy: string, ledgerCount: number): boolean {
  if (createdBy === "operator") return true; // operatör kendi kuralını yazdı
  return ledgerCount >= PROMOTION_MIN_EVIDENCE;
}

/** Corroboration: kanıt defterine idempotent ekle; evidenceCount defter özetiyle monoton güncelle. */
async function corroborate(
  factId: string,
  input: ProposeFactInput,
  canonicalKey: string
): Promise<ProposeFactResult> {
  const result = await prisma.$transaction(async (tx) => {
    const fact = await tx.memoryFact.findUnique({ where: { id: factId } });
    if (!fact) throw new MemoryGovernanceError("not_found", `MemoryFact bulunamadı: ${factId}`);

    let inserted = false;
    if (input.evidence) {
      inserted = await attachEvidence(tx, fact.id, input.evidence);
    }
    // Kanıt yoksa (legacy corroboration çağrısı) eski davranış: sayaç artar.
    // Kanıt varsa sayaç yalnız YENİ distinct satırda artar (retry artıramaz).
    const evidenceCount = input.evidence ? fact.evidenceCount + (inserted ? 1 : 0) : fact.evidenceCount + 1;
    const ledgerCount = await tx.memoryEvidence.count({ where: { memoryFactId: fact.id } });

    await tx.memoryFact.update({
      where: { id: fact.id },
      data: {
        evidenceCount,
        // Fırsatçı canonicalKey doldurma (eski satırlar null) — ifadenin
        // KENDİSİNDEN türetilir, uydurma kaynak değildir.
        ...(fact.canonicalKey ? {} : { canonicalKey }),
        confidence: computeConfidence({
          evidenceCount,
          ageDays: 0,
          decayHalfLifeDays: fact.decayHalfLifeDays,
          provenance: input.provenance,
          hasContradiction: false,
        }),
      },
    });
    return { evidenceCount, ledgerCount, createdBy: fact.createdBy };
  });

  return {
    outcome: "corroborated",
    factId,
    evidenceCount: result.evidenceCount,
    reviewReady: reviewEligible(result.createdBy, result.ledgerCount),
  };
}

// ── İnsan onaylı state geçişleri (ADR-029: hepsi atomik + durum/hesap korumalı) ──

export type FactMutationOpts = {
  /** UI'nin aktif hesap bağlamı — fact başka hesaba aitse mutasyon reddedilir. */
  expectedAccountHandle?: string | null;
};

async function loadFactOrThrow(factId: string) {
  const fact = await prisma.memoryFact.findUnique({ where: { id: factId } });
  if (!fact) throw new MemoryGovernanceError("not_found", `MemoryFact bulunamadı: ${factId}`);
  return fact;
}

/**
 * Operatör onayı (§6.3 + ADR-029): proposed → active, TEK transaction.
 * Öğrenilmiş (createdBy ≠ operator) proposal ≥3 distinct kanıt olmadan
 * ONAYLANAMAZ (server-side fail-closed; UI'daki disabled buton yeterli değil).
 * `operatorAssertion=true` = kullanıcı kuralı AÇIKÇA sahiplendi → kanıt eşiği
 * aranmaz, deftere operator_assertion yazılır (tarihsel kaynak UYDURULMAZ —
 * yeni, bugünkü operatör beyanı kaydedilir).
 */
export async function approveFact(
  factId: string,
  approvedBy = "operator",
  opts: FactMutationOpts & { operatorAssertion?: boolean } = {}
): Promise<void> {
  const fact = await loadFactOrThrow(factId);
  assertAccountMatch(fact.accountHandle, opts.expectedAccountHandle);
  if (fact.status !== "proposed") {
    throw new MemoryGovernanceError("invalid_state", `Yalnız proposed onaylanır (durum: ${fact.status})`);
  }

  if (fact.createdBy !== "operator" && !opts.operatorAssertion) {
    const ledger = await distinctEvidenceCount(factId);
    if (ledger < PROMOTION_MIN_EVIDENCE) {
      throw new MemoryGovernanceError(
        "insufficient_evidence",
        `Öğrenilmiş öneri ${PROMOTION_MIN_EVIDENCE} kanıttan önce onaylanamaz (kaynaklı kanıt: ${ledger}/${PROMOTION_MIN_EVIDENCE}). Kuralı sahiplenmek istiyorsan "Sahiplen" kullan.`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (fact.supersedesId) {
      await tx.memoryFact.update({
        where: { id: fact.supersedesId },
        data: { status: "superseded", tInvalid: new Date() },
      });
    }
    await tx.memoryFact.update({
      where: { id: factId },
      data: { status: "active", approvedBy },
    });
    if (opts.operatorAssertion) {
      const inserted = await attachEvidence(tx, factId, {
        sourceType: "operator_assertion",
        sourceId: factId, // beyanın konusu bu fact — retry idempotent
        signalType: "operator_adopt",
        direction: "operator",
        excerpt: fact.statement.slice(0, EXCERPT_MAX),
      });
      if (inserted) {
        await tx.memoryFact.update({
          where: { id: factId },
          data: { evidenceCount: { increment: 1 } },
        });
      }
    }
  });
}

/** Reddetme: yalnız proposed reddedilir (aktif kural için rollback/supersede kullanılır). */
export async function rejectFact(factId: string, opts: FactMutationOpts = {}): Promise<void> {
  const fact = await loadFactOrThrow(factId);
  assertAccountMatch(fact.accountHandle, opts.expectedAccountHandle);
  if (fact.status !== "proposed") {
    throw new MemoryGovernanceError("invalid_state", `Yalnız proposed reddedilir (durum: ${fact.status})`);
  }
  await prisma.memoryFact.update({ where: { id: factId }, data: { status: "rejected" } });
}

/**
 * Rollback (§4.3 + ADR-029): supersede zincirini TEK transaction'da geri sar —
 * yeni fact `rejected`, eski fact `active` + tInvalid=null. Yalnız zinciri
 * olan AKTİF fact geri alınabilir (yanlış durumda typed red).
 */
export async function rollbackFact(factId: string, opts: FactMutationOpts = {}): Promise<void> {
  const fact = await loadFactOrThrow(factId);
  assertAccountMatch(fact.accountHandle, opts.expectedAccountHandle);
  if (!fact.supersedesId) {
    throw new MemoryGovernanceError("invalid_state", "Bu kuralın geri alınacak supersede zinciri yok.");
  }
  if (fact.status !== "active") {
    throw new MemoryGovernanceError("invalid_state", `Yalnız aktif kural geri alınır (durum: ${fact.status})`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.memoryFact.update({ where: { id: factId }, data: { status: "rejected", tInvalid: new Date() } });
    await tx.memoryFact.update({
      where: { id: fact.supersedesId as string },
      data: { status: "active", tInvalid: null },
    });
  });
}

/**
 * Düzenleme (ADR-029): aktif kuralın statement'ı YERİNDE DEĞİŞTİRİLMEZ.
 * Tek transaction: yeni operatör fact'i (active, supersedesId=eski) + eski
 * fact superseded + yeni fact'e operator_revision kanıtı. Rollback görünür
 * kalır (zincir).
 */
export async function reviseFact(
  factId: string,
  newStatement: string,
  opts: FactMutationOpts = {}
): Promise<{ newFactId: string }> {
  const statement = newStatement.trim();
  if (statement.length < 5) {
    throw new MemoryGovernanceError("invalid_state", "Yeni kural metni çok kısa (≥5 karakter).");
  }
  const fact = await loadFactOrThrow(factId);
  assertAccountMatch(fact.accountHandle, opts.expectedAccountHandle);
  if (fact.status !== "active") {
    throw new MemoryGovernanceError("invalid_state", `Yalnız aktif kural düzenlenir (durum: ${fact.status})`);
  }
  if (isSameStatement(fact.statement, statement)) {
    throw new MemoryGovernanceError("invalid_state", "Yeni metin mevcutla aynı — değişiklik yok.");
  }
  const canonicalKey = canonicalStatementKey(
    fact.accountHandle,
    fact.type as MemoryFactType,
    statement
  );

  try {
    const newFactId = await prisma.$transaction(async (tx) => {
      const created = await tx.memoryFact.create({
        data: {
          accountHandle: fact.accountHandle,
          type: fact.type,
          statement,
          sourceProvenance: "operator",
          status: "active",
          evidenceCount: 1,
          canonicalKey,
          confidence: computeConfidence({
            evidenceCount: 1,
            ageDays: 0,
            decayHalfLifeDays: fact.decayHalfLifeDays,
            provenance: "operator",
            hasContradiction: false,
          }),
          createdBy: "operator",
          approvedBy: "operator",
          decayHalfLifeDays: fact.decayHalfLifeDays,
          supersedesId: fact.id,
        },
      });
      await tx.memoryFact.update({
        where: { id: fact.id },
        data: { status: "superseded", tInvalid: new Date() },
      });
      await attachEvidence(tx, created.id, {
        sourceType: "operator_revision",
        sourceId: fact.id,
        signalType: "operator_revision",
        direction: "operator",
        excerpt: `Önceki: ${fact.statement}`.slice(0, EXCERPT_MAX),
      });
      return created.id;
    });
    return { newFactId };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      throw new MemoryGovernanceError(
        "duplicate_statement",
        "Bu ifade daha önce kaydedilmiş (aynı ifade kimliği) — mevcut kaydı inceleyip onun üzerinden ilerle."
      );
    }
    throw e;
  }
}

/** Aktif kurallar — retrieval enjeksiyonu için (scope zorunlu, AC-7). */
export async function getActiveFacts(
  accountHandle: string,
  type?: MemoryFactType
): Promise<Array<{ id: string; type: string; statement: string; sourceProvenance: string; confidence: number }>> {
  await assertScope(accountHandle);
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
  if (accountHandle !== undefined) await assertScope(accountHandle);
  return prisma.memoryFact.findMany({
    where: {
      status: "proposed",
      ...(accountHandle ? { accountHandle } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}
