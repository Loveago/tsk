"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Phone, AlertCircle, CheckCircle2, ShieldAlert, ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import type { AuthUser } from "@/lib/types";

export function PhonePromptModal({ user }: { user: AuthUser }) {
  const router = useRouter();
  const { toast } = useToast();

  const hasPhone = Boolean(user.phone && user.phone.trim().length >= 9);

  // If user already has a phone number, never prompt
  const [completed, setCompleted] = React.useState(hasPhone);
  const [isOpen, setIsOpen] = React.useState(!hasPhone);
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (completed) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Please enter your phone number");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update phone number");
        return;
      }

      toast("Phone number updated successfully!", "success");
      setCompleted(true);
      setIsOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Top Warning Banner if modal was minimized */}
      {!isOpen && (
        <div className="relative z-20 border-b border-amber-300 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Action Required:</strong> You haven’t set your phone number yet. Add it to receive delivery alerts.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOpen(true)}
              className="h-7 border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200 text-xs font-semibold cursor-pointer"
            >
              Add Phone Number Now
            </Button>
          </div>
        </div>
      )}

      {/* Urgent Prompt Dialog */}
      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Phone Number Required">
        <div className="space-y-4 pt-1">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              <Phone className="h-5 w-5" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-amber-950 dark:text-amber-200">
                Action Required ASAP: Complete Your Account Profile
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                Please provide your active phone number (WhatsApp or Mobile Money). We use this to reach you regarding order deliveries, system announcements, and account security.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="prompt-phone" className="text-xs font-semibold">
                Ghana Phone Number <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="prompt-phone"
                  type="tel"
                  placeholder="e.g. 0244123456 or 0501234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                  required
                  className="rounded-xl pl-9"
                />
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Accepts MTN, Telecel, or AT numbers (10 digits).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                Remind me later
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="gap-1.5 text-xs font-bold"
              >
                {saving ? (
                  <>
                    <Spinner className="h-3.5 w-3.5" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <span>Save Phone Number</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}
