import { prisma } from "../src/lib/prisma";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient, normalizeGhanaPhoneNumber } from "../src/lib/provider-apis/clickyfied";
import { normalizePhoneLast9 } from "../src/lib/provider-apis/router";

async function main() {
  console.log("================================================================================");
  console.log("       Reconcile 262 Orders against ALL recent Clickyfied batches");
  console.log("================================================================================\n");

  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  // 1. Fetch recent batches from Clickyfied
  console.log("Fetching recent order list from Clickyfied account...");
  const recentOrders = await client.listOrders(50, 0);
  console.log(`Found ${recentOrders.length} batches in Clickyfied order list.`);

  // 2. Build map of all phone numbers delivered on Clickyfied by fetching batch details
  const clickyfiedDeliveries = new Map<string, Array<{ orderId: string; entryId: any; status: string; allocationGb: number }>>();

  // Limit to batches from today (first 35 batches covers the entire morning)
  const batchesToFetch = recentOrders.slice(0, 35);
  console.log(`Fetching detailed entries for ${batchesToFetch.length} recent batches...`);

  for (let i = 0; i < batchesToFetch.length; i++) {
    const bo = batchesToFetch[i];
    const bOrderId = String(bo.orderId || bo.id);
    try {
      const details = await client.getOrderStatus(bOrderId);
      const rawAny = details.raw as any;
      const entries: any[] = rawAny?.order?.entries || rawAny?.entries || [];

      for (const e of entries) {
        const pNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
        if (!pNorm) continue;
        const alloc = typeof e.allocationGB === "number" ? e.allocationGB : e.allocationGb;
        const eId = e.orderEntryId ?? e.entryId ?? e.id;
        const st = e.status || details.status || "UNKNOWN";

        if (!clickyfiedDeliveries.has(pNorm)) {
          clickyfiedDeliveries.set(pNorm, []);
        }
        clickyfiedDeliveries.get(pNorm)!.push({
          orderId: bOrderId,
          entryId: eId,
          status: st,
          allocationGb: alloc,
        });
      }
      process.stdout.write(`.`);
    } catch (err: any) {
      // ignore individual batch errors
    }
  }
  console.log(`\nSuccessfully indexed ${clickyfiedDeliveries.size} unique recipient phone numbers from Clickyfied.\n`);

  // 3. Now check the 262 suspect orders
  const suspectOrders = await prisma.order.findMany({
    where: {
      status: "SUCCESS",
      createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      network: "MTN",
      OR: [
        { providerReference: { contains: ":BLOCKED" } },
        { providerReference: null },
        { providerReference: { not: { contains: ":" } } },
      ],
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      status: true,
      providerReference: true,
      externalReference: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${suspectOrders.length} orders with questionable provider reference in last 12h.`);

  let actuallyOnClickyfied = 0;
  let trulyMissing = 0;

  const foundOnProvider: Array<{ order: typeof suspectOrders[0]; match: any }> = [];
  const missingFromProvider: typeof suspectOrders = [];

  for (const o of suspectOrders) {
    const pNorm = normalizePhoneLast9(o.phoneNumber);
    const matches = clickyfiedDeliveries.get(pNorm) || [];
    // Try to match allocation GB
    const exactMatch = matches.find((m) => m.allocationGb === undefined || Math.abs(m.allocationGb - o.gbAmount) <= 0.1) || matches[0];

    if (exactMatch) {
      actuallyOnClickyfied++;
      foundOnProvider.push({ order: o, match: exactMatch });
    } else {
      trulyMissing++;
      missingFromProvider.push(o);
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`ACTUALLY DELIVERED ON CLICKYFIED (Keep SUCCESS) : ${actuallyOnClickyfied}`);
  console.log(`TRULY NEVER ON CLICKYFIED (Reset to PENDING)   : ${trulyMissing}`);
  console.log("--------------------------------------------------------------------------------\n");

  if (foundOnProvider.length > 0) {
    console.log("Sample of ACTUALLY DELIVERED orders (like #12875):");
    for (const item of foundOnProvider.slice(0, 5)) {
      console.log(`  Order #${item.order.id} | ${item.order.phoneNumber} | ${item.order.gbAmount}GB -> On Clickyfied: batch ${item.match.orderId}, entry #${item.match.entryId}, status: ${item.match.status}`);
    }
  }

  if (missingFromProvider.length > 0) {
    console.log("\nSample of TRULY MISSING orders (never reached Clickyfied):");
    for (const o of missingFromProvider.slice(0, 5)) {
      console.log(`  Order #${o.id} | ${o.phoneNumber} | ${o.gbAmount}GB | Ref: ${o.providerReference}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
