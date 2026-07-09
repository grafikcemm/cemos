import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { seedBestAiTools } from "@/lib/series/seriesService";

/**
 * Seri DNA API'si (Sprint 8 — CONTENT-ENGINE §5.3 edit ekranı arkası).
 * GET: aktif seriler; POST {action:"seed"}: Best AI Tools tohumu (idempotent);
 * PUT: alan güncelle → version + promptVersion bump (insan-onaylı DNA).
 */

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const series = await prisma.seriesProfile.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    });
    return ok({ series });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Seriler alınamadı", 500);
  }
}

const SeedSchema = z.object({ action: z.literal("seed"), accountId: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = SeedSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  try {
    const r = await seedBestAiTools(parsed.data.accountId);
    return ok({ ...r });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Seri tohumlanamadı", 500);
  }
}

/** Operatörün düzenleyebildiği DNA alanları (governance alanları hariç). */
const UpdateSchema = z.object({
  id: z.string().min(1).max(64),
  purpose: z.string().max(500).optional(),
  audience: z.string().max(300).optional(),
  objective: z.string().max(60).optional(),
  slideCountRange: z.string().max(20).optional(),
  coverFormula: z.string().max(500).optional(),
  ctaFormula: z.string().max(500).optional(),
  hierarchyNotes: z.string().max(1000).optional(),
  slideArchetypesJson: z.string().max(4000).optional(),
  variableElementsJson: z.string().max(4000).optional(),
  bannedRepetitionJson: z.string().max(4000).optional(),
  productionChecklistJson: z.string().max(4000).optional(),
  evaluationRubricJson: z.string().max(4000).optional(),
});

function isJsonArrayString(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

export async function PUT(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = UpdateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  const { id, ...fields } = parsed.data;
  // JSON-dizi alanları bozuk JSON ile kaydedilemez (motoru sessizce kırmasın).
  for (const key of [
    "slideArchetypesJson",
    "variableElementsJson",
    "bannedRepetitionJson",
    "productionChecklistJson",
    "evaluationRubricJson",
  ] as const) {
    const v = fields[key];
    if (v !== undefined && !isJsonArrayString(v)) {
      return fail(`${key} geçerli bir JSON dizisi değil`, 400);
    }
  }

  try {
    const existing = await prisma.seriesProfile.findUnique({ where: { id } });
    if (!existing) return fail("Seri bulunamadı", 404);
    const updated = await prisma.seriesProfile.update({
      where: { id },
      data: {
        ...fields,
        version: existing.version + 1,
        promptVersion: `v${existing.version + 1}`,
      },
    });
    return ok({ id: updated.id, version: updated.version, promptVersion: updated.promptVersion });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Seri güncellenemedi", 500);
  }
}
