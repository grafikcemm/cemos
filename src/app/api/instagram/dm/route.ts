import { NextResponse } from "next/server";
import { igConversationRepo } from "@/lib/db/igConversationRepo";
import { igDmDraftRepo } from "@/lib/db/igDmDraftRepo";
import { isConfigured } from "@/lib/instagram/igClient";
import { getMetaPageId, IG_CONVERSATION_FETCH_LIMIT } from "@/lib/instagram/igConfig";

export const dynamic = "force-dynamic";

// GET /api/instagram/dm — konuşma listesi (taslak rozeti + pageLinked durumu)
export async function GET() {
  const [configured, conversations, draftConvIds] = await Promise.all([
    isConfigured(),
    igConversationRepo.listRecent(IG_CONVERSATION_FETCH_LIMIT),
    igDmDraftRepo.listConversationIdsWithDrafts(),
  ]);
  const draftSet = new Set(draftConvIds);
  return NextResponse.json({
    success: true,
    configured,
    pageLinked: getMetaPageId() !== null,
    conversations: conversations.map((c) => ({
      conversationId: c.conversationId,
      participantUsername: c.participantUsername,
      lastMessageAt: c.lastMessageAt,
      hasDrafts: draftSet.has(c.conversationId),
    })),
  });
}
