"use client";

import * as React from "react";
import { CheckCircle2, Clock, XCircle, AlertOctagon, FileText, Send, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";

interface ApplicationData {
  id: string;
  businessName: string;
  websiteUrl: string;
  usageDescription: string;
  expectedMonthlyVolume: string;
  contactEmail: string;
  contactPhone: string;
  applicationType: string;
  webhookUrl: string | null;
  status: string;
  adminNotes: string | null;
  allowedScopes: string;
  rateLimitPerMin: number;
  dailyRequestLimit: number;
  maxOrderVolume: number;
  ipRestrictions: string | null;
  webhookPermissions: boolean;
  sandboxAccess: boolean;
  productionAccess: boolean;
  reviewedAt: string | null;
  createdAt: string;
}

export function DeveloperApplicationCard({
  application,
  onApplied,
}: {
  application: ApplicationData | null;
  onApplied?: () => void;
}) {
  const { toast } = useToast();
  const [showApplyModal, setShowApplyModal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Form states
  const [businessName, setBusinessName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [usageDescription, setUsageDescription] = React.useState("");
  const [expectedMonthlyVolume, setExpectedMonthlyVolume] = React.useState("100-500 orders");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [applicationType, setApplicationType] = React.useState("WEBSITE");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  const status = application ? application.status : "NOT_APPLIED";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      toast("You must accept the Developer Terms of Service", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/developer/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          websiteUrl: websiteUrl.trim(),
          usageDescription: usageDescription.trim(),
          expectedMonthlyVolume,
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          applicationType,
          webhookUrl: webhookUrl.trim() || undefined,
          termsAccepted: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Submission failed", "error");
        return;
      }

      toast("Application submitted successfully!", "success");
      setShowApplyModal(false);
      if (onApplied) onApplied();
    } catch {
      toast("An error occurred submitting your application", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "APPROVED") {
    return (
      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-6 dark:border-emerald-500/20 dark:bg-emerald-950/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  API Access Approved
                </h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                  ACTIVE
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Your account is approved for production API access. You can generate production credentials and automate live data orders.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-emerald-100 pt-4 text-xs dark:border-emerald-500/20">
          <div>
            <p className="text-slate-400">Rate Limit</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
              {application?.rateLimitPerMin || 60} req/min
            </p>
          </div>
          <div>
            <p className="text-slate-400">Daily Limit</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
              {application?.dailyRequestLimit?.toLocaleString() || "5,000"} req/day
            </p>
          </div>
          <div>
            <p className="text-slate-400">Production Access</p>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">ENABLED</p>
          </div>
          <div>
            <p className="text-slate-400">Sandbox Access</p>
            <p className="font-semibold text-blue-600 dark:text-blue-400">ENABLED</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "PENDING") {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-6 dark:border-amber-500/20 dark:bg-amber-950/10">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
            <Clock className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Application Under Review
              </h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                PENDING
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              We received your application for <strong>{application?.businessName}</strong>. Our team reviews developer applications within 24 hours. In the meantime, you can test with Sandbox credentials in the API Playground.
            </p>
            <p className="pt-2 text-[11px] text-slate-400">
              Submitted: {application?.createdAt ? formatDateTime(application.createdAt) : "Recently"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "REJECTED") {
    return (
      <div className="rounded-2xl border border-red-200/80 bg-red-50/40 p-6 dark:border-red-500/20 dark:bg-red-950/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Application Not Approved
                </h3>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/20 dark:text-red-400">
                  REJECTED
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {application?.adminNotes
                  ? `Admin feedback: ${application.adminNotes}`
                  : "Your application could not be approved at this time. Please update your details and re-apply."}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowApplyModal(true)}>
            Update Application
          </Button>
        </div>
      </div>
    );
  }

  if (status === "SUSPENDED" || status === "REVOKED") {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertOctagon className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0" />
          <div>
            <h3 className="text-base font-bold text-red-900 dark:text-red-200">
              API Access {status}
            </h3>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              {application?.adminNotes
                ? `Reason: ${application.adminNotes}`
                : "Your API access has been temporarily suspended. Please contact Tskconnect support for reinstatement."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // NOT_APPLIED State (Section 3)
  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-2xl">
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Developer Program
          </span>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Connect your website or application to Tskconnect and automate data orders.
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Get direct API access to dispatch MTN, Telecel, and AirtelTigo data bundles programmatically from your e-commerce storefront, mobile app, or reseller portal.
          </p>

          <div className="mt-6">
            <Button
              onClick={() => setShowApplyModal(true)}
              className="gap-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20 hover:shadow-blue-600/30"
            >
              Apply for API Access <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Application Form Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold">Apply for Developer API Access</h3>
            <p className="mt-1 text-xs text-slate-500">
              Provide information about your business or integration to receive production credentials.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Business / Website Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DataShop Ghana"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Website URL *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://yourwebsite.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  API Usage Description *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe your platform and how you will use the Tskconnect API..."
                  value={usageDescription}
                  onChange={(e) => setUsageDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Intended Application Type *
                  </label>
                  <select
                    value={applicationType}
                    onChange={(e) => setApplicationType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="WEBSITE">Website / Web App</option>
                    <option value="MOBILE_APP">Mobile Application (iOS / Android)</option>
                    <option value="RESELLER_PORTAL">Reseller Platform</option>
                    <option value="ERP_ECOMMERCE">E-Commerce / ERP Integration</option>
                    <option value="OTHER">Other Integration</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Expected Monthly Volume *
                  </label>
                  <select
                    value={expectedMonthlyVolume}
                    onChange={(e) => setExpectedMonthlyVolume(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="1-100 orders">1 - 100 orders/month</option>
                    <option value="100-500 orders">100 - 500 orders/month</option>
                    <option value="500-2,000 orders">500 - 2,000 orders/month</option>
                    <option value="2,000+ orders">2,000+ orders/month</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="dev@yourcompany.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0241234567"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Webhook URL (Optional initially)
                </label>
                <input
                  type="url"
                  placeholder="https://yourwebsite.com/api/webhooks/tskconnect"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="terms" className="text-xs text-slate-600 dark:text-slate-400">
                  I agree to the Tskconnect Developer API Terms of Service and understand that automated order fulfillment will debit from my account balance.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApplyModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 text-white"
                >
                  {submitting ? <Spinner className="h-4 w-4" /> : "Submit Application"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
