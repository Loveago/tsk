"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import {
  PricingProfileDialog,
  type PricingProfile,
} from "@/components/admin/pricing-profile-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatGHS } from "@/lib/types";
import { Receipt, Pencil, Trash2, Plus, Star } from "lucide-react";

export default function AdminPricingPage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = React.useState<PricingProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PricingProfile | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pricing");
    const json = await res.json();
    setProfiles(json.profiles ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const remove = async (p: PricingProfile) => {
    if (p._count.users > 0) {
      return toast(`${p._count.users} user(s) still assigned to this profile`, "error");
    }
    if (!confirm(`Delete pricing profile "${p.name}"?`)) return;
    const res = await fetch(`/api/admin/pricing/${p.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return toast(json.error ?? "Delete failed", "error");
    toast("Profile deleted", "success");
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Profiles"
        description="Per-profile price tiers for resellers & wholesale accounts"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New profile
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState icon={Receipt} title="No pricing profiles" description="Create one to assign to users." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.type} · {p._count.users} user{p._count.users === 1 ? "" : "s"} ·{" "}
                    {p.active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(p);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(p)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-4">
                {p.tiers.map((t) => (
                  <div
                    key={t.gbAmount}
                    className="rounded-xl bg-slate-50 px-2.5 py-2 text-center dark:bg-slate-800"
                  >
                    <p className="font-semibold">{t.gbAmount}GB</p>
                    <p className="text-slate-500">{formatGHS(t.priceGHS)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PricingProfileDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        profile={editing}
        onSaved={load}
      />
    </div>
  );
}
