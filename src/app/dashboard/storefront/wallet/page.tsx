import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, ensureWallet, fromPesewas } from "@/lib/storefront";
import { WithdrawalForm } from "./withdrawal-form";
import { WalletWithdrawalsView } from "@/components/storefront/wallet-withdrawals-view";
import { WalletLedgerView } from "@/components/storefront/wallet-ledger-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StorefrontWalletPage({
  searchParams,
}: {
  searchParams?: Promise<{ wdPage?: string; txPage?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const wdPage = Math.max(1, parseInt(resolvedParams.wdPage || "1", 10));
  const txPage = Math.max(1, parseInt(resolvedParams.txPage || "1", 10));
  const wdPageSize = 10;
  const txPageSize = 15;

  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const wallet = await ensureWallet(user.id);

  const [
    transactions,
    totalTransactions,
    withdrawals,
    totalWithdrawals,
    approvedSum,
    pending,
  ] = await Promise.all([
    prisma.storefrontWalletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      skip: (txPage - 1) * txPageSize,
      take: txPageSize,
    }),
    prisma.storefrontWalletTransaction.count({
      where: { walletId: wallet.id },
    }),
    prisma.storefrontWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
      skip: (wdPage - 1) * wdPageSize,
      take: wdPageSize,
    }),
    prisma.storefrontWithdrawal.count({
      where: { userId: user.id },
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
        pendingDetails={
          pending
            ? {
                amountGHS: fromPesewas(pending.amount),
                feeGHS: fromPesewas(pending.fee ?? 100),
                netAmountGHS: fromPesewas(pending.netAmount ?? pending.amount - (pending.fee ?? 100)),
                network: pending.network,
                momoNumber: pending.momoNumber,
                accountName: pending.accountName,
                reference: pending.reference ?? `CF-WD-${String(pending.seq).padStart(5, "0")}`,
                requestedAt: pending.requestedAt.toISOString(),
              }
            : null
        }
        disabled={storefront.status !== "ENABLED"}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Withdrawals ({totalWithdrawals})
          </h2>
        </div>
        <WalletWithdrawalsView
          withdrawals={withdrawals.map((w) => ({
            id: w.id,
            seq: w.seq,
            reference: w.reference ?? `CF-WD-${String(w.seq).padStart(5, "0")}`,
            amount: w.amount,
            fee: w.fee ?? 100,
            netAmount: w.netAmount ?? Math.max(0, w.amount - (w.fee ?? 100)),
            network: w.network,
            momoNumber: w.momoNumber,
            accountName: w.accountName,
            status: w.status,
            adminNote: w.adminNote,
            requestedAt: w.requestedAt.toISOString(),
          }))}
          total={totalWithdrawals}
          page={wdPage}
          pageSize={wdPageSize}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Commission Ledger ({totalTransactions})
          </h2>
        </div>
        <WalletLedgerView
          transactions={transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            balanceBefore: t.balanceBefore,
            balanceAfter: t.balanceAfter,
            pendingBefore: t.pendingBefore,
            pendingAfter: t.pendingAfter,
            reference: t.reference,
            description: t.description,
            createdAt: t.createdAt.toISOString(),
          }))}
          total={totalTransactions}
          page={txPage}
          pageSize={txPageSize}
        />
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
