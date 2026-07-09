import { prisma } from "@/lib/db/client";
import type { ViralPattern } from "@/generated/prisma/client";
import {
  CreateViralPatternSchema,
  UpdateViralPatternSchema,
  type CreateViralPatternInput,
  type UpdateViralPatternInput,
  safeJsonStringify,
  safeJsonParse,
} from "@/lib/growth-engine/types";
import { deriveViralPlatform } from "@/lib/db/platformDerive";

function serializeInput(input: CreateViralPatternInput) {
  return {
    ...input,
    structureJson: input.structureJson ? safeJsonStringify(input.structureJson) : "{}",
  };
}

export type ViralPatternWithParsed = Omit<ViralPattern, "structureJson"> & {
  structureJson: Record<string, unknown>;
};

function parse(vp: ViralPattern): ViralPatternWithParsed {
  return {
    ...vp,
    structureJson: safeJsonParse(vp.structureJson, {}),
  };
}

export type CreateMinedPatternInput = {
  accountId: string;
  patternName: string;
  category?: string;
  hookType?: string;
  structure?: Record<string, unknown>;
  emotion?: string;
  viralityTrigger?: string;
  exampleGood?: string;
  successScore?: number;
  trendingPotential?: number;
  audienceInterest?: number;
  newsValue?: number;
  angleSuggestions?: string[];
  sourcePostId?: string;
  sourceType?: string;
  platform?: string;
};

export const viralPatternRepo = {
  create(raw: CreateViralPatternInput): Promise<ViralPattern> {
    const input = CreateViralPatternSchema.parse(raw);
    return prisma.viralPattern.create({ data: serializeInput(input) });
  },

  /**
   * Direct create for mined EXTERNAL viral patterns (Phase 2). Bypasses the
   * public Zod schema so the örn1 deep-analysis fields (trendingPotential,
   * audienceInterest, newsValue, angleSuggestions, provenance) are persisted.
   */
  createMined(data: CreateMinedPatternInput): Promise<ViralPattern> {
    return prisma.viralPattern.create({
      data: {
        accountId: data.accountId,
        patternName: data.patternName.slice(0, 120),
        category: data.category,
        hookType: data.hookType,
        structureJson: safeJsonStringify(data.structure ?? {}),
        emotion: data.emotion ?? "",
        viralityTrigger: data.viralityTrigger ?? "",
        exampleGood: data.exampleGood ?? "",
        successScore: data.successScore ?? 55,
        trendingPotential: data.trendingPotential ?? 0,
        audienceInterest: data.audienceInterest ?? 0,
        newsValue: data.newsValue ?? 0,
        angleSuggestionsJson: safeJsonStringify(data.angleSuggestions ?? []),
        sourcePostId: data.sourcePostId,
        sourceType: data.sourceType,
        platform: data.platform ?? deriveViralPlatform(data.sourceType),
      },
    });
  },

  listByAccount(accountId: string, onlyActive = true): Promise<ViralPatternWithParsed[]> {
    return prisma.viralPattern
      .findMany({
        where: { accountId, ...(onlyActive ? { isActive: true } : {}) },
        orderBy: { successScore: "desc" },
      })
      .then((rows) => rows.map(parse));
  },

  findById(id: string): Promise<ViralPatternWithParsed | null> {
    return prisma.viralPattern.findUnique({ where: { id } }).then((vp) => (vp ? parse(vp) : null));
  },

  update(id: string, raw: UpdateViralPatternInput): Promise<ViralPattern> {
    const input = UpdateViralPatternSchema.parse(raw);
    const data: Record<string, unknown> = { ...input };
    if (input.structureJson !== undefined) {
      data.structureJson = safeJsonStringify(input.structureJson);
    }
    return prisma.viralPattern.update({ where: { id }, data });
  },

  incrementUsage(id: string): Promise<ViralPattern> {
    return prisma.viralPattern.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  },

  /**
   * Engagement learning: nudge a pattern's successScore by real post
   * performance, clamped to [10, 95] so no pattern is ever fully killed or
   * deified by a single viral/flop post. No-throw on missing ids.
   */
  async adjustSuccessScore(id: string, delta: number): Promise<ViralPattern | null> {
    try {
      const existing = await prisma.viralPattern.findUnique({ where: { id } });
      if (!existing) return null;
      const next = Math.max(10, Math.min(95, existing.successScore + delta));
      return await prisma.viralPattern.update({
        where: { id },
        data: { successScore: next },
      });
    } catch (err) {
      console.error("ViralPattern successScore güncellenirken hata oluştu:", err);
      return null;
    }
  },

  /**
   * lessonGate promotion (Sprint 9): mark a candidate pattern as VALIDATED once
   * it cleared the two-gate (repetition + significance) + brand veto. Idempotent
   * and no-throw — a re-run on an already-validated pattern just refreshes
   * validatedSupport. Only patternPromotionService should call this.
   */
  async markValidated(id: string, support: number): Promise<ViralPattern | null> {
    try {
      return await prisma.viralPattern.update({
        where: { id },
        data: { validatedAt: new Date(), validatedSupport: support },
      });
    } catch (err) {
      console.error("ViralPattern validatedAt yazılırken hata oluştu:", err);
      return null;
    }
  },

  deactivate(id: string): Promise<ViralPattern> {
    return prisma.viralPattern.update({ where: { id }, data: { isActive: false } });
  },
};
