"use client";

import { EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/types";
import { Package, Pencil, Power, Trash2 } from "lucide-react";
import type { AdminPackage } from "@/components/admin/package-form-dialog";

export function PackageTable({
  packages,
  loading,
  onEdit,
  onDelete,
  onToggle,
}: {
  packages: AdminPackage[];
  loading: boolean;
  onEdit: (p: AdminPackage) => void;
  onDelete: (p: AdminPackage) => void;
  onToggle: (p: AdminPackage) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12 rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const sortedPackages = [...packages].sort((a, b) => {
    if (a.network !== b.network) return a.network.localeCompare(b.network);
    return a.gbAmount - b.gbAmount;
  });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {sortedPackages.length === 0 ? (
        <EmptyState icon={Package} title="No packages" description="Add your first data bundle." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Retail price</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Provider ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedPackages.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">{p.network}</td>
                  <td className="px-4 py-3">{p.gbAmount}GB</td>
                  <td className="px-4 py-3">{p.retailPriceGHS != null ? formatGHS(p.retailPriceGHS) : "—"}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{p.providerProductId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        p.active
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {p.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onToggle(p)}
                        title={p.active ? "Hide this package from users" : "Make this package available to users"}
                      >
                        <Power className={`h-3.5 w-3.5 ${p.active ? "text-emerald-600" : "text-slate-400"}`} />
                        {p.active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onDelete(p)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
