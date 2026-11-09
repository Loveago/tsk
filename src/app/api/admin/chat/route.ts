import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  deleteChatMessage,
  deleteUserChatThread,
  getAdminChatConversations,
  getAdminUserChatMessages,
  getChatUserInfo,
  markChatAsRead,
  sendAdminBulkChatMessages,
  sendAdminChatMessage,
  type ChatBroadcastGroup,
} from "@/lib/chat";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const search = searchParams.get("search") || undefined;
    const includeAll = searchParams.get("includeAll") === "true";

    if (userId) {
      const [messages, user] = await Promise.all([
        getAdminUserChatMessages(userId),
        getChatUserInfo(userId),
      ]);
      return NextResponse.json({ messages, user });
    }

    const conversations = await getAdminChatConversations(search, includeAll);
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
    const text = typeof body.message === "string" ? body.message.trim() : "";

    if (!text) return apiError(400, "Message text is required");
    if (text.length > 2000) return apiError(400, "Message cannot exceed 2000 characters");

    // Support bulk/broadcast messaging to userIds array or targetGroup
    if (Array.isArray(body.userIds) || typeof body.targetGroup === "string") {
      const userIds = Array.isArray(body.userIds)
        ? body.userIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        : undefined;
      const targetGroup =
        typeof body.targetGroup === "string" &&
        ["ALL", "ACTIVE", "PENDING_PAYMENT", "FROZEN", "ZERO_BALANCE", "RESELLERS"].includes(
          body.targetGroup
        )
          ? (body.targetGroup as ChatBroadcastGroup)
          : undefined;

      if ((!userIds || userIds.length === 0) && !targetGroup) {
        return apiError(400, "Specify userIds or a valid targetGroup");
      }

      const { sentCount } = await sendAdminBulkChatMessages({
        adminId: actor.id,
        message: text,
        userIds,
        targetGroup,
      });

      return NextResponse.json({
        ok: true,
        sentCount,
        message: `Message sent to ${sentCount} user(s)`,
      });
    }

    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return apiError(400, "userId is required");

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
