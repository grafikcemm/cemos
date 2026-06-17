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

  // ── grafikcem güçlendirme: tasarım / UI-UX ────────────────────────────────
  { handle: "adamwathan", displayName: "Adam Wathan (Tailwind)", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "steveschoger", displayName: "Steve Schoger (Refactoring UI)", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "grafikcem" },
  { handle: "shadcn", displayName: "shadcn", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "rauchg", displayName: "Guillermo Rauch (Vercel)", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "leeerob", displayName: "Lee Robinson", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "grafikcem" },
  { handle: "addyosmani", displayName: "Addy Osmani", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "JackButcher", displayName: "Jack Butcher (Visualize Value)", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "visualizevalue", displayName: "Visualize Value", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "grafikcem" },
  { handle: "figma", displayName: "Figma", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },

  // ── grafikcem güçlendirme: AI görsel / video / haber ──────────────────────
  { handle: "minchoi", displayName: "Min Choi", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "mreflow", displayName: "Matt Wolfe", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "heyBarsee", displayName: "Barsee", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "grafikcem" },
  { handle: "nickfloats", displayName: "Nick St. Pierre", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "grafikcem" },
  { handle: "DrJimFan", displayName: "Jim Fan", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "emollick", displayName: "Ethan Mollick", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "AnthropicAI", displayName: "Anthropic", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "OpenAI", displayName: "OpenAI", mode: "TWEET", thresholdLikes: 200, thresholdRetweets: 40, channel: "grafikcem" },
  { handle: "midjourney", displayName: "Midjourney", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "runwayml", displayName: "Runway", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },

  // ── grafikcem güçlendirme: içerik / sosyal medya büyüme ───────────────────
  { handle: "thejustinwelsh", displayName: "Justin Welsh", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "dickiebush", displayName: "Dickie Bush", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "Nicolascole77", displayName: "Nicolas Cole", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "levelsio", displayName: "Pieter Levels", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "garrytan", displayName: "Garry Tan", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },

  // ── maskulenkod güçlendirme: disiplin / mindset / self-dev ────────────────
  { handle: "hubermanlab", displayName: "Andrew Huberman", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "AlexHormozi", displayName: "Alex Hormozi", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "EdMylett", displayName: "Ed Mylett", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "RobertGreene", displayName: "Robert Greene", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "DavidGoggins", displayName: "David Goggins", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "TheStoicEmperor", displayName: "The Stoic Emperor", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "maskulenkod" },
  { handle: "OrangeBook_", displayName: "Orange Book", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "maskulenkod" },
  { handle: "thedankoe", displayName: "Dan Koe", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "ShaanVP", displayName: "Shaan Puri", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "gregisenberg", displayName: "Greg Isenberg", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "Codie_Sanchez", displayName: "Codie Sanchez", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "dvassallo", displayName: "Daniel Vassallo", mode: "TWEET", thresholdLikes: 50, thresholdRetweets: 8, channel: "maskulenkod" },
  { handle: "thesamparr", displayName: "Sam Parr", mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
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
