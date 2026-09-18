"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Key,
  BookOpen,
  Play,
  ClipboardList,
  Webhook,
  FileText,
  BarChart2,
  Settings,
  ShieldCheck,
  Activity,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { PageHeader, StatCard, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { formatDateTime } from "@/lib/types";

// Sub-components
import { DeveloperApplicationCard } from "@/components/api/developer-application-card";
import { DeveloperCredentials } from "@/components/api/developer-credentials";
import { DeveloperDocs } from "@/components/api/developer-docs";
import { DeveloperPlayground } from "@/components/api/developer-playground";
import { DeveloperOrdersPanel } from "@/components/api/developer-orders-panel";
import { DeveloperWebhooksPanel } from "@/components/api/developer-webhooks-panel";
import { DeveloperLogsPanel } from "@/components/api/developer-logs-panel";
import { DeveloperStatusPanel } from "@/components/api/developer-status-panel";
import { DeveloperSettingsPanel } from "@/components/api/developer-settings-panel";

type TabKey =
  | "overview"
  | "access"
  | "credentials"
  | "docs"
  | "playground"
  | "orders"
  | "webhooks"
  | "logs"
  | "usage"
  | "settings"
  | "status";

export default function DeveloperDashboardPage() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("overview");
  const [playgroundEndpoint, setPlaygroundEndpoint] = React.useState<string>("post-verify-numbers");
  const [usageData, setUsageData] = React.useState<any>(null);
  const [appData, setAppData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  // Sync tab from URL hash/query if present
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab") as TabKey;
      const endpointParam = url.searchParams.get("endpoint");
      if (tabParam) setActiveTab(tabParam);
      if (endpointParam) setPlaygroundEndpoint(endpointParam);
    }
  }, []);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [usageRes, appRes] = await Promise.all([
        fetch("/api/developer/usage"),
        fetch("/api/developer/application"),
      ]);
      const usageJson = await usageRes.json();
      const appJson = await appRes.json();
      setUsageData(usageJson);
      setAppData(appJson.application);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "access", label: "API Access", icon: ShieldCheck },
    { key: "credentials", label: "Credentials", icon: Key },
    { key: "docs", label: "Documentation", icon: BookOpen },
    { key: "playground", label: "Playground", icon: Play },
    { key: "orders", label: "Orders", icon: ClipboardList },
    { key: "webhooks", label: "Webhooks", icon: Webhook },
    { key: "logs", label: "Logs", icon: FileText },
    { key: "usage", label: "Usage", icon: BarChart2 },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "status", label: "Status", icon: Activity },
  ];

  const metrics = usageData?.metrics || {};
  const isApproved = appData?.status === "APPROVED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer API Platform"
        description="Integrate Tskconnect mobile data fulfillment into your websites and applications."
      />

      {/* Navigation Sub-Tabs with Smooth Chevrons & Mobile Quick Select */}
      <div className="space-y-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
        {/* Mobile quick-jump select */}
        <div className="sm:hidden relative flex items-center">
          <div className="pointer-events-none absolute left-3.5 flex items-center text-blue-600 dark:text-blue-400">
            {React.createElement(navItems.find((n) => n.key === activeTab)?.icon || LayoutDashboard, {
              className: "h-4 w-4",
            })}
          </div>
          <select
            value={activeTab}
            onChange={(e) => {
              const newTab = e.target.value as TabKey;
              setActiveTab(newTab);
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("tab", newTab);
                window.history.replaceState({}, "", url.toString());
              }
            }}
            className="h-10 w-full appearance-none rounded-xl border-2 border-blue-600/70 bg-white pl-10 pr-10 text-xs font-bold uppercase tracking-wider text-slate-900 shadow-sm focus:outline-none dark:border-blue-500/70 dark:bg-slate-900 dark:text-white [&>option]:bg-white dark:[&>option]:bg-slate-900"
          >
            {navItems.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} Section
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Scrollable pill bar with Left/Right chevrons & auto-scroll for all screen sizes */}
        <ScrollableTabs
          tabs={navItems}
          activeTab={activeTab}
          onChange={(newTab) => {
            setActiveTab(newTab);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", newTab);
              window.history.replaceState({}, "", url.toString());
            }
          }}
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
              {/* Application Status Banner */}
              <DeveloperApplicationCard application={appData} onApplied={loadData} />

              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard
                  title="Requests Today"
                  value={metrics.requestsToday?.toLocaleString() || "0"}
                  hint={`${metrics.requestsMonth?.toLocaleString() || 0} this month`}
                />
                <StatCard
                  title="Orders Today"
                  value={metrics.ordersToday?.toLocaleString() || "0"}
                  hint={`${metrics.ordersTotal?.toLocaleString() || 0} lifetime`}
                />
                <StatCard
                  title="Successful"
                  value={metrics.successfulRequests?.toLocaleString() || "0"}
                  hint="Live requests"
                />
                <StatCard
                  title="Failed Requests"
                  value={metrics.failedRequests?.toLocaleString() || "0"}
                  hint="Client/Server errors"
                />
                <StatCard
                  title="Rate Limit"
                  value={`${usageData?.rateLimit || 60}/min`}
                  hint="Per API key"
                />
                <StatCard
                  title="Webhook Success"
                  value={`${metrics.webhookSuccessRate || 100}%`}
                  hint={`${metrics.webhookFailures || 0} failures`}
                />
              </div>

              {/* Recent Activity Sections */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Recent Requests */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-sm font-bold">Recent API Requests</h3>
                    <button
                      onClick={() => setActiveTab("logs")}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {!usageData?.recentRequests || usageData.recentRequests.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">No requests yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {usageData.recentRequests.slice(0, 5).map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                r.success
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              }`}
                            >
                              {r.method} {r.status}
                            </span>
                            <span className="truncate text-slate-700 dark:text-slate-300">
                              {r.endpoint}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0 font-sans">
                            {formatDateTime(r.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Orders */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-sm font-bold">Recent API Orders</h3>
                    <button
                      onClick={() => setActiveTab("orders")}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {!usageData?.recentOrders || usageData.recentOrders.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">No API orders yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {usageData.recentOrders.slice(0, 5).map((o: any) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {o.orderId}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {o.network} {o.gbAmount}GB • {o.phoneNumber}
                            </p>
                          </div>
                          <StatusBadge status={o.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Webhook Events */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-sm font-bold">Recent Webhook Events</h3>
                    <button
                      onClick={() => setActiveTab("webhooks")}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {!usageData?.recentWebhooks || usageData.recentWebhooks.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">No webhook deliveries yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {usageData.recentWebhooks.slice(0, 5).map((w: any) => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {w.event}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {w.orderId || "Test ping"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              w.status === "SUCCESS"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-red-500/10 text-red-600"
                            }`}
                          >
                            {w.statusCode ? `HTTP ${w.statusCode}` : w.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: API ACCESS */}
          {activeTab === "access" && (
            <div className="space-y-6">
              <DeveloperApplicationCard application={appData} onApplied={loadData} />
            </div>
          )}

          {/* TAB 3: CREDENTIALS */}
          {activeTab === "credentials" && (
            <DeveloperCredentials
              isApprovedForProduction={isApproved}
              applicationStatus={appData?.status || "NOT_APPLIED"}
            />
          )}

          {/* TAB 4: DOCUMENTATION */}
          {activeTab === "docs" && (
            <DeveloperDocs
              onOpenPlayground={(endpointId) => {
                setPlaygroundEndpoint(endpointId);
                setActiveTab("playground");
                if (typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.set("tab", "playground");
                  u.searchParams.set("endpoint", endpointId);
                  window.history.replaceState({}, "", u.toString());
                }
              }}
            />
          )}

          {/* TAB 5: PLAYGROUND */}
          {activeTab === "playground" && (
            <DeveloperPlayground initialEndpointId={playgroundEndpoint} />
          )}

          {/* TAB 6: ORDERS */}
          {activeTab === "orders" && <DeveloperOrdersPanel />}

          {/* TAB 7: WEBHOOKS */}
          {activeTab === "webhooks" && <DeveloperWebhooksPanel />}

          {/* TAB 8: LOGS */}
          {activeTab === "logs" && <DeveloperLogsPanel />}

          {/* TAB 9: USAGE */}
          {activeTab === "usage" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  title="Total API Requests"
                  value={
                    ((metrics.successfulRequests || 0) + (metrics.failedRequests || 0)).toLocaleString()
                  }
                />
                <StatCard
                  title="Requests (Month)"
                  value={metrics.requestsMonth?.toLocaleString() || "0"}
                />
                <StatCard
                  title="Orders Completed"
                  value={metrics.ordersCompleted?.toLocaleString() || "0"}
                />
                <StatCard
                  title="Webhook Reliability"
                  value={`${metrics.webhookSuccessRate || 100}%`}
                />
              </div>
              <DeveloperLogsPanel />
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === "settings" && (
            <DeveloperSettingsPanel
              application={appData}
              onNavigateTab={(tab: string) => {
                setActiveTab(tab as TabKey);
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("tab", tab);
                  window.history.replaceState({}, "", url.toString());
                }
              }}
            />
          )}

          {/* TAB 11: STATUS */}
          {activeTab === "status" && <DeveloperStatusPanel />}
        </>
      )}
    </div>
  );
}
