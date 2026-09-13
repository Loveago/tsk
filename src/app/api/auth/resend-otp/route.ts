import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resendOtpSchema } from "@/lib/validation";
import { getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { generateLoginOtp, verifyOtpTicket, isTicketConsumed } from "@/lib/otp";
import { sendLoginOtpEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await request.json();
    const input = resendOtpSchema.parse(body);

    const rl = rateLimit(`resend_otp:${ip}`, 3, 60 * 1000);
    if (!rl.allowed) {
      return apiError(429, "Too many requests. Please wait a minute before requesting another code.");
    }

    const ticketResult = await verifyOtpTicket(input.ticket);
    if (!ticketResult.valid || !ticketResult.payload) {
      return apiError(400, ticketResult.error || "Invalid verification session. Please sign in again.");
    }

    const { payload } = ticketResult;

    if (isTicketConsumed(payload.jti)) {
      return apiError(400, "This verification session has already been completed. Please sign in again.");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== "ACTIVE") {
      return apiError(403, "Account is disabled or not found.");
    }

    const { code, ticket: newTicket } = await generateLoginOtp(user.id, user.email);
    const emailRes = await sendLoginOtpEmail(user.email, user.name || "User", code, 10);
    if (!emailRes.success) {
      return apiError(
        500,
        emailRes.error || "Failed to dispatch verification code to your email. Please try again."
      );
    }

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "auth.login_otp_resent",
      target: `user:${user.id}`,
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      ticket: newTicket,
      email: user.email,
      ...(process.env.NODE_ENV !== "production" ? { devOtp: code } : {}),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
