export default function AdminLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-lg bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-60 rounded-lg bg-slate-200/70 dark:bg-white/5" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-white/10" />
      </div>

      {/* Admin stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#0d1526]"
          >
            <div className="h-3 w-16 rounded bg-slate-200 dark:bg-white/10" />
            <div className="mt-3 h-6 w-24 rounded bg-slate-200 dark:bg-white/10" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#0d1526]">
        <div className="h-5 w-48 rounded bg-slate-200 dark:bg-white/10" />
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-11 w-full rounded-xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
