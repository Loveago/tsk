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
  PauseCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, ensureWallet, fromPesewas, storefrontOrderCode } from "@/lib/storefront";
import { CopyShareButtons } from "@/components/storefront/copy-share-buttons";
import { StoreStatusToggle } from "@/components/storefront/store-status-toggle";
import { RecentOrdersView } from "@/components/storefront/recent-orders-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StorefrontOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ orderPage?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const orderPage = Math.max(1, parseInt(resolvedParams.orderPage || "1", 10));
  const orderPageSize = 10;

  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const wallet = await ensureWallet(user.id);

  const [productCount, activeCount, recentOrders, totalStoreOrders, pendingWithdrawal, completedCount] =
    await Promise.all([
      prisma.storefrontProduct.count({ where: { storefrontId: storefront.id } }),
      prisma.storefrontProduct.count({ where: { storefrontId: storefront.id, isActive: true } }),
      prisma.storefrontOrder.findMany({
        where: { storefrontId: storefront.id },
        orderBy: { createdAt: "desc" },
        skip: (orderPage - 1) * orderPageSize,
        take: orderPageSize,
        include: { product: { include: { dataPackage: true } } },
      }),
      prisma.storefrontOrder.count({ where: { storefrontId: storefront.id } }),
      prisma.storefrontWithdrawal.findFirst({ where: { userId: user.id, status: "PENDING" } }),
      prisma.storefrontOrder.count({
        where: { storefrontId: storefront.id, status: "COMPLETED" },
      }),
    ]);

  const storefrontDomain = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || "tskdatastore.com";
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
      hint:
        storefront.status !== "ENABLED"
          ? "Sales paused by admin"
          : storefront.isActive
          ? "Store is live and accepting orders"
          : "Store is paused by you",
      icon: TrendingUp,
      accent: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    },
  ];

  const isLive = storefront.status === "ENABLED" && storefront.isActive;
  const isUserPaused = storefront.status === "ENABLED" && !storefront.isActive;

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
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isLive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : isUserPaused
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                  }`}
                >
                  {isLive ? "Live" : isUserPaused ? "Paused" : storefront.status}
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
          <div className="flex flex-wrap items-center gap-2">
            <StoreStatusToggle
              initialActive={storefront.isActive}
              storeStatus={storefront.status}
              variant="compact"
            />
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

      {isUserPaused && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <PauseCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <strong>Your storefront is currently paused.</strong> Visitors to your store link cannot purchase bundles until you re-enable it.
            </p>
          </div>
        </div>
      )}

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

      {/* Storefront orders */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Storefront orders ({totalStoreOrders})
          </h2>
        </div>
        <RecentOrdersView
          orders={recentOrders.map((o) => ({
            id: o.id,
            seq: o.seq,
            paymentReference: o.paymentReference,
            customerPhone: o.customerPhone,
            customerEmail: o.customerEmail,
            sellingPrice: o.sellingPrice,
            commission: o.commission,
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            product: {
              dataPackage: {
                network: o.product.dataPackage.network,
                gbAmount: o.product.dataPackage.gbAmount,
              },
            },
          }))}
          totalOrders={totalStoreOrders}
          page={orderPage}
          pageSize={orderPageSize}
          storeUrl={storeUrl}
        />
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
