import { prisma } from "../src/lib/prisma";
import {
  TOTAL_CYCLE_SLOTS,
  getLofaqAllocationRatio,
  setLofaqAllocationRatio,
  CYCLE_SETTING_KEY,
  OrderCycleState,
} from "../src/lib/order-allocation";

// ANSI terminal colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";

function printBoxHeader(title: string) {
  console.log(`\n${BOLD}${CYAN}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`${BOLD}${CYAN}│  ${title.padEnd(68)}│${RESET}`);
  console.log(`${BOLD}${CYAN}├────────────────────────────────────────────────────────────────────────┤${RESET}`);
}

function printBoxFooter() {
  console.log(`${BOLD}${CYAN}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);
}

function renderVisualSlots(slots: boolean[], activeIndex: number = 0): string[] {
  const rendered = slots.map((isLofaq, idx) => {
    const isCurrent = idx === activeIndex;
    const label = isLofaq ? "LOFAQ" : "DD";
    const marker = isCurrent ? "👉 " : "";

    if (isCurrent) {
      return `${BOLD}${YELLOW}[${marker}${label}]${RESET}`;
    } else {
      return isLofaq ? `${GREEN}[${label}]${RESET}` : `${CYAN}[${label}]${RESET}`;
    }
  });

  return [
    rendered.slice(0, 5).join("  "),
    rendered.slice(5, 10).join("  "),
  ];
}

async function main() {
  const args = process.argv.slice(2);

  // Parse input argument (positional e.g. "4", or flag e.g. "--lofaq=4", "--ratio=4")
  let inputVal: string | undefined;
  for (const arg of args) {
    if (arg.startsWith("--lofaq=")) {
      inputVal = arg.replace("--lofaq=", "");
    } else if (arg.startsWith("--ratio=")) {
      inputVal = arg.replace("--ratio=", "");
    } else if (arg.startsWith("--to=")) {
      inputVal = arg.replace("--to=", "");
    } else if (!arg.startsWith("-")) {
      inputVal = arg;
    }
  }

  const currentRatio = await getLofaqAllocationRatio();

  // If no argument provided, display current status and instructions
  if (inputVal === undefined) {
    const rawCycle = await prisma.systemSetting.findUnique({
      where: { key: CYCLE_SETTING_KEY },
    });
    let cycleState: OrderCycleState | null = null;
    if (rawCycle?.value) {
      try {
        cycleState = JSON.parse(rawCycle.value);
      } catch {}
    }

    printBoxHeader("⚙️  CURRENT NEW CUSTOMER ALLOCATION STATUS");
    console.log(`  ${BOLD}Current Lofaq Allocation:${RESET}     ${BOLD}${GREEN}${currentRatio} out of ${TOTAL_CYCLE_SLOTS}${RESET} (${(currentRatio / TOTAL_CYCLE_SLOTS) * 100}%)`);
    console.log(`  ${BOLD}Current Data Deals Share:${RESET}     ${BOLD}${CYAN}${TOTAL_CYCLE_SLOTS - currentRatio} out of ${TOTAL_CYCLE_SLOTS}${RESET} (${((TOTAL_CYCLE_SLOTS - currentRatio) / TOTAL_CYCLE_SLOTS) * 100}%)`);

    if (cycleState && Array.isArray(cycleState.slots)) {
      console.log(`\n  ${BOLD}Active Cycle Number     :${RESET}     #${cycleState.cycleCount}`);
      console.log(`  ${BOLD}Current Slot Position   :${RESET}     Slot ${cycleState.index + 1} of ${TOTAL_CYCLE_SLOTS}`);
      console.log(`\n  ${BOLD}Active Cycle Slots      :${RESET}`);
      const lines = renderVisualSlots(cycleState.slots, cycleState.index);
      console.log(`  ${lines[0]}`);
      console.log(`  ${lines[1]}`);
    }

    console.log(`\n  ${BOLD}${YELLOW}HOW TO CHANGE THE ALLOCATION:${RESET}`);
    console.log(`  ${DIM}Run with the desired number of orders for Lofaq (0 to 10):${RESET}\n`);
    console.log(`    ${BOLD}npm run set:allocation 4${RESET}     ${DIM}# 4 to Lofaq, 6 to Data Deals (40% / 60%)${RESET}`);
    console.log(`    ${BOLD}npm run set:allocation 5${RESET}     ${DIM}# 5 to Lofaq, 5 to Data Deals (50% / 50%)${RESET}`);
    console.log(`    ${BOLD}npm run set:allocation 3${RESET}     ${DIM}# 3 to Lofaq, 7 to Data Deals (30% / 70%)${RESET}`);
    console.log(`    ${BOLD}npm run set:allocation 0${RESET}     ${DIM}# 0 to Lofaq, 10 to Data Deals (turn off diversion)${RESET}`);
    console.log(`    ${BOLD}npm run set:allocation 10${RESET}    ${DIM}# 10 to Lofaq, 0 to Data Deals (100% to Lofaq)${RESET}`);
    printBoxFooter();
    return;
  }

  // Validate input
  const newRatio = parseInt(inputVal, 10);
  if (isNaN(newRatio) || newRatio < 0 || newRatio > TOTAL_CYCLE_SLOTS) {
    console.error(`\n${RED}✗ Error: Invalid allocation "${inputVal}".${RESET}`);
    console.error(`Please provide an integer between 0 and ${TOTAL_CYCLE_SLOTS}.\n`);
    console.error(`Example: ${BOLD}npm run set:allocation 4${RESET}  (allocates 4 to Lofaq, 6 to Data Deals)\n`);
    process.exit(1);
  }

  // Apply new ratio
  const result = await setLofaqAllocationRatio(newRatio);

  const lofaqPct = ((newRatio / TOTAL_CYCLE_SLOTS) * 100).toFixed(0);
  const ddPct = (((TOTAL_CYCLE_SLOTS - newRatio) / TOTAL_CYCLE_SLOTS) * 100).toFixed(0);

  printBoxHeader("✅ NEW CUSTOMER ALLOCATION UPDATED");
  console.log(`  ${BOLD}Previous Ratio  :${RESET}  ${currentRatio} Lofaq / ${TOTAL_CYCLE_SLOTS - currentRatio} Data Deals`);
  console.log(`  ${BOLD}NEW Ratio       :${RESET}  ${BOLD}${GREEN}${newRatio} Lofaq${RESET} / ${BOLD}${CYAN}${result.dataDealsCount} Data Deals${RESET}\n`);

  console.log(`  ${BOLD}Distribution for every 10 brand-new customers:${RESET}`);
  console.log(`    ${GREEN}• Lofaq Data Hub :${RESET} ${BOLD}${newRatio} orders${RESET} (${lofaqPct}%)`);
  console.log(`    ${CYAN}• Data Deals     :${RESET} ${BOLD}${result.dataDealsCount} orders${RESET} (${ddPct}%)\n`);

  console.log(`  ${BOLD}New Cycle #${result.state.cycleCount} Layout (Randomized):${RESET}`);
  const lines = renderVisualSlots(result.state.slots, 0);
  console.log(`  ${lines[0]}`);
  console.log(`  ${lines[1]}\n`);

  const nextStore = result.state.slots[0] ? `${GREEN}LOFAQ DATA HUB${RESET}` : `${CYAN}DATA DEALS${RESET}`;
  console.log(`  ${BOLD}Next New Order  :${RESET}  Will route to ${BOLD}${nextStore}${RESET}`);
  console.log(`  ${DIM}Note: Repeat buyers are sticky and unaffected (Lofaq repeat -> Lofaq, Data Deals repeat -> Data Deals).${RESET}`);
  console.log(`  ${GREEN}✓ Saved to database and active immediately on live traffic!${RESET}`);
  printBoxFooter();
}

async function runWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await main();
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConnError = msg.includes("Can't reach database server") || msg.includes("Connection");
      if (isConnError && attempt < maxRetries) {
        console.log(`[Neon DB connecting... Retrying in 1.5s (attempt ${attempt}/${maxRetries})]`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
}

runWithRetry()
  .catch((err) => {
    console.error("Failed to update allocation:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
