import { prisma } from "@/lib/db/client";
import { learnService } from "./learnService";
import { queueRepo } from "@/lib/db/queueRepo";

/**
 * ADR-045: Öğrenme paketinin içerik fikri → X taslağı köprüsü (Kütüphane→Öğrenme).
 *
 * Bağlayıcı sözleşme:
 *  - DETERMİNİSTİK ($0): fikir metni pakette zaten var — LLM çağrısı YOK, bütçe
 *    kapısı gerekmez. Taslak insan tarafından düzenlenip MANUEL yayınlanır.
 *  - status default "new" → otomatik publish YOK; readiness deterministik → needs_edit
 *    (judge koşmadı → fail-closed "ready" olmaz — tek readiness motoru korunur).
 *  - İDEMPOTENT: originKey = "learn:{packId}:{ideaId}:{accountId}" NULL-distinct
 *    unique; çift-tık/retry pre-check + P2002 backstop mevcut taslağı döner (duplicate
 *    queue item YOK). Anahtar hesabı içerir → farklı X hesapları AYRI taslak alır.
 *  - Provenance scores'a yazılır (packId/ideaId/format/groundingType/sourceTitle);
 *    "öneri, yayınlanmış içerik değil" dürüstlüğü korunur (grounding taşınır).
 */

export type LearnDraftResult =
  | { ok: true; draftId: string; reused: boolean }
  | { ok: false; code: "pack_not_found" | "idea_not_found" | "account_not_found" };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function createDraftFromLearnIdea(
  packId: string,
  ideaId: string,
  accountHandle: string
): Promise<LearnDraftResult> {
  const pack = await learnService.getPackDetail(packId);
  if (!pack) return { ok: false, code: "pack_not_found" };
  const idea = pack.contentIdeas.find((c) => c.id === ideaId);
  if (!idea) return { ok: false, code: "idea_not_found" };
  const account = await prisma.account.findUnique({ where: { handle: accountHandle }, select: { id: true } });
  if (!account) return { ok: false, code: "account_not_found" };

  const originKey = `learn:${packId}:${ideaId}:${account.id}`;

  const existing = await queueRepo.findByOriginKey(originKey);
  if (existing) return { ok: true, draftId: existing.id, reused: true };

  const content =
    [idea.title, idea.hook, idea.angle]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("\n\n") || idea.title;

  const scores = JSON.stringify({
    source: "learn_pack",
    packId,
    ideaId,
    format: idea.format,
    groundingType: idea.groundingType,
    sourceTitle: pack.source?.title ?? null,
  });

  try {
    const draft = await queueRepo.create({
      accountId: account.id,
      content,
      draftType: "TWEET",
      mode: "learn_idea",
      originKey,
      scores,
    });
    return { ok: true, draftId: draft.id, reused: false };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Eşzamanlı ikinci istek yarışı — mevcut taslağı döndür (duplicate yok).
      const raced = await queueRepo.findByOriginKey(originKey);
      if (raced) return { ok: true, draftId: raced.id, reused: true };
    }
    throw err;
  }
}
