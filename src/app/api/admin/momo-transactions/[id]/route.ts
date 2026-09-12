import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;

    const tx = await prisma.incomingMomoTransaction.findUnique({
      where: { id },
      include: {
        claims: {
          include: {
            user: {
              select: { id: true, name: true, email: true, balance: true },
            },
            walletTransaction: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!tx) return apiError(404, "Incoming MoMo transaction not found");

    // Fetch related audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { target: `incoming-momo:${tx.id}` },
          { target: { contains: tx.transactionReference } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      transaction: tx,
      auditLogs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

