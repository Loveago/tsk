import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { deliveryReportCode, sanitizeCustomerRefundNote, sanitizeCustomerFacingText } from "@/lib/types";
import { handleRouteError, apiError } from "@/lib/api-helpers";

import { syncClickyfiedDeliveryReport } from "@/lib/provider-apis/router";

/**
 * User report detail (§15): report information, order information, admin
 * response, evidence metadata and the report timeline. Ownership is enforced —
 * a user can only ever open their own reports.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Trigger on-demand sync if this report is from a Clickyfied order
    try {
      await syncClickyfiedDeliveryReport(id, "On-Demand View Sync");
    } catch {
      // Non-blocking fallback
    }

    const report = await prisma.deliveryReport.findUnique({
      where: { id },
      select: {
        id: true,
        seq: true,
        userId: true,
        status: true,
        reason: true,
        message: true,
        adminNote: true,
        adminResponse: true,
        respondedAt: true,
        respondedBy: true,
        proofImageMime: true,
        proofImageUploadedAt: true,
        resolvedAt: true,
        resolvedBy: true,
        createdAt: true,
        updatedAt: true,
        events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, message: true, actorLabel: true, createdAt: true } },
        order: {
          select: {
            id: true,
            phoneNumber: true,
            network: true,
            gbAmount: true,
            amount: true,
            status: true,
            completedAt: true,
            batch: { select: { batchCode: true } },
          },
        },
      },
    });

    if (!report) return apiError(404, "Report not found");

    const isStaff = user.role === "ADMIN" || user.role === "MANAGER";
    if (!isStaff && report.userId !== user.id) return apiError(403, "Not allowed");
    const { userId: _ownerId, ...safeReport } = report;

    const sanitizeActor = (label: string | null | undefined) => {
      if (!label) return null;
      if (label.toLowerCase().includes("clickyfied") || label.toLowerCase().includes("bigwin")) {
        return "Support Team";
      }
      return sanitizeCustomerFacingText(label) || "Support Team";
    };

    return NextResponse.json({
      report: {
        ...safeReport,
        code: deliveryReportCode(safeReport.seq),
        reason: isStaff ? safeReport.reason : sanitizeCustomerFacingText(safeReport.reason),
        message: isStaff ? safeReport.message : sanitizeCustomerFacingText(safeReport.message),
        adminNote: isStaff ? safeReport.adminNote : null,
        adminResponse: sanitizeCustomerRefundNote(safeReport.adminResponse, safeReport.order?.amount),
        respondedBy: isStaff ? safeReport.respondedBy : sanitizeActor(safeReport.respondedBy),
        resolvedBy: isStaff ? safeReport.resolvedBy : sanitizeActor(safeReport.resolvedBy),
        events: safeReport.events.map((e) => ({
          ...e,
          message: isStaff ? e.message : sanitizeCustomerFacingText(e.message),
          actorLabel: isStaff
            ? e.actorLabel
            : e.actorLabel?.toLowerCase().includes("clickyfied")
            ? "System"
            : (sanitizeCustomerFacingText(e.actorLabel) || "System"),
        })),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
