import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/shared";
import { ProfileForms } from "./profile-form";
import { formatGHS } from "@/lib/types";
import {
  ArrowDownLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Fingerprint,
  Phone,
  Tag,
  Wallet,
  XCircle,
} from "lucide-react";

export default async function ProfilePage() {
  const current = await getCurrentUser();
  if (!current) return null; // guarded by middleware

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: {
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      balance: true,
      createdAt: true,
      pricingProfileId: true,
    },
  });
  if (!user) return null;

  const profileName =
    (
      user.pricingProfileId
        ? await prisma.pricingProfile.findUnique({
            where: { id: user.pricingProfileId },
            select: { name: true },
          })
        : null
    )?.name ??
    (
      await prisma.pricingProfile.findFirst({
        where: { isDefault: true },
        select: { name: true },
      })
    )?.name ??
    "Standard";

  const statusGroups = await prisma.order.groupBy({
    by: ["status"],
    where: { userId: current.id },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const countOf = (s: string) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const totalOrders = statusGroups.reduce((n, g) => n + g._count._all, 0);
  const totalSpend = statusGroups.reduce((n, g) => n + (g._sum.amount ?? 0), 0);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Manage your account details and preferences" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Orders" value={String(totalOrders)} icon={ClipboardList} />
        <StatCard title="Successful" value={String(countOf("SUCCESS"))} icon={CheckCircle2} />
        <StatCard title="Failed" value={String(countOf("FAILED"))} icon={XCircle} />
        <StatCard title="Total Spend" value={formatGHS(totalSpend)} icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Identity card + quick links */}
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
            <div className="h-20 bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600" />
            <div className="-mt-9 px-5 pb-5">
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-blue-500 to-violet-600 text-xl font-black text-white shadow-lg dark:border-[#0d1526]">
                {initials}
              </span>
              <h2 className="mt-3 truncate text-lg font-bold">{user.name}</h2>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {user.status.toLowerCase()}
                </span>
              </div>

              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Fingerprint className="h-3.5 w-3.5" /> User ID
                  </dt>
                  <dd className="max-w-[140px] truncate font-mono text-xs" title={current.id}>
                    {current.id}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </dt>
                  <dd className="truncate font-medium">{user.phone ?? "Not set"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Tag className="h-3.5 w-3.5" /> Pricing profile
                  </dt>
                  <dd className="truncate font-medium">{profileName}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Wallet className="h-3.5 w-3.5" /> Wallet
                  </dt>
                  <dd className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatGHS(user.balance)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" /> Member since
                  </dt>
                  <dd className="font-medium">{memberSince}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/billing"
              className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 dark:border-white/5 dark:bg-[#0d1526] dark:hover:border-brand-500/40"
            >
              <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
              <p className="mt-2 text-sm font-bold">Top up wallet</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Request balance</p>
            </Link>
            <Link
              href="/dashboard/api-docs"
              className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 dark:border-white/5 dark:bg-[#0d1526] dark:hover:border-brand-500/40"
            >
              <BookOpen className="h-5 w-5 text-blue-500" />
              <p className="mt-2 text-sm font-bold">API documentation</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Integrate &amp; automate</p>
            </Link>
          </div>
        </div>

        {/* Forms */}
        <div className="lg:col-span-2">
          <ProfileForms initial={{ name: user.name, email: user.email, phone: user.phone ?? "" }} />
        </div>
      </div>
    </div>
  );
}
