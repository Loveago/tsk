/**
 * EMERGENCY REVERSAL & STOREFRONT AUDIT SCRIPT
 * 
 * 1. Categorizes and inspects Storefront IDs for:
 *    - Intended refunds (the 32/33 numbers to KEEP as REFUNDED)
 *    - Accidental refunds (the 49 numbers to REVERT back to PROCESSING)
 * 2. Reverses accidental refunds:
 *    - Order status: REFUNDED -> PROCESSING
 *    - OrderStatusHistory logged
 *    - User wallet refund debited back / refund tx removed
 *    - Storefront commission restored to pendingBalance
 *    - Delivery reports re-opened if applicable
 *
 * Usage on VPS:
 *   Dry-run (prints storefront IDs and preview):
 *     npx tsx scripts/revert-accidental-refunds.ts
 *
 *   Execute changes:
 *     npx tsx scripts/revert-accidental-refunds.ts --execute
 *
 *   Options:
 *     --hours=48       Look back window in hours (default: 72)
 *     --all-time       Search across all time without date filter
 */

import { prisma } from "../src/lib/prisma";
import { storefrontOrderCode } from "../src/lib/storefront";

const ACTOR = "admin-emergency-reversal";

// ──────────────────────────────────────────────────────────────
// 1. INTENDED REFUNDS (Keep as REFUNDED - 32 items)
// ──────────────────────────────────────────────────────────────
const INTENDED_REFUND_PAIRS: { phone: string; gb: number }[] = [
  { phone: "0599277933", gb: 2 },
  { phone: "0546632768", gb: 3 },
  { phone: "0599835661", gb: 4 },
  { phone: "0552195263", gb: 6 },
  { phone: "0543906009", gb: 2 },
  { phone: "0550902087", gb: 3 },
  { phone: "0558486391", gb: 4 },
  { phone: "0550150552", gb: 25 },
  { phone: "0549668639", gb: 3 },
  { phone: "0598822276", gb: 5 },
  { phone: "0554798018", gb: 2 },
  { phone: "0594844743", gb: 2 },
  { phone: "0543018013", gb: 2 },
  { phone: "0544664386", gb: 2 },
  { phone: "0552687151", gb: 4 },
  { phone: "0547356144", gb: 10 },
  { phone: "0546703326", gb: 1 },
  { phone: "0241459249", gb: 1 },
  { phone: "0554830266", gb: 20 },
  { phone: "0549295118", gb: 2 },
  { phone: "0596140151", gb: 1 },
  { phone: "0598767582", gb: 4 },
  { phone: "0541707025", gb: 5 },
  { phone: "0553007610", gb: 6 },
  { phone: "0540499690", gb: 1 },
  { phone: "0541269501", gb: 2 },
  { phone: "0544687200", gb: 3 },
  { phone: "0541447455", gb: 2 },
  { phone: "0533522776", gb: 1 },
  { phone: "0551711153", gb: 1 },
  { phone: "0542996642", gb: 10 },
  { phone: "0266838009", gb: 1 },
];

// ──────────────────────────────────────────────────────────────
// 2. ACCIDENTAL REFUNDS (To be REVERTED back to PROCESSING - 49 items)
// ──────────────────────────────────────────────────────────────
const ACCIDENTAL_REFUND_PAIRS: { phone: string; gb: number }[] = [
  { phone: "0541200631", gb: 5 },
  { phone: "0551434269", gb: 1 },
  { phone: "0598976857", gb: 3 },
  { phone: "0559233309", gb: 10 },
  { phone: "0596503685", gb: 1 },
  { phone: "0542510508", gb: 10 },
  { phone: "0552537945", gb: 2 },
  { phone: "0539865099", gb: 2 },
  { phone: "0542049284", gb: 1 },
  { phone: "0557744772", gb: 1 },
  { phone: "0551382594", gb: 20 },
  { phone: "0591477746", gb: 1 },
  { phone: "0550282476", gb: 1 },
  { phone: "0552721938", gb: 2 },
  { phone: "0538800992", gb: 25 },
  { phone: "0545332906", gb: 10 },
  { phone: "0559243397", gb: 2 },
  { phone: "0596631157", gb: 1 },
  { phone: "0558829923", gb: 4 },
  { phone: "0543250059", gb: 1 },
  { phone: "0554575864", gb: 3 },
  { phone: "0539540509", gb: 3 },
  { phone: "0596280512", gb: 10 },
  { phone: "0542765686", gb: 5 },
  { phone: "0557187057", gb: 1 },
  { phone: "0556974570", gb: 2 },
  { phone: "0553903236", gb: 2 },
  { phone: "0591412253", gb: 2 },
  { phone: "0552994662", gb: 2 },
  { phone: "0558122970", gb: 10 },
  { phone: "0593460200", gb: 2 },
  { phone: "0542799278", gb: 10 },
  { phone: "0557440572", gb: 10 },
  { phone: "0556039994", gb: 4 },
  { phone: "0538211110", gb: 1 },
  { phone: "0538856395", gb: 10 },
  { phone: "0558776361", gb: 3 },
  { phone: "0558833359", gb: 3 },
  { phone: "0538500147", gb: 2 },
  { phone: "0599903678", gb: 6 },
  { phone: "0539712623", gb: 1 },
  { phone: "0553247997", gb: 4 },
  { phone: "0593756206", gb: 4 },
  { phone: "0206199070", gb: 8 },
  { phone: "0206199070", gb: 8 },
  { phone: "0557436717", gb: 2 },
  { phone: "0552805551", gb: 2 },
  { phone: "0549304435", gb: 1 },
  { phone: "0266838009", gb: 1 },
];

// CLI Arguments
const DRY_RUN = !process.argv.includes("--execute");
const ALL_TIME = process.argv.includes("--all-time");

function getHoursArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--hours="));
  if (arg) {
    const val = parseInt(arg.split("=")[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 72; // default 72 hours lookback
}

const LOOKBACK_HOURS = getHoursArg();

async function main() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  REVERSAL & STOREFRONT AUDIT SCRIPT`);
  console.log(
    `  MODE: ${DRY_RUN ? "🔍 DRY-RUN (Preview only. Pass --execute to commit)" : "⚡ LIVE EXECUTION (--execute)"}`
  );
  console.log(
    `  LOOKBACK: ${ALL_TIME ? "ALL TIME" : `Last ${LOOKBACK_HOURS} hours`}`
  );
  console.log(`${"=".repeat(80)}\n`);

  // Fetch candidate orders:
  // For intended refunds: we expect them to be REFUNDED
  // For actual/processed ones: they may be SUCCESS, PROCESSING, etc.
  const allCandidates = await prisma.order.findMany({
    where: ALL_TIME ? {} : { createdAt: { gte: new Date(Date.now() - LOOKBACK_HOURS * 3600_000) } },
    include: {
      user: { select: { id: true, email: true, name: true, balance: true } },
      storefrontOrder: {
        include: {
          storefront: {
            select: {
              id: true,
              slug: true,
              name: true,
              userId: true,
              user: { select: { email: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${allCandidates.length} total orders in candidate window.\n`);

  const usedOrderIds = new Set<number>();

  function matchPairs(pairs: typeof INTENDED_REFUND_PAIRS, preferStatus?: string) {
    const matched: (typeof allCandidates[0] & { matchedGb: number })[] = [];
    const unmatched: typeof pairs = [];

    for (const pair of pairs) {
      // First try matching preferred status
      let order = preferStatus
        ? allCandidates.find(
            (o) =>
              !usedOrderIds.has(o.id) &&
              o.phoneNumber === pair.phone &&
              Math.abs(o.gbAmount - pair.gb) < 0.01 &&
              o.status === preferStatus
          )
        : null;

      // If not found with preferred status, find any status
      if (!order) {
        order = allCandidates.find(
          (o) =>
            !usedOrderIds.has(o.id) &&
            o.phoneNumber === pair.phone &&
            Math.abs(o.gbAmount - pair.gb) < 0.01
        );
      }

      if (order) {
        usedOrderIds.add(order.id);
        matched.push({ ...order, matchedGb: pair.gb });
      } else {
        unmatched.push(pair);
      }
    }
    return { matched, unmatched };
  }

  // 1. Match Intended Refunds (expect REFUNDED)
  const intended = matchPairs(INTENDED_REFUND_PAIRS, "REFUNDED");

  // 2. Match Actual / Processed Orders
  const accidental = matchPairs(ACCIDENTAL_REFUND_PAIRS);

  // ──────────────────────────────────────────────────────────────
  // SECTION A: INTENDED REFUNDS (KEEP REFUNDED)
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(80)}`);
  console.log(`📋 [SECTION 1] INTENDED REFUNDS (SHOULD REMAIN REFUNDED)`);
  console.log(`Total Expected: ${INTENDED_REFUND_PAIRS.length} | Matched: ${intended.matched.length} | Unmatched: ${intended.unmatched.length}`);
  console.log(`${"─".repeat(80)}`);

  const intendedStorefrontMap = new Map<string, { count: number; name: string; slug: string; orders: number[] }>();
  let intendedNonStorefrontCount = 0;

  for (const o of intended.matched) {
    const sf = o.storefrontOrder?.storefront;
    if (sf) {
      const existing = intendedStorefrontMap.get(sf.id) || {
        count: 0,
        name: sf.name,
        slug: sf.slug,
        orders: [],
      };
      existing.count++;
      existing.orders.push(o.id);
      intendedStorefrontMap.set(sf.id, existing);

      const code = storefrontOrderCode(o.storefrontOrder!.seq);
      console.log(
        `  • Order #${o.id.toString().padEnd(6)} | ${o.phoneNumber} (${o.gbAmount} GB) | Storefront: [${sf.id}] ${sf.name} (${sf.slug}) | Ref: ${code}`
      );
    } else {
      intendedNonStorefrontCount++;
      console.log(
        `  • Order #${o.id.toString().padEnd(6)} | ${o.phoneNumber} (${o.gbAmount} GB) | Source: ${o.source} | User: ${o.user?.email || "Unknown"}`
      );
    }
  }

  console.log(`\n  ➡️ UNIQUE STOREFRONT IDs (Intended Refunds):`);
  if (intendedStorefrontMap.size === 0) {
    console.log(`     (None - all matched orders were direct portal/API orders)`);
  } else {
    for (const [sfId, info] of intendedStorefrontMap.entries()) {
      console.log(`     - Storefront ID : ${sfId}`);
      console.log(`       Store Name    : ${info.name} (/${info.slug})`);
      console.log(`       Order Count   : ${info.count}`);
      console.log(`       Order IDs     : ${info.orders.join(", ")}`);
    }
  }
  console.log(`     Direct Portal / API orders: ${intendedNonStorefrontCount}`);

  if (intended.unmatched.length > 0) {
    console.log(`\n  ⚠️ Unmatched Intended Refund Pairs (Not found with status REFUNDED):`);
    const unmatchedPhones = intended.unmatched.map((p) => p.phone);
    const existingOrders = await prisma.order.findMany({
      where: { phoneNumber: { in: unmatchedPhones } },
      orderBy: { createdAt: "desc" },
      select: { id: true, phoneNumber: true, status: true, gbAmount: true, createdAt: true },
    });
    const orderMap = new Map<string, typeof existingOrders[0]>();
    for (const o of existingOrders) {
      if (!orderMap.has(o.phoneNumber)) orderMap.set(o.phoneNumber, o);
    }
    for (const p of intended.unmatched) {
      const existing = orderMap.get(p.phone);
      if (existing) {
        console.log(`     ${p.phone} (${p.gb} GB) -> Found in DB as Order #${existing.id} with status "${existing.status}" (${existing.gbAmount} GB)`);
      } else {
        console.log(`     ${p.phone} (${p.gb} GB) -> Not found in DB`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // SECTION B: ACTUAL / PROCESSED ORDERS (STOREFRONT AUDIT)
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(80)}`);
  console.log(`📊 [SECTION 2] ACTUAL / PROCESSED ORDERS (STOREFRONT DETAILS)`);
  console.log(`Total Expected: ${ACCIDENTAL_REFUND_PAIRS.length} | Matched: ${accidental.matched.length} | Unmatched: ${accidental.unmatched.length}`);
  console.log(`${"─".repeat(80)}`);

  const accidentalStorefrontMap = new Map<string, { count: number; name: string; slug: string; orders: number[] }>();
  let accidentalNonStorefrontCount = 0;
  const statusCounts: Record<string, number> = {};

  for (const o of accidental.matched) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    const sf = o.storefrontOrder?.storefront;
    if (sf) {
      const existing = accidentalStorefrontMap.get(sf.id) || {
        count: 0,
        name: sf.name,
        slug: sf.slug,
        orders: [],
      };
      existing.count++;
      existing.orders.push(o.id);
      accidentalStorefrontMap.set(sf.id, existing);

      const code = storefrontOrderCode(o.storefrontOrder!.seq);
      console.log(
        `  • Order #${o.id.toString().padEnd(6)} [Status: ${o.status}] | ${o.phoneNumber} (${o.gbAmount} GB) | Storefront: [${sf.id}] ${sf.name} (${sf.slug}) | Ref: ${code}`
      );
    } else {
      accidentalNonStorefrontCount++;
      console.log(
        `  • Order #${o.id.toString().padEnd(6)} [Status: ${o.status}] | ${o.phoneNumber} (${o.gbAmount} GB) | Source: ${o.source} | User: ${o.user?.email || "Unknown"}`
      );
    }
  }

  console.log(`\n  ➡️ STATUS BREAKDOWN OF THESE ORDERS:`);
  for (const [st, cnt] of Object.entries(statusCounts)) {
    console.log(`     - ${st}: ${cnt} orders`);
  }

  console.log(`\n  ➡️ UNIQUE STOREFRONT IDs (Actual / Processed Orders):`);
  if (accidentalStorefrontMap.size === 0) {
    console.log(`     (None - all matched orders were direct portal/API orders)`);
  } else {
    for (const [sfId, info] of accidentalStorefrontMap.entries()) {
      console.log(`     - Storefront ID : ${sfId}`);
      console.log(`       Store Name    : ${info.name} (/${info.slug})`);
      console.log(`       Order Count   : ${info.count}`);
      console.log(`       Order IDs     : ${info.orders.join(", ")}`);
    }
  }
  console.log(`     Direct Portal / API orders: ${accidentalNonStorefrontCount}`);

  if (accidental.unmatched.length > 0) {
    console.log(`\n  ⚠️ Unmatched Pairs:`);
    for (const p of accidental.unmatched) {
      console.log(`     ${p.phone} (${p.gb} GB) -> Not found in DB`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // SECTION C: EXECUTION (REVERT ONLY THOSE CURRENTLY REFUNDED)
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(80)}`);
  console.log(`⚙️ [SECTION 3] REVERSAL EXECUTION`);
  console.log(`${"─".repeat(80)}`);

  const actuallyRefundedToRevert = accidental.matched.filter((o) => o.status === "REFUNDED");

  if (actuallyRefundedToRevert.length === 0) {
    console.log(`\n  ✅ GOOD NEWS: None of the actual/processed orders are currently in "REFUNDED" status!`);
    console.log(`  All ${accidental.matched.length} orders are already in active states (e.g., SUCCESS).`);
    console.log(`  No orders need to be reverted in the database.\n`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${actuallyRefundedToRevert.length} order(s) currently REFUNDED that need reversal to PROCESSING.`);

  if (DRY_RUN) {
    console.log(`\n  ℹ️ DRY-RUN: No changes made to database.`);
    console.log(`  To commit changes and revert ${actuallyRefundedToRevert.length} order(s) back to PROCESSING, run:`);
    console.log(`     npx tsx scripts/revert-accidental-refunds.ts --execute\n`);
    await prisma.$disconnect();
    return;
  }

  let reversedOrders = 0;
  let walletDebits = 0;
  let commissionRestorations = 0;
  let reportReopens = 0;
  let errors = 0;

  for (const order of actuallyRefundedToRevert) {
    const isStorefront = order.source === "STOREFRONT" || Boolean(order.storefrontOrder);
    const refTx = `REF-ORDER-${order.id}`;

    console.log(
      `▶ Reverting Order #${order.id} | ${order.phoneNumber} | ${order.gbAmount} GB | GHS ${order.amount.toFixed(2)} | [${isStorefront ? "STOREFRONT" : order.source}]`
    );

    try {
      // 1. Update Order status: REFUNDED -> PROCESSING
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PROCESSING",
          failureReason: null,
          history: {
            create: {
              status: "PROCESSING",
              previousStatus: "REFUNDED",
              note: "Emergency reversal: accidental refund reverted to processing",
              changedBy: ACTOR,
            },
          },
        },
      });
      reversedOrders++;

      // 2a. Portal/Reseller Order: debit user wallet & delete refund transaction
      if (!isStorefront && order.userId) {
        const refWalletTx = await prisma.walletTransaction.findFirst({
          where: {
            reference: refTx,
            userId: order.userId,
            type: "REFUND",
          },
        });

        if (refWalletTx) {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: order.userId },
              data: { balance: { decrement: order.amount } },
            }),
            prisma.walletTransaction.delete({ where: { id: refWalletTx.id } }),
          ]);
          walletDebits++;
          console.log(`   ✓ Wallet debit applied & REF wallet tx removed (${order.user?.email})`);
        } else {
          console.log(`   ℹ Wallet refund tx ${refTx} not found — skipped wallet debit`);
        }
      }

      // 2b. Storefront Order: restore commission to pendingBalance
      if (isStorefront && order.storefrontOrder) {
        const storeOrder = order.storefrontOrder;
        const ownerUserId = storeOrder.storefront.userId;
        const ownerWallet = await prisma.storefrontWallet.findFirst({
          where: { userId: ownerUserId },
        });

        if (ownerWallet) {
          const commissionPesewas = storeOrder.commission;
          const commissionRef = storefrontOrderCode(storeOrder.seq);

          await prisma.$transaction(async (tx) => {
            const wallet = await tx.storefrontWallet.findUniqueOrThrow({
              where: { id: ownerWallet.id },
            });

            const pendingAfter = wallet.pendingBalance + commissionPesewas;
            await tx.storefrontWallet.update({
              where: { id: ownerWallet.id },
              data: { pendingBalance: pendingAfter },
            });

            await tx.storefrontWalletTransaction.create({
              data: {
                walletId: ownerWallet.id,
                type: "ADJUSTMENT",
                amount: commissionPesewas,
                balanceBefore: wallet.balance,
                balanceAfter: wallet.balance,
                pendingBefore: wallet.pendingBalance,
                pendingAfter,
                reference: commissionRef,
                description: "Emergency reversal: commission restored to pending (accidental refund corrected)",
              },
            });

            await tx.storefrontOrder.update({
              where: { id: storeOrder.id },
              data: {
                commissionState: "PENDING",
                status: "PROCESSING",
                completedAt: null,
              },
            });
          });

          commissionRestorations++;
          console.log(
            `   ✓ Storefront commission GHS ${(commissionPesewas / 100).toFixed(2)} restored to pending`
          );
        } else {
          console.log(`   ℹ Storefront wallet not found — commission restoration skipped`);
        }
      }

      // 3. Re-open any delivery reports auto-resolved as REFUNDED for this order
      const refundedReports = await prisma.deliveryReport.findMany({
        where: { orderId: order.id, status: "REFUNDED" },
      });

      for (const rep of refundedReports) {
        await prisma.$transaction([
          prisma.deliveryReport.update({
            where: { id: rep.id },
            data: {
              status: "INVESTIGATING",
              resolvedAt: null,
              resolvedBy: null,
            },
          }),
          prisma.deliveryReportEvent.create({
            data: {
              reportId: rep.id,
              type: "INVESTIGATION_STARTED",
              message: "Emergency reversal: report re-opened (accidental refund corrected)",
              actorLabel: ACTOR,
            },
          }),
        ]);
        reportReopens++;
      }

      if (refundedReports.length > 0) {
        console.log(`   ✓ Reopened ${refundedReports.length} delivery report(s)`);
      }

      console.log(`   ✓ Successfully reverted\n`);
    } catch (err) {
      errors++;
      console.error(`   ✗ ERROR on order #${order.id}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log(`${"=".repeat(80)}`);
  console.log(`  ✅ REVERSAL COMPLETE`);
  console.log(`     Orders reverted to PROCESSING : ${reversedOrders}`);
  console.log(`     Wallet debits applied          : ${walletDebits}`);
  console.log(`     Commissions restored           : ${commissionRestorations}`);
  console.log(`     Delivery reports reopened      : ${reportReopens}`);
  console.log(`     Errors                         : ${errors}`);
  console.log(`${"=".repeat(80)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  prisma.$disconnect();
  process.exit(1);
});
