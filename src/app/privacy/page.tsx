import type { Metadata } from "next";
import { PolicyShell } from "@/components/legal/policy-shell";
import {
  ShieldCheck,
  Database,
  Lock,
  Share2,
  FileCheck,
  UserCheck,
  Building,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Tskconnect",
  description:
    "Data handling practices and customer privacy protections in compliance with the Data Protection Act, 2012 (Act 843) of Ghana.",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyShell
      title="Privacy Policy"
      subtitle="Outlining our data handling practices in compliance with the Data Protection Act, 2012 (Act 843) of Ghana."
      lastUpdated="1st October, 2026"
    >
      {/* Intro Note */}
      <div className="not-prose mb-8 rounded-2xl border border-yellow-200/80 bg-yellow-50/70 p-5 text-sm text-yellow-950 dark:border-yellow-400/20 dark:bg-yellow-400/5 dark:text-yellow-200">
        <p className="leading-relaxed">
          <strong className="font-bold">Tskconnect.com</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is dedicated to protecting your personal information. This Privacy Policy outlines our data handling practices in compliance with the <strong className="font-bold">Data Protection Act, 2012 (Act 843) of Ghana</strong>.
        </p>
      </div>

      {/* Section 1 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Database className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>1. Information We Collect</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300">
          We collect the following personal and transactional details:
        </p>
        <ul className="space-y-2.5 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Account Information:</strong> Name, email address, phone number, and account tier credentials (for Users, Agents, and Resellers).
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Order &amp; Recipient Data:</strong> Phone numbers submitted for data bundle top-ups, transaction amounts, carrier selection (MTN, Telecel, AT), and status logs.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Verification Data:</strong> Data used to authenticate authorized phone numbers within our delivery database.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Technical Data:</strong> IP address, browser type, device information, and transaction timestamps collected automatically via system logs and cookies.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 2 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <FileCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>2. How We Use Your Information</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300">
          We use your data strictly to:
        </p>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Verify recipient phone numbers and execute data bundle orders.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Communicate order statuses, platform updates, and technical notifications.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Authenticate user accounts, manage Reseller/Agent storefronts, and prevent fraudulent transactions.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Comply with Ghanaian financial record-keeping standards and anti-fraud regulations.</div>
          </li>
        </ul>
      </section>

      {/* Section 3 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Share2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>3. Data Sharing &amp; Third Parties</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          We do not sell, rent, or trade your personal information. We only share information with trusted third parties necessary to provide our services:
        </p>
        <ul className="space-y-2.5 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Mobile Network Operators (MTN Ghana, Telecel Ghana, AirtelTigo):</strong> Recipient phone numbers and purchase specifications are shared to provision data bundles.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Payment Processors (Paystack):</strong> Payment card details and Mobile Money details are handled directly by Paystack via encrypted, PCI-DSS compliant interfaces. Tskconnect does not store your payment pins or card credentials.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>
              <strong>Regulatory &amp; Law Enforcement Authorities:</strong> Only when mandated by Ghanaian law, court order, or an official regulatory directive.
            </div>
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>4. Data Security &amp; Storage</span>
        </h2>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>All communications between your browser and our website are protected using TLS/HTTPS encryption.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Internal access to customer databases and verification lists is strictly role-restricted to authorized technical personnel.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Transactional records are retained only for the duration required by Ghanaian tax, accounting, and anti-fraud compliance mandates.</div>
          </li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <UserCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>5. Your Rights Under Act 843 (Ghana)</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300">
          Under the Data Protection Act, 2012 (Act 843), you have the right to:
        </p>
        <ul className="space-y-2 list-none pl-0 text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Access the personal information we hold about you.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Request the correction of inaccurate or incomplete contact details.</div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2 shrink-0" />
            <div>Request the deactivation of your account and deletion of your records, subject to statutory transaction retention periods.</div>
          </li>
        </ul>
      </section>

      {/* Section 6 */}
      <section className="mb-8 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Building className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>6. Contact Information</span>
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          For inquiries regarding these policies or to exercise your privacy rights, contact:
        </p>
        <ul className="space-y-1.5 list-none pl-0 text-slate-700 dark:text-slate-300 text-sm">
          <li><strong>Entity:</strong> Tskconnect</li>
          <li><strong>Email:</strong> <a href="mailto:support@tskconnect.com">support@tskconnect.com</a></li>
          <li><strong>Customer Support:</strong> <a href="https://wa.me/233551234567">+233 55 123 4567</a></li>
        </ul>
      </section>
    </PolicyShell>
  );
}
