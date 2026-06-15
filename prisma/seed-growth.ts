/**
 * Growth Engine seed — run manually:
 *   npx ts-node --project tsconfig.json prisma/seed-growth.ts
 * Does NOT run automatically. Requires the 3 accounts to exist first.
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const handles = ["grafikcem", "maskulenkod"];
  const accounts = await prisma.account.findMany({
    where: { handle: { in: handles } },
  });

  if (accounts.length === 0) {
    console.error("No accounts found. Run the main seed first.");
    process.exit(1);
  }

  for (const account of accounts) {
    console.log(`Seeding growth data for @${account.handle}...`);

    await prisma.viralPattern.createMany({
      skipDuplicates: true,
      data: [
        {
          accountId: account.id,
          patternName: "Provocative Question Hook",
          category: "hook",
          hookType: "question",
          structureJson: JSON.stringify({ opener: "question", body: "contrast", close: "cta" }),
          emotion: "curiosity",
          viralityTrigger: "open_loop",
          exampleGood: "Why does everyone get this wrong?",
          exampleBad: "Here are some tips.",
          usageCount: 0,
          successScore: 50,
          isActive: true,
          updatedAt: new Date(),
        },
        {
          accountId: account.id,
          patternName: "Counterintuitive Statement",
          category: "hook",
          hookType: "statement",
          structureJson: JSON.stringify({ opener: "bold_claim", body: "proof", close: "lesson" }),
          emotion: "surprise",
          viralityTrigger: "pattern_interrupt",
          exampleGood: "Working harder is making you worse.",
          exampleBad: "Hard work is important.",
          usageCount: 0,
          successScore: 50,
          isActive: true,
          updatedAt: new Date(),
        },
      ],
    });

    await prisma.trainingExample.createMany({
      skipDuplicates: true,
      data: [
        {
          accountId: account.id,
          inputType: "source_tweet",
          sourceContent: "Example viral source tweet",
          outputContent: "Derived insight tweet for @" + account.handle,
          label: "good",
          reason: "High engagement, clear hook",
          metricsJson: JSON.stringify({ likes: 0, retweets: 0 }),
        },
      ],
    });

    await prisma.evalTest.createMany({
      skipDuplicates: true,
      data: [
        {
          accountId: account.id,
          testName: "Hook quality baseline",
          sourceContent: "AI model releases major update",
          expectedBehavior: "Should produce a tweet with a strong hook and no generic phrases",
          generatedOutput: "",
          updatedAt: new Date(),
        },
      ],
    });
  }

  console.log("Growth Engine seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
