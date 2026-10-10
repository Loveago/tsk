import { prisma } from "../src/lib/prisma";
import {
  CYCLE_SETTING_KEY,
  DIVERTED_REFS_SETTING_KEY,
  DIVERTED_PHONES_SETTING_KEY,
  DATA_DEALS_STOREFRONT_FILTER,
  LOFAQ_ALLOCATION_PER_10,
  TOTAL_CYCLE_SLOTS,
  OrderCycleState,
} from "../src/lib/order-allocation";

// ANSI colors for clean terminal output
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";

function normalizePhone9(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function formatGHS(pesewas: number): string {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}

function maskPhone(phone: string, verbose = false): string {
  if (verbose || !phone) return phone;
  const digits = phone.trim();
  if (digits.length <= 6) return digits;
  return digits.slice(0, 3) + "****" + digits.slice(-3);
}

function printBoxHeader(title: string) {
  console.log(`\n${BOLD}${CYAN}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`${BOLD}${CYAN}│  ${title.padEnd(68)}│${RESET}`);
  console.log(`${BOLD}${CYAN}├────────────────────────────────────────────────────────────────────────┤${RESET}`);
}

function printBoxFooter() {
  console.log(`${BOLD}${CYAN}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const isToday = args.includes("--today");
  const isYesterday = args.includes("--yesterday");
  const verbose = args.includes("--verbose") || args.includes("-v");

  const daysArg = args.find((a) => a.startsWith("--days="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const rowLimit = limitArg ? parseInt(limitArg.replace("--limit=", ""), 10) : 25;

  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  let timeLabel = "All Time";

  const now = new Date();
  if (isYesterday) {
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    fromDate = startOfYesterday;
    toDate = endOfYesterday;
    timeLabel = `Yesterday (${startOfYesterday.toISOString().slice(0, 10)})`;
  } else if (isToday) {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    timeLabel = `Today (${fromDate.toISOString().slice(0, 10)})`;
  } else if (daysArg) {
    const days = parseInt(daysArg.replace("--days=", ""), 10) || 7;
    fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    timeLabel = `Last ${days} days (since ${fromDate.toISOString().slice(0, 10)})`;
  } else if (!isAll) {
    // Default to Today, but show note that --all or --days=N is available
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    timeLabel = `Today (${fromDate.toISOString().slice(0, 10)}) [Use --all or --days=7 to expand]`;
  }

  // 1. Fetch Storefronts
  const ddStores = await prisma.storefront.findMany({
    where: DATA_DEALS_STOREFRONT_FILTER,
    select: { id: true, slug: true, name: true },
  });
  const ddStoreIds = new Set(ddStores.map((s) => s.id));

  const lofaqStores = await prisma.storefront.findMany({
    where: {
      OR: [
        { slug: { in: ["lofaq-data-hub", "lofaq", "lofaq-hub", "lofaqdatahub"] } },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });
  const lofaqStoreIds = new Set(lofaqStores.map((s) => s.id));

  // 2. Fetch System Settings (Cycle state, Diverted refs, Diverted phones)
  const cycleSetting = await prisma.systemSetting.findUnique({
    where: { key: CYCLE_SETTING_KEY },
  });
  let cycleState: OrderCycleState = {
    slots: [true, true, true, true, false, false, false, false, false, false],
    index: 0,
    cycleCount: 1,
  };
  if (cycleSetting?.value) {
    try {
      cycleState = JSON.parse(cycleSetting.value);
    } catch {}
  }

  const divertedRefsSetting = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_REFS_SETTING_KEY },
  });
  let divertedRefs = new Set<string>();
  if (divertedRefsSetting?.value) {
    try {
      const arr = JSON.parse(divertedRefsSetting.value);
      if (Array.isArray(arr)) divertedRefs = new Set(arr);
    } catch {}
  }

  const divertedPhonesSetting = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_PHONES_SETTING_KEY },
  });
  let divertedPhones = new Set<string>();
  if (divertedPhonesSetting?.value) {
    try {
      const arr = JSON.parse(divertedPhonesSetting.value);
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (p) divertedPhones.add(normalizePhone9(p));
        }
      }
    } catch {}
  }

  // 3. Fetch Orders
  const relevantStoreIds = Array.from(new Set([...Array.from(ddStoreIds), ...Array.from(lofaqStoreIds)]));

  const dateFilter: Record<string, unknown> = {};
  if (fromDate) dateFilter.gte = fromDate;
  if (toDate) dateFilter.lte = toDate;

  const orders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: { in: relevantStoreIds },
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      underlyingOrderId: { not: null }, // settled orders
    },
    include: {
      storefront: { select: { id: true, slug: true, name: true } },
      underlyingOrder: { select: { id: true, status: true, network: true, gbAmount: true } },
      product: { select: { dataPackage: { select: { network: true, gbAmount: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Also pre-fetch all past settled orders across all time to determine repeat vs new
  const allHistoricalOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: { in: relevantStoreIds },
      underlyingOrderId: { not: null },
    },
    select: {
      id: true,
      storefrontId: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
      paymentReference: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Map each customer's first-ever order time
  const customerFirstSeen = new Map<string, Date>();
  for (const hist of allHistoricalOrders) {
    const key = normalizePhone9(hist.customerPhone);
    if (!customerFirstSeen.has(key)) {
      customerFirstSeen.set(key, hist.createdAt);
    }
  }

  // 4. Compute Statistics
  let ddOrderCount = 0;
  let ddVolumePesewas = 0;

  let lofaqOrderCount = 0;
  let lofaqVolumePesewas = 0;
  let lofaqDivertedCount = 0;
  let lofaqDirectCount = 0;

  let newCustomerTotal = 0;
  let newCustomerToLofaq = 0;
  let newCustomerToDD = 0;

  let repeatCustomerTotal = 0;
  let repeatLofaqCount = 0;
  let repeatDDCount = 0;

  interface ClassifiedOrder {
    order: typeof orders[0];
    isDataDeals: boolean;
    isLofaq: boolean;
    isDiverted: boolean;
    isNewCustomer: boolean;
    classification: string;
    classificationTag: string;
  }

  const classifiedOrders: ClassifiedOrder[] = [];

  for (const o of orders) {
    const isDD = ddStoreIds.has(o.storefrontId);
    const isLofaq = lofaqStoreIds.has(o.storefrontId);
    const isDiverted = divertedRefs.has(o.paymentReference);

    if (isDD) {
      ddOrderCount++;
      ddVolumePesewas += o.sellingPrice;
    } else if (isLofaq) {
      lofaqOrderCount++;
      lofaqVolumePesewas += o.sellingPrice;
      if (isDiverted) {
        lofaqDivertedCount++;
      } else {
        lofaqDirectCount++;
      }
    }

    const phoneKey = normalizePhone9(o.customerPhone);
    const firstSeen = customerFirstSeen.get(phoneKey);
    // Is new customer if this order is their first order ever (within 2 seconds tolerance)
    const isNewCustomer = !firstSeen || Math.abs(firstSeen.getTime() - o.createdAt.getTime()) < 2000;

    let classification = "";
    let classificationTag = "";

    if (isNewCustomer) {
      newCustomerTotal++;
      if (isLofaq) {
        newCustomerToLofaq++;
        classification = isDiverted
          ? "NEW CUSTOMER -> LOFAQ (4/10 Split)"
          : "NEW CUSTOMER -> LOFAQ (Direct)";
        classificationTag = `${GREEN}NEW -> LOFAQ${RESET}`;
      } else {
        newCustomerToDD++;
        classification = "NEW CUSTOMER -> DATA DEALS";
        classificationTag = `${CYAN}NEW -> DATA DEALS${RESET}`;
      }
    } else {
      repeatCustomerTotal++;
      if (isLofaq) {
        repeatLofaqCount++;
        classification = isDiverted
          ? "REPEAT BUYER -> LOFAQ (Sticky)"
          : "REPEAT BUYER -> LOFAQ (Direct)";
        classificationTag = `${MAGENTA}REPEAT -> LOFAQ${RESET}`;
      } else {
        repeatDDCount++;
        classification = "REPEAT BUYER -> DATA DEALS (Protected)";
        classificationTag = `${BLUE}REPEAT -> DATA DEALS${RESET}`;
      }
    }

    classifiedOrders.push({
      order: o,
      isDataDeals: isDD,
      isLofaq,
      isDiverted,
      isNewCustomer,
      classification,
      classificationTag,
    });
  }

  const totalOrders = ddOrderCount + lofaqOrderCount;
  const totalVolumePesewas = ddVolumePesewas + lofaqVolumePesewas;

  // PRINT CLI REPORT
  console.clear?.();
  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}       TSKCONNECT — STOREFRONT ORDER ALLOCATION AUDIT${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${DIM}Time Window  : ${timeLabel}${RESET}`);
  console.log(`${DIM}Execution    : ${new Date().toLocaleString()} (UTC: ${new Date().toISOString()})${RESET}`);

  // SECTION 1: SUMMARY
  printBoxHeader("📊 OVERVIEW SUMMARY");
  console.log(`  ${BOLD}Total Settled Orders:${RESET}  ${BOLD}${totalOrders}${RESET}`);
  console.log(`  ${BOLD}Total Sales Volume  :${RESET}  ${BOLD}${formatGHS(totalVolumePesewas)}${RESET}\n`);

  const ddPct = totalOrders > 0 ? ((ddOrderCount / totalOrders) * 100).toFixed(1) : "0.0";
  const lofaqPct = totalOrders > 0 ? ((lofaqOrderCount / totalOrders) * 100).toFixed(1) : "0.0";

  console.log(`  ${BOLD}${CYAN}Data Deals:${RESET}            ${BOLD}${ddOrderCount}${RESET} orders (${ddPct}%)  │  ${formatGHS(ddVolumePesewas)}`);
  console.log(`  ${BOLD}${GREEN}Lofaq Data Hub:${RESET}        ${BOLD}${lofaqOrderCount}${RESET} orders (${lofaqPct}%)  │  ${formatGHS(lofaqVolumePesewas)}`);
  if (lofaqOrderCount > 0) {
    console.log(`    ${DIM}├─ Diverted from DD :${RESET} ${lofaqDivertedCount} orders`);
    console.log(`    ${DIM}└─ Direct on Lofaq  :${RESET} ${lofaqDirectCount} orders`);
  }
  printBoxFooter();

  // SECTION 2: NEW VS REPEAT CUSTOMERS
  printBoxHeader("👥 CUSTOMER ROUTING & ALLOCATION BREAKDOWN");
  console.log(`  ${BOLD}Brand-New Customers:${RESET}   ${BOLD}${newCustomerTotal}${RESET} total in this period`);
  const newLofaqPct = newCustomerTotal > 0 ? ((newCustomerToLofaq / newCustomerTotal) * 100).toFixed(1) : "0.0";
  const newDDPct = newCustomerTotal > 0 ? ((newCustomerToDD / newCustomerTotal) * 100).toFixed(1) : "0.0";

  console.log(`    ${GREEN}├─ Allocated to Lofaq:${RESET}     ${BOLD}${newCustomerToLofaq}${RESET} (${newLofaqPct}%)  ${DIM}[Target: ${LOFAQ_ALLOCATION_PER_10} in ${TOTAL_CYCLE_SLOTS} = 40.0%]${RESET}`);
  console.log(`    ${CYAN}└─ Retained on Data Deals:${RESET} ${BOLD}${newCustomerToDD}${RESET} (${newDDPct}%)  ${DIM}[Target: ${TOTAL_CYCLE_SLOTS - LOFAQ_ALLOCATION_PER_10} in ${TOTAL_CYCLE_SLOTS} = 60.0%]${RESET}\n`);

  console.log(`  ${BOLD}Repeat Customers:${RESET}      ${BOLD}${repeatCustomerTotal}${RESET} total in this period`);
  console.log(`    ${MAGENTA}├─ Sticky to Lofaq:${RESET}        ${BOLD}${repeatLofaqCount}${RESET} ${DIM}(100% sticky to Lofaq Hub)${RESET}`);
  console.log(`    ${BLUE}└─ Protected on DD:${RESET}        ${BOLD}${repeatDDCount}${RESET} ${DIM}(100% protected on Data Deals)${RESET}`);
  printBoxFooter();

  // SECTION 3: 10-SLOT CYCLE ENGINE STATUS
  printBoxHeader("🔄 CURRENT 10-NEW-CUSTOMER CYCLE STATUS");
  console.log(`  ${BOLD}Active Cycle Number :${RESET}  #${cycleState.cycleCount}`);
  console.log(`  ${BOLD}Current Slot Index  :${RESET}  Slot ${cycleState.index + 1} of ${TOTAL_CYCLE_SLOTS}`);

  // Visual diagram of the 10 slots
  const visualSlots = cycleState.slots.map((isLofaq, idx) => {
    const isCurrent = idx === cycleState.index;
    const isPassed = idx < cycleState.index;
    const label = isLofaq ? "LOFAQ" : "DD";
    const marker = isCurrent ? `👉 ` : "";

    if (isPassed) {
      return `${GRAY}[${marker}✓ ${label}]${RESET}`;
    } else if (isCurrent) {
      return `${BOLD}${YELLOW}[${marker}${label}]${RESET}`;
    } else {
      return isLofaq ? `${GREEN}[${label}]${RESET}` : `${CYAN}[${label}]${RESET}`;
    }
  });

  console.log(`\n  ${BOLD}Cycle Slots layout  :${RESET}`);
  console.log(`  ${visualSlots.slice(0, 5).join("  ")}`);
  console.log(`  ${visualSlots.slice(5, 10).join("  ")}\n`);

  const remainingSlots = cycleState.slots.slice(cycleState.index);
  const remLofaq = remainingSlots.filter(Boolean).length;
  const remDD = remainingSlots.filter((v) => !v).length;
  const nextTarget = cycleState.slots[cycleState.index] ? `${GREEN}LOFAQ DATA HUB${RESET}` : `${CYAN}DATA DEALS${RESET}`;

  console.log(`  ${BOLD}Remaining in Cycle  :${RESET}  ${GREEN}${remLofaq} Lofaq${RESET}, ${CYAN}${remDD} Data Deals${RESET}`);
  console.log(`  ${BOLD}Next New Customer   :${RESET}  Will route to ${BOLD}${nextTarget}${RESET}`);
  console.log(`  ${BOLD}Tracked Diverted DB :${RESET}  ${divertedRefs.size} references | ${divertedPhones.size} customer phones`);
  printBoxFooter();

  // SECTION 4: RECENT ORDERS TABLE
  if (classifiedOrders.length === 0) {
    console.log(`${YELLOW}No settled storefront orders found for ${timeLabel}.${RESET}`);
    console.log(`${DIM}Tip: Run with --all or --days=7 to see historical orders.${RESET}\n`);
    return;
  }

  const displayedOrders = classifiedOrders.slice(0, rowLimit);
  console.log(`${BOLD}📋 RECENT ORDERS BREAKDOWN (Showing ${displayedOrders.length} of ${classifiedOrders.length})${RESET}`);
  console.log(`${DIM}---------------------------------------------------------------------------------------------------------------${RESET}`);
  console.log(
    `${BOLD}${"TIME (UTC)".padEnd(17)} ${"PHONE".padEnd(14)} ${"STOREFRONT".padEnd(16)} ${"ROUTE / REASON".padEnd(30)} ${"AMOUNT".padEnd(12)} ${"STATUS"}${RESET}`
  );
  console.log(`${DIM}---------------------------------------------------------------------------------------------------------------${RESET}`);

  for (const item of displayedOrders) {
    const o = item.order;
    const timeStr = o.createdAt.toISOString().replace("T", " ").slice(5, 16);
    const phoneStr = maskPhone(o.customerPhone, verbose).padEnd(14);
    const storeStr = (o.storefront.slug.length > 15 ? o.storefront.slug.slice(0, 14) + "…" : o.storefront.slug).padEnd(16);
    const amountStr = formatGHS(o.sellingPrice).padEnd(12);
    const statusStr = o.underlyingOrder?.status || o.status;

    let statusColored = statusStr;
    if (statusStr === "SUCCESS") statusColored = `${GREEN}SUCCESS${RESET}`;
    else if (statusStr === "PROCESSING" || statusStr === "PENDING") statusColored = `${YELLOW}${statusStr}${RESET}`;
    else if (statusStr === "FAILED") statusColored = `${RED}FAILED${RESET}`;

    console.log(
      `${timeStr}  ${phoneStr} ${storeStr} ${item.classificationTag.padEnd(39)} ${amountStr} ${statusColored}`
    );
  }

  console.log(`${DIM}---------------------------------------------------------------------------------------------------------------${RESET}`);
  if (classifiedOrders.length > rowLimit) {
    console.log(`${DIM}Showing ${rowLimit} of ${classifiedOrders.length} orders. Use --limit=${classifiedOrders.length} to see all.${RESET}`);
  }
  console.log(`${DIM}Flags: --today | --yesterday | --days=7 | --all | --verbose | --limit=50${RESET}\n`);
}

main()
  .catch((err) => {
    console.error("Audit script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
