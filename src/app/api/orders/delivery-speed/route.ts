import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-helpers";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatOrderTimestamp(date: Date): string {
  // Format: "21 Sept, 07:13 pm"
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = hours.toString().padStart(2, "0");
  return `${day} ${month}, ${hoursStr}:${minutes} ${ampm}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawNetwork = (searchParams.get("network") ?? "MTN").toUpperCase();
    const network = rawNetwork.includes("AIRTELTIGO") ? "AIRTELTIGO" : rawNetwork;

    // Check if admin has toggled off the live delivery speed tracker
    const [speedFeatureSetting, adminNoticeSetting, adminWaitOverrideSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "live_delivery_speed_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: `delivery_speed_notice_${network}` } }),
      prisma.systemSetting.findUnique({ where: { key: `delivery_speed_override_${network}` } }),
    ]);

    if (speedFeatureSetting?.value === "false") {
      return NextResponse.json({
        enabled: false,
        network,
      });
    }

    // Query recent completed orders for this network (pool large enough to capture recent delivery batches)
    const recentOrders = await prisma.order.findMany({
      where: {
        network: { startsWith: network, mode: "insensitive" },
        status: { in: ["SUCCESS", "COMPLETED"] },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 60,
      select: {
        id: true,
        network: true,
        gbAmount: true,
        createdAt: true,
        completedAt: true,
        updatedAt: true,
        externalReference: true,
      },
    });

    const mappedOrders = recentOrders.map((o) => {
      const start = new Date(o.createdAt);
      const end = new Date(o.completedAt ?? o.updatedAt);
      const diffMins = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));

      // Anonymize reference for display
      const ref = o.externalReference
        ? `#${o.externalReference.slice(-7)}`
        : `#${o.id + 100000}`;

      return {
        id: o.id,
        reference: ref,
        gbAmount: o.gbAmount,
        createdAt: start,
        completedAt: end,
        durationMinutes: diffMins,
        durationFormatted: formatDuration(diffMins),
        placedAtFormatted: formatOrderTimestamp(start),
        deliveredAtFormatted: formatOrderTimestamp(end),
        completedAtIso: end.toISOString(),
      };
    });

    // Group into delivery batches where completedAt timestamps are within a delivery session window
    const BATCH_GAP_MS = 35 * 60 * 1000; // 35 minutes gap denotes a distinct delivery batch
    const batches: typeof mappedOrders[] = [];
    let currentBatch: typeof mappedOrders = [];
    let lastCompletedTime: number | null = null;

    for (const order of mappedOrders) {
      const orderCompletedTime = order.completedAt.getTime();
      if (lastCompletedTime === null || lastCompletedTime - orderCompletedTime <= BATCH_GAP_MS) {
        currentBatch.push(order);
        lastCompletedTime = orderCompletedTime;
      } else {
        batches.push(currentBatch);
        currentBatch = [order];
        lastCompletedTime = orderCompletedTime;
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // In each batch:
    // Sort so the latest order placed (highest createdAt) that was delivered in that window comes first.
    // Exclude extreme backlogs (> 60m) if fast orders (<= 60m) exist in the batch.
    for (const batch of batches) {
      batch.sort((a, b) => {
        const aIsBacklog = a.durationMinutes > 60;
        const bIsBacklog = b.durationMinutes > 60;
        if (aIsBacklog && !bIsBacklog) return 1;
        if (!aIsBacklog && bIsBacklog) return -1;

        // If placed more than 2 minutes apart, order placed later (higher createdAt) comes first
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (Math.abs(timeDiff) > 2 * 60 * 1000) {
          return timeDiff;
        }
        // If placed very close together, pick fastest turnaround
        return a.durationMinutes - b.durationMinutes;
      });
    }

    // Select proof orders (up to 2):
    // recentDelivered[0] = "Last Delivered": latest-placed order delivered in the latest delivery window
    // recentDelivered[1] = "Recent": second latest/fastest order
    const proofCandidates: typeof mappedOrders = [];

    if (batches.length > 0) {
      const latestBatch = batches[0];
      // Only show orders that delivered within reasonable turnaround (<= 60m) to showcase speed
      const validLatestBatch = latestBatch.filter((o) => o.durationMinutes <= 60);

      if (validLatestBatch.length >= 2) {
        proofCandidates.push(validLatestBatch[0], validLatestBatch[1]);
      } else if (validLatestBatch.length === 1) {
        proofCandidates.push(validLatestBatch[0]);
        // Look for second proof from previous delivery batch
        for (let i = 1; i < batches.length; i++) {
          const prevValid = batches[i].filter((o) => o.durationMinutes <= 60);
          if (prevValid.length > 0) {
            proofCandidates.push(prevValid[0]);
            break;
          }
        }
      } else {
        // If the latest batch had only delayed orders, look across recent batches for fast ones
        for (const b of batches) {
          const fastOrders = b.filter((o) => o.durationMinutes <= 60);
          for (const fo of fastOrders) {
            if (!proofCandidates.some((p) => p.id === fo.id)) {
              proofCandidates.push(fo);
              if (proofCandidates.length >= 2) break;
            }
          }
          if (proofCandidates.length >= 2) break;
        }
      }
    }

    const recentDelivered = proofCandidates.slice(0, 2).map((o) => ({
      id: o.id,
      reference: o.reference,
      gbAmount: o.gbAmount,
      durationMinutes: o.durationMinutes,
      durationFormatted: o.durationFormatted,
      placedAtFormatted: o.placedAtFormatted,
      deliveredAtFormatted: o.deliveredAtFormatted,
      completedAt: o.completedAtIso,
    }));

    // Baseline turnaround defaults if database has few/no orders yet (marketing-optimized)
    const fallbackMins = network === "MTN" ? 15 : network === "TELECEL" ? 10 : 8;
    let estimatedWaitMinutes = fallbackMins;

    if (adminWaitOverrideSetting?.value && !isNaN(Number(adminWaitOverrideSetting.value))) {
      estimatedWaitMinutes = Number(adminWaitOverrideSetting.value);
    } else {
      // Find all recent fast durations (<= 60 mins) to calculate a realistic wait time
      const fastDurations = mappedOrders
        .filter((o) => o.durationMinutes <= 60)
        .slice(0, 6)
        .map((o) => o.durationMinutes);

      if (fastDurations.length > 0) {
        const avg = Math.round(fastDurations.reduce((a, b) => a + b, 0) / fastDurations.length);
        // Clamp between 5m (realistic minimum) and 35m
        estimatedWaitMinutes = Math.max(5, Math.min(avg, 35));
      }
    }

    const estimatedWaitFormatted = formatDuration(estimatedWaitMinutes);

    // Status Level classification
    let statusLevel: "FAST" | "NORMAL" | "BUSY" = "FAST";
    let statusSubtitle = "Fast delivery active right now — orders processing rapidly.";

    if (estimatedWaitMinutes <= 30) {
      statusLevel = "FAST";
      statusSubtitle = "Fast delivery active right now — orders processing rapidly.";
    } else if (estimatedWaitMinutes <= 50) {
      statusLevel = "NORMAL";
      statusSubtitle = "Normal network delivery speed right now.";
    } else {
      statusLevel = "BUSY";
      statusSubtitle = "Some extra wait right now due to peak network traffic.";
    }

    // Network specific headline
    const networkDisplayName = network === "AIRTELTIGO" ? "AT (AirtelTigo)" : network;
    const headline = `${networkDisplayName} Delivery Status — new orders within about ${estimatedWaitFormatted}.`;

    return NextResponse.json({
      enabled: true,
      network,
      networkDisplayName,
      headline,
      statusSubtitle: adminNoticeSetting?.value || statusSubtitle,
      estimatedWaitMinutes,
      estimatedWaitFormatted,
      statusLevel,
      adminNotice: adminNoticeSetting?.value || null,
      recentDelivered,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
