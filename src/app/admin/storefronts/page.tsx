import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromPesewas } from "@/lib/storefront";
import { AdminStorefrontPanel } from "./admin-panel";

export default async function AdminStorefrontsPage() {
  await requireAdmin();
  const [storefronts, users, withdrawals, applications] = await Promise.all([
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
  ]);

  const storefrontUserIds = new Set(storefronts.map((s) => s.userId));
  const candidates = users.filter((u) => !storefrontUserIds.has(u.id));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefronts</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enable reseller storefronts, set their public address, and review withdrawal requests.
        </p>
      </header>

      <AdminStorefrontPanel
        storefronts={storefronts.map((s) => ({
          id: s.id,
          userId: s.userId,
          slug: s.slug,
          name: s.name,
          status: s.status,
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
          owner: `${a.user.name} (${a.user.email})`,
          status: a.status,
          rejectionNote: a.rejectionNote,
          requestedAt: a.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        }))}
      />
    </div>
  );
}
