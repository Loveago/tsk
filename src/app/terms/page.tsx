import type { Metadata } from "next";
import { PolicyShell } from "@/components/legal/policy-shell";
import { CheckCircle2, Shield, AlertTriangle, Scale, Lock, Users, Store, Zap, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Tskconnect",
  description:
    "Official Terms of Service governing access to and use of Tskconnect platform, APIs, and storefront services.",
};

export default function TermsOfServicePage() {
  return (
    <PolicyShell
      title="Terms of Service"
      subtitle="These Terms of Service govern your access to and use of our website, services, APIs, and storefront platforms."
      lastUpdated="1st October, 2026"
    >
      {/* Intro Note */}
      <div className="not-prose mb-8 rounded-2xl border border-yellow-200/80 bg-yellow-50/70 p-5 text-sm text-yellow-950 dark:border-yellow-400/20 dark:bg-yellow-400/5 dark:text-yellow-200">
        <p className="leading-relaxed">
          Welcome to <strong className="font-bold">Tskconnect.com</strong> (&ldquo;Tskconnect,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of our website, services, APIs, and storefront platforms (collectively, the &ldquo;Services&rdquo;). By creating an account, making a purchase, or using our Services, you agree to be bound by these Terms and the laws of the Republic of Ghana.
        </p>
      </div>

      {/* Section 1 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>1. Description of Services</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          <strong>Tskconnect.com</strong> operates a telecommunication digital distribution platform in Ghana, providing data bundle delivery for supported mobile network operators, including <strong>MTN Ghana</strong>, <strong>Telecel Ghana</strong>, and <strong>AT (AirtelTigo)</strong>. We operate as an independent aggregator and technology intermediary.
        </p>
      </section>

      {/* Section 2 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Users className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>2. User Accounts &amp; Membership Tiers</span>
        </h2>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Standard Accounts:</strong> Every customer registering on Tskconnect.com is initially assigned the status of a Standard User, configured for direct usage of purchased bundles.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Tier Upgrades:</strong> Users may request an account upgrade to specialized tiers (e.g., Agent, Reseller). Upgrades are approved at our sole discretion based on eligibility requirements. Upgraded tiers unlock wholesale pricing, specialized dashboard tools, and extended features.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Account Responsibility:</strong> You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 3 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Store className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>3. Agent &amp; Reseller Storefronts</span>
        </h2>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              Agents and Resellers may generate customized storefronts through Tskconnect.com to sell data bundles directly to third-party end-users.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              Resellers act as independent sellers and are solely responsible for setting compliant end-user prices within allowed parameters, managing their direct customer relationships, and addressing preliminary customer inquiries.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              Resellers may not misrepresent themselves as the official mobile network operators (MTN, Telecel, AT) or as sole owners of Tskconnect.com.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Shield className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>4. Recipient Number Verification &amp; Order Acceptance</span>
        </h2>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p>
            <strong>System Verification Requirement:</strong> Our platform operates a closed-loop validation safeguard. Data bundles can only be dispatched to phone numbers that are verified and active on the Tskconnect system.
          </p>
          <p>
            <strong>Automatic Rejection:</strong> If a customer or storefront buyer submits an unverified, malformed, or unlisted phone number, the transaction will be automatically rejected by our system before order completion, and no payment will be accepted or captured.
          </p>
          <p>
            <strong>Accuracy of Information:</strong> For verified numbers, the buyer remains responsible for ensuring the selected network matches the phone number. Dispatches made to a verified number mistakenly designated by the customer cannot be undone.
          </p>
        </div>
      </section>

      {/* Section 5 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>5. Payments &amp; Pricing</span>
        </h2>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              All payments on Tskconnect.com are processed securely in Ghana Cedis (GHS) via licensed third-party payment gateways, including Paystack.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              We do not store credit/debit card numbers or Mobile Money PINs on our servers.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              Prices for data bundles are subject to real-time adjustments based on operator tariff updates, wholesale costs, and platform tier status.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 6 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <CheckCircle2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>6. Delivery Timelines &amp; Network Outages</span>
        </h2>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p>
            <strong>Express Delivery:</strong> Under normal conditions, data bundle top-ups are automated and processed instantly or within minutes.
          </p>
          <p>
            <strong>Third-Party Dependency:</strong> Service delivery relies directly on the gateway infrastructure and network APIs of telecommunication operators (MTN, Telecel, AT). Tskconnect is not liable for delayed dispatches caused by telecommunication network outages, API downtime, or maintenance windows.
          </p>
          <p>
            <strong>Reporting Delays:</strong> If a bundle is marked as paid but not credited to the recipient&apos;s line, the user must log a support ticket within twenty-four (24) hours. We will investigate with the designated operator and ensure dispatch or issue a resolution.
          </p>
        </div>
      </section>

      {/* Section 7 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>7. Prohibited Use</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300">
          You agree not to use the Services for:
        </p>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>Any fraudulent, unauthorized, or illegal transactions.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>Exploiting system vulnerabilities, automated scraping, or bot-driven purchases without API authorization.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
            <div>Distributing malicious storefront links or conducting unauthorized financial activities.</div>
          </li>
        </ul>
      </section>

      {/* Section 8 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Scale className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>8. Limitation of Liability &amp; Governing Law</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          To the maximum extent permitted by Ghanaian law, Tskconnect.com will not be liable for any indirect, incidental, or consequential damages resulting from network delays or operator-level errors. These Terms are governed by and construed in accordance with the laws of the Republic of Ghana.
        </p>
      </section>

      {/* Section 9 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Phone className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>9. Contact &amp; Inquiries</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          For inquiries regarding these Terms or support with your account and orders, please reach out to us:
        </p>
        <ul className="space-y-1.5 list-none pl-0 text-slate-700 dark:text-slate-300 text-sm">
          <li><strong>Entity:</strong> Tskconnect</li>
          <li><strong>WhatsApp / Phone:</strong> <a href="https://wa.me/233551234567">+233 55 123 4567</a></li>
          <li><strong>Support Email:</strong> <a href="mailto:support@tskconnect.com">support@tskconnect.com</a></li>
          <li><strong>Operating Hours:</strong> 5:00 AM – 11:59 PM GMT, Monday – Sunday</li>
        </ul>
      </section>
    </PolicyShell>
  );
}
