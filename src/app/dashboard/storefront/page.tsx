import Link from "next/link";
import {
  Wallet,
  Package,
  Settings,
  ExternalLink,
  Store,
  Clock,
  TrendingUp,
  Hourglass,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, ensureWallet, fromPesewas, storefrontOrderCode } from "@/lib/storefront";
import { CopyShareButtons } from "@/components/storefront/copy-share-buttons";

const ORDER_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  REFUNDED: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
        ORDER_BADGES[status] ?? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
      }`}
    >
      {status}
    </span>
  );
}

export default async function StorefrontOverviewPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const wallet = await ensureWallet(user.id);

  const [productCount, activeCount, recentOrders, pendingWithdrawal, completedCount] =
    await Promise.all([
      prisma.storefrontProduct.count({ where: { storefrontId: storefront.id } }),
      prisma.storefrontProduct.count({ where: { storefrontId: storefront.id, isActive: true } }),
      prisma.storefrontOrder.findMany({
        where: { storefrontId: storefront.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { product: { include: { dataPackage: true } } },
      }),
      prisma.storefrontWithdrawal.findFirst({ where: { userId: user.id, status: "PENDING" } }),
      prisma.storefrontOrder.count({
        where: { storefrontId: storefront.id, status: "COMPLETED" },
      }),
    ]);

  const storefrontDomain = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || "tskstore.net";
  const storeUrl = `https://${storefrontDomain}/${storefront.slug}`;
  const stats = [
    {
      label: "Available balance",
      value: `GHS ${fromPesewas(wallet.balance).toFixed(2)}`,
      hint: "Withdrawable commissions",
      icon: Wallet,
      accent: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      label: "Pending commissions",
      value: `GHS ${fromPesewas(wallet.pendingBalance).toFixed(2)}`,
      hint: "Awaiting order completion",
      icon: Hourglass,
      accent: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    },
    {
      label: "Active products",
      value: `${activeCount}/${productCount}`,
      hint: "Listed on your public store",
      icon: Package,
      accent: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
    {
      label: "Completed sales",
      value: String(completedCount),
      hint: storefront.status === "ENABLED" ? "Store is live and accepting orders" : "Sales paused by admin",
      icon: TrendingUp,
      accent: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Store hero */}
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-600/20">
              <Store className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{storefront.name}</h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    storefront.status === "ENABLED"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  }`}
                >
                  {storefront.status === "ENABLED" ? "Live" : storefront.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Public address:{" "}
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-violet-600 hover:underline dark:text-violet-400"
                >
                  {storefrontDomain}/{storefront.slug}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <div className="mt-3">
                <CopyShareButtons url={storeUrl} storeName={storefront.name} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/storefront/products"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Manage products
            </Link>
            <Link
              href="/dashboard/storefront/wallet"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Wallet
            </Link>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]"
          >
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.accent}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {s.label}
            </p>
            <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{s.hint}</p>
          </div>
        ))}
      </div>

      {pendingWithdrawal && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock className="h-5 w-5 shrink-0" />
          <p>
            A withdrawal of <strong>GHS {fromPesewas(pendingWithdrawal.amount).toFixed(2)}</strong> is
            awaiting admin review.
          </p>
        </div>
      )}

      {/* Recent orders */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recent storefront orders
          </h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">No sales yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tap <span className="font-semibold">Share on WhatsApp</span> above to spread your store link{" "}
              <span className="font-semibold text-violet-600 dark:text-violet-400">{storeUrl}</span> and get
              your first order.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Bundle</th>
                  <th className="px-4 py-2">Recipient</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">Commission</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-mono text-xs">{storefrontOrderCode(o.seq, o.paymentReference)}</td>
                    <td className="px-4 py-2">
                      {o.product.dataPackage.network} {o.product.dataPackage.gbAmount}GB
                    </td>
                    <td className="px-4 py-2">{o.customerPhone}</td>
                    <td className="px-4 py-2">GHS {fromPesewas(o.sellingPrice).toFixed(2)}</td>
                    <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">
                      GHS {fromPesewas(o.commission).toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { href: "/dashboard/storefront/products", label: "Set prices", desc: "Manage your bundle listings", icon: Package, external: false },
            { href: "/dashboard/storefront/wallet", label: "Withdraw", desc: "Cash out commissions via MoMo", icon: Wallet, external: false },
            { href: "/dashboard/storefront/settings", label: "Store settings", desc: "Name, contact & payout", icon: Settings, external: false },
            { href: storeUrl, label: "View store", desc: "See what buyers see", icon: ExternalLink, external: true },
          ].map((a) => (
            <Link
              key={a.label}
              href={a.href}
              {...(a.external ? { target: "_blank" } : {})}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-800 dark:bg-[#0d1526] dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5"
            >
              <a.icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{a.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
