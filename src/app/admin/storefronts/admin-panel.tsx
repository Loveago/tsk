"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  ExternalLink,
  ArrowUpRight,
  Clock,
  Store,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/shared";

interface StorefrontRow {
  id: string;
  userId: string;
  slug: string;
  name: string;
  status: string;
  isActive?: boolean;
  owner: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string | null;
  balance?: number;
  pendingBalance?: number;
  totalWithdrawn?: number;
  pendingWithdrawn?: number;
  lifetimeEarned?: number;
}

interface Candidate {
  id: string;
  label: string;
}

interface WithdrawalRow {
  id: string;
  owner: string;
  amount: number; // GHS
  network: string;
  momoNumber: string;
  accountName: string;
  reference: string;
}

interface ApplicationRow {
  id: string;
  userId: string;
  name: string;
  slug: string;
  phone?: string | null;
  whatsappGroupLink?: string | null;
  owner: string;
  status: string;
  rejectionNote: string | null;
  requestedAt: string;
}

interface DetailUserWallet {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
  };
  storefront: {
    id: string;
    name: string;
    slug: string;
    status: string;
    isActive: boolean;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  wallet: {
    id: string | null;
    balance: number;
    pendingBalance: number;
    balanceGHS: number;
    pendingBalanceGHS: number;
    totalWithdrawn: number;
    totalWithdrawnGHS: number;
    pendingWithdrawals: number;
    pendingWithdrawalsGHS: number;
    lifetimeEarned: number;
    lifetimeEarnedGHS: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    amountGHS: number;
    balanceBefore: number;
    balanceAfter: number;
    balanceBeforeGHS: number;
    balanceAfterGHS: number;
    pendingBefore: number | null;
    pendingAfter: number | null;
    pendingBeforeGHS: number | null;
    pendingAfterGHS: number | null;
    reference: string | null;
    description: string | null;
    createdAt: string;
  }>;
  withdrawals: Array<{
    id: string;
    seq: number;
    reference: string;
    amount: number;
    amountGHS: number;
    fee: number;
    feeGHS: number;
    netAmount: number;
    netAmountGHS: number;
    network: string;
    momoNumber: string;
    accountName: string;
    status: string;
    note: string | null;
    adminNote: string | null;
    requestedAt: string;
    processedAt: string | null;
  }>;
  recentOrders: Array<{
    id: string;
    seq: number;
    orderCode: string;
    customerPhone: string;
    customerEmail: string | null;
    sellingPrice: number;
    sellingPriceGHS: number;
    productCost: number;
    productCostGHS: number;
    commission: number;
    commissionGHS: number;
    status: string;
    commissionState: string;
    paymentReference: string;
    packageName: string;
    network: string;
    dataAmount: number;
    createdAt: string;
  }>;
}

const TYPE_STYLES: Record<string, { label: string; badge: string }> = {
  COMMISSION: {
    label: "Commission Earned",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  },
  COMMISSION_RELEASE: {
    label: "Commission Released",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  },
  COMMISSION_REVERSAL: {
    label: "Commission Reversal",
    badge: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 border-red-200 dark:border-red-500/30",
  },
  WITHDRAWAL: {
    label: "MoMo Withdrawal",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  },
  WITHDRAWAL_REVERSAL: {
    label: "Withdrawal Reversal",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  },
  ADJUSTMENT: {
    label: "Admin Adjustment",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
  },
};

export function AdminStorefrontPanel({
  storefronts,
  candidates,
  pendingWithdrawals,
  applications,
  initialStorefrontEnabled = true,
}: {
  storefronts: StorefrontRow[];
  candidates: Candidate[];
  pendingWithdrawals: WithdrawalRow[];
  applications: ApplicationRow[];
  initialStorefrontEnabled?: boolean;
}) {
  const router = useRouter();
  const storefrontDomain = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || "tskdatastore.com";
  const [storefrontsActive, setStorefrontsActive] = React.useState(initialStorefrontEnabled);
  const [togglingMaster, setTogglingMaster] = React.useState(false);
  const [userId, setUserId] = React.useState(candidates[0]?.id ?? "");
  const [slug, setSlug] = React.useState("");
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [approveSlugs, setApproveSlugs] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Quick Wallet Inspector Sheet State
  const [inspectUserId, setInspectUserId] = React.useState<string | null>(null);
  const [inspectLoading, setInspectLoading] = React.useState(false);
  const [inspectDetail, setInspectDetail] = React.useState<DetailUserWallet | null>(null);
  const [inspectTab, setInspectTab] = React.useState<"ledger" | "withdrawals" | "orders">("ledger");

  async function openWalletDrawer(targetUserId: string) {
    setInspectUserId(targetUserId);
    setInspectLoading(true);
    setInspectTab("ledger");
    try {
      const res = await fetch(`/api/admin/storefront-wallets?userId=${encodeURIComponent(targetUserId)}`);
      if (!res.ok) throw new Error("Failed to load storefront wallet");
      const data = await res.json();
      setInspectDetail(data);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to load wallet" });
    } finally {
      setInspectLoading(false);
    }
  }

  async function toggleMasterStorefronts() {
    setTogglingMaster(true);
    setMsg(null);
    try {
      const nextVal = !storefrontsActive;
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storefront_feature_enabled: nextVal ? "true" : "false" }),
      });
      if (!res.ok) throw new Error("Failed to update master storefront status");
      setStorefrontsActive(nextVal);
      setMsg({
        kind: "ok",
        text: nextVal
          ? "All storefronts have been enabled successfully."
          : "All storefronts have been disabled (maintenance mode active).",
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to update storefronts" });
    } finally {
      setTogglingMaster(false);
    }
  }

  async function call(url: string, body: unknown, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setMsg({ kind: "ok", text: okText });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Action failed" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/admin/storefronts", { userId, action: "ENABLE", slug: slug || undefined }, "Storefront enabled.");
    if (ok) {
      setSlug("");
      setUserId(candidates.filter((c) => c.id !== userId)[0]?.id ?? "");
    }
  }

  async function setStatus(sf: StorefrontRow, action: "SUSPEND" | "REVOKE") {
    await call("/api/admin/storefronts", { userId: sf.userId, action }, `Storefront ${action === "SUSPEND" ? "suspended" : "revoked"}.`);
  }

  async function reviewWithdrawal(id: string, action: "APPROVE" | "REJECT") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, adminNote: notes[id] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setMsg({ kind: "ok", text: `Withdrawal ${action === "APPROVE" ? "approved — wallet debited" : "rejected"}.` });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500";

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      {/* Master Storefront Killswitch Card */}
      <div className={`rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 transition ${
        storefrontsActive
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5"
          : "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
      }`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${storefrontsActive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Master Storefront Status: {storefrontsActive ? "All Storefronts Active" : "All Storefronts Disabled"}
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {storefrontsActive
              ? "All customer-facing storefronts are operational and accepting orders."
              : "All customer storefront links are currently disabled and show maintenance mode."}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || togglingMaster}
          onClick={toggleMasterStorefronts}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm ${
            storefrontsActive
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {togglingMaster ? "Updating…" : storefrontsActive ? "Disable All Storefronts" : "Enable All Storefronts"}
        </button>
      </div>

      {/* Store applications (user-submitted) */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Store applications ({applications.filter((a) => a.status === "PENDING").length} pending)
        </h2>
        <div className="space-y-3">
          {applications.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No store applications yet. Users apply from their dashboard with a store name.
            </p>
          )}
          {applications.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {a.name}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-white/10">
                      {a.status === "PENDING" ? "Under review" : "Rejected"}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.owner} · applied {a.requestedAt}
                    {a.rejectionNote ? ` · last note: “${a.rejectionNote}”` : ""}
                  </p>
                  {(a.phone || a.whatsappGroupLink) && (
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {a.phone && (
                        <span className="text-slate-600 dark:text-slate-300">
                          <strong>Tel:</strong> {a.phone}
                        </span>
                      )}
                      {a.whatsappGroupLink && (
                        <a
                          href={a.whatsappGroupLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          WhatsApp Group Link ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
                {a.status === "PENDING" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">/store/</span>
                      <input
                        value={approveSlugs[a.id] ?? a.slug}
                        onChange={(e) =>
                          setApproveSlugs((s) => ({ ...s, [a.id]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))
                        }
                        className={`${inputCls} h-9 w-48 pl-14 text-xs`}
                        aria-label="Public store address"
                      />
                    </div>
                    <button
                      onClick={() => call("/api/admin/storefronts", { userId: a.userId, action: "APPROVE", slug: approveSlugs[a.id] ?? a.slug }, "Application approved — store is live.")}
                      disabled={busy}
                      className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <input
                      value={notes[a.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                      placeholder="Reason (optional)"
                      className="h-9 w-40 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      onClick={() => call("/api/admin/storefronts", { userId: a.userId, action: "REJECT", note: notes[a.id] ?? "" }, "Application rejected.")}
                      disabled={busy}
                      className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">The user can re-apply from their dashboard.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Enable form */}
      <form onSubmit={enable} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Enable storefront</h2>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} max-w-xs dark:bg-[#0d1526]`} required>
          {candidates.length === 0 && <option value="">No eligible users</option>}
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">/store/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="store-address e.g. kofi-data"
            pattern="[a-z0-9][a-z0-9-]{2,31}"
            required
            className={`${inputCls} pl-16`}
          />
        </div>
        <button type="submit" disabled={busy || candidates.length === 0} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          Enable
        </button>
      </form>

      {/* Storefront list with Wallets */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Storefronts &amp; Reseller Wallets ({storefronts.length})
          </h2>
          <Link
            href="/admin/storefronts/wallets"
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>Open Dedicated Wallets Tracker &amp; Ledger →</span>
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Available Wallet</th>
                <th className="px-4 py-3 text-right">In-Flight Pending</th>
                <th className="px-4 py-3 text-right">Lifetime Earned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {storefronts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No storefronts yet</td></tr>
              )}
              {storefronts.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openWalletDrawer(s.userId)}
                      className="font-bold text-slate-900 hover:text-brand-600 hover:underline dark:text-white dark:hover:text-brand-400 text-left"
                    >
                      {s.userName || s.owner}
                    </button>
                    <p className="text-xs text-slate-400">{s.userEmail || s.owner}</p>
                    {s.userPhone && <p className="text-[11px] text-slate-400">{s.userPhone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://${storefrontDomain}/${s.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-violet-600 hover:underline dark:text-violet-400 inline-flex items-center gap-1"
                    >
                      <span>/{s.slug}</span>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>
                    <span className="ml-2 text-slate-400 text-xs">{s.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === "ENABLED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : s.status === "SUSPENDED" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : s.status === "PENDING" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : s.status === "REJECTED" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-500 dark:bg-white/10"}`}>
                        {s.status}
                      </span>
                      {s.status === "ENABLED" && s.isActive === false && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          Paused by user
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    GHS {(s.balance ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400">
                    GHS {(s.pendingBalance ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                    GHS {(s.lifetimeEarned ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openWalletDrawer(s.userId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Wallet className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                        <span>Track Wallet</span>
                      </button>
                      {s.status === "ENABLED" ? (
                        <button onClick={() => setStatus(s, "SUSPEND")} disabled={busy} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
                          Suspend
                        </button>
                      ) : s.status === "SUSPENDED" ? (
                        <button onClick={() => setStatus(s, "REVOKE")} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending withdrawals */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Pending withdrawals ({pendingWithdrawals.length})</h2>
          <a href="/admin/storefronts/withdrawals" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Open Dedicated Withdrawals Page →
          </a>
        </div>
        <div className="space-y-3">
          {pendingWithdrawals.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">No withdrawal requests awaiting review.</p>
          )}
          {pendingWithdrawals.map((w) => (
            <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">GHS {w.amount.toFixed(2)} · {w.network} {w.momoNumber}</p>
                  <p className="text-xs text-slate-500">{w.owner} · {w.accountName} · Ref {w.reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={notes[w.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [w.id]: e.target.value }))}
                    placeholder="Note (optional)"
                    className="h-9 w-44 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button onClick={() => reviewWithdrawal(w.id, "APPROVE")} disabled={busy} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                    Approve &amp; pay
                  </button>
                  <button onClick={() => reviewWithdrawal(w.id, "REJECT")} disabled={busy} className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Slide-over Inspector Sheet for Storefront Wallet */}
      <Sheet
        open={!!inspectUserId}
        onClose={() => {
          setInspectUserId(null);
          setInspectDetail(null);
        }}
        title={
          inspectDetail ? (
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <span>{inspectDetail.user.name}&apos;s Storefront Wallet</span>
            </div>
          ) : (
            "Storefront Wallet Details"
          )
        }
        description={
          inspectDetail ? (
            <span>
              {inspectDetail.user.email} {inspectDetail.user.phone ? `· ${inspectDetail.user.phone}` : ""}
              {inspectDetail.storefront ? ` · Store: /${inspectDetail.storefront.slug}` : ""}
            </span>
          ) : undefined
        }
        className="max-w-3xl"
      >
        {inspectLoading && (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-brand-600" />
          </div>
        )}

        {!inspectLoading && inspectDetail && (
          <div className="space-y-6">
            {/* Quick Balances Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Available (Withdrawable)
                </span>
                <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  GHS {inspectDetail.wallet.balanceGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  In-Flight Pending
                </span>
                <p className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-400">
                  GHS {inspectDetail.wallet.pendingBalanceGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Paid Out
                </span>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                  GHS {inspectDetail.wallet.totalWithdrawnGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5 dark:border-violet-500/20 dark:bg-violet-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  Lifetime Earnings
                </span>
                <p className="mt-1 text-lg font-bold text-violet-700 dark:text-violet-400">
                  GHS {inspectDetail.wallet.lifetimeEarnedGHS.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Quick Actions & Store Info */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#0d1526]">
              <div>
                <p className="text-xs text-slate-500">
                  Manage this reseller&apos;s full ledger history, adjust balances, and export data in the dedicated section.
                </p>
              </div>
              <Link
                href="/admin/storefronts/wallets"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-500"
              >
                <span>Open Full Wallets Tracker</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Detail Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setInspectTab("ledger")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  inspectTab === "ledger"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Ledger Transactions</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {inspectDetail.transactions.length}
                </span>
              </button>

              <button
                onClick={() => setInspectTab("withdrawals")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  inspectTab === "withdrawals"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Withdrawals</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {inspectDetail.withdrawals.length}
                </span>
              </button>

              <button
                onClick={() => setInspectTab("orders")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  inspectTab === "orders"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Recent Orders</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {inspectDetail.recentOrders.length}
                </span>
              </button>
            </div>

            {/* Tab 1: Ledger */}
            {inspectTab === "ledger" && (
              <div className="space-y-3">
                {inspectDetail.transactions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No transactions recorded for this wallet yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Date &amp; Time</th>
                            <th className="px-3.5 py-2.5">Type</th>
                            <th className="px-3.5 py-2.5 text-right">Amount</th>
                            <th className="px-3.5 py-2.5 text-right">Balance After</th>
                            <th className="px-3.5 py-2.5">Reference &amp; Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {inspectDetail.transactions.map((t) => {
                            const isPositive = t.amount >= 0;
                            const typeMeta = TYPE_STYLES[t.type] || {
                              label: t.type,
                              badge: "bg-slate-100 text-slate-700",
                            };
                            return (
                              <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                                <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                                  {new Date(t.createdAt).toLocaleString("en-GB", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </td>
                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  <span
                                    className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold ${typeMeta.badge}`}
                                  >
                                    {typeMeta.label}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono font-bold">
                                  <span
                                    className={
                                      isPositive
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-rose-600 dark:text-rose-400"
                                    }
                                  >
                                    {isPositive ? "+" : "−"}GHS {Math.abs(t.amountGHS).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                                  <div>GHS {t.balanceAfterGHS.toFixed(2)}</div>
                                  {t.pendingAfterGHS !== null && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                      pending: GHS {t.pendingAfterGHS.toFixed(2)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">
                                  {t.description && <div>{t.description}</div>}
                                  {t.reference && (
                                    <div className="font-mono text-[10px] text-slate-400">
                                      Ref: {t.reference}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Withdrawals */}
            {inspectTab === "withdrawals" && (
              <div className="space-y-3">
                {inspectDetail.withdrawals.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No withdrawals requested by this user.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Requested At</th>
                            <th className="px-3.5 py-2.5">Ref / Seq</th>
                            <th className="px-3.5 py-2.5">MoMo Destination</th>
                            <th className="px-3.5 py-2.5 text-right">Net Payout</th>
                            <th className="px-3.5 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {inspectDetail.withdrawals.map((w) => (
                            <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                                {new Date(w.requestedAt).toLocaleString("en-GB", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {w.reference}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {w.network} · {w.momoNumber}
                                </div>
                                <div className="text-[10px] text-slate-400">{w.accountName}</div>
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                GHS {w.netAmountGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    w.status === "APPROVED"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                      : w.status === "PENDING"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                      : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                                  }`}
                                >
                                  {w.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Orders */}
            {inspectTab === "orders" && (
              <div className="space-y-3">
                {inspectDetail.recentOrders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No orders recorded for this storefront yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Order / Date</th>
                            <th className="px-3.5 py-2.5">Package</th>
                            <th className="px-3.5 py-2.5">Buyer</th>
                            <th className="px-3.5 py-2.5 text-right">Profit</th>
                            <th className="px-3.5 py-2.5">Commission State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {inspectDetail.recentOrders.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2.5">
                                <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {o.orderCode}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(o.createdAt).toLocaleString("en-GB", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {o.network} {o.packageName}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {o.customerPhone}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                +GHS {o.commissionGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    o.commissionState === "AVAILABLE"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                      : o.commissionState === "PENDING"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                                  }`}
                                >
                                  {o.commissionState}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
