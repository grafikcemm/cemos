/**
 * Aylık plan preview → apply → lifecycle sözleşmesi (Phase 3E, ADR-039 §7).
 *
 * Sözleşmeler:
 *  - PREVIEW sıfır DB write yapar; APPLY tek transaction + advisory-lock +
 *    optimistic concurrency (expectedUpdatedAt) + preview fingerprint + idempotent
 *    no-op.
 *  - NON-DESTRUCTIVE reconcile: assembler tarafından yönetilen kullanılmamış
 *    "planned" slotlar FİZİKSEL SİLİNMEZ; obsolete olanlar status="skipped"e
 *    geçer. KORUNAN slotlar (drafted/done/dossier-bağlı/handoff-referanslı)
 *    asla silinmez/skipped yapılmaz.
 *  - Lifecycle: draft/active/archived server state machine — apply otomatik
 *    active yapmaz; aktivasyon açık kullanıcı eylemi; archive non-destructive.
 *  - notesJson versioned zarf (planNotes) — legacy string[] okunur.
 *  - Yeni migration YOK.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import {
  assembleMonthlyPlan,
  type PlanInput,
  type PlanSlot,
  type ProtectedSlotInput,
} from "@/lib/reels/plan-assembler";
import type { RepetitionSignal } from "@/lib/reels/repetition";
import {
  parsePlanNotes,
  serializePlanNotes,
  PLAN_NOTES_VERSION,
  type PlanNotesEnvelope,
} from "@/lib/reels/planNotes";

// Korunan statüler: işlenmiş içerik — assembler asla dokunmaz.
export const PROTECTED_SLOT_STATUSES = ["drafted", "done"] as const;
const RECENT_MONTHS_LOOKBACK = 3;
const RECENT_SIGNAL_CAP = 120;

export type PlanApplyInput = {
  pillars: string[];
  postDays: number[];
  series?: Array<{ seriesKey: string; pillar: string; episodesPerMonth: number; displayName?: string; format?: string }>;
  seasonalTopics?: string[];
  /** Server-türetimli (seri profillerinden) — anti-tekrar hafızası. */
  pastTopics?: string[];
  /** Server-türetimli (seri profillerinden) — yasaklı tekrarlar. */
  bannedRepetition?: string[];
};

type SlotRow = {
  id: string;
  dayOfMonth: number;
  pillar: string;
  mixBucket: string;
  seriesKey: string | null;
  topicHint: string;
  status: string;
  dossierId: string | null;
};

type DossierSummary = { toolUrl: string | null; hook: string; title: string };

export type PreviewSlot = {
  slotId: string | null; // mevcut satır (varsa)
  dayOfMonth: number;
  pillar: string;
  mixBucket: string;
  seriesKey: string | null;
  topicHint: string;
  status: string;
};

export type SlotReconcilePlan = {
  toCreate: PlanSlot[];
  toUpdate: Array<{ id: string; slot: PlanSlot }>;
  toSkip: string[]; // status="skipped" yapılacak slot id'leri
  protectedSlots: SlotRow[];
  unchanged: SlotRow[];
  collisions: Array<{ dayOfMonth: number; reason: string }>;
};

// ── Saf: fingerprint ─────────────────────────────────────────────────────────
export function canonicalPlanInput(accountId: string, month: string, input: PlanApplyInput) {
  return {
    accountId,
    month,
    pillars: [...input.pillars].map((p) => p.trim()).sort(),
    postDays: [...new Set(input.postDays)].sort((a, b) => a - b),
    series: [...(input.series ?? [])]
      .map((s) => ({ seriesKey: s.seriesKey, episodesPerMonth: s.episodesPerMonth }))
      .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey)),
    seasonalTopics: [...(input.seasonalTopics ?? [])].map((t) => t.trim()).filter(Boolean).sort(),
  };
}

export function fingerprintPlanInput(accountId: string, month: string, input: PlanApplyInput): string {
  const canonical = canonicalPlanInput(accountId, month, input);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}

// ── Saf: slot reconcile ──────────────────────────────────────────────────────
function isProtected(slot: SlotRow, protectedSlotIds: Set<string>): boolean {
  return (
    (PROTECTED_SLOT_STATUSES as readonly string[]).includes(slot.status) ||
    slot.dossierId !== null ||
    protectedSlotIds.has(slot.id)
  );
}

function slotEquals(row: SlotRow, s: PlanSlot): boolean {
  return (
    row.status === "planned" &&
    row.pillar === s.pillar &&
    row.mixBucket === s.mixBucket &&
    (row.seriesKey ?? null) === (s.seriesKey ?? null) &&
    row.topicHint === s.topicHint
  );
}

/**
 * NON-DESTRUCTIVE reconcile. Assembler slotları (planned/skipped, korunmasız)
 * güne göre eşlenir: aynı günde varsa güncellenir, yoksa oluşturulur; yeni planda
 * olmayan yönetilen "planned" slotlar skipped'e geçer (silinmez). Korunanlar
 * dokunulmaz; korunan günle çakışan yönetilen slot skipped + collision notu.
 */
export function reconcileSlots(
  assembledSlots: PlanSlot[],
  existingSlots: SlotRow[],
  protectedSlotIds: Set<string>
): SlotReconcilePlan {
  const protectedSlots = existingSlots.filter((s) => isProtected(s, protectedSlotIds));
  const managed = existingSlots.filter((s) => !isProtected(s, protectedSlotIds));
  const protectedDays = new Set(protectedSlots.map((s) => s.dayOfMonth));

  const collisions: Array<{ dayOfMonth: number; reason: string }> = [];

  // Yönetilen slotları güne göre indeksle (çoklu ise ilki tutulur, diğerleri skip).
  const managedByDay = new Map<number, SlotRow>();
  const extraManaged: SlotRow[] = [];
  for (const m of managed) {
    if (managedByDay.has(m.dayOfMonth)) {
      extraManaged.push(m);
      collisions.push({ dayOfMonth: m.dayOfMonth, reason: "same_day_duplicate_managed_slot" });
    } else {
      managedByDay.set(m.dayOfMonth, m);
    }
  }

  const toCreate: PlanSlot[] = [];
  const toUpdate: Array<{ id: string; slot: PlanSlot }> = [];
  const unchanged: SlotRow[] = [];
  const toSkip: string[] = [];

  for (const s of assembledSlots) {
    // Assembler zaten korunan günlere slot üretmez; güvenlik için tekrar kontrol.
    if (protectedDays.has(s.dayOfMonth)) {
      collisions.push({ dayOfMonth: s.dayOfMonth, reason: "assembler_day_protected" });
      continue;
    }
    const m = managedByDay.get(s.dayOfMonth);
    if (m) {
      managedByDay.delete(s.dayOfMonth);
      if (slotEquals(m, s)) unchanged.push(m);
      else toUpdate.push({ id: m.id, slot: s });
    } else {
      toCreate.push(s);
    }
  }

  // Kalan yönetilen slotlar (yeni planda yok): planned ise skip; skipped ise bırak.
  for (const m of managedByDay.values()) {
    if (m.status === "planned") toSkip.push(m.id);
  }
  // Aynı-gün fazlalıkları + korunan günle çakışan yönetilen planned slotlar → skip.
  for (const m of extraManaged) {
    if (m.status === "planned") toSkip.push(m.id);
  }
  for (const m of managed) {
    if (m.status === "planned" && protectedDays.has(m.dayOfMonth) && !toSkip.includes(m.id)) {
      toSkip.push(m.id);
      collisions.push({ dayOfMonth: m.dayOfMonth, reason: "managed_slot_on_protected_day" });
    }
  }

  return { toCreate, toUpdate, toSkip, protectedSlots, unchanged, collisions };
}

// ── DB bağlamı ───────────────────────────────────────────────────────────────
function priorMonths(month: string, count: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const zero = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

function toolUrlOf(primaryToolJson: string): string | null {
  try {
    const t = JSON.parse(primaryToolJson) as { url?: string };
    return t.url ?? null;
  } catch {
    return null;
  }
}

export type PlanContext = {
  plan: { id: string; status: string; updatedAt: Date } | null;
  slots: SlotRow[];
  protectedSlotIds: Set<string>;
  dossierBySlot: Map<string, DossierSummary>;
  recentHistory: RepetitionSignal[];
};

export async function loadPlanContext(accountId: string, month: string): Promise<PlanContext> {
  const plan = await prisma.reelPlan.findUnique({
    where: { accountId_month: { accountId, month } },
    select: { id: true, status: true, updatedAt: true },
  });
  const slots: SlotRow[] = plan
    ? (
        await prisma.reelPlanSlot.findMany({
          where: { planId: plan.id },
          select: {
            id: true,
            dayOfMonth: true,
            pillar: true,
            mixBucket: true,
            seriesKey: true,
            topicHint: true,
            status: true,
            dossierId: true,
          },
          orderBy: { dayOfMonth: "asc" },
        })
      ).map((s) => ({ ...s, seriesKey: s.seriesKey ?? null, dossierId: s.dossierId ?? null }))
    : [];

  // Handoff-referanslı slotlar (consumed plan handoff.resultRef) → korunur.
  const slotIds = slots.map((s) => s.id);
  const protectedSlotIds = new Set<string>();
  if (slotIds.length > 0) {
    const handoffs = await prisma.opportunityHandoff.findMany({
      where: { accountId, action: "plan", status: "consumed", resultRef: { in: slotIds } },
      select: { resultRef: true },
    });
    for (const h of handoffs) if (h.resultRef) protectedSlotIds.add(h.resultRef);
  }

  // Bağlı dossier özetleri (tool/hook histogramı + korunan slot zenginliği).
  const dossierIds = slots.map((s) => s.dossierId).filter((x): x is string => Boolean(x));
  const dossierBySlot = new Map<string, DossierSummary>();
  if (dossierIds.length > 0) {
    const dossiers = await prisma.reelDossier.findMany({
      where: { id: { in: dossierIds } },
      select: { id: true, primaryToolJson: true, hook: true, title: true },
    });
    const byId = new Map(dossiers.map((d) => [d.id, d]));
    for (const s of slots) {
      if (s.dossierId && byId.has(s.dossierId)) {
        const d = byId.get(s.dossierId)!;
        dossierBySlot.set(s.id, { toolUrl: toolUrlOf(d.primaryToolJson), hook: d.hook, title: d.title });
      }
    }
  }

  // Yakın geçmiş (önceki aylar) — histogram sinyalleri (bounded).
  const recentHistory: RepetitionSignal[] = [];
  const prevMonths = priorMonths(month, RECENT_MONTHS_LOOKBACK);
  const prevPlans = await prisma.reelPlan.findMany({
    where: { accountId, month: { in: prevMonths } },
    select: { id: true },
  });
  if (prevPlans.length > 0) {
    const prevSlots = await prisma.reelPlanSlot.findMany({
      where: { planId: { in: prevPlans.map((p) => p.id) }, status: { not: "skipped" } },
      select: { pillar: true, seriesKey: true, topicHint: true, dossierId: true },
      take: RECENT_SIGNAL_CAP,
    });
    const prevDossierIds = prevSlots.map((s) => s.dossierId).filter((x): x is string => Boolean(x));
    const prevDossierById = new Map<string, { toolUrl: string | null; hook: string }>();
    if (prevDossierIds.length > 0) {
      const pd = await prisma.reelDossier.findMany({
        where: { id: { in: prevDossierIds } },
        select: { id: true, primaryToolJson: true, hook: true },
      });
      for (const d of pd) prevDossierById.set(d.id, { toolUrl: toolUrlOf(d.primaryToolJson), hook: d.hook });
    }
    for (const s of prevSlots) {
      const dos = s.dossierId ? prevDossierById.get(s.dossierId) : undefined;
      recentHistory.push({
        pillar: s.pillar,
        seriesKey: s.seriesKey ?? null,
        topic: s.topicHint,
        toolUrl: dos?.toolUrl ?? null,
        hookShape: dos?.hook ?? null,
        origin: "history",
      });
    }
  }

  return { plan, slots, protectedSlotIds, dossierBySlot, recentHistory };
}

// ── Seri çözümleme (client truth DEĞİL; DB'den doğrulanır) ───────────────────
export const PLAN_SERIES_FORMATS = ["carousel", "reel", "single"] as const;

export type ResolvedSeries = {
  seriesKey: string;
  pillar: string;
  episodesPerMonth: number;
  displayName: string;
  format: string;
};

export type SeriesResolveResult =
  | { ok: true; series: ResolvedSeries[]; pastTopics: string[]; bannedRepetition: string[] }
  | { ok: false; code: "series_invalid"; message: string; invalid: string[] };

function parseStringArray(raw: string): string[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * İstemciden gelen seri seçimini DB'ye karşı doğrular: seri aynı hesaba ait +
 * aktif olmalı, format Instagram/Reels-uyumlu olmalı, pillar plan pillarlarından
 * biri olmalı. Görünen ad, format, pastTopics ve bannedRepetition DB TRUTH'tan
 * alınır (client override edemez).
 */
export async function resolveSeriesForPlan(
  accountId: string,
  pillars: string[],
  series: Array<{ seriesKey: string; pillar: string; episodesPerMonth: number }>
): Promise<SeriesResolveResult> {
  if (series.length === 0) return { ok: true, series: [], pastTopics: [], bannedRepetition: [] };
  const keys = [...new Set(series.map((s) => s.seriesKey))];
  const profiles = await prisma.seriesProfile.findMany({
    where: { accountId, seriesKey: { in: keys }, isActive: true },
    orderBy: { version: "desc" },
    select: { seriesKey: true, name: true, format: true, pastTopicsJson: true, bannedRepetitionJson: true },
  });
  const byKey = new Map<string, { name: string; format: string; pastTopicsJson: string; bannedRepetitionJson: string }>();
  for (const p of profiles) if (!byKey.has(p.seriesKey)) byKey.set(p.seriesKey, p);

  const invalid: string[] = [];
  const resolved: ResolvedSeries[] = [];
  const pastTopics = new Set<string>();
  const bannedRepetition = new Set<string>();
  const pillarSet = new Set(pillars.map((p) => p.trim()));
  for (const s of series) {
    const prof = byKey.get(s.seriesKey);
    if (!prof) {
      invalid.push(`${s.seriesKey} (aktif seri yok)`);
      continue;
    }
    if (!(PLAN_SERIES_FORMATS as readonly string[]).includes(prof.format)) {
      invalid.push(`${s.seriesKey} (format "${prof.format}" Reels planına uygun değil)`);
      continue;
    }
    if (!pillarSet.has(s.pillar.trim())) {
      invalid.push(`${s.seriesKey} (pillar "${s.pillar}" plan sütunlarından değil)`);
      continue;
    }
    resolved.push({
      seriesKey: s.seriesKey,
      pillar: s.pillar.trim(),
      episodesPerMonth: s.episodesPerMonth,
      displayName: prof.name || s.seriesKey,
      format: prof.format,
    });
    for (const t of parseStringArray(prof.pastTopicsJson)) pastTopics.add(t);
    for (const t of parseStringArray(prof.bannedRepetitionJson)) bannedRepetition.add(t);
  }
  if (invalid.length > 0) {
    return { ok: false, code: "series_invalid", message: "Bazı seriler geçersiz.", invalid };
  }
  return { ok: true, series: resolved, pastTopics: [...pastTopics], bannedRepetition: [...bannedRepetition] };
}

// ── Preview (sıfır write) ────────────────────────────────────────────────────
export type PlanPreview = {
  accountId: string;
  month: string;
  daysInMonth: number;
  config: PlanApplyInput;
  planExists: boolean;
  planStatus: string | null;
  expectedUpdatedAt: string | null;
  fingerprint: string;
  mix: Record<string, number>;
  seriesDistribution: Array<{ seriesKey: string; episodes: number }>;
  slotsAdded: PreviewSlot[];
  slotsUpdated: PreviewSlot[];
  slotsUnchanged: PreviewSlot[];
  slotsProtected: PreviewSlot[];
  slotsSkipped: PreviewSlot[];
  collisions: Array<{ dayOfMonth: number; reason: string }>;
  histogram: ReturnType<typeof assembleMonthlyPlan>["histogram"];
  warnings: string[];
  hardBlockers: string[];
  idempotentNoop: boolean;
};

function protectedSlotInputs(ctx: PlanContext): ProtectedSlotInput[] {
  return ctx.slots
    .filter((s) => isProtected(s, ctx.protectedSlotIds))
    .map((s) => {
      const dos = ctx.dossierBySlot.get(s.id);
      return {
        dayOfMonth: s.dayOfMonth,
        pillar: s.pillar,
        seriesKey: s.seriesKey,
        topic: dos?.title || s.topicHint,
        toolUrl: dos?.toolUrl ?? null,
        hookShape: dos?.hook ?? null,
      };
    });
}

function toPreviewSlot(row: SlotRow): PreviewSlot {
  return {
    slotId: row.id,
    dayOfMonth: row.dayOfMonth,
    pillar: row.pillar,
    mixBucket: row.mixBucket,
    seriesKey: row.seriesKey,
    topicHint: row.topicHint,
    status: row.status,
  };
}
function newPreviewSlot(s: PlanSlot, status: string): PreviewSlot {
  return {
    slotId: null,
    dayOfMonth: s.dayOfMonth,
    pillar: s.pillar,
    mixBucket: s.mixBucket,
    seriesKey: s.seriesKey,
    topicHint: s.topicHint,
    status,
  };
}

function buildPreview(accountId: string, month: string, input: PlanApplyInput, ctx: PlanContext): PlanPreview {
  const assembled = assembleMonthlyPlan({
    month,
    postDays: input.postDays,
    pillars: input.pillars,
    series: input.series,
    seasonalTopics: input.seasonalTopics,
    pastTopics: input.pastTopics,
    bannedRepetition: input.bannedRepetition,
    protectedSlots: protectedSlotInputs(ctx),
    recentHistory: ctx.recentHistory,
  } satisfies PlanInput);

  const reconcile = reconcileSlots(assembled.slots, ctx.slots, ctx.protectedSlotIds);
  const skipSet = new Set(reconcile.toSkip);

  const idempotentNoop =
    reconcile.toCreate.length === 0 && reconcile.toUpdate.length === 0 && reconcile.toSkip.length === 0;

  return {
    accountId,
    month,
    daysInMonth: assembled.daysInMonth,
    config: input,
    planExists: ctx.plan !== null,
    planStatus: ctx.plan?.status ?? null,
    expectedUpdatedAt: ctx.plan?.updatedAt.toISOString() ?? null,
    fingerprint: fingerprintPlanInput(accountId, month, input),
    mix: assembled.mix,
    seriesDistribution: (input.series ?? []).map((s) => ({ seriesKey: s.seriesKey, episodes: s.episodesPerMonth })),
    slotsAdded: reconcile.toCreate.map((s) => newPreviewSlot(s, "planned")),
    slotsUpdated: reconcile.toUpdate.map((u) => newPreviewSlot(u.slot, "planned")),
    slotsUnchanged: reconcile.unchanged.map(toPreviewSlot),
    slotsProtected: reconcile.protectedSlots.map(toPreviewSlot),
    slotsSkipped: ctx.slots.filter((s) => skipSet.has(s.id)).map(toPreviewSlot),
    collisions: reconcile.collisions,
    histogram: assembled.histogram,
    warnings: assembled.warnings,
    hardBlockers: assembled.hardBlockers,
    idempotentNoop,
  };
}

export async function computePlanPreview(input: {
  accountId: string;
  month: string;
  plan: PlanApplyInput;
}): Promise<PlanPreview> {
  const ctx = await loadPlanContext(input.accountId, input.month);
  return buildPreview(input.accountId, input.month, input.plan, ctx);
}

// ── Apply (transactional) ────────────────────────────────────────────────────
export type ApplyError = {
  ok: false;
  code: "stale" | "fingerprint_mismatch" | "hard_blocked" | "archived_plan";
  message: string;
  hardBlockers?: string[];
};

export type ApplyResult =
  | ApplyError
  | {
      ok: true;
      planId: string;
      revision: number;
      idempotent: boolean;
      created: number;
      updated: number;
      skipped: number;
      updatedAt: string;
      warnings: string[];
    };

function histogramSummary(h: PlanPreview["histogram"]) {
  const top = (rec: Record<string, number>) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as Array<[string, number]>;
  return {
    topPillars: top(h.byPillar),
    topTools: top(h.byTool),
    topicClusterCount: h.topicClusters.filter((c) => c.count >= 2).length,
  };
}

export async function applyPlan(input: {
  accountId: string;
  month: string;
  plan: PlanApplyInput;
  expectedUpdatedAt: string | null;
  fingerprint: string;
  nowIso: string;
  source?: string;
}): Promise<ApplyResult> {
  // Fingerprint bütünlüğü: preview'daki girdiyle apply girdisi aynı olmalı.
  const recomputed = fingerprintPlanInput(input.accountId, input.month, input.plan);
  if (recomputed !== input.fingerprint) {
    return {
      ok: false,
      code: "fingerprint_mismatch",
      message: "Önizleme ile uygulanan plan farklı — yeniden önizle.",
    };
  }

  const ctx = await loadPlanContext(input.accountId, input.month);

  // Optimistic concurrency (tx dışı ön-kontrol; tx içinde tekrar doğrulanır).
  const expected = input.expectedUpdatedAt ? Date.parse(input.expectedUpdatedAt) : null;
  if (ctx.plan) {
    if (expected === null || !Number.isFinite(expected) || expected !== ctx.plan.updatedAt.getTime()) {
      return { ok: false, code: "stale", message: "Plan bu arada değişti — yeniden önizle." };
    }
    if (ctx.plan.status === "archived") {
      return {
        ok: false,
        code: "archived_plan",
        message: "Arşivli plana uygulanamaz — önce taslağa geri al (aktive/restore).",
      };
    }
  } else if (expected !== null) {
    return { ok: false, code: "stale", message: "Plan bu arada oluşturuldu — yeniden önizle." };
  }

  const preview = buildPreview(input.accountId, input.month, input.plan, ctx);
  if (preview.hardBlockers.length > 0) {
    return {
      ok: false,
      code: "hard_blocked",
      message: "Plan hard blocker içeriyor — uygulanamaz.",
      hardBlockers: preview.hardBlockers,
    };
  }

  const assembled = assembleMonthlyPlan({
    month: input.month,
    postDays: input.plan.postDays,
    pillars: input.plan.pillars,
    series: input.plan.series,
    seasonalTopics: input.plan.seasonalTopics,
    pastTopics: input.plan.pastTopics,
    bannedRepetition: input.plan.bannedRepetition,
    protectedSlots: protectedSlotInputs(ctx),
    recentHistory: ctx.recentHistory,
  });

  const prevRevision = ctx.plan
    ? parsePlanNotes(
        (await prisma.reelPlan.findUnique({ where: { id: ctx.plan.id }, select: { notesJson: true } }))?.notesJson
      ).envelope?.revision ?? 0
    : 0;

  const envelope: PlanNotesEnvelope = {
    schemaVersion: PLAN_NOTES_VERSION,
    revision: prevRevision + 1,
    fingerprint: input.fingerprint,
    input: {
      pillars: input.plan.pillars,
      postDays: [...new Set(input.plan.postDays)].sort((a, b) => a - b),
      seriesKeys: (input.plan.series ?? []).map((s) => s.seriesKey),
      seasonalTopicsCount: (input.plan.seasonalTopics ?? []).length,
    },
    warnings: assembled.warnings,
    hardBlockers: assembled.hardBlockers,
    histogram: histogramSummary(assembled.histogram),
    appliedAt: input.nowIso,
    source: input.source ?? "operator_apply",
    method: "assembler.v2",
  };

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"reel_plan:" + input.accountId + ":" + input.month}))`;

    // Plan upsert (create ilk apply'da; update mevcut).
    let planId: string;
    if (ctx.plan) {
      const fresh = await tx.reelPlan.findUnique({
        where: { id: ctx.plan.id },
        select: { id: true, updatedAt: true, status: true },
      });
      if (!fresh) return { stale: true as const };
      if (fresh.updatedAt.getTime() !== expected) return { stale: true as const };
      if (fresh.status === "archived") return { archived: true as const };
      planId = fresh.id;
    } else {
      const created = await tx.reelPlan.create({
        data: {
          accountId: input.accountId,
          month: input.month,
          status: "draft",
          mixJson: JSON.stringify(assembled.mix),
          notesJson: serializePlanNotes(envelope),
        },
        select: { id: true },
      });
      planId = created.id;
    }

    // Fresh slotlarla reconcile'ı TX İÇİNDE yeniden hesapla (yarış koruması).
    const freshSlots: SlotRow[] = (
      await tx.reelPlanSlot.findMany({
        where: { planId },
        select: {
          id: true,
          dayOfMonth: true,
          pillar: true,
          mixBucket: true,
          seriesKey: true,
          topicHint: true,
          status: true,
          dossierId: true,
        },
      })
    ).map((s) => ({ ...s, seriesKey: s.seriesKey ?? null, dossierId: s.dossierId ?? null }));

    const reconcile = reconcileSlots(assembled.slots, freshSlots, ctx.protectedSlotIds);

    const idempotent =
      reconcile.toCreate.length === 0 && reconcile.toUpdate.length === 0 && reconcile.toSkip.length === 0;

    if (reconcile.toCreate.length > 0) {
      await tx.reelPlanSlot.createMany({
        data: reconcile.toCreate.map((s) => ({
          planId,
          dayOfMonth: s.dayOfMonth,
          pillar: s.pillar,
          mixBucket: s.mixBucket,
          seriesKey: s.seriesKey,
          topicHint: s.topicHint,
          status: "planned",
        })),
      });
    }
    for (const u of reconcile.toUpdate) {
      await tx.reelPlanSlot.update({
        where: { id: u.id },
        data: {
          pillar: u.slot.pillar,
          mixBucket: u.slot.mixBucket,
          seriesKey: u.slot.seriesKey,
          topicHint: u.slot.topicHint,
          status: "planned",
        },
      });
    }
    if (reconcile.toSkip.length > 0) {
      await tx.reelPlanSlot.updateMany({
        where: { id: { in: reconcile.toSkip } },
        data: { status: "skipped" },
      });
    }

    // İdempotent no-op: revision bump YOK, mix/notes yalnız ilk oluşturmada.
    const updated = idempotent && ctx.plan
      ? await tx.reelPlan.update({ where: { id: planId }, data: {}, select: { updatedAt: true } })
      : await tx.reelPlan.update({
          where: { id: planId },
          data: { mixJson: JSON.stringify(assembled.mix), notesJson: serializePlanNotes(envelope) },
          select: { updatedAt: true },
        });

    return {
      planId,
      idempotent,
      created: reconcile.toCreate.length,
      updated: reconcile.toUpdate.length,
      skipped: reconcile.toSkip.length,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });

  if ("stale" in result) return { ok: false, code: "stale", message: "Plan bu arada değişti — yeniden önizle." };
  if ("archived" in result)
    return { ok: false, code: "archived_plan", message: "Arşivli plana uygulanamaz — önce taslağa geri al." };

  return {
    ok: true,
    planId: result.planId,
    revision: result.idempotent ? prevRevision : envelope.revision,
    idempotent: result.idempotent,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    updatedAt: result.updatedAt,
    warnings: assembled.warnings,
  };
}

// ── Lifecycle (draft/active/archived) ────────────────────────────────────────
export type PlanStatus = "draft" | "active" | "archived";
export const PLAN_STATUS_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: ["active", "archived"],
  active: ["archived", "draft"],
  archived: ["active", "draft"],
};

export type LifecycleError = {
  ok: false;
  code: "not_found" | "stale" | "invalid_transition" | "ack_required";
  message: string;
};

export type LifecycleResult =
  | LifecycleError
  | { ok: true; status: PlanStatus; updatedAt: string };

export function isValidTransition(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionPlanStatus(input: {
  accountId: string;
  month: string;
  target: PlanStatus;
  expectedUpdatedAt: string;
  /** draft→active geçişinde uyarı varsa açık onay gerekir. */
  acknowledgeWarnings?: boolean;
}): Promise<LifecycleResult> {
  const plan = await prisma.reelPlan.findUnique({
    where: { accountId_month: { accountId: input.accountId, month: input.month } },
    select: { id: true, status: true, updatedAt: true, notesJson: true },
  });
  if (!plan) return { ok: false, code: "not_found", message: "Plan bulunamadı." };

  const from = plan.status as PlanStatus;
  if (from === input.target) {
    return { ok: false, code: "invalid_transition", message: `Plan zaten "${input.target}".` };
  }
  if (!isValidTransition(from, input.target)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `Geçersiz geçiş: ${from} → ${input.target}.`,
    };
  }

  // Aktivasyon: uyarı varsa açık onay şart (sessiz aktivasyon yok).
  if (input.target === "active") {
    const warnings = parsePlanNotes(plan.notesJson).warnings;
    if (warnings.length > 0 && !input.acknowledgeWarnings) {
      return {
        ok: false,
        code: "ack_required",
        message: "Plan uyarı içeriyor — aktive etmek için uyarıları onayla.",
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"reel_plan:" + input.accountId + ":" + input.month}))`;
    const fresh = await tx.reelPlan.findUnique({ where: { id: plan.id }, select: { updatedAt: true, status: true } });
    if (!fresh) return { stale: true as const };
    const expected = Date.parse(input.expectedUpdatedAt);
    if (!Number.isFinite(expected) || fresh.updatedAt.getTime() !== expected) return { stale: true as const };
    // TX içinde geçiş yeniden doğrulanır (yarış).
    if (!isValidTransition(fresh.status as PlanStatus, input.target)) return { invalid: true as const };
    const updated = await tx.reelPlan.update({
      where: { id: plan.id },
      data: { status: input.target },
      select: { status: true, updatedAt: true },
    });
    return { status: updated.status as PlanStatus, updatedAt: updated.updatedAt.toISOString() };
  });

  if ("stale" in result) return { ok: false, code: "stale", message: "Plan bu arada değişti — yenile." };
  if ("invalid" in result)
    return { ok: false, code: "invalid_transition", message: "Plan durumu bu arada değişti — yenile." };
  return { ok: true, status: result.status, updatedAt: result.updatedAt };
}
