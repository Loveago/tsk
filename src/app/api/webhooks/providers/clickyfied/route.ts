import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { mapClickyfiedStatus, normalizePhoneLast9, getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { ClickyfiedClient } from "@/lib/provider-apis/clickyfied";
import { recordOrderApiLog } from "@/lib/order-api-logs";
import { sanitizeCustomerRefundNote } from "@/lib/types";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const rawBody = await request.text();
    const event = (request.headers.get("x-external-event") || "").toLowerCase();

    let payload: any;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const effectiveEvent = (event || payload?.event || "").toLowerCase();

    // Verify HMAC-SHA256 signature using Clickyfied formula: HMAC_SHA256(secret, timestamp + "." + raw_body)
    try {
      const config = await getProviderRoutingConfig();
      const signingSecret = (config.clickyfied.callbackSigningSecret || process.env.CLICKYFIED_CALLBACK_SECRET || "").trim();
      const incomingSignature = (
        request.headers.get("x-external-signature") ||
        request.headers.get("x-signature") ||
        request.headers.get("x-clickyfied-signature") ||
        request.headers.get("signature") ||
        ""
      ).trim();

      const incomingTimestamp = (
        request.headers.get("x-external-timestamp") ||
        request.headers.get("x-timestamp") ||
        request.headers.get("x-signature-timestamp") ||
        ""
      ).trim();

      if (signingSecret && incomingSignature) {
        const cleanSig = incomingSignature.replace(/^sha256=/i, "").trim();
        const rawBuffer = Buffer.from(rawBody, "utf-8");
        const payloadBuffer = incomingTimestamp
          ? Buffer.concat([Buffer.from(`${incomingTimestamp}.`, "utf-8"), rawBuffer])
          : rawBuffer;

        const computedHex = crypto
          .createHmac("sha256", signingSecret)
          .update(payloadBuffer)
          .digest("hex");

        const computedBase64 = crypto
          .createHmac("sha256", signingSecret)
          .update(payloadBuffer)
          .digest("base64");

        const isValid =
          computedHex.toLowerCase() === cleanSig.toLowerCase() ||
          computedBase64 === cleanSig;

        if (isValid) {
          console.log("[ClickyfiedWebhook] HMAC signature verified successfully with X-External-Timestamp.");
        } else {
          // Fallback check against raw body bytes directly without timestamp
          const fallbackHex = crypto
            .createHmac("sha256", signingSecret)
            .update(rawBuffer)
            .digest("hex");
          const fallbackBase64 = crypto
            .createHmac("sha256", signingSecret)
            .update(rawBuffer)
            .digest("base64");

          if (
            fallbackHex.toLowerCase() === cleanSig.toLowerCase() ||
            fallbackBase64 === cleanSig
          ) {
            console.log("[ClickyfiedWebhook] HMAC signature verified successfully with raw body fallback.");
          } else {
            console.warn(
              `[ClickyfiedWebhook] Signature mismatch (received: ${incomingSignature.slice(0, 15)}..., computed: ${computedHex.slice(0, 15)}...). Processing in permissive mode.`
            );
          }
        }
      }
    } catch (sigErr: any) {
      console.warn("[ClickyfiedWebhook] Signature check error:", sigErr);
    }

    const orderId =
      payload?.orderId ||
      payload?.order?.orderId ||
      payload?.order?.id ||
      payload?.id ||
      payload?.externalReference;
    const externalRef = payload?.externalReference || payload?.reference || payload?.order?.externalReference;

    // Search for orders in our database (single order or batch)
    let orders: any[] = [];
    const searchKeys = [orderId, externalRef].filter(Boolean).map(String);
    if (searchKeys.length > 0) {
      orders = await prisma.order.findMany({
        where: {
          OR: [
            ...searchKeys.map((k) => ({ providerReference: `CLICKYFIED:${k}` })),
            ...searchKeys.map((k) => ({ providerReference: { startsWith: `CLICKYFIED:${k}:` } })),
            ...searchKeys.map((k) => ({ providerReference: { contains: k } })),
            ...searchKeys.map((k) => ({ externalReference: k })),
            ...searchKeys
              .filter((k) => k.startsWith("TSK-ORD-"))
              .map((k) => ({ id: parseInt(k.replace("TSK-ORD-", ""), 10) })),
          ],
        },
      });
    }

    // Fallback: If not found by orderId/externalRef, check if payload entries phone numbers match active orders
    if (orders.length === 0) {
      const rawEntriesList = payload?.entries || payload?.order?.entries || [];
      const entryPhones = rawEntriesList
        .map((e: any) => normalizePhoneLast9(e.number || e.phoneNumber || e.phone))
        .filter(Boolean);

      if (entryPhones.length > 0) {
        const candidates = await prisma.order.findMany({
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
            OR: [
              { providerReference: { startsWith: "CLICKYFIED" } },
              { externalReference: { startsWith: "CF-BATCH-" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        });

        const matched = candidates.filter((c) =>
          entryPhones.includes(normalizePhoneLast9(c.phoneNumber))
        );
        if (matched.length > 0) {
          orders = matched;
        }
      }
    }

    // Fallback 2: If still not found and orderId is provided, query Clickyfied API to resolve externalReference
    if (orders.length === 0 && orderId && !effectiveEvent.includes("report")) {
      try {
        const config = await getProviderRoutingConfig();
        const client = new ClickyfiedClient(config.clickyfied);
        const remote = await client.getOrderStatus(orderId);
        const remoteRef = (remote.raw as any)?.order?.externalReference || (remote.raw as any)?.externalReference;
        if (remoteRef) {
          orders = await prisma.order.findMany({
            where: {
              OR: [
                { externalReference: remoteRef },
                { providerReference: { contains: remoteRef } },
              ],
            },
          });
        }
      } catch {}
    }

    const order = orders[0] ?? null;

    // -----------------------------------------------------------------------
    // Handle Delivery Report Events (Not Received Flow)
    // -----------------------------------------------------------------------
    const isReportEvent =
      event.startsWith("report.not_received.") ||
      event.startsWith("report.") ||
      event.includes("not_received") ||
      event.includes("report") ||
      Boolean(payload?.report) ||
      Boolean(payload?.reports) ||
      Boolean(payload?.reportId) ||
      Boolean(payload?.data?.report) ||
      Boolean(payload?.data?.reports) ||
      Boolean(payload?.data?.reportId);

    if (isReportEvent) {
      const repData =
        payload?.report ||
        payload?.data?.report ||
        (Array.isArray(payload?.reports) ? payload.reports[0] : null) ||
        (Array.isArray(payload?.data?.reports) ? payload.data.reports[0] : null) ||
        payload?.data ||
        payload ||
        {};
      const repEntryId =
        repData?.orderEntryId ??
        repData?.entryId ??
        repData?.id ??
        payload?.orderEntryId ??
        payload?.entryId;
      const repNumber =
        repData?.number ??
        repData?.phoneNumber ??
        repData?.phone ??
        repData?.recipient ??
        payload?.number ??
        payload?.phoneNumber ??
        payload?.phone;
      const repReportId =
        repData?.reportId ??
        repData?.id ??
        payload?.reportId;

      // Fallback: If orders wasn't found by externalRef/orderId, resolve target order by reportId or recipient phone
      if (orders.length === 0 && repReportId) {
        const rep = await prisma.deliveryReport.findFirst({
          where: {
            adminNote: { contains: `[PROVIDER_REPORT_ID:${repReportId}]` },
          },
          include: { order: true },
        });
        if (rep?.order) {
          orders = [rep.order];
        }
      }
      if (orders.length === 0 && repNumber) {
        const normRep = normalizePhoneLast9(String(repNumber));
        const foundOrders = await prisma.order.findMany({
          where: { phoneNumber: { contains: normRep } },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        if (foundOrders.length > 0) {
          orders = foundOrders;
        }
      }

      if (orders.length > 0) {
        // Find the specific target order in this batch:
        let targetOrder: any = null;

        // 0. Match by provider reportId from deliveryReport.adminNote or OrderApiLog
        if (repReportId) {
          const matchedByNote = await prisma.deliveryReport.findFirst({
            where: {
              orderId: { in: orders.map((o) => o.id) },
              adminNote: {
                contains: `[PROVIDER_REPORT_ID:${repReportId}]`,
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
                responsePayload: { contains: `"reportId":${repReportId}` },
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
            event === "report.not_received.refund" ||
            event.includes("refund") ||
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
          const resolutionDate =
            repData?.resolutionDate && !isNaN(new Date(repData.resolutionDate).getTime())
              ? new Date(repData.resolutionDate)
              : undefined;

          await prisma.deliveryReport.update({
            where: { id: report.id },
            data: {
              status: newStatus,
              adminResponse:
                (targetOrder
                  ? sanitizeCustomerRefundNote(adminNotes, targetOrder.amount)
                  : sanitizeCustomerRefundNote(adminNotes)) || report.adminResponse,
              respondedAt: resolutionDate || report.respondedAt || new Date(),
              ...(newProofAttached
                ? {
                    proofImage,
                    proofImageMime,
                    proofImageUploadedAt: new Date(),
                    proofImageUploadedBy: "Support Team",
                  }
                : {}),
              ...(isTerminal
                ? {
                    resolvedAt: resolutionDate || report.resolvedAt || new Date(),
                    resolvedBy: "Support Team",
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
                { id: "system", label: "System Sync" },
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
                adminNotes || "Order confirmed delivered",
                { id: "system", label: "System Sync" },
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
                message: `Delivery proof image received${evidenceUrl ? ` (${evidenceUrl})` : ""}`,
                actorLabel: "System",
              },
            });
          }

          await prisma.deliveryReportEvent.create({
            data: {
              reportId: report.id,
              type: newStatus === "CONFIRM_SENT" ? "MARKED_DELIVERED" : newStatus === "REFUNDED" ? "REFUND" : "RESOLVED",
              message: `Report update: ${newStatus}.${adminNotes ? ` Notes: ${adminNotes}` : ""}`,
              actorLabel: "System",
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
      const eventStatus =
        effectiveEvent === "order.processing" || effectiveEvent === "order.in_progress"
          ? "processing"
          : effectiveEvent === "order.processed" || effectiveEvent === "order.completed"
          ? "processed"
          : effectiveEvent === "order.failed"
          ? "failed"
          : effectiveEvent === "order.accepted"
          ? "pending"
          : "";

      const rawStatus =
        payload?.order?.status ||
        payload?.status ||
        eventStatus;
      const processedAt = payload?.order?.processedAt || payload?.processedAt;
      const overallTargetStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

      // Check if per-entry status list is provided in webhook payload
      const rawEntries: Array<any> =
        payload?.entries ||
        payload?.order?.entries ||
        payload?.order?.phoneNumbers ||
        payload?.phoneNumbers ||
        [];

      const parsedEntries: Array<{
        id?: string | number;
        normPhone: string;
        allocationGb?: number;
        status?: string;
      }> = [];

      for (const re of rawEntries) {
        const num = re.number || re.phoneNumber || re.phone || re.recipient || re.mobile || "";
        const norm = normalizePhoneLast9(String(num));
        const st = re.currentStatus || re.status || re.deliveryStatus || re.state;
        const eId = re.id ?? re.orderEntryId ?? re.entryId ?? re._id;
        const alloc =
          typeof re.allocationGB === "number"
            ? re.allocationGB
            : typeof re.allocationGb === "number"
            ? re.allocationGb
            : typeof re.allocation === "number"
            ? re.allocation
            : undefined;
        if (norm) {
          parsedEntries.push({
            id: eId !== undefined && eId !== null ? eId : undefined,
            normPhone: norm,
            allocationGb: alloc,
            status: st,
          });
        }
      }

      const canonicalOrderId = String(orderId || payload?.order?.orderId || "");
      const claimedIndices = new Set<number>();

      for (const ord of orders) {
        const ordNormPhone = normalizePhoneLast9(ord.phoneNumber);
        const cachedParts = (ord.providerReference || "").replace("CLICKYFIED:", "").trim().split(":");
        const cachedEntryId = cachedParts.length >= 2 ? cachedParts[cachedParts.length - 1] : null;

        // 1. Match by cached entry ID if available
        let matchedIdx = -1;
        if (cachedEntryId) {
          matchedIdx = parsedEntries.findIndex(
            (pe, idx) =>
              !claimedIndices.has(idx) &&
              pe.id !== undefined &&
              String(pe.id) === String(cachedEntryId)
          );
        }

        // 2. Match by phone + allocation GB
        if (matchedIdx === -1) {
          matchedIdx = parsedEntries.findIndex(
            (pe, idx) =>
              !claimedIndices.has(idx) &&
              pe.normPhone === ordNormPhone &&
              pe.allocationGb !== undefined &&
              Math.abs(pe.allocationGb - ord.gbAmount) <= 0.1
          );
        }

        // 3. Fallback match by phone
        if (matchedIdx === -1) {
          matchedIdx = parsedEntries.findIndex(
            (pe, idx) => !claimedIndices.has(idx) && pe.normPhone === ordNormPhone
          );
        }

        const matchedEntry = matchedIdx !== -1 ? parsedEntries[matchedIdx] : null;
        if (matchedIdx !== -1) {
          claimedIndices.add(matchedIdx);
        }

        const entryStatus = matchedEntry?.status;
        const eId = matchedEntry?.id;

        // Cache canonical orderId & entryId in providerReference (format CLICKYFIED:orderId:entryId)
        if (eId !== undefined && eId !== null && canonicalOrderId) {
          const expectedRef = `CLICKYFIED:${canonicalOrderId}:${eId}`;
          if (ord.providerReference !== expectedRef) {
            await prisma.order
              .update({
                where: { id: ord.id },
                data: { providerReference: expectedRef },
              })
              .catch(() => {});
            ord.providerReference = expectedRef;
          }
        }

        const hasExplicitBatchStatus = rawStatus !== "";
        let targetStatus: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" | null = null;
        if (entryStatus) {
          const mapped = mapClickyfiedStatus(entryStatus);
          if (["SUCCESS", "FAILED", "CANCELLED"].includes(mapped)) {
            targetStatus = mapped;
          } else {
            // Any active entry reported by Clickyfied is PROCESSING
            targetStatus = "PROCESSING";
          }
        } else if (hasExplicitBatchStatus) {
          // SAFEGUARD: If individual entries were provided and this order was NOT matched to any of them,
          // or if this order was tagged :BLOCKED, it is NOT part of this delivery batch!
          // NEVER escalate an unmatched or BLOCKED order to SUCCESS based on parent batch status!
          if ((parsedEntries.length > 0 && !matchedEntry) || ord.providerReference?.includes(":BLOCKED")) {
            continue;
          }
          if (["SUCCESS", "FAILED", "CANCELLED"].includes(overallTargetStatus)) {
            targetStatus = overallTargetStatus;
          } else {
            targetStatus = "PROCESSING";
          }
        }

        if (targetStatus && targetStatus !== ord.status) {
          await changeOrderStatus(
            ord.id,
            targetStatus,
            payload?.failureReason ||
              payload?.notes ||
              `Updated delivery status via callback (${entryStatus || rawStatus || targetStatus})`,
            { id: "system", label: "System Sync" },
            { force: true }
          );

          await recordAudit({
            userId: ord.userId,
            actorLabel: "System Sync",
            action: "order.callback_update",
            target: `order:${ord.id}`,
            newValue: JSON.stringify({ event: effectiveEvent, status: targetStatus, orderId, entryStatus }),
          });
        }
      }
    }

    // Record incoming webhook to OrderApiLog for complete visibility
    const durationMs = Date.now() - startTime;
    await recordOrderApiLog({
      orderId: order?.id ?? null,
      provider: "CLICKYFIED",
      action: "WEBHOOK",
      endpoint: "/api/webhooks/providers/clickyfied",
      method: "POST",
      requestPayload: payload,
      responsePayload: { received: true, event: effectiveEvent, matchedOrders: orders.length },
      statusCode: 200,
      success: true,
      errorMessage: orders.length === 0 ? "No local orders matched callback payload" : null,
      providerReference: orderId ? `CLICKYFIED:${orderId}` : null,
      durationMs,
    });

    return NextResponse.json({ received: true, orderId: order?.id ?? null, matchedOrders: orders.length });
  } catch (err: any) {
    console.error("Clickyfied callback error:", err);
    await recordOrderApiLog({
      orderId: null,
      provider: "CLICKYFIED",
      action: "WEBHOOK",
      endpoint: "/api/webhooks/providers/clickyfied",
      method: "POST",
      statusCode: 500,
      success: false,
      errorMessage: err?.message || "Callback processing error",
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: err?.message || "Callback processing error" }, { status: 500 });
  }
}
