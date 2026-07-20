import { prisma } from "@/lib/db/client";
import { learnService } from "./learnService";
import { queueRepo } from "@/lib/db/queueRepo";
import { opportunityHandoffService } from "@/lib/services/opportunityHandoffService";

/**
 * ADR-045 + Phase 5E (ADR-048): Öğrenme paketinin içerik fikri → FORMAT-FARKINDA
 * kanonik hedef (Kütüphane→Öğrenme).
 *
 * SERVER-OTORİTELİ routing: hedef yüzey fikrin `format` alanından SUNUCUDA
 * türetilir — client (activeChannel) yalnız X hesabını SEÇER, formatı zorlayamaz.
 *  - `carousel`  → OpportunityHandoff(action="series")  → Plan→Seriler
 *  - `reel`/`reels` → OpportunityHandoff(action="plan")  → Plan→Takvim
 *  - `tweet`/`thread`/`video`/boş/bilinmeyen → X taslağı (QueueItem, Bugün)
 *
 * Neden: bir Instagram fikri (carousel/reel) ASLA X tweet taslağına dönüşmemeli
 * (yanlış yüzey — Phase 5E BUG-01). İlham'ın Instagram→Seriler/Takvim handoff
 * sözleşmesi (ADR-028) yeniden kullanılır; yeni yüzey/plumbing YOK.
 *
 * Bağlayıcı sözleşme (her iki dal):
 *  - DETERMİNİSTİK ($0): fikir metni pakette zaten var — LLM çağrısı YOK.
 *  - İDEMPOTENT: X dalı originKey="learn:{packId}:{ideaId}:{accountId}" NULL-distinct
 *    unique (çift-tık/retry pre-check + P2002 backstop); handoff dalı
 *    (sourceKind,sourceId,topicSeed) fingerprint dedup → duplicate satır YOK.
 *  - Otomatik publish YOK (X: status default "new"; handoff: pending, insan tüketir).
 */

export type LearnDraftResult =
  | { ok: true; kind: "draft"; draftId: string; reused: boolean }
  | {
      ok: true;
      kind: "handoff";
      handoffId: string;
      action: "series" | "plan";
      target: "plan-seriler" | "plan-takvim";
      reused: boolean;
    }
  | { ok: false; code: "pack_not_found" | "idea_not_found" | "account_not_found" };

type IgTarget = {
  action: "series" | "plan";
  suggestedPlatform: "Instagram" | "Reels";
  target: "plan-seriler" | "plan-takvim";
};

/**
 * Fikir formatını Instagram hedef yüzeyine eşle. Yalnız bilinen görsel-Instagram
 * formatları (carousel/reel) yönlendirilir; aksi (tweet/thread/video/boş) X kalır
 * (Öğrenme X-döngüsü önceliklidir; belirsiz format X taslağı olarak düzenlenebilir).
 */
export function classifyIdeaFormat(format: string | null | undefined): IgTarget | null {
  const f = (format ?? "").trim().toLowerCase();
  if (f === "carousel") return { action: "series", suggestedPlatform: "Instagram", target: "plan-seriler" };
  if (f === "reel" || f === "reels") return { action: "plan", suggestedPlatform: "Reels", target: "plan-takvim" };
  return null;
}

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

  // ── Instagram formatı (carousel/reel) → kanonik handoff (X'e AKMAZ) ──
  const ig = classifyIdeaFormat(idea.format);
  if (ig) {
    const title = (idea.title || "Öğrenme fikri").slice(0, 500);
    const topicSeed = [idea.hook, idea.angle]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" · ")
      .slice(0, 2000);
    const { handoff, reused } = await opportunityHandoffService.createHandoff({
      accountId: account.id,
      action: ig.action,
      sourceKind: "learn",
      sourceId: `${packId}:${ideaId}`,
      sourcePlatform: "instagram",
      title,
      topicSeed,
      whyNow: "Öğrenme paketi içerik fikri",
      rawTab: "lib-ogrenme",
      suggestedPlatform: ig.suggestedPlatform,
    });
    return { ok: true, kind: "handoff", handoffId: handoff.id, action: ig.action, target: ig.target, reused };
  }

  // ── X yüzeyi (tweet/thread/…) → deterministik taslak (mevcut sözleşme) ──
  const originKey = `learn:${packId}:${ideaId}:${account.id}`;

  const existing = await queueRepo.findByOriginKey(originKey);
  if (existing) return { ok: true, kind: "draft", draftId: existing.id, reused: true };

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
    return { ok: true, kind: "draft", draftId: draft.id, reused: false };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Eşzamanlı ikinci istek yarışı — mevcut taslağı döndür (duplicate yok).
      const raced = await queueRepo.findByOriginKey(originKey);
      if (raced) return { ok: true, kind: "draft", draftId: raced.id, reused: true };
    }
    throw err;
  }
}
