/**
 * PAYSTACK REFUND REFERENCE AUDIT SCRIPT
 *
 * Checks a list of Paystack payment references refunded on Paystack against:
 *  1. The 32 Intended Refund Orders (Status: REFUNDED)
 *  2. The 48 Actual / Delivered Orders (Status: SUCCESS) -> CRITICAL ALERT
 *  3. Other Storefront Orders or GeminiPro Orders
 *
 * Usage:
 *   npx tsx scripts/check-paystack-refund-refs.ts
 */

import { prisma } from "../src/lib/prisma";
import { storefrontOrderCode } from "../src/lib/storefront";

const PAYSTACK_REFS: string[] = [
  "GH-22-2026-A7MU6P",
  "GH-22-2026-VSTMTT",
  "GH-22-2026-TNDVE5",
  "GH-22-2026-9P4V99",
  "GH-22-2026-XVZ82J",
  "GH-22-2026-XVZ82J",
  "GH-22-2026-8ETYYM",
  "GH-23-2026-6K3FWJ",
  "GH-23-2026-V52XTY",
  "GH-23-2026-3JVFWV",
  "GH-23-2026-HQ9DVN",
  "GH-23-2026-P98UYJ",
  "GH-23-2026-A4HE6C",
  "GH-23-2026-V7UHSC",
  "GH-23-2026-MPW3WC",
  "GH-23-2026-ZNY8LL",
  "GH-23-2026-PBKYPS",
  "GH-23-2026-76NJ7J",
  "GH-23-2026-99RN3J",
  "GH-23-2026-SK83NJ",
  "GH-23-2026-S24JZ7",
  "GH-23-2026-MHAA94",
  "GH-23-2026-QAKB9A",
  "GH-23-2026-SY9NGG",
  "GH-23-2026-HMJU74",
  "GH-23-2026-65M5RM",
  "GH-23-2026-CC74VL",
  "GH-23-2026-ZDLES8",
  "GH-23-2026-424TXV",
  "GH-23-2026-SRB2F7",
  "GH-23-2026-2T93UY",
  "GH-23-2026-6XUWFN",
  "GH-23-2026-KN5R9G",
  "GH-23-2026-YG5Q5F",
  "GH-23-2026-5ATUMS",
  "GH-23-2026-6MNYJH",
  "GH-23-2026-ENTS2L",
  "GH-23-2026-378MKN",
  "GH-23-2026-SZSPXL",
  "GH-23-2026-VLLCNY",
  "GH-23-2026-42DTUY",
  "GH-23-2026-7PHHNH",
  "GH-23-2026-H25QFK",
  "GH-23-2026-PY9CW2",
  "GH-23-2026-U34RNS",
  "GH-23-2026-ZAPHRM",
  "GH-23-2026-WLPPCK",
  "GH-23-2026-9J46XY",
  "GH-23-2026-C9HMEG",
  "GH-23-2026-M2BG8B",
  "GH-23-2026-VTE9KH",
  "GH-23-2026-ZSP8VY",
  "GH-23-2026-RKPM6U",
  "GH-23-2026-G7UMW6",
  "GH-23-2026-868S8A",
  "GH-23-2026-G9VHEQ",
  "GH-23-2026-5U3D3U",
  "GH-23-2026-26TV9Z",
  "GH-23-2026-KHLVP8",
  "GH-23-2026-6YDUPE",
  "GH-23-2026-ZRJEFV",
  "GH-23-2026-7Z92A2",
  "GH-23-2026-XQUZDT",
  "GH-23-2026-CYZAQD",
  "GH-23-2026-YXZSC7",
  "GH-23-2026-F5UDAQ",
  "GH-23-2026-QXE7B9",
  "GH-23-2026-JK7TP3",
  "GH-23-2026-S9VZCV",
  "GH-23-2026-4GYJTY",
  "GH-23-2026-TMNMPU",
  "GH-23-2026-WE8LH5",
  "GH-23-2026-SRRGYT",
  "GH-23-2026-W6RVXK",
  "GH-23-2026-6YEP5E",
  "GH-23-2026-PKJHHL",
  "GH-23-2026-M45757",
  "GH-23-2026-GA44KF",
  "GH-23-2026-EPWD5R",
  "GH-23-2026-5YVHAV",
  "GH-23-2026-EGYFUG",
  "GH-23-2026-K45TGC",
  "GH-23-2026-9R8S6L",
  "GH-23-2026-SJWBCB",
  "GH-23-2026-Y3YXNK",
  "GH-23-2026-WKCCVV",
];

// The 32 phone + GB pairs intended to be refunded
const INTENDED_REFUND_PHONES = new Set([
  "0599277933:2",
  "0546632768:3",
  "0599835661:4",
  "0552195263:6",
  "0543906009:2",
  "0550902087:3",
  "0558486391:4",
  "0550150552:25",
  "0549668639:3",
  "0598822276:5",
  "0554798018:2",
  "0594844743:2",
  "0543018013:2",
  "0544664386:2",
  "0552687151:4",
  "0547356144:10",
  "0546703326:1",
  "0241459249:1",
  "0554830266:20",
  "0549295118:2",
  "0596140151:1",
  "0598767582:4",
  "0541707025:5",
  "0553007610:6",
  "0540499690:1",
  "0541269501:2",
  "0544687200:3",
  "0541447455:2",
  "0533522776:1",
  "0551711153:1",
  "0542996642:10",
  "0266838009:1",
]);

// The 48/49 phone + GB pairs that were actual / SUCCESS
const ACTUAL_SUCCESS_PHONES = new Set([
  "0541200631:5",
  "0551434269:1",
  "0598976857:3",
  "0559233309:10",
  "0596503685:1",
  "0542510508:10",
  "0552537945:2",
  "0539865099:2",
  "0542049284:1",
  "0557744772:1",
  "0551382594:20",
  "0591477746:1",
  "0550282476:1",
  "0552721938:2",
  "0538800992:25",
  "0545332906:10",
  "0559243397:2",
  "0596631157:1",
  "0558829923:4",
  "0543250059:1",
  "0554575864:3",
  "0539540509:3",
  "0596280512:10",
  "0542765686:5",
  "0557187057:1",
  "0556974570:2",
  "0553903236:2",
  "0591412253:2",
  "0552994662:2",
  "0558122970:10",
  "0593460200:2",
  "0542799278:10",
  "0557440572:10",
  "0556039994:4",
  "0538211110:1",
  "0538856395:10",
  "0558776361:3",
  "0558833359:3",
  "0538500147:2",
  "0599903678:6",
  "0539712623:1",
  "0553247997:4",
  "0593756206:4",
  "0206199070:8",
  "0557436717:2",
  "0552805551:2",
  "0549304435:1",
]);

async function main() {
  console.log(`\n${"=".repeat(85)}`);
  console.log(`  PAYSTACK REFUND REFERENCE CROSS-CHECK AUDIT`);
  console.log(`  Checking ${PAYSTACK_REFS.length} Paystack References`);
  console.log(`${"=".repeat(85)}\n`);

  const uniqueRefs = Array.from(new Set(PAYSTACK_REFS));

  // Query StorefrontOrder table
  const storefrontOrders = await prisma.storefrontOrder.findMany({
    where: { paymentReference: { in: uniqueRefs } },
    include: {
      underlyingOrder: true,
      storefront: { select: { id: true, name: true, slug: true } },
      product: { include: { dataPackage: true } },
    },
  });

  const soMap = new Map<string, typeof storefrontOrders[0]>();
  for (const so of storefrontOrders) {
    soMap.set(so.paymentReference, so);
  }

  // Also query GeminiProOrder in case any refs belong there
  const geminiOrders = await prisma.geminiProOrder.findMany({
    where: { paymentReference: { in: uniqueRefs } },
  });
  const geminiMap = new Map<string, typeof geminiOrders[0]>();
  for (const go of geminiOrders) {
    geminiMap.set(go.paymentReference, go);
  }

  // Also query WalletTransaction in case any refs are user wallet topups
  const walletTxs = await prisma.walletTransaction.findMany({
    where: { reference: { in: uniqueRefs } },
    include: { user: { select: { email: true, name: true } } },
  });
  const walletMap = new Map<string, typeof walletTxs[0]>();
  for (const wt of walletTxs) {
    if (wt.reference) walletMap.set(wt.reference, wt);
  }

  // Categorize results
  const in32IntendedRefunds: any[] = [];
  const in48ActualDelivered: any[] = [];
  const otherStorefrontOrders: any[] = [];
  const notFoundRefs: string[] = [];

  for (const ref of uniqueRefs) {
    const so = soMap.get(ref);
    if (!so) {
      const go = geminiMap.get(ref);
      const wt = walletMap.get(ref);
      if (go) {
        otherStorefrontOrders.push({
          type: "GEMINI_PRO",
          ref,
          phone: go.customerWhatsapp,
          email: go.customerEmail,
          amountGhs: go.amount,
          status: `${go.paystackStatus} / ${go.fulfillmentStatus}`,
          storefront: "data-deals.com (Gemini)",
        });
      } else if (wt) {
        otherStorefrontOrders.push({
          type: "WALLET_TOPUP",
          ref,
          phone: wt.user.email,
          amountGhs: wt.amount,
          status: wt.status,
          storefront: `Wallet Topup (${wt.user.email})`,
        });
      } else {
        notFoundRefs.push(ref);
      }
      continue;
    }

    const phone = so.customerPhone;
    const gb = so.underlyingOrder?.gbAmount ?? so.product.dataPackage.gbAmount;
    const phoneGbKey = `${phone}:${gb}`;
    const orderStatus = so.underlyingOrder?.status ?? so.status;
    const orderId = so.underlyingOrderId ?? "N/A";
    const sfName = so.storefront.name;
    const sfId = so.storefront.id;
    const sfSlug = so.storefront.slug;
    const amountGhs = (so.sellingPrice / 100).toFixed(2);
    const code = storefrontOrderCode(so.seq);

    const item = {
      ref,
      orderId,
      code,
      phone,
      gb,
      amountGhs,
      orderStatus,
      storefrontId: sfId,
      storefrontName: sfName,
      storefrontSlug: sfSlug,
      createdAt: so.createdAt,
    };

    if (INTENDED_REFUND_PHONES.has(phoneGbKey) || orderStatus === "REFUNDED") {
      in32IntendedRefunds.push(item);
    } else if (ACTUAL_SUCCESS_PHONES.has(phoneGbKey) || orderStatus === "SUCCESS") {
      in48ActualDelivered.push(item);
    } else {
      otherStorefrontOrders.push({
        type: "STOREFRONT",
        ...item,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 1. DANGER ALERT: REFERENCES BELONGING TO 48 ACTUAL DELIVERED (SUCCESS) ORDERS
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(85)}`);
  if (in48ActualDelivered.length > 0) {
    console.log(`🚨 CRITICAL WARNING: ${in48ActualDelivered.length} REFUND(S) BELONG TO THE 48 ACTUAL DELIVERED ORDERS!`);
    console.log(`   (These customers received their data [status: SUCCESS] AND their Paystack payment was refunded!)`);
    console.log(`${"─".repeat(85)}`);
    for (const o of in48ActualDelivered) {
      console.log(`  ❌ Ref: ${o.ref} | Order #${o.orderId} [${o.orderStatus}] | ${o.phone} (${o.gb} GB) | GHS ${o.amountGhs} | Store: [${o.storefrontId}] ${o.storefrontName} | Code: ${o.code}`);
    }
  } else {
    console.log(`✅ EXCELLENT NEWS: 0 of these Paystack references belong to the 48 Actual / Delivered orders!`);
    console.log(`   None of the completed/delivered customers were refunded on Paystack.`);
    console.log(`${"─".repeat(85)}`);
  }

  // ──────────────────────────────────────────────────────────────
  // 2. REFERENCES BELONGING TO 32 INTENDED REFUND ORDERS
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(85)}`);
  console.log(`📋 REFERENCES MATCHING INTENDED REFUNDS (Expected & Correct: ${in32IntendedRefunds.length} found)`);
  console.log(`${"─".repeat(85)}`);
  for (const o of in32IntendedRefunds) {
    console.log(`  ✓ Ref: ${o.ref} | Order #${o.orderId} [${o.orderStatus}] | ${o.phone} (${o.gb} GB) | GHS ${o.amountGhs} | Store: [${o.storefrontId}] ${o.storefrontName}`);
  }

  // ──────────────────────────────────────────────────────────────
  // 3. OTHER STOREFRONT ORDERS (E.G. YESTERDAY / TODAY FAILED OR CANCELLED ORDERS)
  // ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(85)}`);
  console.log(`ℹ️ OTHER STOREFRONT ORDERS REFUNDED (${otherStorefrontOrders.length} found)`);
  console.log(`${"─".repeat(85)}`);
  for (const o of otherStorefrontOrders) {
    if (o.type === "GEMINI_PRO") {
      console.log(`  • [Gemini Pro] Ref: ${o.ref} | ${o.phone} | GHS ${o.amountGhs} | Status: ${o.status}`);
    } else if (o.type === "WALLET_TOPUP") {
      console.log(`  • [Wallet Topup] Ref: ${o.ref} | User: ${o.phone} | GHS ${o.amountGhs} | Status: ${o.status}`);
    } else {
      console.log(`  • Ref: ${o.ref} | Order #${o.orderId} [${o.orderStatus}] | ${o.phone} (${o.gb} GB) | GHS ${o.amountGhs} | Store: [${o.storefrontId}] ${o.storefrontName}`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 4. REFERENCES NOT FOUND IN STOREFRONT ORDERS
  // ──────────────────────────────────────────────────────────────
  if (notFoundRefs.length > 0) {
    console.log(`\n${"─".repeat(85)}`);
    console.log(`❓ REFERENCES NOT FOUND IN STOREFRONT ORDERS (${notFoundRefs.length} found)`);
    console.log(`   (Could be portal user wallet topups, or references from a different portal)`);
    console.log(`${"─".repeat(85)}`);
    for (const ref of notFoundRefs) {
      console.log(`  ? ${ref}`);
    }
  }

  // SUMMARY
  console.log(`\n${"=".repeat(85)}`);
  console.log(`  SUMMARY BREAKDOWN:`);
  console.log(`  • Total References Checked       : ${uniqueRefs.length}`);
  console.log(`  • Belong to 48 Actual Delivered : ${in48ActualDelivered.length} ${in48ActualDelivered.length > 0 ? "⚠️ (DOUBLE REFUND RISK)" : "✅ (CLEAN)"}`);
  console.log(`  • Belong to 32 Intended Refunds : ${in32IntendedRefunds.length} ✅`);
  console.log(`  • Other Storefront Orders        : ${otherStorefrontOrders.length}`);
  console.log(`  • Not Found in Storefront DB     : ${notFoundRefs.length}`);
  console.log(`${"=".repeat(85)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  prisma.$disconnect();
  process.exit(1);
});
