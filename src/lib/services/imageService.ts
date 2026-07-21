import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { usageService } from "@/lib/services/usageService";
import { getFalBudgetStatus } from "@/lib/config/costGate";
import { getCostLimits } from "@/lib/config/costLimits";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { redactError } from "@/lib/utils/redactSecrets";

/**
 * fal.ai image-generation engine (Nano Banana Pro / NB2 by default).
 *
 * Credit discipline (per operator decision):
 * - grafikcem  → manual only: an image is produced when the operator clicks the
 *   button on a specific draft. Never automatic.
 * - maskulenkod → every PUBLISHED tweet gets a topic-relevant image, generated at
 *   publish time (see publishService) so rejected drafts never burn credits.
 *
 * Waste guards, every path:
 * - dedupe: never regenerate when generatedImageUrl already exists (unless force).
 * - fal budget gate: hard-stop at the separate monthly fal budget ($10 default).
 * - fail-open: any provider/network error returns the prompt only, never throws.
 */

export type GenerateImageResult = {
  ok: boolean;
  generatedImageUrl: string | null;
  imagePrompt: string;
  provider: "fal" | "none";
  reused: boolean;
  blocked?: "budget" | "not_configured";
  costUsd: number;
};

type FalResult = { images?: Array<{ url?: string }> };

/** Build a tight, topic-relevant prompt per account from the draft text. */
function buildImagePrompt(handle: AccountHandle, draftText: string): string {
  const concept = accountProfiles[handle]?.concept ?? accountProfiles.grafikcem.concept;
  const cleaned = draftText.replace(/\s+/g, " ").trim().slice(0, 400);

  if (handle === "maskulenkod") {
    return [
      "Bold, cinematic visual for a Turkish masculinity/discipline X account (maskulenkod).",
      `Account concept: ${concept}`,
      `Post context: "${cleaned}"`,
      "Style: dark, high-contrast, disciplined and stoic mood; strong geometric composition,",
      "single cold accent (steel blue var(--status-info)) on near-black; editorial, no faces, no text,",
      "no motivational-poster cliché, no stock photo look, sharp focus.",
      "FULL-BLEED 1:1 square that fills the ENTIRE 1080x1080 frame edge-to-edge;",
      "absolutely no white border, no margins, no passe-partout, no frame, no mockup,",
      "no poster-on-wall look, no drop shadow around the artwork — the design bleeds to all four edges.",
    ].join(" ");
  }

  // grafikcem (default): AI/design creator visual.
  return [
    "High-quality social media visual for a Turkish AI/design creator account (grafikcem).",
    `Account concept: ${concept}`,
    `Post context: "${cleaned}"`,
    "Style: clean, modern, bold typography-friendly composition, high contrast,",
    "dark editorial background with a single deep garnet accent (#9b2c34),",
    "no watermark, no stock-photo cliché, sharp focus.",
    "FULL-BLEED 1:1 square that fills the ENTIRE 1080x1080 frame edge-to-edge;",
    "absolutely no white border, no margins, no passe-partout, no frame, no mockup,",
    "no poster-on-wall look, no drop shadow around the artwork — the design bleeds to all four edges.",
  ].join(" ");
}

/** Call fal.ai. Returns a URL on success, or null to fall back to prompt-only. */
async function callFal(prompt: string): Promise<string | null> {
  // Never spend real fal credits inside the test runner, even if .env.local has a key.
  if (process.env.VITEST) return null;
  const falKey = process.env.FAL_KEY;
  const { falImageModel } = getCostLimits();
  if (!falKey || !falImageModel) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    const res = await fetch(`https://fal.run/${falImageModel}`, {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: { width: 1080, height: 1080 }, num_images: 1 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    // Observability: a real fal.ai failure (bad/rotated key, quota, outage,
    // malformed response) was previously invisible — an operator could only
    // infer "images stopped" from UI silence. Log a redacted class here.
    if (!res.ok) {
      console.warn(`[imageService] fal.ai HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as FalResult;
    const url = data.images?.[0]?.url;
    if (typeof url === "string" && url.length > 0) return url;
    console.warn("[imageService] fal.ai response had no image URL");
    return null;
  } catch (err) {
    console.warn("[imageService] fal.ai request failed:", redactError(err));
    return null;
  }
}

export const imageService = {
  /**
   * Generate (or reuse) an image for a queued draft. Safe to call from the
   * manual button (grafikcem) or the publish hook (maskulenkod) — dedupe and the
   * budget gate make repeated calls cheap and bounded.
   */
  async generateForQueueItem(
    queueItemId: string,
    opts: { force?: boolean } = {}
  ): Promise<GenerateImageResult> {
    const item = await queueRepo.findById(queueItemId);
    if (!item) throw new Error("queue_item_not_found");

    const account = await accountRepo.findById(item.accountId);
    const handle = (account?.handle ?? "grafikcem") as AccountHandle;
    const draftText = item.editedContent || item.content || "";
    const imagePrompt = buildImagePrompt(handle, draftText);

    // Dedupe: an image already exists → reuse, no spend.
    if (item.generatedImageUrl && !opts.force) {
      return {
        ok: true,
        generatedImageUrl: item.generatedImageUrl,
        imagePrompt,
        provider: "none",
        reused: true,
        costUsd: 0,
      };
    }

    // Not configured → prompt-only (fail-open, no spend).
    if (!process.env.FAL_KEY) {
      return {
        ok: true,
        generatedImageUrl: null,
        imagePrompt,
        provider: "none",
        reused: false,
        blocked: "not_configured",
        costUsd: 0,
      };
    }

    // Separate fal budget gate — hard stop, no spend.
    const budget = await getFalBudgetStatus();
    if (!budget.allowed) {
      return {
        ok: false,
        generatedImageUrl: null,
        imagePrompt,
        provider: "fal",
        reused: false,
        blocked: "budget",
        costUsd: 0,
      };
    }

    const url = await callFal(imagePrompt);
    const { falImageModel, falImageCostUsd } = getCostLimits();

    // Only charge + persist when a real URL was produced.
    if (url) {
      await usageService
        .recordImage({
          accountId: item.accountId,
          estimatedCostUsd: falImageCostUsd,
          model: falImageModel,
          meta: { purpose: "image_gen", handle },
        })
        .catch(() => {});
      await queueRepo.update(queueItemId, { generatedImageUrl: url });
      return {
        ok: true,
        generatedImageUrl: url,
        imagePrompt,
        provider: "fal",
        reused: false,
        costUsd: falImageCostUsd,
      };
    }

    // Generation attempt failed → prompt-only, no charge (no image produced).
    return {
      ok: true,
      generatedImageUrl: null,
      imagePrompt,
      provider: "fal",
      reused: false,
      costUsd: 0,
    };
  },
};
