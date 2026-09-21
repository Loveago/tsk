"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader, Spinner, StatCard, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
  Ban,
  FileSpreadsheet,
  Download,
  UploadCloud,
  Plus,
  Trash2,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
  Info,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDateTime } from "@/lib/types";
import { ImportAcceptedModal } from "@/components/admin/mtn-verification/import-accepted-modal";
import { CreateBatchModal } from "@/components/admin/mtn-verification/create-batch-modal";
import { VerifyBatchModal } from "@/components/admin/mtn-verification/verify-batch-modal";
import { AddNumberModal } from "@/components/admin/mtn-verification/add-number-modal";
import { NumberDetailsModal } from "@/components/admin/mtn-verification/number-details-modal";
import { isMtnPhoneNumber, detectNetworkNameByPrefix } from "@/lib/phone-utils";

export default function AdminMtnVerificationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const activeTab = searchParams.get("tab") || "requests";

  // Global Stats
  const [stats, setStats] = React.useState<{
    accepted: number;
    pending: number;
    processing: number;
    verified: number;
    rejected: number;
    blocked: number;
    verificationEnabled: boolean;
  }>({
    accepted: 0,
    pending: 0,
    processing: 0,
    verified: 0,
    rejected: 0,
    blocked: 0,
    verificationEnabled: false,
  });

  const [loadingStats, setLoadingStats] = React.useState(true);

  // Tab 1: Requests state
  const [requests, setRequests] = React.useState<any[]>([]);
  const [reqTotal, setReqTotal] = React.useState(0);
  const [reqPage, setReqPage] = React.useState(1);
  const [reqSearch, setReqSearch] = React.useState("");
  const [reqStatus, setReqStatus] = React.useState("SUBMITTED");
  const [selectedReqIds, setSelectedReqIds] = React.useState<Set<string>>(new Set());
  const [loadingRequests, setLoadingRequests] = React.useState(false);

  // Tab 2: Accepted Numbers state
  const [accepted, setAccepted] = React.useState<any[]>([]);
  const [accTotal, setAccTotal] = React.useState(0);
  const [accPage, setAccPage] = React.useState(1);
  const [accSearch, setAccSearch] = React.useState("");
  const [accSource, setAccSource] = React.useState("ALL");
  const [selectedAccIds, setSelectedAccIds] = React.useState<Set<string>>(new Set());
  const [loadingAccepted, setLoadingAccepted] = React.useState(false);

  // Tab 3: Batches state
  const [batches, setBatches] = React.useState<any[]>([]);
  const [batchTotal, setBatchTotal] = React.useState(0);
  const [batchPage, setBatchPage] = React.useState(1);
  const [batchStatus, setBatchStatus] = React.useState("ALL");
  const [batchSearch, setBatchSearch] = React.useState("");
  const [loadingBatches, setLoadingBatches] = React.useState(false);

  // Tab 4: Blocked / Unverified state
  const [blocked, setBlocked] = React.useState<any[]>([]);
  const [blockTotal, setBlockTotal] = React.useState(0);
  const [blockPage, setBlockPage] = React.useState(1);
  const [blockSearch, setBlockSearch] = React.useState("");
  const [blockStatus, setBlockStatus] = React.useState("ALL");
  const [loadingBlocked, setLoadingBlocked] = React.useState(false);
  const [selectedBlockedIds, setSelectedBlockedIds] = React.useState<Set<string>>(new Set());

  // Modals state
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [createBatchModalOpen, setCreateBatchModalOpen] = React.useState(false);
  const [verifyBatchModalOpen, setVerifyBatchModalOpen] = React.useState(false);
  const [activeBatchToVerify, setActiveBatchToVerify] = React.useState<any | null>(null);
  const [addNumberModalOpen, setAddNumberModalOpen] = React.useState(false);
  const [numberDetailsModalOpen, setNumberDetailsModalOpen] = React.useState(false);
  const [selectedNumberForDetails, setSelectedNumberForDetails] = React.useState<string | null>(null);

  const fetchStats = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mtn-verification/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Fetch Requests
  const fetchRequests = React.useCallback(async () => {
    setLoadingRequests(true);
    try {
      const params = new URLSearchParams({
        page: String(reqPage),
        pageSize: "20",
      });
      if (reqStatus !== "ALL") params.set("status", reqStatus);
      if (reqSearch.trim()) params.set("q", reqSearch.trim());

      const res = await fetch(`/api/admin/mtn-verification/requests?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setRequests(d.data ?? []);
        setReqTotal(d.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRequests(false);
    }
  }, [reqPage, reqStatus, reqSearch]);

  // Fetch Accepted
  const fetchAccepted = React.useCallback(async () => {
    setLoadingAccepted(true);
    try {
      const params = new URLSearchParams({
        page: String(accPage),
        pageSize: "20",
      });
      if (accSource !== "ALL") params.set("source", accSource);
      if (accSearch.trim()) params.set("q", accSearch.trim());

      const res = await fetch(`/api/admin/mtn-verification/accepted?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setAccepted(d.data ?? []);
        setAccTotal(d.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccepted(false);
    }
  }, [accPage, accSource, accSearch]);

  // Fetch Batches
  const fetchBatches = React.useCallback(async () => {
    setLoadingBatches(true);
    try {
      const params = new URLSearchParams({
        page: String(batchPage),
        pageSize: "20",
      });
      if (batchStatus !== "ALL") params.set("status", batchStatus);
      if (batchSearch.trim()) params.set("q", batchSearch.trim());

      const res = await fetch(`/api/admin/mtn-verification/batches?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setBatches(d.data ?? []);
        setBatchTotal(d.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBatches(false);
    }
  }, [batchPage, batchStatus, batchSearch]);

  // Fetch Blocked
  const fetchBlocked = React.useCallback(async () => {
    setLoadingBlocked(true);
    try {
      const params = new URLSearchParams({
        page: String(blockPage),
        pageSize: "20",
      });
      if (blockStatus !== "ALL") params.set("status", blockStatus);
      if (blockSearch.trim()) params.set("q", blockSearch.trim());

      const res = await fetch(`/api/admin/mtn-verification/blocked?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setBlocked(d.data ?? []);
        setBlockTotal(d.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBlocked(false);
    }
  }, [blockPage, blockStatus, blockSearch]);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  React.useEffect(() => {
    if (activeTab === "requests") fetchRequests();
    else if (activeTab === "accepted") fetchAccepted();
    else if (activeTab === "batches") fetchBatches();
    else if (activeTab === "blocked") fetchBlocked();
  }, [activeTab, fetchRequests, fetchAccepted, fetchBatches, fetchBlocked]);

  const setTab = (tab: string) => {
    router.push(`/admin/mtn-verification?tab=${tab}`);
  };

  // Selection helpers
  const toggleReqSelect = (id: string) => {
    setSelectedReqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllReqs = () => {
    if (selectedReqIds.size === requests.length) {
      setSelectedReqIds(new Set());
    } else {
      setSelectedReqIds(new Set(requests.map((r) => r.id)));
    }
  };

  const toggleAccSelect = (id: string) => {
    setSelectedAccIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAccs = () => {
    if (selectedAccIds.size === accepted.length) {
      setSelectedAccIds(new Set());
    } else {
      setSelectedAccIds(new Set(accepted.map((a) => a.id)));
    }
  };

  // Actions
  const handleSingleReqAction = async (id: string, action: "VERIFY" | "REJECT") => {
    try {
      const res = await fetch("/api/admin/mtn-verification/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Action failed");
      toast(`Request marked as ${action}!`, "success");
      fetchRequests();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const handleBulkReqAction = async (action: "VERIFY" | "REJECT") => {
    if (!selectedReqIds.size) return;
    const count = selectedReqIds.size;
    const label = action === "VERIFY" ? "verify" : "reject";
    if (!confirm(`Are you sure you want to ${label} ${count} selected request${count > 1 ? "s" : ""}?`)) return;
    try {
      const res = await fetch("/api/admin/mtn-verification/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedReqIds), action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Bulk action failed");
      toast(`${d.count} request${d.count > 1 ? "s" : ""} marked as ${action}!`, "success");
      setSelectedReqIds(new Set());
      fetchRequests();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const handleDeleteAccepted = async (id: string) => {
    if (!confirm("Are you sure you want to remove this number from the accepted whitelist?")) return;
    try {
      const res = await fetch(`/api/admin/mtn-verification/accepted?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast("Number removed from whitelist", "success");
      fetchAccepted();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error deleting", "error");
    }
  };

  const handleBulkDeleteAccepted = async () => {
    if (!selectedAccIds.size) return;
    if (!confirm(`Are you sure you want to delete ${selectedAccIds.size} accepted numbers?`)) return;
    try {
      const res = await fetch("/api/admin/mtn-verification/accepted", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedAccIds) }),
      });
      if (!res.ok) throw new Error("Bulk delete failed");
      toast(`Deleted ${selectedAccIds.size} numbers`, "success");
      setSelectedAccIds(new Set());
      fetchAccepted();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const handleBlockedAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/admin/mtn-verification/blocked/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Action failed");
      toast("Action executed successfully", "success");
      fetchBlocked();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const toggleBlockedSelect = (id: string) => {
    setSelectedBlockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllBlocked = () => {
    if (selectedBlockedIds.size === blocked.length) {
      setSelectedBlockedIds(new Set());
    } else {
      setSelectedBlockedIds(new Set(blocked.map((b) => b.id)));
    }
  };

  const [exportingRequests, setExportingRequests] = React.useState(false);

  const handleExportRequestsTxt = async () => {
    setExportingRequests(true);
    try {
      const params = new URLSearchParams({ export: "true" });
      if (reqStatus !== "ALL") params.set("status", reqStatus);
      if (reqSearch.trim()) params.set("q", reqSearch.trim());

      const res = await fetch(`/api/admin/mtn-verification/requests?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");

      // Use filename from server (contains batch reference when one was created)
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `verification-requests-${Date.now()}.txt`;

      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Extract batch ref from filename for the toast message
      const batchRefMatch = filename.match(/verification-requests-([A-Z0-9-]+?)-\d+\.txt/);
      const batchRef = batchRefMatch?.[1];
      toast(
        batchRef
          ? `Exported & moved to batch ${batchRef} in Verification Batches`
          : "Numbers exported successfully",
        "success"
      );

      // Refresh list and stats so requests show updated PROCESSING status
      fetchRequests();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Export failed", "error");
    } finally {
      setExportingRequests(false);
    }
  };

  const openNumberDetails = (num: string) => {
    setSelectedNumberForDetails(num);
    setNumberDetailsModalOpen(true);
  };

  const handleCreateBatchFromBlocked = async () => {
    if (!selectedBlockedIds.size) return;
    try {
      const res = await fetch("/api/admin/mtn-verification/blocked/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedIds: Array.from(selectedBlockedIds) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to create batch");
      toast(`Verification batch created with ${d.batch.totalNumbers} numbers!`, "success");
      setSelectedBlockedIds(new Set());
      fetchBlocked();
      fetchStats();
      router.push("/admin/mtn-verification?tab=batches");
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const handleMarkBatchSubmitted = async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/mtn-verification/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PROCESSING" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to mark batch as submitted");
      }
      toast("Batch marked as submitted (PROCESSING)", "success");
      fetchBatches();
      fetchStats();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    }
  };

  const openVerifyBatch = async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/mtn-verification/batches/${batchId}`);
      if (!res.ok) throw new Error("Failed to fetch batch details");
      const d = await res.json();
      setActiveBatchToVerify(d.batch);
      setVerifyBatchModalOpen(true);
    } catch (err: any) {
      toast(err.message ?? "Error loading batch", "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="MTN Number Verification"
        description="Manage whitelist, user verification requests, verification batches, and unverified review records"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/settings">
              <Button variant="outline" size="sm">
                Verification Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStats();
                if (activeTab === "requests") fetchRequests();
                if (activeTab === "accepted") fetchAccepted();
                if (activeTab === "batches") fetchBatches();
                if (activeTab === "blocked") fetchBlocked();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Enforcement Status Banner */}
      <div
        className={`flex items-center justify-between rounded-2xl border p-4 text-sm ${
          stats.verificationEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              MTN Number Verification Enforcement:{" "}
              <span className="uppercase">{stats.verificationEnabled ? "ENABLED (ON)" : "DISABLED (OFF)"}</span>
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              {stats.verificationEnabled
                ? "Only whitelisted / verified MTN numbers can place MTN orders. Unverified numbers are blocked."
                : "Any valid MTN number can purchase. Orders are allowed and recorded in Blocked/Unverified Numbers for review."}
            </p>
          </div>
        </div>
        <Link href="/admin/settings">
          <Button variant="outline" size="sm" className="shrink-0 text-xs h-8">
            Configure in Settings →
          </Button>
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Accepted Numbers"
          value={stats.accepted.toLocaleString()}
          icon={CheckCircle2}
          hint="Verified whitelist"
          className="cursor-pointer hover:border-brand-500"
        />
        <StatCard
          title="Pending Requests"
          value={stats.pending.toLocaleString()}
          icon={Clock}
          hint="Awaiting batching"
          className="cursor-pointer hover:border-brand-500"
        />
        <StatCard
          title="Processing"
          value={stats.processing.toLocaleString()}
          icon={RefreshCw}
          hint="In verification batches"
          className="cursor-pointer hover:border-brand-500"
        />
        <StatCard
          title="Verified Requests"
          value={stats.verified.toLocaleString()}
          icon={ShieldCheck}
          hint="Successfully verified"
          className="cursor-pointer hover:border-brand-500"
        />
        <StatCard
          title="Rejected Requests"
          value={stats.rejected.toLocaleString()}
          icon={XCircle}
          hint="Failed verification"
          className="cursor-pointer hover:border-brand-500"
        />
        <StatCard
          title="Blocked / Unverified"
          value={stats.blocked.toLocaleString()}
          icon={Ban}
          hint="Ordered when OFF"
          className="cursor-pointer hover:border-brand-500"
        />
      </div>

      {/* Main Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab("requests")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "requests"
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Clock className="h-4 w-4" />
            Verification Requests
            {stats.pending > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {stats.pending}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab("accepted")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "accepted"
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Accepted Numbers
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {stats.accepted}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("batches")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "batches"
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Layers className="h-4 w-4" />
            Verification Batches
          </button>

          <button
            type="button"
            onClick={() => setTab("blocked")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "blocked"
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Ban className="h-4 w-4" />
            Blocked / Unverified
            {stats.blocked > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {stats.blocked}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: REQUESTS */}
        {activeTab === "requests" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search number, user..."
                    value={reqSearch}
                    onChange={(e) => setReqSearch(e.target.value)}
                    className="h-8.5 w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <select
                  value={reqStatus}
                  onChange={(e) => setReqStatus(e.target.value)}
                  className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUBMITTED">Submitted (Pending)</option>
                  <option value="PROCESSING">Processing (In Batch)</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportRequestsTxt}
                  disabled={exportingRequests || requests.length === 0}
                  className="h-8.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {exportingRequests ? "Exporting..." : "Export TXT"}
                </Button>
                {selectedReqIds.size > 0 && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleBulkReqAction("VERIFY")}
                      className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Verify ({selectedReqIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkReqAction("REJECT")}
                      className="h-8.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Reject ({selectedReqIds.size})
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setCreateBatchModalOpen(true)}
                      className="h-8.5 text-xs"
                    >
                      <Layers className="h-3.5 w-3.5 mr-1" />
                      Create Batch ({selectedReqIds.size})
                    </Button>
                  </>
                )}
              </div>
            </div>

            {loadingRequests ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                title="No verification requests"
                description="User submitted verification requests will appear here."
                icon={Clock}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="w-10 px-3 py-3">
                        <button type="button" onClick={toggleAllReqs}>
                          {selectedReqIds.size === requests.length ? (
                            <CheckSquare className="h-4 w-4 text-brand-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-3 font-semibold">MTN Number</th>
                      <th className="px-3 py-3 font-semibold">Submitted By</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Date Submitted</th>
                      <th className="px-3 py-3 font-semibold">Batch</th>
                      <th className="px-3 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {requests.map((r) => {
                      const isSelected = selectedReqIds.has(r.id);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => toggleReqSelect(r.id)}>
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-brand-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-left font-mono font-semibold text-brand-600 hover:underline dark:text-brand-400"
                                onClick={() => openNumberDetails(r.number)}
                              >
                                {r.number}
                              </button>
                              {!isMtnPhoneNumber(r.number) && (
                                <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-950/60 dark:text-indigo-300">
                                  Ported: {detectNetworkNameByPrefix(r.number)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {r.user?.name ?? "User"}
                            </div>
                            <div className="text-[11px] text-slate-400">{r.user?.email}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                r.status === "VERIFIED"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : r.status === "PROCESSING"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                                  : r.status === "REJECTED"
                                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatDateTime(r.submittedAt || r.createdAt)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                            {r.batch?.batchReference ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                                {r.batch.batchReference}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300"
                                onClick={() => openNumberDetails(r.number)}
                              >
                                View
                              </Button>
                              {r.status !== "VERIFIED" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                                    onClick={() => handleSingleReqAction(r.id, "VERIFY")}
                                  >
                                    Verify
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-600 hover:text-red-700"
                                    onClick={() => handleSingleReqAction(r.id, "REJECT")}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Requests Pagination */}
            {reqTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>
                  Showing {(reqPage - 1) * 20 + 1} to {Math.min(reqPage * 20, reqTotal)} of {reqTotal} requests
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reqPage <= 1}
                    onClick={() => setReqPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reqPage * 20 >= reqTotal}
                    onClick={() => setReqPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACCEPTED MTN NUMBERS */}
        {activeTab === "accepted" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search accepted number..."
                    value={accSearch}
                    onChange={(e) => setAccSearch(e.target.value)}
                    className="h-8.5 w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <select
                  value={accSource}
                  onChange={(e) => setAccSource(e.target.value)}
                  className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="ALL">All Sources</option>
                  <option value="MANUAL">Manual</option>
                  <option value="IMPORT_TXT">Import (TXT)</option>
                  <option value="IMPORT_CSV">Import (CSV)</option>
                  <option value="BATCH_VERIFICATION">Batch Verification</option>
                  <option value="BLOCKED_NUMBER_PROMOTION">Blocked Promotion</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedAccIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleBulkDeleteAccepted}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete ({selectedAccIds.size})
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 text-xs"
                  onClick={() => window.open("/api/admin/mtn-verification/accepted/export?format=csv", "_blank")}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export CSV
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 text-xs"
                  onClick={() => window.open("/api/admin/mtn-verification/accepted/export?format=txt", "_blank")}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export TXT
                </Button>

                <Button
                  size="sm"
                  className="h-8.5 text-xs"
                  onClick={() => setImportModalOpen(true)}
                >
                  <UploadCloud className="h-3.5 w-3.5 mr-1" />
                  Import TXT / CSV
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8.5 text-xs"
                  onClick={() => setAddNumberModalOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Single
                </Button>
              </div>
            </div>

            {loadingAccepted ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : accepted.length === 0 ? (
              <EmptyState
                title="No accepted numbers"
                description="Upload TXT/CSV files or verify batches to populate the MTN whitelist."
                icon={CheckCircle2}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="w-10 px-3 py-3">
                        <button type="button" onClick={toggleAllAccs}>
                          {selectedAccIds.size === accepted.length ? (
                            <CheckSquare className="h-4 w-4 text-brand-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-3 font-semibold">MTN Number</th>
                      <th className="px-3 py-3 font-semibold">Source</th>
                      <th className="px-3 py-3 font-semibold">Batch Reference</th>
                      <th className="px-3 py-3 font-semibold">Verified Date</th>
                      <th className="px-3 py-3 font-semibold">Verified By</th>
                      <th className="px-3 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {accepted.map((a) => {
                      const isSelected = selectedAccIds.has(a.id);
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => toggleAccSelect(a.id)}>
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-brand-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-left font-mono font-semibold text-brand-600 hover:underline dark:text-brand-400"
                                onClick={() => openNumberDetails(a.number)}
                              >
                                {a.number}
                              </button>
                              {(!isMtnPhoneNumber(a.number) || a.isPorted) && (
                                <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-950/60 dark:text-indigo-300">
                                  Ported: {a.originalNetwork || detectNetworkNameByPrefix(a.number)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {a.source}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                            {a.batch?.batchReference || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatDateTime(a.verifiedAt || a.createdAt)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {a.verifiedBy || "System"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300"
                                onClick={() => openNumberDetails(a.number)}
                              >
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteAccepted(a.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {accTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>
                  Showing {(accPage - 1) * 20 + 1} to {Math.min(accPage * 20, accTotal)} of {accTotal} numbers
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={accPage <= 1}
                    onClick={() => setAccPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={accPage * 20 >= accTotal}
                    onClick={() => setAccPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BATCHES */}
        {activeTab === "batches" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search batch reference..."
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    className="h-8.5 w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <select
                  value={batchStatus}
                  onChange={(e) => setBatchStatus(e.target.value)}
                  className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="ALL">All Batch Statuses</option>
                  <option value="READY">Ready</option>
                  <option value="EXPORTED">Exported</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PARTIALLY_VERIFIED">Partially Verified</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div className="text-xs text-slate-500">
                Total Batches: {batchTotal}
              </div>
            </div>

            {loadingBatches ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : batches.length === 0 ? (
              <EmptyState
                title="No verification batches"
                description="Select pending requests in the Verification Requests tab to create a batch."
                icon={Layers}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Batch Reference</th>
                      <th className="px-3 py-3 font-semibold">Total Numbers</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Results</th>
                      <th className="px-3 py-3 font-semibold">Created Date</th>
                      <th className="px-3 py-3 font-semibold">Exported Date</th>
                      <th className="px-3 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">
                          {b.batchReference}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {b.totalNumbers} numbers
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              b.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : b.status === "PARTIALLY_VERIFIED"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                                : b.status === "REJECTED"
                                ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                : b.status === "EXPORTED"
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                          {b.status === "COMPLETED" || b.status === "PARTIALLY_VERIFIED" || b.status === "REJECTED" ? (
                            <span>
                              <strong className="text-emerald-600">{b.verifiedCount}</strong> verified,{" "}
                              <strong className="text-red-600">{b.rejectedCount}</strong> rejected
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {formatDateTime(b.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {b.exportedAt ? formatDateTime(b.exportedAt) : "Not yet"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                window.open(
                                  `/api/admin/mtn-verification/batches/${b.id}/export?format=txt`,
                                  "_blank"
                                )
                              }
                            >
                              TXT
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                window.open(
                                  `/api/admin/mtn-verification/batches/${b.id}/export?format=csv`,
                                  "_blank"
                                )
                              }
                            >
                              CSV
                            </Button>

                            {(b.status === "READY" || b.status === "EXPORTED") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => handleMarkBatchSubmitted(b.id)}
                              >
                                Mark as Submitted
                              </Button>
                            )}

                            {b.status !== "COMPLETED" && b.status !== "REJECTED" && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => openVerifyBatch(b.id)}
                              >
                                Mark Verified
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {batchTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>
                  Showing {(batchPage - 1) * 20 + 1} to {Math.min(batchPage * 20, batchTotal)} of {batchTotal} batches
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batchPage <= 1}
                    onClick={() => setBatchPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batchPage * 20 >= batchTotal}
                    onClick={() => setBatchPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: BLOCKED / UNVERIFIED */}
        {activeTab === "blocked" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 flex items-start gap-3">
              <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  About Blocked / Unverified MTN Numbers (§13, §14)
                </p>
                <p className="mt-0.5">
                  These numbers placed orders while MTN verification was OFF, but were not yet verified. Orders were allowed and not blocked. You can review them here and promote verified ones directly into the accepted whitelist.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search number..."
                    value={blockSearch}
                    onChange={(e) => setBlockSearch(e.target.value)}
                    className="h-8.5 w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <select
                  value={blockStatus}
                  onChange={(e) => setBlockStatus(e.target.value)}
                  className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UNVERIFIED">Unverified</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="ACCEPTED">Accepted (Whitelisted)</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {selectedBlockedIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleCreateBatchFromBlocked}
                    className="h-8.5 text-xs bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    <Layers className="h-3.5 w-3.5 mr-1" />
                    Create Verification Batch ({selectedBlockedIds.size})
                  </Button>
                )}
                <div className="text-xs text-slate-500">
                  Total Review Numbers: {blockTotal}
                </div>
              </div>
            </div>

            {loadingBlocked ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : blocked.length === 0 ? (
              <EmptyState
                title="No unverified numbers recorded"
                description="Numbers ordered while verification enforcement is OFF will automatically appear here for review."
                icon={Ban}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="w-10 px-3 py-3">
                        <button type="button" onClick={toggleAllBlocked}>
                          {selectedBlockedIds.size === blocked.length && blocked.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-brand-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-3 font-semibold">Number</th>
                      <th className="px-3 py-3 font-semibold">User</th>
                      <th className="px-3 py-3 font-semibold text-right">Orders</th>
                      <th className="px-3 py-3 font-semibold">First Seen</th>
                      <th className="px-3 py-3 font-semibold">Last Seen</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {blocked.map((b) => {
                      const isSelected = selectedBlockedIds.has(b.id);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => toggleBlockedSelect(b.id)}>
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-brand-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold">
                            <button
                              type="button"
                              className="text-left font-mono font-semibold text-brand-600 hover:underline dark:text-brand-400"
                              onClick={() => openNumberDetails(b.number)}
                            >
                              {b.number}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {b.user?.name ?? "Guest / User"}
                            </div>
                            <div className="text-[11px] text-slate-400">{b.user?.email}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">
                            {b.orderCount}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatDateTime(b.firstSeenAt)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatDateTime(b.lastSeenAt)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                b.status === "ACCEPTED"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : b.status === "REJECTED"
                                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                  : b.status === "SUBMITTED" || b.status === "PROCESSING"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300"
                                onClick={() => openNumberDetails(b.number)}
                              >
                                View
                              </Button>
                              {b.status !== "ACCEPTED" && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                    onClick={() => handleBlockedAction(b.id, "ADD_ACCEPTED")}
                                  >
                                    Whitelist
                                  </Button>
                                  {b.status !== "SUBMITTED" && b.status !== "PROCESSING" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-blue-600"
                                      onClick={() => handleBlockedAction(b.id, "SUBMIT_VERIFICATION")}
                                    >
                                      Verify
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-600"
                                    onClick={() => handleBlockedAction(b.id, "REJECT")}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              <Link href={`/admin/orders?q=${b.number}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500">
                                  History
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {blockTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>
                  Showing {(blockPage - 1) * 20 + 1} to {Math.min(blockPage * 20, blockTotal)} of {blockTotal} records
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={blockPage <= 1}
                    onClick={() => setBlockPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={blockPage * 20 >= blockTotal}
                    onClick={() => setBlockPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ImportAcceptedModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          fetchAccepted();
          fetchStats();
        }}
      />

      <CreateBatchModal
        open={createBatchModalOpen}
        onClose={() => setCreateBatchModalOpen(false)}
        selectedRequestIds={Array.from(selectedReqIds)}
        onSuccess={() => {
          setSelectedReqIds(new Set());
          fetchRequests();
          fetchBatches();
          fetchStats();
          setTab("batches");
        }}
      />

      <VerifyBatchModal
        open={verifyBatchModalOpen}
        onClose={() => {
          setVerifyBatchModalOpen(false);
          setActiveBatchToVerify(null);
        }}
        batch={activeBatchToVerify}
        onSuccess={() => {
          fetchBatches();
          fetchAccepted();
          fetchStats();
        }}
      />

      <AddNumberModal
        open={addNumberModalOpen}
        onClose={() => setAddNumberModalOpen(false)}
        onSuccess={() => {
          fetchAccepted();
          fetchStats();
        }}
      />

      <NumberDetailsModal
        open={numberDetailsModalOpen}
        onClose={() => {
          setNumberDetailsModalOpen(false);
          setSelectedNumberForDetails(null);
        }}
        phoneNumber={selectedNumberForDetails}
        onActionComplete={() => {
          fetchStats();
          if (activeTab === "requests") fetchRequests();
          else if (activeTab === "accepted") fetchAccepted();
          else if (activeTab === "blocked") fetchBlocked();
        }}
      />
    </div>
  );
}
