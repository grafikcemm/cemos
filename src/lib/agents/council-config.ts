import { accountProfiles, type AccountHandle } from "@/lib/accounts";

/**
 * Subagent specs as DATA (Faz G). Councils and generation pipelines are
 * described declaratively here; thin runners in council.ts / pipeline-runner.ts
 * execute them. Prompts are BUILDER CLOSURES (not static strings) because every
 * prompt interpolates runtime context (handle/persona/prior output) — this is
 * what lets the refactor stay byte-identical to the hand-written versions.
 */

// --- Council (multi-lens judging) --------------------------------------------

export type LensSpec = {
  lens: string;
  weight: number;
  defaultScore: number;
  /** Per-lens instruction; interpolates the account profile. */
  buildInstruction: (handle: string) => string;
};

export type CouncilSpec = {
  id: string;
  lenses: LensSpec[];
  /** synthesize() verdict thresholds. */
  strongAt: number;
  maybeAt: number;
};

/**
 * The original 4-lens X council, verbatim. "risk" reports SAFETY (100 = safe),
 * so high is always good. Weights 0.3/0.3/0.2/0.2, neutral fail-open defaults.
 */
export const X_COUNCIL_SPEC: CouncilSpec = {
  id: "x_council",
  strongAt: 70,
  maybeAt: 45,
  lenses: [
    {
      lens: "hook",
      weight: 0.3,
      defaultScore: 55,
      buildInstruction: (handle) =>
        `Bu içerik @${handle} için ne kadar güçlü bir HOOK/viral potansiyel taşıyor? (0=zayıf, 100=patlama). Tek cümle gerekçe.`,
    },
    {
      lens: "persona",
      weight: 0.3,
      defaultScore: 55,
      buildInstruction: (handle) => {
        // Tohumlu hesapta bootstrap persona metni; yeni DB hesabında başka
        // hesabın personasına DÜŞMEDEN jenerik hesap-sesi sorusu sorulur.
        const p = accountProfiles[handle as AccountHandle];
        return p
          ? `Bu içerik @${handle} personasına ("${p.persona}", konsept: ${p.concept}) ne kadar uyuyor? (0=alakasız, 100=tam ses). Tek cümle gerekçe.`
          : `Bu içerik @${handle} hesabının kendi sesine ve konseptine ne kadar uyuyor? (0=alakasız, 100=tam ses). Tek cümle gerekçe.`;
      },
    },
    {
      lens: "risk",
      weight: 0.2,
      defaultScore: 70,
      buildInstruction: (handle) =>
        `Bu içeriğe dayalı bir tweet @${handle} için ne kadar GÜVENLİ? (100=tamamen güvenli, 0=hakaret/iftira/asılsız iddia riski yüksek). Tek cümle gerekçe.`,
    },
    {
      lens: "novelty",
      weight: 0.2,
      defaultScore: 55,
      buildInstruction: () =>
        `Bu içerik ne kadar ÖZGÜN/taze/zamanlı? (0=bayat klişe, 100=yeni ve dikkat çekici). Tek cümle gerekçe.`,
    },
  ],
};
