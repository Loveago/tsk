import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserChatMessages, sendUserChatMessage } from "@/lib/chat";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const messages = await getUserChatMessages(user.id);
    return NextResponse.json({ messages });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const text = typeof body.message === "string" ? body.message.trim() : "";
    if (!text) {
      return apiError(400, "Message text is required");
    }
    if (text.length > 2000) {
      return apiError(400, "Message cannot exceed 2000 characters");
    }

    const msg = await sendUserChatMessage(user.id, text);
    return NextResponse.json({ message: msg });
  } catch (err) {
    return handleRouteError(err);
  }
}
