import Link from "next/link";
import { Database } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Database className="h-5 w-5" />
        </span>
        <span className="text-xl font-bold tracking-tight">Clickyfied</span>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-xs text-slate-400">Clickyfied4u © 2026</p>
    </div>
  );
}

export function AuthFooterLink({
  href,
  prompt,
  cta,
}: {
  href: string;
  prompt: string;
  cta: string;
}) {
  return (
    <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
      {prompt}{" "}
      <Link href={href} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
        {cta}
      </Link>
    </p>
  );
}
