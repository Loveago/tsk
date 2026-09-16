import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle, AlertCircle, ArrowLeft, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fromPesewas, verifyAndSettleStorefrontOrder } from "@/lib/storefront";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    iconCls: string;
    cardCls: string;
    label: string;
    message: string;
  }
> = {
  PENDING: {
    icon: Clock,
    iconCls: "text-amber-500",
    cardCls: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30",
    label: "Order Pending",
    message: "Payment received. Your order has been received and is queued for fulfillment.",
  },
  PROCESSING: {
    icon: Clock,
    iconCls: "text-blue-500",
    cardCls: "bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30",
    label: "Processing",
    message: "Your bundle is being delivered — this usually takes a few minutes.",
  },
  COMPLETED: {
    icon: CheckCircle2,
    iconCls: "text-emerald-500",
    cardCls: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30",
    label: "Delivered!",
    message: "Your data bundle has been successfully delivered. Enjoy!",
  },
  SUCCESS: {
    icon: CheckCircle2,
    iconCls: "text-emerald-500",
    cardCls: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30",
    label: "Delivered!",
    message: "Your data bundle has been successfully delivered. Enjoy!",
  },
  FAILED: {
    icon: XCircle,
    iconCls: "text-red-500",
    cardCls: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30",
    label: "Delivery Failed",
    message:
      "Unfortunately delivery did not complete. Please contact the store for assistance using your reference number.",
  },
  CANCELLED: {
    icon: XCircle,
    iconCls: "text-slate-500",
    cardCls: "bg-slate-100 border-slate-200 dark:bg-white/5 dark:border-white/10",
    label: "Order Cancelled",
    message: "This order was cancelled. Please contact the store if you have questions.",
  },
  REFUNDED: {
    icon: AlertCircle,
    iconCls: "text-slate-500",
    cardCls:
      "bg-slate-100 border-slate-200 dark:bg-white/5 dark:border-white/10",
    label: "Refunded",
    message: "This order was refunded. Please contact the store if you have questions.",
  },
};

const NETWORK_COLOURS: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  TELECEL:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
  AIRTELTIGO:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
};

export default async function StorefrontOrderPage({
  params,
}: {
  params: Promise<{ slug: string; reference: string }>;
}) {
  const { slug, reference } = await params;

  // Fetch the storefront order by paymentReference, scoped to this slug
  let order = await prisma.storefrontOrder.findUnique({
    where: { paymentReference: reference },
    include: {
      storefront: { select: { slug: true, name: true, logoUrl: true } },
      product: { include: { dataPackage: true } },
      underlyingOrder: {
        select: { id: true, status: true, providerReference: true, updatedAt: true },
      },
    },
  });

  // Guard: must belong to this slug
  if (!order || order.storefront.slug !== slug) notFound();

  // Self-healing fallback: If customer paid on Paystack but the callback or redirect failed,
  // verify with Paystack right now and automatically settle the order!
  if (!order.underlyingOrderId) {
    const autoSettle = await verifyAndSettleStorefrontOrder(reference);
    if (autoSettle.settled) {
      const refreshed = await prisma.storefrontOrder.findUnique({
        where: { id: order.id },
        include: {
          storefront: { select: { slug: true, name: true, logoUrl: true } },
          product: { include: { dataPackage: true } },
          underlyingOrder: {
            select: { id: true, status: true, providerReference: true, updatedAt: true },
          },
        },
      });
      if (refreshed) order = refreshed;
    }
  }

  // On-demand sync for in-flight Clickyfied underlying order
  if (
    order.underlyingOrder &&
    (order.underlyingOrder.status === "PENDING" || order.underlyingOrder.status === "PROCESSING") &&
    order.underlyingOrder.providerReference?.startsWith("CLICKYFIED:") &&
    Date.now() - new Date(order.underlyingOrder.updatedAt).getTime() > 15000
  ) {
    try {
      const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
      const syncRes = await syncClickyfiedOrder(order.underlyingOrder, "Storefront Order Page Sync");
      if (syncRes.changed && syncRes.newStatus) {
        order.underlyingOrder.status = syncRes.newStatus;
      }
    } catch (syncErr) {
      console.error("Storefront order sync error:", syncErr);
    }
  }

  let effectiveStatus = order.status;
  if (order.underlyingOrder) {
    effectiveStatus = order.underlyingOrder.status === "SUCCESS" ? "COMPLETED" : order.underlyingOrder.status;
  }

  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = cfg.icon;
  const network = order.product.dataPackage.network;
  const networkCls = NETWORK_COLOURS[network] ?? NETWORK_COLOURS.AIRTELTIGO;
  const gbAmount = order.product.dataPackage.gbAmount;
  const amountGhs = fromPesewas(order.sellingPrice);

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      {/* Back link */}
      <Link
        href={`/store/${slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {order.storefront.name}
      </Link>

      {/* Status card */}
      <div
        className={`rounded-3xl border p-6 sm:p-8 ${cfg.cardCls}`}
      >
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-8 w-8 shrink-0 ${cfg.iconCls}`} />
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{cfg.label}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{cfg.message}</p>
          </div>
        </div>
      </div>

      {/* Order details card */}
      <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-8 dark:bg-[#111a2c] dark:ring-white/10">
        <h2 className="mb-5 font-serif text-xl font-bold text-slate-900 dark:text-white">
          Order Details
        </h2>

        <dl className="space-y-4 text-sm">
          {/* Store */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Store</dt>
            <dd className="font-semibold text-slate-900 text-right dark:text-white">
              {order.storefront.name}
            </dd>
          </div>

          {/* Network */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Network</dt>
            <dd>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${networkCls}`}
              >
                {network}
              </span>
            </dd>
          </div>

          {/* Bundle */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Bundle</dt>
            <dd className="font-bold text-slate-900 dark:text-white">{gbAmount} GB</dd>
          </div>

          {/* Recipient */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Recipient number</dt>
            <dd className="font-mono font-bold text-slate-900 dark:text-white">
              {order.customerPhone}
            </dd>
          </div>

          {/* Amount */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Amount paid</dt>
            <dd className="font-bold text-slate-900 dark:text-white">
              ₵{amountGhs.toFixed(2)}
            </dd>
          </div>

          <div className="border-t border-slate-100 dark:border-white/10" />

          {/* Reference */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Reference</dt>
            <dd className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
              {reference}
            </dd>
          </div>

          {/* Date */}
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Date</dt>
            <dd className="text-right text-slate-700 dark:text-slate-300">
              {new Date(order.createdAt).toLocaleString("en-GH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/store/${slug}/track`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
          <Search className="h-4 w-4" />
          Track Order
        </Link>
        <Link
          href={`/store/${slug}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-yellow-300 py-3 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/30 transition hover:bg-yellow-400"
        >
          Buy Another Bundle
        </Link>
      </div>

      {/* Help note */}
      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        Keep your reference number <span className="font-mono font-semibold">{reference}</span> handy
        in case you need to contact support.
      </p>
    </div>
  );
}
