import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  getAdminChatConversations,
  getUserChatMessages,
  sendAdminChatMessage,
} from "@/lib/chat";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (userId) {
      const messages = await getUserChatMessages(userId);
      return NextResponse.json({ messages });
    }

    const conversations = await getAdminChatConversations();
    return NextResponse.json({ conversations });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const text = typeof body.message === "string" ? body.message.trim() : "";

    if (!userId) return apiError(400, "userId is required");
    if (!text) return apiError(400, "Message text is required");
    if (text.length > 2000) return apiError(400, "Message cannot exceed 2000 characters");

    const msg = await sendAdminChatMessage(userId, actor.id, text);
    return NextResponse.json({ message: msg });
  } catch (err) {
    return handleRouteError(err);
  }
}
