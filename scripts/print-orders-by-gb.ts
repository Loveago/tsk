import { prisma } from "../src/lib/prisma";
import { normalizeGhanaPhoneNumber } from "../src/lib/phone-utils";

/**
 * Script to find orders matching specific GB amounts (e.g., 7GB and 12GB)
 * and output them in the format: <phoneNumber> <gbAmount> (e.g. 0535308873 12)
 *
 * Usage:
 *   npx tsx scripts/print-orders-by-gb.ts
 *   npx tsx scripts/print-orders-by-gb.ts --date=2026-10-25
 *   npx tsx scripts/print-orders-by-gb.ts --today
 *   npx tsx scripts/print-orders-by-gb.ts --gb=7,12
 *   npx tsx scripts/print-orders-by-gb.ts --network=MTN
 *   npx tsx scripts/print-orders-by-gb.ts --status=ALL
 */

function parseArgs() {
  const args = process.argv.slice(2);
  let dateStr: string | null = null;
  let isToday = false;
  let gbList = [7, 12];
  let networkFilter: string | null = "MTN";
  let statusFilter: string[] | null = null; // null means exclude REFUNDED and CANCELLED
  let includeAllStatuses = false;

  for (const arg of args) {
    if (arg.startsWith("--date=")) {
      dateStr = arg.replace("--date=", "").trim();
    } else if (arg === "--today") {
      isToday = true;
    } else if (arg.startsWith("--gb=")) {
      gbList = arg
        .replace("--gb=", "")
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
    } else if (arg.startsWith("--network=")) {
      const net = arg.replace("--network=", "").trim().toUpperCase();
      networkFilter = net === "ALL" ? null : net;
    } else if (arg.startsWith("--status=")) {
      const val = arg.replace("--status=", "").trim().toUpperCase();
      if (val === "ALL") {
        includeAllStatuses = true;
      } else {
        statusFilter = val.split(",").map((s) => s.trim());
      }
    }
  }

  return { dateStr, isToday, gbList, networkFilter, statusFilter, includeAllStatuses };
}

function getDateRange(dateStr: string | null, isToday: boolean) {
  let targetDate: Date;

  if (dateStr) {
    // Expected format: YYYY-MM-DD
    targetDate = new Date(`${dateStr}T00:00:00Z`);
  } else if (isToday) {
    targetDate = new Date();
  } else {
    // Default: Yesterday
    const now = new Date();
    targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // Get YYYY-MM-DD for target date in UTC
  const year = targetDate.getUTCFullYear();
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getUTCDate()).padStart(2, "0");
  const dateFormatted = `${year}-${month}-${day}`;

  const startOfDay = new Date(`${dateFormatted}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateFormatted}T23:59:59.999Z`);

  return { dateFormatted, startOfDay, endOfDay };
}

async function main() {
  const { dateStr, isToday, gbList, networkFilter, statusFilter, includeAllStatuses } = parseArgs();
  const { dateFormatted, startOfDay, endOfDay } = getDateRange(dateStr, isToday);

  // Informational logs sent to stderr so stdout remains purely "<phone> <gb>"
  console.error("=================================================");
  console.error(`Checking orders for: ${dateFormatted}`);
  console.error(`GB Target          : ${gbList.join("GB, ")}GB`);
  if (networkFilter) console.error(`Network filter     : ${networkFilter}`);
  if (statusFilter) console.error(`Status filter      : ${statusFilter.join(", ")}`);
  else if (includeAllStatuses) console.error(`Status filter      : ALL statuses`);
  else console.error(`Status filter      : Excluding CANCELLED and REFUNDED`);
  console.error("=================================================");

  const whereClause: any = {
    gbAmount: { in: gbList },
    createdAt: {
      gte: startOfDay,
      lte: endOfDay,
    },
  };

  if (networkFilter && networkFilter !== "ALL") {
    if (networkFilter === "MTN") {
      whereClause.network = { in: ["MTN", "MTN_XPRESS"] };
    } else {
      whereClause.network = networkFilter;
    }
  }

  if (statusFilter && statusFilter.length > 0) {
    whereClause.status = { in: statusFilter };
  } else if (!includeAllStatuses) {
    whereClause.status = { notIn: ["CANCELLED", "REFUNDED"] };
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      network: true,
      status: true,
      createdAt: true,
    },
  });

  if (orders.length === 0) {
    console.error(`\nNo orders found matching the criteria for ${dateFormatted}.`);
    return;
  }

  console.error(`\nFound ${orders.length} order(s):\n`);

  for (const order of orders) {
    const cleanPhone = normalizeGhanaPhoneNumber(order.phoneNumber) || order.phoneNumber;
    // Format: <phone> <gb>
    console.log(`${cleanPhone} ${order.gbAmount}`);
  }

  console.error(`\n---\nTotal outputted: ${orders.length} orders`);
}

main()
  .catch((err) => {
    console.error("Error executing query:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
