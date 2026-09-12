import { cn } from "@/lib/utils";

/** Thin horizontal progress bar. `value` is clamped to 0..total. */
export function ProgressBar({
  value,
  total,
  className,
  barClassName,
}: {
  value: number;
  total: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10",
        className
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className={cn("h-full rounded-full bg-brand-500 transition-all", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}