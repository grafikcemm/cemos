import type { NextRequest } from "next/server";
import { z } from "zod";
import { voiceProfileRepo } from "@/lib/db/voiceProfileRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/voice-profiles?accountId=&kind=voice|visual
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  const kind = sp.get("kind") ?? "voice";
  if (!accountId) {
    return fail("accountId gerekli", 400);
  }
  try {
    const profiles =
      kind === "visual"
        ? await voiceProfileRepo.listVisual(accountId)
        : await voiceProfileRepo.listVoice(accountId);
    return ok({ kind, count: profiles.length, profiles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const strArr = z.array(z.string()).max(100).optional();
const VoiceSchema = z.object({
  kind: z.literal("voice").optional(),
  accountId: z.string().min(1),
  name: z.string().max(120).optional(),
  mission: z.string().max(4000).optional(),
  pointOfView: z.string().max(4000).optional(),
  coreIdeas: strArr,
  audience: z.string().max(2000).optional(),
  personality: z.string().max(2000).optional(),
  vocabulary: strArr,
  toneTags: strArr,
  rhythm: z.string().max(2000).optional(),
  formatHabits: strArr,
  preferred: strArr,
  avoid: strArr,
  anchorStories: z.string().max(8000).optional(),
  writingSamples: z.string().max(20000).optional(),
  notes: z.string().max(4000).optional(),
  mode: z.string().max(40).optional(),
  sourceAttribution: z.string().max(2000).optional(),
});

const VisualSchema = z.object({
  kind: z.literal("visual"),
  accountId: z.string().min(1),
  name: z.string().max(120).optional(),
  brandColors: strArr,
  typography: z.string().max(2000).optional(),
  layoutPatterns: strArr,
  aspectRatios: strArr,
  textDensity: z.string().max(200).optional(),
  headlineLength: z.string().max(200).optional(),
  imageStyle: z.string().max(2000).optional(),
  motifs: strArr,
  ctaStyle: z.string().max(500).optional(),
  forbidden: strArr,
  references: strArr,
});

// POST /api/voice-profiles  — create voice (default) or visual (kind:"visual") profile.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody<{ kind?: string }>(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  try {
    if (body.data?.kind === "visual") {
      const parsed = VisualSchema.safeParse(body.data);
      if (!parsed.success) {
        return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
      }
      const profile = await voiceProfileRepo.createVisual(parsed.data);
      return ok({ kind: "visual", profile }, { status: 201 });
    }
    const parsed = VoiceSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
    }
    const profile = await voiceProfileRepo.createVoice(parsed.data);
    return ok({ kind: "voice", profile }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
