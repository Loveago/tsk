import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { mapClickyfiedStatus } from "@/lib/provider-apis/router";

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

    // Search for order in our database
    let order = null;
    const searchKeys = [orderId, externalRef].filter(Boolean).map(String);
    if (searchKeys.length > 0) {
      order = await prisma.order.findFirst({
        where: {
          OR: [
            ...searchKeys.map((k) => ({ providerReference: `CLICKYFIED:${k}` })),
            ...searchKeys.map((k) => ({ providerReference: k })),
            ...searchKeys.map((k) => ({ externalReference: k })),
            ...searchKeys
              .filter((k) => k.startsWith("TSK-ORD-"))
              .map((k) => ({ id: parseInt(k.replace("TSK-ORD-", ""), 10) })),
          ],
        },
      });
    }

    // -----------------------------------------------------------------------
    // Handle Delivery Report Events (Not Received Flow)
    // -----------------------------------------------------------------------
    if (
      event === "report.not_received.resolved" ||
      event === "report.not_received.confirmed_sent" ||
      payload?.report
    ) {
      const repData = payload?.report;
      if (order) {
        const report = await prisma.deliveryReport.findFirst({
          where: { orderId: order.id },
          orderBy: { createdAt: "desc" },
        });

        if (report) {
          const rawStatus = String(repData?.status || "").toLowerCase();
          const newStatus =
            event === "report.not_received.confirmed_sent" || ["confirmed_sent", "sent", "delivered"].includes(rawStatus)
              ? "DELIVERED"
              : rawStatus === "rejected" || rawStatus === "cancelled"
              ? "REJECTED"
              : "RESOLVED";

          const adminNotes =
            repData?.adminNotes ||
            repData?.adminNote ||
            repData?.notes ||
            repData?.resolutionNote ||
            null;

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

          await prisma.deliveryReport.update({
            where: { id: report.id },
            data: {
              status: newStatus,
              adminResponse: adminNotes || report.adminResponse,
              ...(newProofAttached
                ? {
                    proofImage,
                    proofImageMime,
                    proofImageUploadedAt: new Date(),
                    proofImageUploadedBy: "Clickyfied Callback",
                  }
                : {}),
              resolvedAt: new Date(),
              resolvedBy: "Clickyfied Callback",
            },
          });

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
              type: newStatus === "DELIVERED" ? "MARKED_DELIVERED" : "RESOLVED",
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
    if (order) {
      const summary = payload?.order?.entrySummary || payload?.entrySummary;
      const rawStatus =
        payload?.order?.status ||
        payload?.status ||
        (event === "order.accepted" ? "pending" : "");

      const targetStatus = mapClickyfiedStatus(rawStatus, summary);

      if (targetStatus && targetStatus !== order.status) {
        await changeOrderStatus(
          order.id,
          targetStatus,
          payload?.failureReason || payload?.notes || `Updated via Clickyfied Callback: ${rawStatus || targetStatus}`,
          { id: "system", label: "Clickyfied Callback" },
          { force: true }
        );

        await recordAudit({
          userId: order.userId,
          actorLabel: "Clickyfied Callback",
          action: "order.callback_update",
          target: `order:${order.id}`,
          newValue: JSON.stringify({ event, status: targetStatus, orderId }),
        });
      }
    }

    return NextResponse.json({ received: true, orderId: order?.id ?? null });
  } catch (err: any) {
    console.error("Clickyfied callback error:", err);
    return NextResponse.json({ error: err?.message || "Callback processing error" }, { status: 500 });
  }
}
