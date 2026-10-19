/**
 * EMERGENCY REVERSAL SCRIPT
 * Reverses accidental REFUNDED → PROCESSING for the listed phone+GB pairs.
 *
 * For each matched order this script:
 *  1. Flips order status  REFUNDED → PROCESSING  (force override)
 *  2. Deletes the wallet credit  (REF-ORDER-xxx)  and debits balance back
 *  3. Re-credits the storefront commission that was reversed (if applicable)
 *  4. Re-opens any delivery reports that were auto-resolved as REFUNDED
 *  5. Appends an OrderStatusHistory entry so the audit trail is intact
 *
 * Run dry-run first (default), then pass --execute to actually commit.
 */

import { prisma } from "../src/lib/prisma";
import { storefrontOrderCode } from "../src/lib/storefront";

const ACTOR = "admin-emergency-reversal";

// ──────────────────────────────────────────────────────────────
// Paste the exact phone + GB pairs here
// ──────────────────────────────────────────────────────────────
const PAIRS: { phone: string; gb: number }[] = [
  { phone: "0596088949", gb: 1 },
  { phone: "0598288636", gb: 1 },
  { phone: "0530970454", gb: 3 },
  { phone: "0593562997", gb: 1 },
  { phone: "0249846523", gb: 7 },
  { phone: "0241170434", gb: 20 },
  { phone: "0555402639", gb: 2 },
  { phone: "0245320065", gb: 10 },
  { phone: "0597103035", gb: 1 },
  { phone: "0557693310", gb: 1 },
  { phone: "0546207585", gb: 1 },
  { phone: "0591814090", gb: 1 },
  { phone: "0248501320", gb: 2 },
  { phone: "0592125511", gb: 2 },
  { phone: "0597083736", gb: 10 },
  { phone: "0248211240", gb: 1 },
  { phone: "0540684945", gb: 2 },
  { phone: "0246003217", gb: 3 },
  { phone: "0249428660", gb: 3 },
  { phone: "0546320326", gb: 3 },
  { phone: "0551821818", gb: 1 },
  { phone: "0544366390", gb: 15 },
  { phone: "0240133302", gb: 1 },
  { phone: "0557188781", gb: 2 },
  { phone: "0545703743", gb: 1 },
  { phone: "0240577040", gb: 1 },
  { phone: "0599062657", gb: 3 },
  { phone: "0546616324", gb: 2 },
  { phone: "0249739978", gb: 1 },
  { phone: "0552174778", gb: 3 },
  { phone: "0538554072", gb: 2 },
  { phone: "0543666678", gb: 7 },
  { phone: "0548788937", gb: 1 },
];

// Look back this many hours for the refunded orders (today + buffer)
const LOOKBACK_HOURS = 24;

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(
    `  EMERGENCY REVERSAL — ${DRY_RUN ? "DRY-RUN (pass --execute to commit)" : "LIVE EXECUTION"}`
  );
  console.log(`${"=".repeat(70)}\n`);

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);

  const phones = PAIRS.map((p) => p.phone);

  // Fetch all candidate orders for these phones in the lookback window
  const candidates = await prisma.order.findMany({
    where: {
      phoneNumber: { in: phones },
      status: "REFUNDED",
      createdAt: { gte: since },
    },
    include: {
      user: { select: { id: true, email: true, balance: true } },
      storefrontOrder: {
        include: {
          storefront: { select: { userId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Match each PAIR to a candidate order
  type MatchedOrder = (typeof candidates)[0] & { matchedGb: number };
  const matched: MatchedOrder[] = [];
  const unmatched: typeof PAIRS = [];
  const used = new Set<number>();

  for (const pair of PAIRS) {
    const order = candidates.find(
      (o) =>
        !used.has(o.id) &&
        o.phoneNumber === pair.phone &&
        Math.abs(o.gbAmount - pair.gb) < 0.01
    );
    if (order) {
      used.add(order.id);
      matched.push({ ...order, matchedGb: pair.gb });
    } else {
      unmatched.push(pair);
    }
  }

  console.log(`  Pairs supplied  : ${PAIRS.length}`);
  console.log(`  Orders matched  : ${matched.length}`);
  console.log(`  Unmatched pairs : ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(`\n  ⚠️  UNMATCHED (no REFUNDED order found in last ${LOOKBACK_HOURS}h):`);
    for (const p of unmatched) {
      console.log(`     ${p.phone}  ${p.gb} GB`);
    }
  }
  console.log();

  let reversedOrders = 0;
  let walletDebits = 0;
  let commissionRestorations = 0;
  let reportReopens = 0;
  let errors = 0;

  for (const order of matched) {
    const isStorefront = order.source === "STOREFRONT" || Boolean(order.storefrontOrder);
    const refTx = `REF-ORDER-${order.id}`;

    console.log(
      `▶ Order #${order.id}  ${order.phoneNumber}  ${order.gbAmount} GB  GHS ${order.amount.toFixed(2)}  [${isStorefront ? "STOREFRONT" : order.source}]`
    );

    try {
      if (DRY_RUN) {
        // ── DRY-RUN: just show what would happen ──
        const refWalletTx = !isStorefront
          ? await prisma.walletTransaction.findFirst({ where: { reference: refTx } })
          : null;

        const storeOrder = order.storefrontOrder;
        const ownerWallet = storeOrder
          ? await prisma.storefrontWallet.findFirst({
              where: { userId: storeOrder.storefront.userId },
            })
          : null;

        const affectedReports = await prisma.deliveryReport.findMany({
          where: { orderId: order.id, status: "REFUNDED" },
          orderBy: { createdAt: "desc" },
          take: 5,
        });

        console.log(`   → status: REFUNDED → PROCESSING`);
        if (!isStorefront && refWalletTx) {
          console.log(
            `   → delete wallet credit ${refTx} (GHS ${order.amount.toFixed(2)}) & debit user balance`
          );
        }
        if (isStorefront && storeOrder && ownerWallet) {
          console.log(
            `   → restore storefront commission GHS ${(storeOrder.commission / 100).toFixed(2)} to owner wallet`
          );
          console.log(`   → storefrontOrder commissionState: REVERSED → PENDING`);
        }
        if (affectedReports.length > 0) {
          console.log(
            `   → reopen ${affectedReports.length} delivery report(s) back to INVESTIGATING`
          );
        }
      } else {
        // ── LIVE EXECUTION ──

        // 1. Flip order status → PROCESSING (force)
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "PROCESSING",
              failureReason: null,
            },
          });

          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: "PROCESSING",
              previousStatus: "REFUNDED",
              note: "Emergency reversal — accidental refund corrected",
              changedBy: ACTOR,
            },
          });
        });
        reversedOrders++;

        // 2a. Non-storefront: undo wallet credit and debit balance
        if (!isStorefront && order.userId) {
          const refWalletTx = await prisma.walletTransaction.findFirst({
            where: { reference: refTx, userId: order.userId },
          });

          if (refWalletTx) {
            await prisma.$transaction([
              // Remove the refund balance credit
              prisma.user.update({
                where: { id: order.userId },
                data: { balance: { decrement: order.amount } },
              }),
              // Delete the refund wallet transaction record
              prisma.walletTransaction.delete({ where: { id: refWalletTx.id } }),
            ]);
            walletDebits++;
            console.log(
              `   ✓ Wallet debit applied & REF wallet tx deleted  (user ${order.user?.email})`
            );
          } else {
            console.log(`   ℹ Wallet credit ${refTx} not found — skipped`);
          }
        }

        // 2b. Storefront: restore commission that was reversed
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

              // Restore: add back to pendingBalance (order is now in-flight again)
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
                  description: `Emergency reversal — commission restored to pending (accidental refund corrected)`,
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
            console.log(`   ℹ Storefront wallet not found — commission skipped`);
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
                message: "Emergency reversal — report re-opened (accidental refund corrected)",
                actorLabel: ACTOR,
              },
            }),
          ]);
          reportReopens++;
        }

        if (refundedReports.length > 0) {
          console.log(`   ✓ Reopened ${refundedReports.length} delivery report(s)`);
        }
      }

      console.log(`   ✓ OK\n`);
    } catch (err) {
      errors++;
      console.error(`   ✗ ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log(`${"=".repeat(70)}`);
  if (DRY_RUN) {
    console.log(`  DRY-RUN complete. No changes were made.`);
    console.log(`  Re-run with --execute to apply.\n`);
  } else {
    console.log(`  ✅  DONE`);
    console.log(`     Orders reversed to PROCESSING : ${reversedOrders}`);
    console.log(`     Wallet debits applied          : ${walletDebits}`);
    console.log(`     Commissions restored           : ${commissionRestorations}`);
    console.log(`     Delivery reports reopened      : ${reportReopens}`);
    console.log(`     Errors                         : ${errors}`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
