import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { accountProfiles } from "../src/lib/accounts";

const prisma = new PrismaClient();

const defaultSources = [
  // grafikcem
  { handle: "ozansihay", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "hrrcnes", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "ozcnkrtn", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "viktoroddy", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "vibeeval", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "Techburhan", displayName: "Techburhan", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "kadiruludag", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "buzzicra", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "Aykutuces", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "rowancheung", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "sama", displayName: "Sam Altman", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  // maskulenkod — HİBRİT: disiplin/sistem/sosyal güç önce; cinsiyet-realizmi (redpill) dengeli yan eksen (yüksek eşik = daha az gürültü).
  { handle: "naval", displayName: "Naval", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "JockoWillink", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "JamesClear", displayName: "James Clear", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "AndyFrisella", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "maskuleninsan", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "maskulenkod" },
  { handle: "enkijust", mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "maskulenkod" },
  // cinsiyet-realizmi kaynakları (daha yüksek eşik → ton dengesi generation forbidden ile korunur)
  { handle: "bayredpill", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "maskulenkod" },
  { handle: "klaus0035", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "maskulenkod" },
];

const scheduleDefaults: Record<string, "daily" | "monday"> = {
  grafikcem: "daily",
  maskulenkod: "daily",

};

async function main() {
  for (const profile of Object.values(accountProfiles)) {
    const account = await prisma.account.upsert({
      where: { handle: profile.handle },
      create: {
        handle: profile.handle,
        xHandle: profile.xHandle,
        persona: profile.persona,
        concept: profile.concept,
        maxChars: profile.maxChars,
      },
      update: {
        xHandle: profile.xHandle,
        persona: profile.persona,
        concept: profile.concept,
        maxChars: profile.maxChars,
      },
    });

    await prisma.styleProfile.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        toneRules: JSON.stringify(profile.toneRules),
        formatRules: JSON.stringify(profile.formatRules),
        forbiddenRules: JSON.stringify(profile.forbiddenRules),
        modes: JSON.stringify(profile.modes),
      },
      update: {
        toneRules: JSON.stringify(profile.toneRules),
        formatRules: JSON.stringify(profile.formatRules),
        forbiddenRules: JSON.stringify(profile.forbiddenRules),
        modes: JSON.stringify(profile.modes),
      },
    });

    await prisma.schedule.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        cadence: scheduleDefaults[profile.handle] ?? "daily",
        dailyMaxPosts: 1,
        requireApproval: true,
        automationEnabled: true,
      },
      update: {
        dailyMaxPosts: 1,
        requireApproval: true,
        automationEnabled: true,
        cadence: scheduleDefaults[profile.handle] ?? "daily",
      },
    });

    const channelSources = defaultSources.filter((s) => s.channel === profile.handle);
    for (const src of channelSources) {
      await prisma.source.upsert({
        where: { accountId_handle: { accountId: account.id, handle: src.handle } },
        create: {
          accountId: account.id,
          handle: src.handle,
          displayName: (src as { displayName?: string }).displayName,
          mode: src.mode,
          thresholdLikes: src.thresholdLikes,
          thresholdRetweets: src.thresholdRetweets,
        },
        update: {
          thresholdLikes: src.thresholdLikes,
          thresholdRetweets: src.thresholdRetweets,
        },
      });
    }

    console.log(`Seeded: ${profile.handle} (${channelSources.length} sources)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
