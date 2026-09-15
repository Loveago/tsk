"use client";

import * as React from "react";
import {
  LayoutDashboard,
  FileCheck2,
  Users,
  Key,
  ClipboardList,
  Webhook,
  FileText,
  Sliders,
  Settings,
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  RotateCw,
  Shield,
  Eye,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
} from "lucide-react";
import { PageHeader, StatCard, Spinner, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { useToast } from "@/components/toast";
import { formatDateTime, formatGHS } from "@/lib/types";

type AdminTab =
  | "overview"
  | "applications"
  | "users"
  | "credentials"
  | "orders"
  | "webhooks"
  | "logs"
  | "ratelimits"
  | "settings"
  | "docs";

export default function AdminApiManagementPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<AdminTab>("overview");
  const [loading, setLoading] = React.useState(true);

  // Overview data
  const [overview, setOverview] = React.useState<any>(null);

  // Applications
  const [applications, setApplications] = React.useState<any[]>([]);
  const [selectedApp, setSelectedApp] = React.useState<any | null>(null);
  const [reviewActionModal, setReviewActionModal] = React.useState<any | null>(null);
  const [adminNotes, setAdminNotes] = React.useState("");
  const [configuredRateLimit, setConfiguredRateLimit] = React.useState(60);
  const [configuredDailyLimit, setConfiguredDailyLimit] = React.useState(5000);
  const [configuredScopes, setConfiguredScopes] = React.useState(
    "networks:read,packages:read,orders:create,orders:read,orders:status,orders:bulk_status,balance:read,webhooks:read,webhooks:manage"
  );
  const [configuredIps, setConfiguredIps] = React.useState("");
  const [configuredMaxVolume, setConfiguredMaxVolume] = React.useState(1000);
  const [webhookPerms, setWebhookPerms] = React.useState(true);
  const [prodAccess, setProdAccess] = React.useState(true);
  const [sandboxAccess, setSandboxAccess] = React.useState(true);
  const [reviewing, setReviewing] = React.useState(false);

  // Credentials
  const [credentials, setCredentials] = React.useState<any[]>([]);

  // Orders
  const [orders, setOrders] = React.useState<any[]>([]);
  const [orderSourceFilter, setOrderSourceFilter] = React.useState("ALL");
  const [orderSearch, setOrderSearch] = React.useState("");
  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);

  // Webhooks
  const [webhooksData, setWebhooksData] = React.useState<any>(null);

  // Logs
  const [logs, setLogs] = React.useState<any[]>([]);
  const [logSearch, setLogSearch] = React.useState("");

  // Settings
  const [settings, setSettings] = React.useState<any>(null);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [rateLimitInput, setRateLimitInput] = React.useState(60);
  const [dailyLimitInput, setDailyLimitInput] = React.useState(5000);
  const [maxBatchInput, setMaxBatchInput] = React.useState(1000);
  const [webhookTimeoutInput, setWebhookTimeoutInput] = React.useState(10000);
  const [webhookRetriesInput, setWebhookRetriesInput] = React.useState(5);

  const loadTab = React.useCallback(async (tab: AdminTab) => {
    setLoading(true);
    try {
      if (tab === "overview") {
        const res = await fetch("/api/admin/api/overview");
        const json = await res.json();
        setOverview(json);
      } else if (tab === "applications") {
        const res = await fetch("/api/admin/api/applications");
        const json = await res.json();
        setApplications(json.applications || []);
      } else if (tab === "users") {
        const res = await fetch("/api/admin/users");
        const json = await res.json();
        setOverview((prev: any) => ({ ...prev, allUsers: json.users }));
      } else if (tab === "credentials") {
        const res = await fetch("/api/admin/api/credentials");
        const json = await res.json();
        setCredentials(json.credentials || []);
      } else if (tab === "orders") {
        const params = new URLSearchParams();
        if (orderSourceFilter !== "ALL") params.set("source", orderSourceFilter);
        if (orderSearch.trim()) params.set("search", orderSearch.trim());
        const res = await fetch(`/api/admin/api/orders?${params.toString()}`);
        const json = await res.json();
        setOrders(json.orders || []);
      } else if (tab === "webhooks") {
        const res = await fetch("/api/admin/api/webhooks");
        const json = await res.json();
        setWebhooksData(json);
      } else if (tab === "logs") {
        const params = new URLSearchParams();
        if (logSearch.trim()) params.set("search", logSearch.trim());
        const res = await fetch(`/api/admin/api/logs?${params.toString()}`);
        const json = await res.json();
        setLogs(json.logs || []);
      } else if (tab === "settings" || tab === "ratelimits") {
        const res = await fetch("/api/admin/api/settings");
        const json = await res.json();
        setSettings(json);
        setRateLimitInput(json.defaultRateLimitPerMin ?? 60);
        setDailyLimitInput(json.defaultDailyLimit ?? 5000);
        setMaxBatchInput(json.maxBatchVolume ?? 1000);
        setWebhookTimeoutInput(json.webhookTimeoutMs ?? 10000);
        setWebhookRetriesInput(json.webhookMaxRetries ?? 5);
      }
    } catch {
      toast("Failed to load admin data", "error");
    } finally {
      setLoading(false);
    }
  }, [orderSourceFilter, orderSearch, logSearch, toast]);

  React.useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  const openReviewModal = (app: any, action: string) => {
    setReviewActionModal({ app, action });
    setConfiguredRateLimit(app.rateLimitPerMin || 60);
    setConfiguredDailyLimit(app.dailyRequestLimit || 5000);
    setConfiguredMaxVolume(app.maxOrderVolume || 1000);
    setConfiguredScopes(
      app.allowedScopes ||
        "networks:read,packages:read,orders:create,orders:read,orders:status,orders:bulk_status,balance:read,webhooks:read,webhooks:manage"
    );
    setConfiguredIps(app.ipRestrictions || "");
    setWebhookPerms(app.webhookPermissions ?? true);
    setProdAccess(app.productionAccess ?? true);
    setSandboxAccess(app.sandboxAccess ?? true);
    setAdminNotes(app.adminNotes || "");
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewActionModal) return;

    setReviewing(true);
    try {
      const res = await fetch(`/api/admin/api/applications/${reviewActionModal.app.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewActionModal.action,
          adminNotes,
          rateLimitPerMin: configuredRateLimit,
          dailyRequestLimit: configuredDailyLimit,
          maxOrderVolume: configuredMaxVolume,
          allowedScopes: configuredScopes,
          ipRestrictions: configuredIps,
          webhookPermissions: webhookPerms,
          productionAccess: prodAccess,
          sandboxAccess,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Action failed", "error");
        return;
      }

      toast(`Application marked as ${reviewActionModal.action}`, "success");
      setReviewActionModal(null);
      loadTab("applications");
    } catch {
      toast("Failed to update application", "error");
    } finally {
      setReviewing(false);
    }
  };

  const handleNetworkToggle = async (key: string, currentVal: boolean) => {
    try {
      const res = await fetch("/api/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !currentVal }),
      });
      const json = await res.json();
      if (res.ok) {
        setSettings(json);
        toast("Network availability updated", "success");
      }
    } catch {
      toast("Failed to update network setting", "error");
    }
  };

  const handleProcessDueRetries = async () => {
    try {
      const res = await fetch("/api/admin/api/webhooks", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        toast(`Processed ${json.processed || 0} retries (${json.successful || 0} delivered)`, "success");
        loadTab("webhooks");
      }
    } catch {
      toast("Failed to process due retries", "error");
    }
  };

  const handleManualWebhookRetry = async (deliveryId: string) => {
    try {
      const res = await fetch("/api/admin/api/webhooks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      const json = await res.json();
      if (json.success) {
        toast("Webhook delivered successfully", "success");
      } else {
        toast(json.error ? `Retry failed: ${json.error}` : "Delivery failed", "error");
      }
      loadTab("webhooks");
    } catch {
      toast("Failed to trigger webhook retry", "error");
    }
  };

  const handleCredentialToggle = async (id: string, currentStatus: string) => {
    const targetStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const res = await fetch(`/api/admin/api/credentials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        toast(`Credential status set to ${targetStatus}`, "success");
        loadTab("credentials");
      }
    } catch {
      toast("Failed to update credential", "error");
    }
  };

  const handleToggleMaintenance = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderProcessingHalted: !settings.orderProcessingHalted,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSettings(json);
        toast(
          json.orderProcessingHalted
            ? "API Order Creation is now PAUSED (Maintenance Mode)"
            : "API Order Creation is now ENABLED",
          "info"
        );
      }
    } catch {
      toast("Failed to update setting", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveApiSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultRateLimitPerMin: Number(rateLimitInput),
          defaultDailyLimit: Number(dailyLimitInput),
          maxBatchVolume: Number(maxBatchInput),
          webhookTimeoutMs: Number(webhookTimeoutInput),
          webhookMaxRetries: Number(webhookRetriesInput),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to save API settings", "error");
        return;
      }
      setSettings(json);
      setRateLimitInput(json.defaultRateLimitPerMin ?? 60);
      setDailyLimitInput(json.defaultDailyLimit ?? 5000);
      setMaxBatchInput(json.maxBatchVolume ?? 1000);
      setWebhookTimeoutInput(json.webhookTimeoutMs ?? 10000);
      setWebhookRetriesInput(json.webhookMaxRetries ?? 5);
      toast("API configurations saved successfully", "success");
    } catch {
      toast("Failed to save API configurations", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "applications", label: "Applications", icon: FileCheck2 },
    { key: "users", label: "API Users", icon: Users },
    { key: "credentials", label: "Credentials", icon: Key },
    { key: "orders", label: "Orders", icon: ClipboardList },
    { key: "webhooks", label: "Webhooks", icon: Webhook },
    { key: "logs", label: "Logs", icon: FileText },
    { key: "ratelimits", label: "Rate Limits", icon: Sliders },
    { key: "settings", label: "API Settings", icon: Settings },
    { key: "docs", label: "Documentation", icon: BookOpen },
  ];

  const m = overview?.metrics || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="API Platform Administration"
          description="Manage developer applications, API keys, global order processing, rate limits, and webhook health."
        />
        {settings && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800 text-xs">
            <span className="text-slate-500 font-semibold px-1">Order Processing:</span>
            <Button
              size="sm"
              variant={settings.orderProcessingHalted ? "destructive" : "default"}
              onClick={handleToggleMaintenance}
              disabled={savingSettings}
              className="h-7 px-2.5 text-xs font-bold"
            >
              {settings.orderProcessingHalted ? "PAUSED (Maintenance)" : "ENABLED"}
            </Button>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs with Smooth Chevrons & Mobile Quick Select */}
      <div className="space-y-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
        {/* Mobile quick-jump select */}
        <div className="sm:hidden relative flex items-center">
          <div className="pointer-events-none absolute left-3.5 flex items-center text-blue-600 dark:text-blue-400">
            {React.createElement(tabs.find((t) => t.key === activeTab)?.icon || LayoutDashboard, {
              className: "h-4 w-4",
            })}
          </div>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as AdminTab)}
            className="h-10 w-full appearance-none rounded-xl border-2 border-blue-600/70 bg-white pl-10 pr-10 text-xs font-bold uppercase tracking-wider text-slate-900 shadow-sm focus:outline-none dark:border-blue-500/70 dark:bg-slate-900 dark:text-white"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label} {tab.key === "applications" && m.pendingApplications > 0 ? `(${m.pendingApplications} pending)` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Scrollable pill bar with Left/Right chevrons & auto-scroll for all screen sizes */}
        <ScrollableTabs
          tabs={tabs.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            badge: t.key === "applications" && m.pendingApplications > 0 ? m.pendingApplications : undefined,
            badgeCls: "bg-amber-500 text-white",
          }))}
          activeTab={activeTab}
          onChange={(newTab) => setActiveTab(newTab as AdminTab)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-blue-600" />
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <StatCard
                  title="API Users"
                  value={m.totalApiUsers || 0}
                  hint={`${m.activeApiUsers || 0} approved`}
                />
                <StatCard
                  title="Pending Applications"
                  value={m.pendingApplications || 0}
                  hint="Awaiting review"
                />
                <StatCard
                  title="API Orders (Today)"
                  value={m.ordersToday || 0}
                  hint={`${m.ordersMonth || 0} this month`}
                />
                <StatCard
                  title="API Revenue"
                  value={formatGHS(m.apiRevenue || 0)}
                  hint="Completed orders"
                />
                <StatCard
                  title="API Requests"
                  value={(m.totalRequests || 0).toLocaleString()}
                  hint={`${m.failedRequests || 0} failed`}
                />
                <StatCard
                  title="Webhook Failures"
                  value={m.webhookFailures || 0}
                  hint="Undelivered pings"
                />
              </div>

              {/* Pending applications quick glance */}
              {overview?.recentApplications && overview.recentApplications.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900 dark:bg-amber-950/10">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-3 dark:border-amber-900">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                        Pending Developer Applications Requiring Review
                      </h3>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("applications")}
                    >
                      Review All
                    </Button>
                  </div>
                  <div className="mt-3 divide-y divide-amber-100 dark:divide-amber-900/50">
                    {overview.recentApplications.map((app: any) => (
                      <div key={app.id} className="flex items-center justify-between py-2 text-xs">
                        <div>
                          <p className="font-bold">{app.businessName}</p>
                          <p className="text-[11px] text-slate-500">
                            Applicant: {app.user?.name} ({app.user?.email}) • Volume: {app.expectedMonthlyVolume}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveTab("applications");
                            setSelectedApp(app);
                          }}
                        >
                          Inspect
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Request Stream */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <h3 className="text-sm font-bold">Recent API Traffic Stream</h3>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    View All Logs
                  </button>
                </div>
                {!overview?.recentLogs || overview.recentLogs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No requests logged yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800 font-sans">
                          <th className="pb-2 font-semibold">Method & Status</th>
                          <th className="pb-2 font-semibold">Endpoint</th>
                          <th className="pb-2 font-semibold">User</th>
                          <th className="pb-2 font-semibold">Duration</th>
                          <th className="pb-2 text-right font-semibold font-sans">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {overview.recentLogs.map((l: any) => (
                          <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  l.success
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                }`}
                              >
                                {l.method} {l.status}
                              </span>
                            </td>
                            <td className="py-2 text-slate-800 dark:text-slate-200">{l.endpoint}</td>
                            <td className="py-2 text-slate-500 font-sans">{l.userEmail || "Key user"}</td>
                            <td className="py-2 text-slate-400 font-sans">{l.responseTimeMs ? `${l.responseTimeMs}ms` : "—"}</td>
                            <td className="py-2 text-right text-slate-400 font-sans text-[11px]">
                              {formatDateTime(l.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: APPLICATIONS */}
          {activeTab === "applications" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <h3 className="text-sm font-bold">API Access Applications</h3>
                  <p className="text-xs text-slate-500">Review applicants and grant production scopes and limits.</p>
                </div>

                {applications.length === 0 ? (
                  <EmptyState title="No applications submitted yet" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                          <th className="px-4 py-3 font-semibold">Applicant</th>
                          <th className="px-4 py-3 font-semibold">Business Name</th>
                          <th className="px-4 py-3 font-semibold">Website</th>
                          <th className="px-4 py-3 font-semibold">Date Applied</th>
                          <th className="px-4 py-3 font-semibold">Volume</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {applications.map((app) => (
                          <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{app.user?.name}</p>
                              <p className="text-[11px] text-slate-400">{app.user?.email}</p>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              {app.businessName}
                            </td>
                            <td className="px-4 py-3">
                              <a
                                href={app.websiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                {app.websiteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {formatDateTime(app.createdAt)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                              {app.expectedMonthlyVolume}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={app.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedApp(app)}
                                  className="h-6 px-2 text-[11px]"
                                >
                                  <Eye className="h-3 w-3" /> View
                                </Button>
                                {app.status !== "APPROVED" && (
                                  <Button
                                    size="sm"
                                    onClick={() => openReviewModal(app, "APPROVE")}
                                    className="h-6 px-2 bg-emerald-600 text-white hover:bg-emerald-700 text-[11px]"
                                  >
                                    Approve
                                  </Button>
                                )}
                                {app.status === "PENDING" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReviewModal(app, "REJECT")}
                                    className="h-6 px-2 text-red-600 hover:text-red-700 text-[11px]"
                                  >
                                    Reject
                                  </Button>
                                )}
                                {app.status === "APPROVED" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReviewModal(app, "SUSPEND")}
                                    className="h-6 px-2 text-amber-600 hover:text-amber-700 text-[11px]"
                                  >
                                    Suspend
                                  </Button>
                                )}
                                {(app.status === "SUSPENDED" || app.status === "REJECTED") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReviewModal(app, "REINSTATE")}
                                    className="h-6 px-2 text-blue-600 hover:text-blue-700 text-[11px]"
                                  >
                                    Reinstate
                                  </Button>
                                )}
                                {app.status !== "REVOKED" && app.status !== "PENDING" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReviewModal(app, "REVOKE")}
                                    className="h-6 px-2 text-red-600 hover:text-red-700 text-[11px]"
                                  >
                                    Revoke
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openReviewModal(app, "ADD_NOTES")}
                                  className="h-6 px-1.5 text-slate-500 text-[11px]"
                                >
                                  Notes
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: API USERS */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <h3 className="text-sm font-bold">Registered Users & API Status</h3>
                </div>
                <div className="p-5">
                  <p className="text-xs text-slate-500 mb-4">
                    List of all users with active roles and developer platform applications.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                          <th className="pb-3 font-semibold">User</th>
                          <th className="pb-3 font-semibold">Role</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold">Balance</th>
                          <th className="pb-3 font-semibold">Date Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(overview?.allUsers || []).map((u: any) => (
                          <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{u.name}</p>
                              <p className="text-[11px] text-slate-400">{u.email}</p>
                            </td>
                            <td className="py-2.5 font-bold text-blue-600">{u.role}</td>
                            <td className="py-2.5"><StatusBadge status={u.status} /></td>
                            <td className="py-2.5 font-semibold">{formatGHS(u.balance)}</td>
                            <td className="py-2.5 text-slate-400">{formatDateTime(u.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CREDENTIALS */}
          {activeTab === "credentials" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <h3 className="text-sm font-bold">All API Credentials</h3>
                  <p className="text-xs text-slate-500">Every active and revoked API key in the system.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="px-4 py-3 font-semibold">Owner</th>
                        <th className="px-4 py-3 font-semibold">Key Name</th>
                        <th className="px-4 py-3 font-semibold">Key Prefix</th>
                        <th className="px-4 py-3 font-semibold">Env</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Requests</th>
                        <th className="px-4 py-3 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {credentials.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 font-sans">
                          <td className="px-4 py-3">
                            <p className="font-semibold">{c.user?.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{c.user?.email}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                            {c.name}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500">
                            {c.keyPrefix}••••••••
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                              {c.environment}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {c.requestCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCredentialToggle(c.id, c.status)}
                              className="h-7 text-xs"
                            >
                              <Power className="h-3 w-3" /> {c.status === "ACTIVE" ? "Disable" : "Enable"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ORDERS */}
          {activeTab === "orders" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search recipient, ref, or email..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="h-9 w-64 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <select
                    value={orderSourceFilter}
                    onChange={(e) => setOrderSourceFilter(e.target.value)}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">All Sources (WEB, STOREFRONT, API)</option>
                    <option value="API">API Only</option>
                    <option value="STOREFRONT">Storefront Only</option>
                    <option value="WEB">Web Dashboard Only</option>
                  </select>
                </div>

                <Button variant="outline" size="sm" onClick={() => loadTab("orders")} className="h-9">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="px-4 py-3 font-semibold">Order ID</th>
                        <th className="px-4 py-3 font-semibold">Source</th>
                        <th className="px-4 py-3 font-semibold">User & Key</th>
                        <th className="px-4 py-3 font-semibold">External Ref</th>
                        <th className="px-4 py-3 font-semibold">Network & Package</th>
                        <th className="px-4 py-3 font-semibold">Recipient</th>
                        <th className="px-4 py-3 font-semibold">Amount</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono font-bold text-blue-600">
                            {o.orderCode}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                o.source === "API"
                                  ? "bg-purple-500/10 text-purple-600"
                                  : o.source === "STOREFRONT"
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800"
                              }`}
                            >
                              {o.source}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold">{o.user?.email}</p>
                            {o.apiCredential && (
                              <p className="font-mono text-[11px] text-slate-400">{o.apiCredential.name}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500">
                            {o.externalReference || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold">{o.network}</span> • {o.package}
                          </td>
                          <td className="px-4 py-3 font-mono">{o.recipient}</td>
                          <td className="px-4 py-3 font-semibold">{formatGHS(o.amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedOrder(o)}
                              className="h-7 text-xs text-blue-600"
                            >
                              Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: WEBHOOKS */}
          {activeTab === "webhooks" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold">All Registered Webhooks</h3>
                    <p className="text-xs text-slate-500">Configured webhook destinations for automated order events</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleProcessDueRetries} className="gap-1.5 text-xs">
                    <RotateCw className="h-3.5 w-3.5" /> Process Due Retries
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Endpoint URL</th>
                        <th className="px-4 py-3 font-semibold">Events</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Total Deliveries</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(webhooksData?.webhooks || []).map((w: any) => (
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <p className="font-semibold">{w.user?.name}</p>
                            <p className="text-[11px] text-slate-400">{w.user?.email}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-blue-600">{w.url}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{w.events}</td>
                          <td className="px-4 py-3"><StatusBadge status={w.active ? "ACTIVE" : "DISABLED"} /></td>
                          <td className="px-4 py-3 font-mono">{w._count?.deliveries || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delivery logs */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <h3 className="text-sm font-bold">Recent Webhook Deliveries Across Platform</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="px-4 py-3 font-semibold">Recipient User</th>
                        <th className="px-4 py-3 font-semibold">Event</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Error</th>
                        <th className="px-4 py-3 font-semibold">Timestamp</th>
                        <th className="px-4 py-3 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {(webhooksData?.deliveries || []).map((d: any) => (
                        <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 font-sans">
                          <td className="px-4 py-3 font-semibold">{d.webhook?.user?.email}</td>
                          <td className="px-4 py-3 font-mono">{d.event}</td>
                          <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                          <td className="px-4 py-3 font-mono">{d.statusCode || "—"}</td>
                          <td className="px-4 py-3 text-red-500 text-[11px]">{d.error || "—"}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">{formatDateTime(d.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            {d.status === "FAILED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleManualWebhookRetry(d.id)}
                                className="h-6 px-2 text-[11px]"
                              >
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search request ID, IP, or user..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => loadTab("logs")} className="h-9">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh Logs
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800 font-sans">
                        <th className="px-4 py-3 font-semibold">Method & Status</th>
                        <th className="px-4 py-3 font-semibold">Endpoint</th>
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Request ID</th>
                        <th className="px-4 py-3 font-semibold">IP</th>
                        <th className="px-4 py-3 text-right font-semibold font-sans">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {logs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                l.success
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                              }`}
                            >
                              {l.method} {l.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{l.endpoint}</td>
                          <td className="px-4 py-3 font-sans text-slate-500">
                            {l.credential?.user?.email || l.apiKey?.user?.email || "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">{l.requestId || "—"}</td>
                          <td className="px-4 py-3 text-slate-400">{l.ip || "—"}</td>
                          <td className="px-4 py-3 text-right text-slate-400 text-[11px] font-sans">
                            {formatDateTime(l.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: RATE LIMITS & TAB 9: SETTINGS */}
          {(activeTab === "settings" || activeTab === "ratelimits") && (
            <div className="space-y-6 max-w-2xl">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-base font-bold">API Global Control & Maintenance</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Manage the global order processing gate for all API clients.
                </p>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between rounded-xl border p-4 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-bold">API Order Creation</p>
                      <p className="text-[11px] text-slate-500">
                        When paused, POST /v1/orders returns ORDER_PROCESSING_UNAVAILABLE (503). Status checks continue working.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={settings?.orderProcessingHalted ? "destructive" : "default"}
                      onClick={handleToggleMaintenance}
                      disabled={savingSettings}
                    >
                      {settings?.orderProcessingHalted ? "Resume Processing" : "Halt Orders"}
                    </Button>
                  </div>

                  {/* Carrier Network Availability */}
                  <div className="rounded-xl border p-4 dark:border-slate-800 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Carrier Network Availability Controls
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Enable or disable individual networks for the API. When disabled, orders for that network will be immediately rejected with 503 ORDER_PROCESSING_UNAVAILABLE and reflected on /v1/networks/status.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                        <div>
                          <p className="text-xs font-bold">MTN</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {settings?.networkMtnEnabled !== false ? "AVAILABLE" : "DISABLED"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={settings?.networkMtnEnabled !== false ? "default" : "destructive"}
                          onClick={() => handleNetworkToggle("networkMtnEnabled", settings?.networkMtnEnabled !== false)}
                          className="h-6 px-2 text-[10px]"
                        >
                          {settings?.networkMtnEnabled !== false ? "Disable" : "Enable"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                        <div>
                          <p className="text-xs font-bold">Telecel</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {settings?.networkTelecelEnabled !== false ? "AVAILABLE" : "DISABLED"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={settings?.networkTelecelEnabled !== false ? "default" : "destructive"}
                          onClick={() => handleNetworkToggle("networkTelecelEnabled", settings?.networkTelecelEnabled !== false)}
                          className="h-6 px-2 text-[10px]"
                        >
                          {settings?.networkTelecelEnabled !== false ? "Disable" : "Enable"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                        <div>
                          <p className="text-xs font-bold">AirtelTigo</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {settings?.networkAirteltigoEnabled !== false ? "AVAILABLE" : "DISABLED"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={settings?.networkAirteltigoEnabled !== false ? "default" : "destructive"}
                          onClick={() => handleNetworkToggle("networkAirteltigoEnabled", settings?.networkAirteltigoEnabled !== false)}
                          className="h-6 px-2 text-[10px]"
                        >
                          {settings?.networkAirteltigoEnabled !== false ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Editable Rate Limits & Daily Quotas */}
                  <form onSubmit={handleSaveApiSettings} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Default Rate Limits & Volume Controls
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Configure baseline quotas applied to API clients unless custom limits are approved.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="defaultRateLimit" className="text-xs">Default Rate Limit (req/min)</Label>
                        <Input
                          id="defaultRateLimit"
                          type="number"
                          min={5}
                          max={1000}
                          value={rateLimitInput}
                          onChange={(e) => setRateLimitInput(Number(e.target.value))}
                          required
                          className="text-xs"
                        />
                        <p className="text-[10px] text-slate-400">Allowed range: 5 – 1,000</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="defaultDailyLimit" className="text-xs">Default Daily Request Limit</Label>
                        <Input
                          id="defaultDailyLimit"
                          type="number"
                          min={100}
                          max={100000}
                          value={dailyLimitInput}
                          onChange={(e) => setDailyLimitInput(Number(e.target.value))}
                          required
                          className="text-xs"
                        />
                        <p className="text-[10px] text-slate-400">Allowed range: 100 – 100,000</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="maxBatchVolume" className="text-xs">Max Bulk Order Volume</Label>
                        <Input
                          id="maxBatchVolume"
                          type="number"
                          min={1}
                          max={5000}
                          value={maxBatchInput}
                          onChange={(e) => setMaxBatchInput(Number(e.target.value))}
                          required
                          className="text-xs"
                        />
                        <p className="text-[10px] text-slate-400">Max orders per API batch: 1 – 5,000</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="webhookTimeout" className="text-xs">Webhook Timeout (ms)</Label>
                        <Input
                          id="webhookTimeout"
                          type="number"
                          min={1000}
                          max={60000}
                          step={500}
                          value={webhookTimeoutInput}
                          onChange={(e) => setWebhookTimeoutInput(Number(e.target.value))}
                          required
                          className="text-xs"
                        />
                        <p className="text-[10px] text-slate-400">HTTP timeout: 1,000 – 60,000 ms</p>
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="webhookRetries" className="text-xs">Webhook Max Retries</Label>
                        <Input
                          id="webhookRetries"
                          type="number"
                          min={1}
                          max={10}
                          value={webhookRetriesInput}
                          onChange={(e) => setWebhookRetriesInput(Number(e.target.value))}
                          required
                          className="text-xs max-w-xs"
                        />
                        <p className="text-[10px] text-slate-400">Exponential backoff retry attempts: 1 – 10</p>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingSettings}
                        className="bg-brand-600 hover:bg-brand-700 text-white"
                      >
                        {savingSettings ? "Saving Configurations…" : "Save API Configurations"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: DOCS */}
          {activeTab === "docs" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h3 className="text-base font-bold">OpenAPI 3.1.0 Specification</h3>
                  <p className="text-xs text-slate-500">Public contract for automated SDK and documentation generation.</p>
                </div>
                <a href="/v1/openapi.json" target="_blank" download="openapi.json">
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Download openapi.json
                  </Button>
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {/* Application Inspect Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold">{selectedApp.businessName}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedApp(null)}>✕</Button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <div>
                  <p className="text-slate-400">Applicant</p>
                  <p className="font-bold">{selectedApp.user?.name} ({selectedApp.user?.email})</p>
                </div>
                <div>
                  <p className="text-slate-400">Website</p>
                  <a href={selectedApp.websiteUrl} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">
                    {selectedApp.websiteUrl}
                  </a>
                </div>
                <div>
                  <p className="text-slate-400">Application Type</p>
                  <p className="font-bold">{selectedApp.applicationType}</p>
                </div>
                <div>
                  <p className="text-slate-400">Expected Volume</p>
                  <p className="font-bold">{selectedApp.expectedMonthlyVolume}</p>
                </div>
                <div>
                  <p className="text-slate-400">Contact Phone</p>
                  <p className="font-bold">{selectedApp.contactPhone}</p>
                </div>
                <div>
                  <p className="text-slate-400">Current Status</p>
                  <div className="mt-0.5"><StatusBadge status={selectedApp.status} /></div>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-700 dark:text-slate-300">Usage Description:</p>
                <p className="mt-1 rounded-xl border border-slate-100 p-3 bg-white dark:border-slate-800 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                  {selectedApp.usageDescription}
                </p>
              </div>

              {selectedApp.adminNotes && (
                <div>
                  <p className="font-bold text-slate-700 dark:text-slate-300">Admin Notes:</p>
                  <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-amber-800 dark:border-amber-900 dark:text-amber-300">
                    {selectedApp.adminNotes}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setSelectedApp(null)}>Close</Button>
              {selectedApp.status !== "APPROVED" && (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    const app = selectedApp;
                    setSelectedApp(null);
                    openReviewModal(app, "APPROVE");
                  }}
                >
                  Approve
                </Button>
              )}
              {selectedApp.status === "PENDING" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    const app = selectedApp;
                    setSelectedApp(null);
                    openReviewModal(app, "REJECT");
                  }}
                >
                  Reject
                </Button>
              )}
              {selectedApp.status === "APPROVED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-amber-600 hover:text-amber-700"
                  onClick={() => {
                    const app = selectedApp;
                    setSelectedApp(null);
                    openReviewModal(app, "SUSPEND");
                  }}
                >
                  Suspend
                </Button>
              )}
              {(selectedApp.status === "SUSPENDED" || selectedApp.status === "REJECTED") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-600 hover:text-blue-700"
                  onClick={() => {
                    const app = selectedApp;
                    setSelectedApp(null);
                    openReviewModal(app, "REINSTATE");
                  }}
                >
                  Reinstate
                </Button>
              )}
              {selectedApp.status !== "REVOKED" && selectedApp.status !== "PENDING" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    const app = selectedApp;
                    setSelectedApp(null);
                    openReviewModal(app, "REVOKE");
                  }}
                >
                  Revoke
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const app = selectedApp;
                  setSelectedApp(null);
                  openReviewModal(app, "ADD_NOTES");
                }}
              >
                Add Notes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Configuration Modal */}
      {reviewActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold">
              {reviewActionModal.action === "APPROVE" ? "Approve & Configure API Access" : `${reviewActionModal.action} Application`}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {reviewActionModal.app.businessName} ({reviewActionModal.app.user?.email})
            </p>

            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-3 text-xs">
              {reviewActionModal.action === "APPROVE" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-600 dark:text-slate-300">Rate Limit (req/min)</label>
                      <input
                        type="number"
                        min={5}
                        max={1000}
                        value={configuredRateLimit}
                        onChange={(e) => setConfiguredRateLimit(parseInt(e.target.value, 10))}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 dark:text-slate-300">Daily Request Limit</label>
                      <input
                        type="number"
                        min={100}
                        value={configuredDailyLimit}
                        onChange={(e) => setConfiguredDailyLimit(parseInt(e.target.value, 10))}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-600 dark:text-slate-300">Max Order Volume</label>
                      <input
                        type="number"
                        min={10}
                        max={100000}
                        value={configuredMaxVolume}
                        onChange={(e) => setConfiguredMaxVolume(parseInt(e.target.value, 10))}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 dark:text-slate-300">Webhook Permissions</label>
                      <label className="mt-2.5 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={webhookPerms}
                          onChange={(e) => setWebhookPerms(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>Permitted</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-300">Allowed Scopes</label>
                    <input
                      type="text"
                      value={configuredScopes}
                      onChange={(e) => setConfiguredScopes(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-300">IP Restrictions (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 197.251.1.2, 102.176.4.5"
                      value={configuredIps}
                      onChange={(e) => setConfiguredIps(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prodAccess}
                        onChange={(e) => setProdAccess(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Production Access</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sandboxAccess}
                        onChange={(e) => setSandboxAccess(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Sandbox Access</span>
                    </label>
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-300">Admin Notes / Decision Reason</label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional internal or feedback note..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button type="button" size="sm" variant="outline" onClick={() => setReviewActionModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={reviewing} className="bg-blue-600 text-white">
                  {reviewing ? <Spinner className="h-4 w-4" /> : "Confirm Action"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Relationship Inspection Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold">API Order: {selectedOrder.orderCode}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>✕</Button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 font-mono">
                <div>
                  <p className="text-slate-400">Source</p>
                  <p className="font-bold text-blue-600">{selectedOrder.source}</p>
                </div>
                <div>
                  <p className="text-slate-400">External Ref</p>
                  <p className="font-bold">{selectedOrder.externalReference || "None"}</p>
                </div>
                <div>
                  <p className="text-slate-400">User Account</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.user?.email}</p>
                </div>
                <div>
                  <p className="text-slate-400">Credential</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedOrder.apiCredential ? `${selectedOrder.apiCredential.name} (${selectedOrder.apiCredential.keyPrefix}…)` : "Web / Direct"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Recipient</p>
                  <p className="font-bold">{selectedOrder.recipient}</p>
                </div>
                <div>
                  <p className="text-slate-400">Bundle</p>
                  <p className="font-bold">{selectedOrder.network} {selectedOrder.package}</p>
                </div>
              </div>

              {selectedOrder.history && selectedOrder.history.length > 0 && (
                <div className="pt-2">
                  <p className="font-bold text-slate-700 dark:text-slate-300">Status History Timeline:</p>
                  <div className="mt-1 space-y-1.5 border-l-2 border-blue-500 pl-3">
                    {selectedOrder.history.map((h: any, i: number) => (
                      <div key={i} className="text-[11px]">
                        <span className="font-bold text-blue-600">{h.status}</span> — {h.note || "No note"}
                        <span className="text-slate-400 ml-2">({formatDateTime(h.createdAt)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={() => setSelectedOrder(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
