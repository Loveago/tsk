import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { mapClickyfiedStatus, normalizePhoneLast9 } from "@/lib/provider-apis/router";
import { sanitizeCustomerRefundNote } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const event = request.headers.get("x-external-event") || "";

    let payload: any;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const orderId =
      payload?.orderId ||
      payload?.order?.id ||
      payload?.id ||
      payload?.externalReference;
    const externalRef = payload?.externalReference || payload?.reference;

    // Search for orders in our database (single order or batch)
    let orders: any[] = [];
    const searchKeys = [orderId, externalRef].filter(Boolean).map(String);
    if (searchKeys.length > 0) {
      orders = await prisma.order.findMany({
        where: {
          OR: [
            ...searchKeys.map((k) => ({ providerReference: `CLICKYFIED:${k}` })),
            ...searchKeys.map((k) => ({ providerReference: { startsWith: `CLICKYFIED:${k}:` } })),
            ...searchKeys.map((k) => ({ providerReference: k })),
            ...searchKeys.map((k) => ({ externalReference: k })),
            ...searchKeys
              .filter((k) => k.startsWith("TSK-ORD-"))
              .map((k) => ({ id: parseInt(k.replace("TSK-ORD-", ""), 10) })),
          ],
        },
      });
    }
    const order = orders[0] ?? null;

    // -----------------------------------------------------------------------
    // Handle Delivery Report Events (Not Received Flow)
    // -----------------------------------------------------------------------
    if (
      event === "report.not_received.resolved" ||
      event === "report.not_received.confirmed_sent" ||
      payload?.report
    ) {
      const repData = payload?.report || {};
      const repEntryId = repData?.orderEntryId ?? payload?.orderEntryId;
      const repNumber = repData?.number ?? payload?.number;

      if (orders.length > 0) {
        // Find the specific target order in this batch:
        let targetOrder: any = null;

        // 0. Match by provider reportId from deliveryReport.adminNote or OrderApiLog
        if (repData?.reportId) {
          const matchedByNote = await prisma.deliveryReport.findFirst({
            where: {
              orderId: { in: orders.map((o) => o.id) },
              adminNote: {
                contains: `[PROVIDER_REPORT_ID:${repData.reportId}]`,
              },
            },
            include: { order: true },
          });
          if (matchedByNote?.order) {
            targetOrder = matchedByNote.order;
          } else if ((prisma as any).orderApiLog) {
            const apiLog = await (prisma as any).orderApiLog.findFirst({
              where: {
                orderId: { in: orders.map((o) => o.id) },
                provider: "CLICKYFIED",
                action: "NOT_RECEIVED",
                responsePayload: { contains: `"reportId":${repData.reportId}` },
              },
              orderBy: { createdAt: "desc" },
            });
            if (apiLog?.orderId) {
              targetOrder = orders.find((o) => o.id === apiLog.orderId);
            }
          }
        }

        // 1. Match by orderEntryId (e.g. providerReference ends with :<repEntryId>)
        if (!targetOrder && repEntryId !== undefined && repEntryId !== null) {
          targetOrder = orders.find((o) => {
            if (!o.providerReference) return false;
            const parts = o.providerReference.replace("CLICKYFIED:", "").split(":");
            return parts[1] && String(parts[1]) === String(repEntryId);
          });
        }

        // 2. Match by phone number
        if (!targetOrder && repNumber) {
          const normRep = normalizePhoneLast9(String(repNumber));
          targetOrder = orders.find((o) => normalizePhoneLast9(o.phoneNumber) === normRep);
        }

        // 3. Match by refund amount in adminNotes against order.gbAmount
        if (!targetOrder && repData?.adminNotes) {
          const ghsMatch = String(repData.adminNotes).match(/Refund(?:ed)?\s+(?:GHS|GH₵)?\s*([0-9]+(?:\.[0-9]+)?)/i);
          const gbMatch = String(repData.adminNotes).match(/Refund(?:ed)?\s+([0-9]+(?:\.[0-9]+)?)\s*GB/i);
          if (ghsMatch) {
            const refundedGhs = parseFloat(ghsMatch[1]);
            const targetGb = refundedGhs / 3.75;
            targetOrder = orders.find((o) => Math.abs(o.gbAmount - targetGb) <= 0.1);
          } else if (gbMatch) {
            const refundedGb = parseFloat(gbMatch[1]);
            targetOrder = orders.find((o) => Math.abs(o.gbAmount - refundedGb) <= 0.1);
          }
        }

        // 4. In single-order cases, match the order with an active delivery report or the single order
        if (!targetOrder && orders.length === 1) {
          targetOrder = orders[0];
        } else if (!targetOrder && orders.length > 1) {
          // In multi-entry batches, only match if there is exactly ONE open delivery report across all orders in the batch
          const orderIds = orders.map((o) => o.id);
          const openReps = await prisma.deliveryReport.findMany({
            where: {
              orderId: { in: orderIds },
              status: { in: ["OPEN", "INVESTIGATING", "UNDER_REVIEW"] },
            },
          });
          if (openReps.length === 1) {
            targetOrder = orders.find((o) => o.id === openReps[0].orderId);
          }
        }

        // If target order could not be unambiguously identified in a multi-entry batch, do not corrupt other orders
        if (!targetOrder) {
          return NextResponse.json({ received: true, event, skipped: "Unmatched recipient in multi-entry batch" });
        }

        // Find the specific report for this target order
        const report = await prisma.deliveryReport.findFirst({
          where: { orderId: targetOrder.id },
          orderBy: { createdAt: "desc" },
        });

        if (report && targetOrder) {
          const rawStatus = String(repData?.status || "").toLowerCase();
          const adminNotes =
            repData?.adminNotes ||
            repData?.adminNote ||
            repData?.notes ||
            repData?.resolutionNote ||
            null;
          const notesLower = String(adminNotes || "").toLowerCase();
          const resolutionStr = String(
            repData?.resolution || repData?.resolutionType || repData?.action || repData?.decision || ""
          ).toLowerCase();

          const isRefund =
            event === "report.not_received.refunded" ||
            ["refund", "refunded"].includes(rawStatus) ||
            resolutionStr === "refund" ||
            resolutionStr === "refunded" ||
            Boolean(notesLower.match(/refund(?:ed)?\s+(?:ghs|gh₵)?\s*[0-9]+/i)) ||
            Boolean(notesLower.match(/refund(?:ed)?\s+[0-9]+(?:\.[0-9]+)?\s*gb/i));

          const isConfirmedSent =
            event === "report.not_received.confirmed_sent" ||
            ["confirmed_sent", "delivered"].includes(rawStatus) ||
            resolutionStr === "confirmed_sent" ||
            resolutionStr === "delivered";

          const isRejected =
            event === "report.not_received.rejected" ||
            ["rejected", "cancelled", "canceled"].includes(rawStatus) ||
            resolutionStr === "rejected" ||
            resolutionStr === "cancelled";

          const isPending =
            ["open", "pending", "pending_resolution", "investigating", "under_review"].includes(rawStatus) ||
            event === "report.not_received.investigating" ||
            event === "report.not_received.created";

          const newStatus = isRefund
            ? "REFUNDED"
            : isConfirmedSent
            ? "CONFIRM_SENT"
            : isRejected
            ? "REJECTED"
            : isPending
            ? "INVESTIGATING"
            : ["resolved", "completed", "closed"].includes(rawStatus) ||
              resolutionStr === "resolved" ||
              event === "report.not_received.resolved" ||
              Boolean(repData?.evidenceUrl || repData?.evidence_url || repData?.proofUrl || repData?.evidence?.url)
            ? "RESOLVED"
            : report.status;

          const evidenceUrl =
            repData?.evidenceUrl ||
            repData?.evidence_url ||
            repData?.proofUrl ||
            repData?.proof_url ||
            repData?.imageUrl ||
            repData?.image_url ||
            repData?.evidence?.url ||
            null;

          let proofImage = report.proofImage;
          let proofImageMime = report.proofImageMime;
          let newProofAttached = false;

          if (newStatus === "REFUNDED") {
            proofImage = null;
            proofImageMime = null;
          }

          if (evidenceUrl && (!report.proofImage || report.proofImage.startsWith("http"))) {
            try {
              const imgRes = await fetch(evidenceUrl, {
                headers: { "User-Agent": "Tskconnect/1.0" },
                signal: AbortSignal.timeout(10000),
              });
              if (imgRes.ok) {
                const contentType = imgRes.headers.get("content-type") || "image/jpeg";
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                proofImage = buffer.toString("base64");
                proofImageMime = contentType;
                newProofAttached = true;
              } else {
                proofImage = evidenceUrl;
                proofImageMime = "image/jpeg";
                newProofAttached = true;
              }
            } catch {
              proofImage = evidenceUrl;
              proofImageMime = "image/jpeg";
              newProofAttached = true;
            }
          }

          const isTerminal = ["RESOLVED", "CONFIRM_SENT", "DELIVERED", "REFUNDED", "REJECTED"].includes(newStatus);

          await prisma.deliveryReport.update({
            where: { id: report.id },
            data: {
              status: newStatus,
              adminResponse:
                (targetOrder
                  ? sanitizeCustomerRefundNote(adminNotes, targetOrder.amount)
                  : sanitizeCustomerRefundNote(adminNotes)) || report.adminResponse,
              ...(newProofAttached
                ? {
                    proofImage,
                    proofImageMime,
                    proofImageUploadedAt: new Date(),
                    proofImageUploadedBy: "Clickyfied Callback",
                  }
                : {}),
              ...(isTerminal
                ? {
                    resolvedAt: new Date(),
                    resolvedBy: "Clickyfied Callback",
                  }
                : {}),
            },
          });

          // If failed/refunded on Clickyfied, update ONLY this specific reported order to FAILED
          if (newStatus === "REFUNDED" && targetOrder) {
            try {
              const refundReason =
                sanitizeCustomerRefundNote(adminNotes, targetOrder.amount) ||
                (targetOrder.amount ? `Refunded GHS ${targetOrder.amount.toFixed(2)}` : "Order was refunded");
              await changeOrderStatus(
                targetOrder.id,
                "FAILED",
                refundReason,
                { id: "system", label: "Clickyfied Callback" },
                { force: true }
              );
            } catch (err) {
              console.error("Failed to update order status during webhook refund:", err);
            }
          }

          // If confirmed sent or resolved on Clickyfied, restore order status to SUCCESS if it was previously marked FAILED
          if ((newStatus === "CONFIRM_SENT" || newStatus === "RESOLVED") && targetOrder && targetOrder.status === "FAILED") {
            try {
              await changeOrderStatus(
                targetOrder.id,
                "SUCCESS",
                adminNotes || "Order confirmed sent/resolved by Clickyfied provider",
                { id: "system", label: "Clickyfied Callback" },
                { force: true }
              );
            } catch (err) {
              console.error("Failed to restore order status during webhook delivery confirmation:", err);
            }
          }

          if (newProofAttached) {
            await prisma.deliveryReportEvent.create({
              data: {
                reportId: report.id,
                type: "EVIDENCE_UPLOADED",
                message: `Delivery proof image received from Clickyfied${evidenceUrl ? ` (${evidenceUrl})` : ""}`,
                actorLabel: "Clickyfied API",
              },
            });
          }

          await prisma.deliveryReportEvent.create({
            data: {
              reportId: report.id,
              type: newStatus === "CONFIRM_SENT" ? "MARKED_DELIVERED" : newStatus === "REFUNDED" ? "REFUND" : "RESOLVED",
              message: `Clickyfied report update: ${newStatus}. Notes: ${adminNotes || "None"}`,
              actorLabel: "Clickyfied API",
            },
          });
        }
      }

      return NextResponse.json({ received: true, event, processed: true });
    }

    // -----------------------------------------------------------------------
    // Handle Order Status Changed Events
    // -----------------------------------------------------------------------
    if (orders.length > 0) {
      const summary = payload?.order?.entrySummary || payload?.entrySummary;
      const rawStatus =
        payload?.order?.status ||
        payload?.status ||
        (event === "order.accepted" ? "pending" : "");
      const processedAt = payload?.order?.processedAt || payload?.processedAt;
      const overallTargetStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

      // Check if per-entry status list is provided in webhook payload
      const rawEntries: Array<{ number?: string; currentStatus?: string; status?: string }> =
        payload?.entries || payload?.order?.entries || [];

      const entryStatusMap = new Map<string, string>();
      for (const re of rawEntries) {
        const ph = normalizePhoneLast9(re.number);
        const st = re.currentStatus || re.status;
        if (ph && st) {
          entryStatusMap.set(ph, st);
        }
      }

      for (const ord of orders) {
        const entryStatus = entryStatusMap.get(normalizePhoneLast9(ord.phoneNumber));
        const targetStatus = entryStatus
          ? mapClickyfiedStatus(entryStatus)
          : overallTargetStatus;

        if (targetStatus && targetStatus !== ord.status) {
          await changeOrderStatus(
            ord.id,
            targetStatus,
            payload?.failureReason ||
              payload?.notes ||
              `Updated via Clickyfied Callback: ${entryStatus || rawStatus || targetStatus}`,
            { id: "system", label: "Clickyfied Callback" },
            { force: true }
          );

          await recordAudit({
            userId: ord.userId,
            actorLabel: "Clickyfied Callback",
            action: "order.callback_update",
            target: `order:${ord.id}`,
            newValue: JSON.stringify({ event, status: targetStatus, orderId, entryStatus }),
          });
        }
      }
    }

    return NextResponse.json({ received: true, orderId: order?.id ?? null });
  } catch (err: any) {
    console.error("Clickyfied callback error:", err);
    return NextResponse.json({ error: err?.message || "Callback processing error" }, { status: 500 });
  }
}
