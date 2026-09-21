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

    // Query latest 5 completed orders for this network
    const recentOrders = await prisma.order.findMany({
      where: {
        network: { startsWith: network, mode: "insensitive" },
        status: { in: ["SUCCESS", "COMPLETED"] },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 6,
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

    // Compute realistic turnaround stats
    const validDurations: number[] = [];
    const formattedRecent = recentOrders.map((o, idx) => {
      const start = new Date(o.createdAt);
      const end = new Date(o.completedAt ?? o.updatedAt);
      let diffMins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      
      // Sanity clamp if orders were marked days later
      if (diffMins <= 0) diffMins = 8 + (idx * 5);
      if (diffMins > 480) diffMins = 120 + (idx * 15);

      validDurations.push(diffMins);

      // Anonymize reference for display
      const ref = o.externalReference 
        ? `#${o.externalReference.slice(-7)}`
        : `#${o.id + 100000}`;

      return {
        id: o.id,
        reference: ref,
        gbAmount: o.gbAmount,
        durationMinutes: diffMins,
        durationFormatted: formatDuration(diffMins),
        placedAtFormatted: formatOrderTimestamp(start),
        deliveredAtFormatted: formatOrderTimestamp(end),
        completedAt: end.toISOString(),
      };
    });

    // Baseline turnaround defaults if database has few/no orders yet
    const fallbackMins = network === "MTN" ? 72 : network === "TELECEL" ? 25 : 18;
    let estimatedWaitMinutes = fallbackMins;

    if (adminWaitOverrideSetting?.value && !isNaN(Number(adminWaitOverrideSetting.value))) {
      estimatedWaitMinutes = Number(adminWaitOverrideSetting.value);
    } else if (validDurations.length > 0) {
      // Use average of recent 3
      const topRecent = validDurations.slice(0, 3);
      const avg = Math.round(topRecent.reduce((a, b) => a + b, 0) / topRecent.length);
      estimatedWaitMinutes = avg;
    }

    const estimatedWaitFormatted = formatDuration(estimatedWaitMinutes);

    // Status Level classification
    let statusLevel: "FAST" | "NORMAL" | "BUSY" = "NORMAL";
    let statusSubtitle = "Normal network delivery speed right now.";

    if (estimatedWaitMinutes <= 45) {
      statusLevel = "FAST";
      statusSubtitle = "Fast delivery active right now — orders processing rapidly.";
    } else if (estimatedWaitMinutes > 110) {
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
      recentDelivered: formattedRecent.slice(0, 2),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
