export default function GlobalLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600 dark:border-white/10 dark:border-t-brand-400" />
        <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      </div>
    </div>
  );
}
