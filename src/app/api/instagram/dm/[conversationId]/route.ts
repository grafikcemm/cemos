import { NextRequest, NextResponse } from "next/server";
import { igConversationRepo } from "@/lib/db/igConversationRepo";
import { igMessageRepo } from "@/lib/db/igMessageRepo";
import { IG_MESSAGES_PER_CONVERSATION } from "@/lib/instagram/igConfig";

export const dynamic = "force-dynamic";

// GET /api/instagram/dm/[conversationId] — konuşma + mesajlar (kronolojik)
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await ctx.params;
  const [conversation, messages] = await Promise.all([
    igConversationRepo.getByConversationId(conversationId),
    igMessageRepo.listByConversation(conversationId, IG_MESSAGES_PER_CONVERSATION),
  ]);
  return NextResponse.json({
    success: true,
    conversation,
    messages: messages.map((m) => ({
      messageId: m.messageId,
      fromMe: m.fromMe,
      text: m.text,
      trText: m.trText,
      lang: m.lang,
      sentAt: m.sentAt,
    })),
  });
}
