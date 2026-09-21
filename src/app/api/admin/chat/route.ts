import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  deleteChatMessage,
  deleteUserChatThread,
  getAdminChatConversations,
  getAdminUserChatMessages,
  markChatAsRead,
  sendAdminChatMessage,
} from "@/lib/chat";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const search = searchParams.get("search") || undefined;

    if (userId) {
      const messages = await getAdminUserChatMessages(userId);
      return NextResponse.json({ messages });
    }

    const conversations = await getAdminChatConversations(search);
    return NextResponse.json({ conversations });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireStaff();
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return apiError(400, "userId is required");

    await markChatAsRead(userId, "USER");
    return NextResponse.json({ ok: true });
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

export async function DELETE(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    let messageId = searchParams.get("messageId");
    let userId = searchParams.get("userId");

    if (!messageId && !userId) {
      try {
        const body = await request.json();
        if (typeof body.messageId === "string") messageId = body.messageId;
        if (typeof body.userId === "string") userId = body.userId;
      } catch {
        // body parsing optional
      }
    }

    if (messageId) {
      const success = await deleteChatMessage(messageId);
      return NextResponse.json({ ok: success, message: "Message deleted successfully" });
    }

    if (userId) {
      const success = await deleteUserChatThread(userId);
      return NextResponse.json({ ok: success, message: "Conversation deleted successfully" });
    }

    return apiError(400, "messageId or userId is required");
  } catch (err) {
    return handleRouteError(err);
  }
}
