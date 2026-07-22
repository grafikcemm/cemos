import { prisma } from "@/lib/db/client";
import type { VoiceProfile, VisualStyleProfile } from "@/generated/prisma/client";

// Voice + Visual identity deposu (Faz CI-4). Hardcoded prompts.ts → DB profilleri.
// Array alanlar JSON String olarak tutulur; servis katmanı parse eder.

export const voiceProfileRepo = {
  listVoice(accountId: string): Promise<VoiceProfile[]> {
    return prisma.voiceProfile.findMany({
      where: { accountId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  },

  getActiveVoice(accountId: string): Promise<VoiceProfile | null> {
    return prisma.voiceProfile.findFirst({
      where: { accountId, isActive: true },
      orderBy: { version: "desc" },
    });
  },

  createVoice(input: {
    accountId: string;
    name?: string;
    mission?: string;
    pointOfView?: string;
    coreIdeas?: string[];
    audience?: string;
    personality?: string;
    vocabulary?: string[];
    toneTags?: string[];
    rhythm?: string;
    formatHabits?: string[];
    preferred?: string[];
    avoid?: string[];
    anchorStories?: string;
    writingSamples?: string;
    notes?: string;
    mode?: string;
    sourceAttribution?: string;
  }): Promise<VoiceProfile> {
    return prisma.voiceProfile.create({
      data: {
        accountId: input.accountId,
        name: input.name ?? "default",
        mission: input.mission ?? "",
        pointOfView: input.pointOfView ?? "",
        coreIdeasJson: JSON.stringify(input.coreIdeas ?? []),
        audience: input.audience ?? "",
        personality: input.personality ?? "",
        vocabularyJson: JSON.stringify(input.vocabulary ?? []),
        toneTagsJson: JSON.stringify(input.toneTags ?? []),
        rhythm: input.rhythm ?? "",
        formatHabitsJson: JSON.stringify(input.formatHabits ?? []),
        preferredJson: JSON.stringify(input.preferred ?? []),
        avoidJson: JSON.stringify(input.avoid ?? []),
        anchorStories: input.anchorStories ?? "",
        writingSamples: input.writingSamples ?? "",
        notes: input.notes ?? "",
        mode: input.mode ?? "personal",
        sourceAttribution: input.sourceAttribution ?? "",
      },
    });
  },

  listVisual(accountId: string): Promise<VisualStyleProfile[]> {
    return prisma.visualStyleProfile.findMany({
      where: { accountId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  },

  createVisual(input: {
    accountId: string;
    name?: string;
    brandColors?: string[];
    typography?: string;
    layoutPatterns?: string[];
    aspectRatios?: string[];
    textDensity?: string;
    headlineLength?: string;
    imageStyle?: string;
    motifs?: string[];
    ctaStyle?: string;
    forbidden?: string[];
    references?: string[];
  }): Promise<VisualStyleProfile> {
    return prisma.visualStyleProfile.create({
      data: {
        accountId: input.accountId,
        name: input.name ?? "default",
        brandColorsJson: JSON.stringify(input.brandColors ?? []),
        typography: input.typography ?? "",
        layoutPatternsJson: JSON.stringify(input.layoutPatterns ?? []),
        aspectRatiosJson: JSON.stringify(input.aspectRatios ?? []),
        textDensity: input.textDensity ?? "",
        headlineLength: input.headlineLength ?? "",
        imageStyle: input.imageStyle ?? "",
        motifsJson: JSON.stringify(input.motifs ?? []),
        ctaStyle: input.ctaStyle ?? "",
        forbiddenJson: JSON.stringify(input.forbidden ?? []),
        referencesJson: JSON.stringify(input.references ?? []),
      },
    });
  },

  /** Bir hesap için zaten voice var mı (seed idempotency). */
  async hasVoice(accountId: string): Promise<boolean> {
    const count = await prisma.voiceProfile.count({ where: { accountId } });
    return count > 0;
  },
};
