import type { Metadata } from "next";
import { PolicyShell } from "@/components/legal/policy-shell";
import {
  RotateCcw,
  Ban,
  Clock,
  Wallet,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Tskconnect",
  description:
    "Official Refund and Cancellation Policy for digital mobile data bundle orders on Tskconnect.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyShell
      title="Refund & Cancellation Policy"
      subtitle="Outlining the terms and conditions under which data bundle transactions may be cancelled, escalated, or refunded."
      lastUpdated="1st October, 2026"
    >
      {/* Intro Note */}
      <div className="not-prose mb-8 rounded-2xl border border-yellow-200/80 bg-yellow-50/70 p-5 text-sm text-yellow-950 dark:border-yellow-400/20 dark:bg-yellow-400/5 dark:text-yellow-200">
        <p className="leading-relaxed">
          At <strong className="font-bold">Tskconnect.com</strong>, we strive to provide reliable and automated data bundle delivery. Because data bundles are digital services consumed immediately upon transfer, this Refund and Cancellation Policy outlines the conditions under which transactions may be cancelled or refunded.
        </p>
      </div>

      {/* Section 1 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>1. Failed Deliveries &amp; Network Delays</span>
        </h2>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">
              Automated Escalation
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              If you make a successful payment, but the data bundle is not delivered due to a network timeout, operator API disruption, or system error, you must notify customer support via your dashboard ticket or our official support channels within <strong>24 hours</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">
              Resolution Period
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Our technical team will investigate the transaction with the designated mobile network operator (MTN, Telecel, or AT). We will attempt to resolve the issue and manually push the data delivery within <strong>12 to 24 hours</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/20">
            <h3 className="font-bold text-emerald-900 dark:text-emerald-300 mb-1 text-sm flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Refund Trigger
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed text-emerald-800 dark:text-emerald-400">
              If the network provider confirms delivery failure or if the bundle cannot be delivered within 24 hours from when the issue is logged, you are entitled to a full refund.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>2. Unverified Numbers</span>
        </h2>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p>
            Orders to unverified numbers are systematically blocked before processing.
          </p>
          <p>
            In the rare event that a payment gateway pre-authorizes or debits funds for an unverified recipient number due to a latency error, our system will automatically flag the anomaly, and a full refund will be processed immediately.
          </p>
        </div>
      </section>

      {/* Section 3 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Ban className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <span>3. Non-Refundable Transactions</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300">
          Refunds will <strong>not</strong> be granted under the following circumstances:
        </p>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>
              <strong>Successful Dispatch:</strong> The data bundle has already been successfully delivered and confirmed by the telecommunication network&apos;s SMS or API response.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>
              <strong>Customer Entry Error:</strong> You entered a verified number belonging to another person by mistake, and the network successfully delivered the bundle to that recipient.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>
              <strong>Telco-Side Line Ineligibility:</strong> The recipient number is barred, suspended, or inactive by the carrier&apos;s network policies.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>
              <strong>Change of Mind:</strong> You change your mind after the payment has been captured and the bundle has been queued or delivered.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Wallet className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>4. Refund Methods &amp; Timelines</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">
              Wallet Credit
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              For registered users, agents, and resellers, refunds are typically credited to your Tskconnect account wallet instantly upon approval, enabling immediate re-orders.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">
              Original Payment Method (Paystack / Mobile Money)
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              If a customer requests a reversal directly back to their original Mobile Money wallet or bank card, the refund will be initiated via Paystack. Gateway reversals typically reflect within <strong>24 to 48 hours</strong>, subject to standard Mobile Money network and banking clearing times.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <HelpCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>5. Dispute Resolution</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          If you have an unresolved issue, please reach out directly before filing a payment dispute with your payment provider:
        </p>
        <ul className="space-y-1.5 list-none pl-0 text-slate-700 dark:text-slate-300 text-sm">
          <li><strong>Support Email:</strong> <a href="mailto:support@tskconnect.com">support@tskconnect.com</a></li>
          <li><strong>WhatsApp / Phone:</strong> <a href="https://wa.me/233243721334">+233 24 372 1334</a></li>
          <li><strong>Operating Hours:</strong> 5:00 AM – 11:59 PM GMT, Monday – Sunday</li>
        </ul>
      </section>
    </PolicyShell>
  );
}
