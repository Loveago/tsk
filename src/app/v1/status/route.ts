import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOrderProcessingHalted } from "@/lib/orders";
import { generateRequestId } from "@/lib/developer-api";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const halted = await isOrderProcessingHalted();

  const packages = await prisma.dataPackage.findMany({
    where: { active: true },
    select: { network: true },
  });

  const activeNetworks = new Set(packages.map((p) => p.network.toUpperCase()));

  const data = {
    status: "OPERATIONAL",
    timestamp: new Date().toISOString(),
    components: {
      api: {
        name: "Developer API Platform",
        status: "OPERATIONAL",
      },
      mtn: {
        name: "MTN Network",
        status: !halted && activeNetworks.has("MTN") ? "OPERATIONAL" : "DEGRADED",
      },
      telecel: {
        name: "Telecel Network",
        status: !halted && activeNetworks.has("TELECEL") ? "OPERATIONAL" : "DEGRADED",
      },
      airteltigo: {
        name: "AirtelTigo Network",
        status: !halted && activeNetworks.has("AIRTELTIGO") ? "OPERATIONAL" : "DEGRADED",
      },
      orderProcessing: {
        name: "Order Processing Engine",
        status: halted ? "MAINTENANCE" : "OPERATIONAL",
      },
      webhooks: {
        name: "Webhook Delivery Service",
        status: "OPERATIONAL",
      },
    },
    requestId,
  };

  return NextResponse.json(
    {
      success: true,
      data,
      requestId,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    }
  );
}
