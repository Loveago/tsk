"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

interface StorefrontRow {
  id: string;
  userId: string;
  slug: string;
  name: string;
  status: string;
  isActive?: boolean;
  owner: string;
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

      {/* Storefront list */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Store</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {storefronts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No storefronts yet</td></tr>
            )}
            {storefronts.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{s.owner}</td>
                <td className="px-4 py-2">
                  <a
                    href={`https://${storefrontDomain}/${s.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-violet-600 hover:underline dark:text-violet-400"
                  >
                    {storefrontDomain}/{s.slug}
                  </a>
                  <span className="ml-2 text-slate-400">{s.name}</span>
                </td>
                <td className="px-4 py-2">
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
                <td className="px-4 py-2">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending withdrawals */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Pending withdrawals ({pendingWithdrawals.length})</h2>
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
    </div>
  );
}
