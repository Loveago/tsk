import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromPesewas } from "@/lib/storefront";
import { AdminStorefrontPanel } from "./admin-panel";
import { Store, Banknote, AlertCircle } from "lucide-react";

export default async function AdminStorefrontsPage() {
  await requireAdmin();
  const [storefronts, users, withdrawals, applications, storefrontEnabledSetting] = await Promise.all([
    prisma.storefront.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      where: { role: { not: "ADMIN" } },
      orderBy: { name: "asc" },
    }),
    prisma.storefrontWithdrawal.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.storefront.findMany({
      where: { status: { in: ["PENDING", "REJECTED"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.systemSetting.findUnique({ where: { key: "storefront_feature_enabled" } }),
  ]);

  const storefrontUserIds = new Set(storefronts.map((s) => s.userId));
  const candidates = users.filter((u) => !storefrontUserIds.has(u.id));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefronts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enable reseller storefronts, set their public address, and review withdrawal requests.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <Link
            href="/admin/storefronts"
            className="flex items-center gap-2 border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-brand-600 dark:border-brand-400 dark:text-brand-400"
          >
            <Store className="h-4 w-4" />
            <span>Storefronts &amp; Resellers</span>
          </Link>
          <Link
            href="/admin/storefronts/withdrawals"
            className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Banknote className="h-4 w-4" />
            <span>Withdrawals</span>
            {withdrawals.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                {withdrawals.length}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Alert Banner for pending withdrawals */}
      {withdrawals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
              <AlertCircle className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {withdrawals.length} Pending Storefront Withdrawal{withdrawals.length === 1 ? "" : "s"} Awaiting Payout
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Resellers have requested MoMo payouts. Review and disburse on the dedicated Withdrawals page.
              </p>
            </div>
          </div>
          <Link
            href="/admin/storefronts/withdrawals"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-500 transition-colors"
          >
            Review Withdrawals ({withdrawals.length}) →
          </Link>
        </div>
      )}

      <AdminStorefrontPanel
        storefronts={storefronts.map((s) => ({
          id: s.id,
          userId: s.userId,
          slug: s.slug,
          name: s.name,
          status: s.status,
          isActive: s.isActive,
          owner: `${s.user.name} (${s.user.email})`,
        }))}
        candidates={candidates.map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))}
        pendingWithdrawals={withdrawals.map((w) => ({
          id: w.id,
          owner: `${w.user.name} (${w.user.email})`,
          amount: fromPesewas(w.amount),
          network: w.network,
          momoNumber: w.momoNumber,
          accountName: w.accountName,
          reference: w.reference ?? `CF-WD-${String(w.seq).padStart(5, "0")}`,
        }))}
        applications={applications.map((a) => ({
          id: a.id,
          userId: a.userId,
          name: a.name,
          slug: a.slug,
          phone: a.phone,
          whatsappGroupLink: a.whatsappGroupLink,
          owner: `${a.user.name} (${a.user.email})`,
          status: a.status,
          rejectionNote: a.rejectionNote,
          requestedAt: a.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        }))}
        initialStorefrontEnabled={storefrontEnabledSetting?.value !== "false"}
      />
    </div>
  );
}
