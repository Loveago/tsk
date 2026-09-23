"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader, Spinner, StatCard, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatGHS, formatDateTime } from "@/lib/types";
import { ManualCreditDialog } from "@/components/admin/manual-credit-dialog";
import {
  Wallet,
  Search,
  ArrowLeftRight,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Download,
  User as UserIcon,
  Mail,
  Phone,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  X,
  CreditCard,
  History,
  ShieldCheck,
} from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  balance: number;
  createdAt: string;
  lastLoginAt: string | null;
  pricingProfile?: { id: string; name: string; type: string } | null;
}

interface WalletStats {
  totalTopups: number;
  totalTopupsCount: number;
  totalDebits: number;
  totalDebitsCount: number;
  totalRefunds: number;
  totalRefundsCount: number;
  totalOrdersCount: number;
  totalOrderSpend: number;
  successOrdersCount: number;
  failedOrdersCount: number;
}

interface WalletTxItem {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  sendClaim?: { id: string; transactionReference: string; senderPhone: string; status: string } | null;
}

interface OrderItem {
  id: number;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  phoneNumber: string;
  createdAt: string;
  batch?: { batchCode: string } | null;
}

interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  balance: number;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { orders: number; walletTransactions: number };
}

interface OverviewStats {
  totalPlatformBalance: number;
  activeWalletsCount: number;
  zeroBalanceCount: number;
  negativeBalanceCount: number;
}

export default function AdminWalletsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const activeUserId = searchParams.get("userId");

  // Autocomplete / Search input state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  // Single User State
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [stats, setStats] = React.useState<WalletStats | null>(null);
  const [txItems, setTxItems] = React.useState<WalletTxItem[]>([]);
  const [txTotal, setTxTotal] = React.useState(0);
  const [txPage, setTxPage] = React.useState(1);
  const [txPages, setTxPages] = React.useState(1);
  const [txType, setTxType] = React.useState("");
  const [txStatus, setTxStatus] = React.useState("");

  const [orders, setOrders] = React.useState<OrderItem[]>([]);
  const [orderTotal, setOrderTotal] = React.useState(0);
  const [orderPage, setOrderPage] = React.useState(1);
  const [orderPages, setOrderPages] = React.useState(1);

  const [activeTab, setActiveTab] = React.useState<"transactions" | "orders">("transactions");
  const [singleLoading, setSingleLoading] = React.useState(false);

  // Directory Overview State
  const [overview, setOverview] = React.useState<OverviewStats | null>(null);
  const [directoryUsers, setDirectoryUsers] = React.useState<UserDirectoryItem[]>([]);
  const [dirTotal, setDirTotal] = React.useState(0);
  const [dirPage, setDirPage] = React.useState(1);
  const [dirPages, setDirPages] = React.useState(1);
  const [dirFilterBalance, setDirFilterBalance] = React.useState("");
  const [dirFilterRole, setDirFilterRole] = React.useState("");
  const [dirQuery, setDirQuery] = React.useState("");
  const [overviewLoading, setOverviewLoading] = React.useState(false);

  // Credit / Debit Dialog
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"CREDIT" | "DEBIT">("CREDIT");
  const [busyActionId, setBusyActionId] = React.useState<string | null>(null);

  // Load live autocomplete suggestions when typing in search bar
  React.useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/admin/wallets?search=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {
        // silent fail
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load single user details & transactions
  const loadSingleUser = React.useCallback(async () => {
    if (!activeUserId) return;
    setSingleLoading(true);
    try {
      const params = new URLSearchParams({
        userId: activeUserId,
        txPage: String(txPage),
        orderPage: String(orderPage),
      });
      if (txType) params.set("txType", txType);
      if (txStatus) params.set("txStatus", txStatus);

      const res = await fetch(`/api/admin/wallets?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load user wallet details");

      setUserProfile(json.user);
      setStats(json.stats);
      setTxItems(json.transactions?.items ?? []);
      setTxTotal(json.transactions?.total ?? 0);
      setTxPages(json.transactions?.pages ?? 1);

      setOrders(json.orders?.items ?? []);
      setOrderTotal(json.orders?.total ?? 0);
      setOrderPages(json.orders?.pages ?? 1);
    } catch (err: any) {
      toast(err.message || "Failed to load user wallet data", "error");
    } finally {
      setSingleLoading(false);
    }
  }, [activeUserId, txPage, orderPage, txType, txStatus, toast]);

  // Load overview / directory when no user is selected
  const loadOverview = React.useCallback(async () => {
    if (activeUserId) return;
    setOverviewLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(dirPage),
        pageSize: "20",
      });
      if (dirQuery) params.set("q", dirQuery);
      if (dirFilterBalance) params.set("balance", dirFilterBalance);
      if (dirFilterRole) params.set("role", dirFilterRole);

      const res = await fetch(`/api/admin/wallets?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load wallet directory");

      setOverview(json.overview);
      setDirectoryUsers(json.users ?? []);
      setDirTotal(json.total ?? 0);
      setDirPages(json.pages ?? 1);
    } catch (err: any) {
      toast(err.message || "Failed to load wallet directory", "error");
    } finally {
      setOverviewLoading(false);
    }
  }, [activeUserId, dirPage, dirQuery, dirFilterBalance, dirFilterRole, toast]);

  React.useEffect(() => {
    if (activeUserId) {
      loadSingleUser();
    } else {
      loadOverview();
    }
  }, [activeUserId, loadSingleUser, loadOverview]);

  const selectUser = (userId: string) => {
    setShowSuggestions(false);
    setSearchQuery("");
    setTxPage(1);
    setOrderPage(1);
    router.push(`/admin/wallets?userId=${userId}`);
  };

  const clearSelectedUser = () => {
    router.push("/admin/wallets");
  };

  const openAdjustDialog = (mode: "CREDIT" | "DEBIT") => {
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const handleTxDecision = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const note =
      decision === "REJECTED" ? prompt("Rejection reason (optional)") ?? undefined : undefined;
    setBusyActionId(id);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Action failed", "error");
      toast(
        decision === "APPROVED" ? "Top-up approved — user credited" : "Top-up rejected",
        decision === "APPROVED" ? "success" : "info"
      );
      loadSingleUser();
    } catch {
      toast("Failed to update transaction", "error");
    } finally {
      setBusyActionId(null);
    }
  };

  const verifyPaystack = async (id: string, reference: string) => {
    setBusyActionId(id);
    try {
      const res = await fetch("/api/billing/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id, reference }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Paystack check failed", "error");
      if (json.settled) {
        toast("Top-up verified with Paystack and approved!", "success");
        loadSingleUser();
      } else {
        toast(json.reason ?? `Paystack status: ${json.status}`, "info");
      }
    } catch {
      toast("Failed to verify transaction with Paystack", "error");
    } finally {
      setBusyActionId(null);
    }
  };

  // Export CSV statement for selected user
  const exportUserStatement = () => {
    if (!userProfile || txItems.length === 0) {
      toast("No transactions to export for this user", "info");
      return;
    }
    const headers = ["ID", "Date", "Type", "Amount (GHS)", "Status", "Reference", "Note"];
    const rows = txItems.map((tx) => [
      tx.id,
      new Date(tx.createdAt).toISOString(),
      tx.type,
      tx.amount.toFixed(2),
      tx.status,
      tx.reference || "",
      `"${(tx.note || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `wallet-statement-${userProfile.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Statement downloaded successfully", "success");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Wallets & Activity Tracker"
        description="Search any user to monitor their live wallet balance, inspect ledger transactions, and track order activity"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeUserId && (
              <>
                <Button
                  variant="outline"
                  onClick={clearSelectedUser}
                  className="text-xs h-9 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All User Wallets
                </Button>
                <Button
                  variant="outline"
                  onClick={exportUserStatement}
                  className="text-xs h-9 cursor-pointer"
                  title="Export wallet statement as CSV"
                >
                  <Download className="h-3.5 w-3.5 mr-1 text-slate-500" /> Export CSV
                </Button>
                <Button
                  onClick={() => openAdjustDialog("CREDIT")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-xs cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5 mr-1" /> Credit User
                </Button>
                <Button
                  onClick={() => openAdjustDialog("DEBIT")}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 shadow-xs cursor-pointer"
                >
                  <MinusCircle className="h-3.5 w-3.5 mr-1" /> Debit User
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Top Search Bar with Live User Picker */}
      <div className="relative z-20 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/60 via-white to-indigo-50/40 p-4 dark:border-brand-500/20 dark:from-brand-950/30 dark:via-slate-900 dark:to-indigo-950/20 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search user by name, email, or phone number to track wallet..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="pl-9 pr-9 h-11 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl"
            />
            {searchLoading ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner className="h-4 w-4 text-brand-600" />
              </div>
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSuggestions([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 divide-y divide-slate-100 dark:divide-slate-800">
                {suggestions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition hover:bg-brand-50/80 dark:hover:bg-brand-500/10 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {u.name}
                          </p>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {u.role}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {u.email} {u.phone ? `· ${u.phone}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatGHS(u.balance)}
                      </p>
                      <span className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                        Inspect <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            type="button"
            onClick={() => {
              if (suggestions.length > 0) selectUser(suggestions[0].id);
            }}
            disabled={suggestions.length === 0}
            className="bg-brand-600 hover:bg-brand-700 text-white h-11 px-5 rounded-xl text-sm shrink-0 cursor-pointer"
          >
            <UserIcon className="h-4 w-4 mr-1.5" />
            Track User
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: SINGLE USER DETAIL & ACTIVITY VIEW */}
      {/* ========================================================================= */}
      {activeUserId ? (
        singleLoading && !userProfile ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-8 w-8 text-brand-600" />
          </div>
        ) : !userProfile ? (
          <EmptyState
            icon={Wallet}
            title="User Not Found"
            description="The requested user does not exist or has been removed."
          />
        ) : (
          <div className="space-y-6">
            {/* User Hero & Current Balance Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* User identity info */}
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 text-lg font-bold text-white shadow-md">
                    {userProfile.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {userProfile.name}
                      </h2>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        {userProfile.role}
                      </span>
                      <StatusBadge status={userProfile.status} />
                      {userProfile.pricingProfile && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {userProfile.pricingProfile.name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        {userProfile.email}
                      </span>
                      {userProfile.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {userProfile.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        Joined {new Date(userProfile.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Big Wallet Balance Banner */}
                <div className="flex items-center gap-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent px-5 py-3 dark:border-emerald-500/20">
                  <div className="rounded-xl bg-emerald-600/10 p-3 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Current Wallet Balance
                    </p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white">
                      {formatGHS(userProfile.balance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stat Cards for this User */}
            {stats && (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  title="Total Credited"
                  value={formatGHS(stats.totalTopups)}
                  icon={ArrowDownLeft}
                  hint={`${stats.totalTopupsCount} top-ups / credits`}
                />
                <StatCard
                  title="Spent on Orders"
                  value={formatGHS(stats.totalOrderSpend)}
                  icon={ShoppingBag}
                  hint={`${stats.successOrdersCount} successful bundles`}
                />
                <StatCard
                  title="Total Refunds"
                  value={formatGHS(stats.totalRefunds)}
                  icon={RefreshCw}
                  hint={`${stats.totalRefundsCount} refunded transactions`}
                />
                <StatCard
                  title="Total Orders"
                  value={String(stats.totalOrdersCount)}
                  icon={History}
                  hint={stats.failedOrdersCount > 0 ? `${stats.failedOrdersCount} failed` : "All in good standing"}
                />
              </div>
            )}

            {/* Tabs for Wallet Transactions vs Orders */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("transactions")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                      activeTab === "transactions"
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                    Wallet Ledger ({txTotal})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("orders")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                      activeTab === "orders"
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Orders Activity ({orderTotal})
                  </button>
                </div>

                {activeTab === "transactions" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={txType}
                      onChange={(e) => {
                        setTxType(e.target.value);
                        setTxPage(1);
                      }}
                      className="h-8 text-xs w-36"
                    >
                      <option value="">All Types</option>
                      <option value="TOPUP">Top-ups</option>
                      <option value="DEBIT">Debits</option>
                      <option value="REFUND">Refunds</option>
                      <option value="ADJUSTMENT">Adjustments</option>
                      <option value="SIGNUP_FEE">Signup Fees</option>
                    </Select>
                    <Select
                      value={txStatus}
                      onChange={(e) => {
                        setTxStatus(e.target.value);
                        setTxPage(1);
                      }}
                      className="h-8 text-xs w-36"
                    >
                      <option value="">All Statuses</option>
                      <option value="APPROVED">Approved</option>
                      <option value="PENDING">Pending</option>
                      <option value="REJECTED">Rejected</option>
                    </Select>
                  </div>
                )}
              </div>

              {/* TAB 1: WALLET TRANSACTIONS LEDGER */}
              {activeTab === "transactions" && (
                <div>
                  {txItems.length === 0 ? (
                    <div className="py-12">
                      <EmptyState
                        icon={Wallet}
                        title="No Wallet Transactions"
                        description="This user does not have any transactions matching the selected filters."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {txItems.map((tx) => {
                        const isCredit =
                          tx.type === "TOPUP" ||
                          tx.type === "REFUND" ||
                          (tx.type === "ADJUSTMENT" && tx.amount > 0);
                        return (
                          <div
                            key={tx.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                className={`rounded-xl p-2 shrink-0 ${
                                  isCredit
                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                                }`}
                              >
                                {isCredit ? (
                                  <ArrowDownLeft className="h-4 w-4" />
                                ) : (
                                  <ArrowUpRight className="h-4 w-4" />
                                )}
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-bold ${
                                      isCredit
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-slate-900 dark:text-white"
                                    }`}
                                  >
                                    {isCredit ? "+" : "-"}
                                    {formatGHS(Math.abs(tx.amount))}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {tx.type}
                                  </span>
                                  <StatusBadge status={tx.status} />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  {tx.reference && <span>Ref: {tx.reference}</span>}
                                  {tx.note && <span>· Note: {tx.note}</span>}
                                  <span>· {formatDateTime(tx.createdAt)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Pending transaction moderation actions */}
                            {tx.status === "PENDING" && (
                              <div className="flex items-center gap-1.5">
                                {tx.reference?.startsWith("PSK-") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyActionId === tx.id}
                                    onClick={() => verifyPaystack(tx.id, tx.reference!)}
                                    className="h-8 text-xs border-brand-500/40 text-brand-600 hover:bg-brand-50 dark:text-brand-400 cursor-pointer"
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" /> Verify PSK
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  disabled={busyActionId === tx.id}
                                  onClick={() => handleTxDecision(tx.id, "APPROVED")}
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busyActionId === tx.id}
                                  onClick={() => handleTxDecision(tx.id, "REJECTED")}
                                  className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                                >
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Transactions Pagination */}
                  {txPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                      <span>
                        Page {txPage} of {txPages} ({txTotal} total transactions)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={txPage <= 1}
                          onClick={() => setTxPage((p) => p - 1)}
                          className="h-7 text-xs"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={txPage >= txPages}
                          onClick={() => setTxPage((p) => p + 1)}
                          className="h-7 text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: USER ORDERS ACTIVITY */}
              {activeTab === "orders" && (
                <div>
                  {orders.length === 0 ? (
                    <div className="py-12">
                      <EmptyState
                        icon={ShoppingBag}
                        title="No Orders Found"
                        description="This user has not placed any bundle orders yet."
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 text-xs text-slate-400 dark:border-slate-800">
                          <tr>
                            <th className="py-2.5 font-medium">Order ID</th>
                            <th className="py-2.5 font-medium">Network &amp; GB</th>
                            <th className="py-2.5 font-medium">Recipient Phone</th>
                            <th className="py-2.5 font-medium">Amount</th>
                            <th className="py-2.5 font-medium">Status</th>
                            <th className="py-2.5 font-medium">Date Placed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {orders.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              <td className="py-3 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                                #{o.id} {o.batch?.batchCode ? `(${o.batch.batchCode})` : ""}
                              </td>
                              <td className="py-3 font-semibold">
                                {o.network} {o.gbAmount} GB
                              </td>
                              <td className="py-3 font-mono text-xs">{o.phoneNumber}</td>
                              <td className="py-3 font-semibold text-slate-900 dark:text-white">
                                {formatGHS(o.amount)}
                              </td>
                              <td className="py-3">
                                <StatusBadge status={o.status} />
                              </td>
                              <td className="py-3 text-xs text-slate-500">
                                {formatDateTime(o.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Orders Pagination */}
                  {orderPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                      <span>
                        Page {orderPage} of {orderPages} ({orderTotal} total orders)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={orderPage <= 1}
                          onClick={() => setOrderPage((p) => p - 1)}
                          className="h-7 text-xs"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={orderPage >= orderPages}
                          onClick={() => setOrderPage((p) => p + 1)}
                          className="h-7 text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* ========================================================================= */
        /* MODE 2: DIRECTORY OVERVIEW (NO SPECIFIC USER SELECTED YET) */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Platform Wallet Overview Stats */}
          {overview && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                title="Total User Balances"
                value={formatGHS(overview.totalPlatformBalance)}
                icon={Wallet}
                hint="Total held across all wallets"
              />
              <StatCard
                title="Active Wallets"
                value={String(overview.activeWalletsCount)}
                icon={CheckCircle2}
                hint="Users with balance > GHS 0"
              />
              <StatCard
                title="Zero Balance"
                value={String(overview.zeroBalanceCount)}
                icon={Clock}
                hint="Users needing top-up"
              />
              <StatCard
                title="Negative Balances"
                value={String(overview.negativeBalanceCount)}
                icon={XCircle}
                hint={
                  overview.negativeBalanceCount > 0 ? "Requires admin reconciliation" : "All clean"
                }
              />
            </div>
          )}

          {/* Directory Filter Bar */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="w-64 space-y-1.5">
              <Label className="text-xs">Search name, email, phone</Label>
              <Input
                placeholder="Filter users..."
                value={dirQuery}
                onChange={(e) => {
                  setDirQuery(e.target.value);
                  setDirPage(1);
                }}
                className="h-9 text-xs"
              />
            </div>
            <div className="w-44 space-y-1.5">
              <Label className="text-xs">Balance Filter</Label>
              <Select
                value={dirFilterBalance}
                onChange={(e) => {
                  setDirFilterBalance(e.target.value);
                  setDirPage(1);
                }}
                className="h-9 text-xs"
              >
                <option value="">All Balances</option>
                <option value="positive">Has Balance (&gt; 0)</option>
                <option value="zero">Zero Balance (0)</option>
                <option value="negative">Negative Balance (&lt; 0)</option>
              </Select>
            </div>
            <div className="w-40 space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={dirFilterRole}
                onChange={(e) => {
                  setDirFilterRole(e.target.value);
                  setDirPage(1);
                }}
                className="h-9 text-xs"
              >
                <option value="">All Roles</option>
                <option value="USER">USER</option>
                <option value="RESELLER">RESELLER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </Select>
            </div>
            {(dirQuery || dirFilterBalance || dirFilterRole) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDirQuery("");
                  setDirFilterBalance("");
                  setDirFilterRole("");
                  setDirPage(1);
                }}
                className="h-9 text-xs text-slate-500"
              >
                Reset Filters
              </Button>
            )}
          </div>

          {/* Directory Users Table */}
          <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs overflow-hidden">
            {overviewLoading ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-7 w-7 text-brand-600" />
              </div>
            ) : directoryUsers.length === 0 ? (
              <div className="py-16">
                <EmptyState
                  icon={Wallet}
                  title="No User Wallets Found"
                  description="No user wallets match the selected filters."
                />
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800/50 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3">User</th>
                        <th className="px-4 py-3">Role &amp; Status</th>
                        <th className="px-4 py-3">Current Balance</th>
                        <th className="px-4 py-3">Orders</th>
                        <th className="px-4 py-3">Transactions</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {directoryUsers.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                                {u.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {u.name}
                                </p>
                                <p className="text-xs text-slate-500 truncate">
                                  {u.email} {u.phone ? `· ${u.phone}` : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {u.role}
                              </span>
                              <StatusBadge status={u.status} />
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400 text-base">
                            {formatGHS(u.balance)}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                            {u._count.orders} orders
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                            {u._count.walletTransactions} entries
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Button
                              size="sm"
                              onClick={() => selectUser(u.id)}
                              className="bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20 text-xs h-8 cursor-pointer"
                            >
                              <Wallet className="h-3.5 w-3.5 mr-1" /> Track Wallet
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Directory Pagination */}
                {dirPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">
                    <span>
                      Page {dirPage} of {dirPages} ({dirTotal} total users)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dirPage <= 1}
                        onClick={() => setDirPage((p) => p - 1)}
                        className="h-7 text-xs"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dirPage >= dirPages}
                        onClick={() => setDirPage((p) => p + 1)}
                        className="h-7 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Credit / Debit Dialog */}
      {dialogOpen && (
        <ManualCreditDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          user={userProfile}
          initialMode={dialogMode}
          onAdjusted={() => {
            setDialogOpen(false);
            if (activeUserId) loadSingleUser();
            else loadOverview();
          }}
        />
      )}
    </div>
  );
}
