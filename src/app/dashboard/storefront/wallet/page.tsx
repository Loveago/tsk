import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, ensureWallet, fromPesewas } from "@/lib/storefront";
import { WithdrawalForm } from "./withdrawal-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StorefrontWalletPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const wallet = await ensureWallet(user.id);

  const [transactions, withdrawals, approvedSum, pending] = await Promise.all([
    prisma.storefrontWalletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.storefrontWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
      take: 20,
    }),
    prisma.storefrontWithdrawal.aggregate({
      where: { userId: user.id, status: "APPROVED" },
      _sum: { amount: true },
    }),
    prisma.storefrontWithdrawal.findFirst({ where: { userId: user.id, status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Commissions Wallet</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Withdraw commissions to your mobile money account.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available" value={wallet.balance} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Pending" value={wallet.pendingBalance} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Total withdrawn" value={approvedSum._sum.amount ?? 0} accent="text-slate-900 dark:text-white" />
        <StatCard label="Lifetime commissions" value={wallet.balance + wallet.pendingBalance + (approvedSum._sum.amount ?? 0)} accent="text-slate-900 dark:text-white" />
      </div>

      <WithdrawalForm
        available={wallet.balance}
        pending={!!pending}
        disabled={storefront.status !== "ENABLED"}
      />

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Withdrawals</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Destination</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No withdrawals yet</td></tr>
              )}
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 font-mono text-xs">{w.reference ?? `CF-WD-${String(w.seq).padStart(5, "0")}`}</td>
                  <td className="px-4 py-2 font-semibold">GHS {fromPesewas(w.amount).toFixed(2)}</td>
                  <td className="px-4 py-2">{w.network} · {w.momoNumber}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.status === "APPROVED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : w.status === "REJECTED" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>
                      {w.status}
                    </span>
                    {w.adminNote && <span className="ml-2 text-xs text-slate-400">{w.adminNote}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Ledger (last 50)</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No transactions yet</td></tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-xs text-slate-500">{t.createdAt.toLocaleString("en-GB")}</td>
                  <td className="px-4 py-2 text-xs font-semibold">{t.type}</td>
                  <td className={`px-4 py-2 font-semibold ${t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {t.amount >= 0 ? "+" : "−"}GHS {fromPesewas(Math.abs(t.amount)).toFixed(2)}
                  </td>
                  <td className="px-4 py-2">GHS {fromPesewas(t.balanceAfter).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent}`}>GHS {fromPesewas(value).toFixed(2)}</p>
    </div>
  );
}
