"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import {
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  Search,
  X,
  ArrowLeftRight,
  User as UserIcon,
  Mail,
  Phone,
  CheckCircle2,
} from "lucide-react";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  balance: number;
  phone?: string | null;
  role?: string;
  status?: string;
}

export function ManualCreditDialog({
  open,
  onClose,
  user,
  initialMode = "CREDIT",
  onCredited,
  onAdjusted,
}: {
  open: boolean;
  onClose: () => void;
  user: UserSummary | null;
  initialMode?: "CREDIT" | "DEBIT";
  onCredited?: () => void;
  onAdjusted?: () => void;
}) {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = React.useState<UserSummary | null>(user);
  const [mode, setMode] = React.useState<"CREDIT" | "DEBIT">(initialMode);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  // User search state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<UserSummary[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchHasSearched, setSearchHasSearched] = React.useState(false);

  // Reset state on open or user prop changes
  React.useEffect(() => {
    if (open) {
      setSelectedUser(user);
      setMode(initialMode);
      setAmount("");
      setReason("");
      setReference("");
      setConfirmed(false);
      setSearchQuery("");
      setSearchResults([]);
      setSearchHasSearched(false);

      // If no initial user, load first 6 users by default for instant selection
      if (!user) {
        setSearchLoading(true);
        fetch("/api/admin/users?pageSize=6")
          .then((res) => res.json())
          .then((json) => {
            setSearchResults(json.data ?? []);
          })
          .catch(() => {})
          .finally(() => setSearchLoading(false));
      }
    }
  }, [open, user, initialMode]);

  // Debounced search when user types in search input
  React.useEffect(() => {
    if (!open || selectedUser) return;
    const query = searchQuery.trim();
    if (!query) {
      // Reload default initial list if query is cleared
      setSearchLoading(true);
      fetch("/api/admin/users?pageSize=6")
        .then((res) => res.json())
        .then((json) => {
          setSearchResults(json.data ?? []);
          setSearchHasSearched(false);
        })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&pageSize=10`);
        const json = await res.json();
        setSearchResults(json.data ?? []);
        setSearchHasSearched(true);
      } catch {
        toast("Failed to search users", "error");
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, open, selectedUser, toast]);

  const parsedAmount = Number(amount) || 0;
  const isDebit = mode === "DEBIT";
  const currentBalance = selectedUser?.balance ?? 0;
  const projectedBalance = isDebit ? currentBalance - parsedAmount : currentBalance + parsedAmount;
  const isInsufficient = isDebit && parsedAmount > currentBalance;

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!confirmed) {
      if (parsedAmount <= 0) {
        return toast(`Enter a valid ${isDebit ? "debit" : "credit"} amount`, "error");
      }
      if (isDebit && isInsufficient) {
        return toast(
          `Insufficient balance. User has ${formatGHS(currentBalance)}, cannot debit ${formatGHS(parsedAmount)}`,
          "error"
        );
      }
      if (!reason.trim()) {
        return toast(`Enter a reason for this ${isDebit ? "debit" : "credit"}`, "error");
      }
      setConfirmed(true);
      return;
    }

    setSaving(true);
    try {
      const endpoint = isDebit
        ? "/api/admin/wallet/manual-debit"
        : "/api/admin/wallet/manual-credit";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: parsedAmount,
          reason: reason.trim(),
          reference: reference.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? `Failed to ${isDebit ? "debit" : "credit"} wallet`, "error");
        return;
      }

      toast(
        isDebit
          ? `Successfully debited ${formatGHS(parsedAmount)} from ${selectedUser.name}`
          : `Successfully credited ${formatGHS(parsedAmount)} to ${selectedUser.name}`,
        "success"
      );
      if (onAdjusted) onAdjusted();
      else if (onCredited) onCredited();
      onClose();
    } catch {
      toast("An unexpected error occurred", "error");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = selectedUser
    ? `Manual Wallet ${isDebit ? "Debit" : "Credit"}: ${selectedUser.name}`
    : "Credit / Debit User Wallet";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dialogTitle}
      className="max-w-lg"
    >
      {/* Step 1: User Search (if no user selected yet) */}
      {!selectedUser ? (
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="userSearchInput">Search User by Name or Email</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                id="userSearchInput"
                type="text"
                autoFocus
                placeholder="Type user's name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Select a user below to view their balance and credit or debit their wallet.
            </p>
          </div>

          {/* Results List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              <span>{searchHasSearched ? "Search Results" : "Recent / Suggested Users"}</span>
              {searchLoading && <Spinner className="h-3.5 w-3.5 text-brand-600" />}
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 dark:divide-white/5 dark:border-white/10 dark:bg-white/5">
              {searchLoading && searchResults.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-slate-500">
                  <Spinner className="mr-2 h-4 w-4 text-brand-600" /> Loading users...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  {searchHasSearched
                    ? `No users found matching "${searchQuery}".`
                    : "No users available."}
                </div>
              ) : (
                searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setAmount("");
                      setReason("");
                      setReference("");
                      setConfirmed(false);
                    }}
                    className="w-full text-left p-3 hover:bg-brand-50/80 dark:hover:bg-brand-500/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 font-bold text-xs flex items-center justify-center shrink-0">
                        {u.name ? u.name.substring(0, 2).toUpperCase() : "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-xs text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">
                            {u.name}
                          </p>
                          {u.role && u.role !== "USER" && (
                            <span className="rounded bg-slate-200 px-1 py-0.2 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              {u.role}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">
                        Balance
                      </span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {formatGHS(u.balance)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Step 2: Selected User Adjustment Form */
        <form onSubmit={handleProceed} className="space-y-4 text-sm">
          {/* Selected User Header Card with Change User option */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/5">
            <div className="flex justify-between items-start text-xs gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {selectedUser.name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{selectedUser.email}</span>
                </div>
                {selectedUser.phone && (
                  <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                    <Phone className="h-3 w-3" />
                    <span>{selectedUser.phone}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">
                  Current Balance
                </span>
                <p className="font-bold text-sm text-slate-900 dark:text-white">
                  {formatGHS(currentBalance)}
                </p>
                {!confirmed && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setConfirmed(false);
                    }}
                    className="mt-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline flex items-center justify-end gap-1 cursor-pointer"
                  >
                    <ArrowLeftRight className="h-3 w-3" /> Change User
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Credit / Debit Segmented Selector */}
          {!confirmed && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              <button
                type="button"
                onClick={() => {
                  setMode("CREDIT");
                  setConfirmed(false);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  mode === "CREDIT"
                    ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <PlusCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Credit Account (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("DEBIT");
                  setConfirmed(false);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  mode === "DEBIT"
                    ? "bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <MinusCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                Debit Account (-)
              </button>
            </div>
          )}

          {!confirmed ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="adjustmentAmt">
                    {isDebit ? "Debit Amount (GHS) *" : "Credit Amount (GHS) *"}
                  </Label>
                  {amount && (
                    <span
                      className={`text-xs font-medium ${
                        isInsufficient
                          ? "text-rose-600 dark:text-rose-400 font-bold"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Est. New Balance: {formatGHS(projectedBalance)}
                    </span>
                  )}
                </div>
                <Input
                  id="adjustmentAmt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={isDebit ? "e.g. 50.00" : "e.g. 100.00"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                {isInsufficient && (
                  <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    Debit amount exceeds current user balance ({formatGHS(currentBalance)}).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adjustmentReason">Reason / Notes *</Label>
                <Input
                  id="adjustmentReason"
                  placeholder={
                    isDebit
                      ? "e.g. Reversal of duplicate deposit / Administrative correction"
                      : "e.g. Offline MoMo deposit / Telecom compensation"
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adjustmentRef">Reference (Optional)</Label>
                <Input
                  id="adjustmentRef"
                  placeholder={isDebit ? "e.g. DEBIT-12345" : "e.g. MOMO-REF-12345"}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isInsufficient || !amount || Number(amount) <= 0 || !reason.trim()}
                  className={`flex-1 text-white cursor-pointer ${
                    isDebit
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  Continue to Confirmation
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div
                className={`rounded-xl border p-4 ${
                  isDebit
                    ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`h-5 w-5 shrink-0 mt-0.5 ${
                      isDebit ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  />
                  <div>
                    <p className="font-bold text-sm">
                      You are about to {isDebit ? "debit" : "credit"}{" "}
                      <span className="underline font-black">{formatGHS(parsedAmount)}</span>{" "}
                      {isDebit ? "from" : "to"} {selectedUser.name}&apos;s wallet.
                    </p>
                    <p className="mt-1 text-xs opacity-90">Reason: {reason}</p>
                    {reference && <p className="text-xs opacity-80">Reference: {reference}</p>}
                    <div className="mt-2 text-xs font-semibold space-y-0.5">
                      <p>Current balance: {formatGHS(currentBalance)}</p>
                      <p
                        className={
                          isDebit
                            ? "text-rose-700 dark:text-rose-300 font-bold"
                            : "text-emerald-700 dark:text-emerald-300 font-bold"
                        }
                      >
                        New balance will be: {formatGHS(projectedBalance)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  disabled={saving}
                  onClick={() => setConfirmed(false)}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className={`flex-1 text-white cursor-pointer ${
                    isDebit
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Spinner className="mr-1.5" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {isDebit ? "Confirm & Debit" : "Confirm & Credit"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

