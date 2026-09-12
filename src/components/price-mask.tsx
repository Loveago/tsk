import { cn } from "@/lib/utils";

/** Masked price display — rates are shared privately with resellers. */
export function PriceMask({
  label = "per allocation",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-right", className)}>
      <p
        title="Rates are shared privately — contact support to confirm"
        className="font-mono text-base font-bold tracking-[0.25em] text-brand-500 dark:text-brand-400"
      >
        *****
      </p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}