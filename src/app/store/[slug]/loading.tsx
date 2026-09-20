export default function StorefrontPublicLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-pulse">
      {/* Hero skeleton */}
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="h-6 w-48 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-14 w-3/4 rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="h-10 w-full rounded-xl bg-slate-200/70 dark:bg-white/5" />
          <div className="flex gap-3 pt-2">
            <div className="h-11 w-36 rounded-full bg-slate-200 dark:bg-white/10" />
            <div className="h-11 w-36 rounded-full bg-slate-200 dark:bg-white/10" />
          </div>
        </div>
        <div className="flex justify-center">
          <div className="h-64 w-64 rounded-full border-4 border-slate-200/60 dark:border-white/10" />
        </div>
      </div>

      {/* Network cards grid skeleton */}
      <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-56 rounded-3xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#111a2c]"
          >
            <div className="aspect-square w-full rounded-2xl bg-slate-100 dark:bg-white/5" />
            <div className="mt-3 h-4 w-20 rounded bg-slate-200 dark:bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
