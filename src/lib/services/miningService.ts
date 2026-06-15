import { prisma } from "@/lib/db/client";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { deliberate } from "@/lib/agents/council";
import { analyzeViralItem } from "@/lib/growth-engine/viral-analysis";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";

const COUNCIL_FLOOR = 45; // below this the council says "weak" → skip mining

export type MiningVerdict = {
  sourcePostId: string;
  sourceType: string;
  score: number;
  verdict: string;
  rationale: string;
};

export type MiningSummary = {
  handle: AccountHandle;
  considered: number;
  deliberated: number;
  mined: number;
  skipped: number;
  errors: number;
  verdicts: MiningVerdict[];
};

export const miningService = {
  /**
   * The deliberation + mining core. Picks the highest-opportunity un-mined
   * SourcePosts, runs the council on each, and for survivors runs örn1 deep
   * analysis and persists a ViralPattern + an EMBEDDED TrainingExample (closing
   * the vector-memory persist gap). Marks mined posts so they are not re-mined.
   */
  async mineTopItems(handle: AccountHandle, limit = 5): Promise<MiningSummary> {
    const profile = accountProfiles[handle];
    if (!profile) throw new Error(`Profile not found: ${handle}`);
    const account = await prisma.account.findUnique({ where: { handle } });
    if (!account) throw new Error(`Account not found: ${handle}`);

    const candidates = await prisma.sourcePost.findMany({
      where: { accountId: account.id, status: { in: ["new", "scored"] } },
      orderBy: [{ opportunityScore: "desc" }, { viralScore: "desc" }],
      take: limit * 3,
    });

    const summary: MiningSummary = {
      handle,
      considered: candidates.length,
      deliberated: 0,
      mined: 0,
      skipped: 0,
      errors: 0,
      verdicts: [],
    };

    for (const post of candidates) {
      if (summary.mined >= limit) break;
      summary.deliberated++;

      const verdict = await deliberate(post.text, handle);
      summary.verdicts.push({
        sourcePostId: post.id,
        sourceType: post.sourceType ?? "x",
        score: verdict.score,
        verdict: verdict.verdict,
        rationale: verdict.rationale,
      });

      if (verdict.score < COUNCIL_FLOOR) {
        summary.skipped++;
        await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "scored" } }).catch(() => {});
        continue;
      }

      try {
        const analysis = await analyzeViralItem(post.text, handle);
        const pattern = await viralPatternRepo.createMined({
          accountId: account.id,
          patternName: analysis.hook || analysis.summary.slice(0, 60),
          category: post.sourceType ?? "x",
          hookType: analysis.structure,
          structure: {
            hook: analysis.hook,
            structure: analysis.structure,
            keyArguments: analysis.keyArguments,
            councilRationale: verdict.rationale,
            councilLenses: verdict.lenses,
          },
          emotion: analysis.emotion,
          viralityTrigger: analysis.viralityReason,
          exampleGood: post.text.slice(0, 280),
          successScore: Math.round((verdict.score + analysis.audienceInterest * 10) / 2),
          trendingPotential: analysis.trendingPotential * 10,
          audienceInterest: analysis.audienceInterest * 10,
          newsValue: analysis.newsValue * 10,
          angleSuggestions: analysis.angleSuggestions,
          sourcePostId: post.id,
          sourceType: post.sourceType ?? "x",
        });

        // Embedded training example → populates vector memory (the persist gap fix).
        const example = await trainingExampleRepo.create({
          accountId: account.id,
          inputType: "viral_pattern",
          sourceContent: post.text.slice(0, 500),
          outputContent: analysis.hook || analysis.summary,
          label: "pattern",
          reason: `external_viral ${post.sourceType ?? "x"} pattern:${pattern.id}`,
          metricsJson: {
            councilScore: verdict.score,
            trendingPotential: analysis.trendingPotential,
            audienceInterest: analysis.audienceInterest,
          },
        });
        await embedTrainingExample(example.id).catch(() => {}); // best-effort

        await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "mined" } });
        summary.mined++;
      } catch {
        summary.errors++;
        await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "error" } }).catch(() => {});
      }
    }

    return summary;
  },
};
