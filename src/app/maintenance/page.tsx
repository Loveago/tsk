export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-center dark:bg-[#060b16]">
      <div className="max-w-md space-y-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">System Maintenance</h1>
        <p className="text-slate-600 dark:text-slate-300">
          We are currently undergoing scheduled maintenance to improve our systems.
          Please check back later.
        </p>
      </div>
    </div>
  );
}
