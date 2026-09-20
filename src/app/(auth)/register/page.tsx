"use client";

import { Suspense, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { CheckCircle2, XCircle, CreditCard, ExternalLink, AlertTriangle } from "lucide-react";

interface SignupFeeInfo {
  enabled: boolean;
  amount: number;
  currency: string;
  description: string;
  paystackConfigured: boolean;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [serverError, setServerError] = useState<string | null>(null);
  const [signupCodeMode, setSignupCodeMode] = useState<"DISABLED" | "OPTIONAL" | "REQUIRED">("OPTIONAL");
  const [codeStatus, setCodeStatus] = useState<{ checked: boolean; valid: boolean; message?: string } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [signupFee, setSignupFee] = useState<SignupFeeInfo | null>(null);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [redirectingPayment, setRedirectingPayment] = useState<{ url: string; amount: number } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const enteredCode = watch("signupCode");

  // Load registration settings
  useEffect(() => {
    fetch("/api/auth/registration-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.signupCodeMode) setSignupCodeMode(data.signupCodeMode);
        if (data.allowRegistration === false) setRegistrationClosed(true);
        if (data.signupFee) setSignupFee(data.signupFee);
      })
      .catch(() => {
        // Fallback to legacy endpoint if needed
        fetch("/api/auth/signup-code-mode")
          .then((r) => r.json())
          .then((data) => {
            if (data.mode) setSignupCodeMode(data.mode);
          })
          .catch(() => {});
      });
  }, []);

  // Handle URL errors (e.g. redirected from Paystack callback on cancel/failure)
  useEffect(() => {
    const error = searchParams.get("error");
    const reason = searchParams.get("reason");
    const message = searchParams.get("message");
    if (error === "payment_failed") {
      setServerError(
        reason
          ? `Payment failed: ${reason}. Please try signing up again to complete activation.`
          : "Payment was not completed. Please try again to activate your account."
      );
    } else if (error === "verification_error") {
      setServerError(message || "An error occurred while verifying your payment. Please try again.");
    } else if (error === "transaction_not_found") {
      setServerError("Registration transaction record not found. Please try submitting again.");
    }
  }, [searchParams]);

  // Validate signup code with debounce
  useEffect(() => {
    if (signupCodeMode === "DISABLED" || !enteredCode || !enteredCode.trim()) {
      setCodeStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      setValidatingCode(true);
      try {
        const res = await fetch(`/api/auth/validate-code?code=${encodeURIComponent(enteredCode.trim())}`);
        const data = await res.json();
        setCodeStatus({
          checked: true,
          valid: !!data.valid,
          message: data.valid ? "✓ Valid signup code" : data.message || "Invalid or expired signup code",
        });
      } catch {
        setCodeStatus(null);
      } finally {
        setValidatingCode(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [enteredCode, signupCodeMode]);

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Registration failed");
      return;
    }

    // Check if account monetization fee payment is required
    if (json.requiresPayment && json.authorizationUrl) {
      setRedirectingPayment({
        url: json.authorizationUrl,
        amount: json.amount || signupFee?.amount || 0,
      });
      toast("Account registered! Redirecting to Paystack for activation...", "info");
      // Redirect after a brief moment to allow UI prompt to display
      setTimeout(() => {
        window.location.href = json.authorizationUrl;
      }, 1000);
      return;
    }

    toast("Account created. Welcome to Tskconnect!", "success");
    router.push("/dashboard");
    router.refresh();
  };

  const hasFee = signupFee?.enabled && signupFee.amount > 0;

  return (
    <AuthShell title="Create your account" subtitle="Start sending data bundles in minutes">
      {/* Payment Redirecting Modal / Prompt */}
      {redirectingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Spinner className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Redirecting to Paystack…
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Your account details have been recorded. Complete the activation fee of{" "}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  GHS {redirectingPayment.amount.toFixed(2)}
                </strong>{" "}
                to activate your account and access your dashboard.
              </p>
            </div>
            <Button
              type="button"
              className="w-full gap-1.5"
              onClick={() => {
                window.location.href = redirectingPayment.url;
              }}
            >
              Proceed to Paystack <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {registrationClosed ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600 dark:text-amber-400" />
          <p className="font-semibold">Registrations are currently closed</p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            New user sign-ups are temporarily paused by the administrator. Please check back later.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {serverError}
            </div>
          )}

          {/* Activation Fee Banner */}
          {hasFee && (
            <div className="rounded-xl border border-brand-200/80 bg-brand-50/60 p-3.5 text-xs text-brand-950 dark:border-brand-500/30 dark:bg-brand-950/40 dark:text-brand-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1.5 text-brand-700 dark:text-brand-300">
                  <CreditCard className="h-4 w-4" />
                  {signupFee.description || "Account Activation Fee"}
                </span>
                <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-black text-white dark:bg-brand-500">
                  GHS {signupFee.amount.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                A one-time activation fee is required. After submitting this form, you will be redirected to Paystack to complete payment and activate your account.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" {...register("name")} />
            {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Signup Code input */}
          {signupCodeMode !== "DISABLED" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="signupCode">
                  {signupCodeMode === "REQUIRED" ? "Signup Code *" : "Signup Code (Optional)"}
                </Label>
                {validatingCode && <Spinner className="h-3.5 w-3.5 text-brand-600" />}
              </div>
              <Input
                id="signupCode"
                placeholder="e.g. WELCOME2026"
                className="uppercase tracking-wider font-mono text-sm"
                {...register("signupCode")}
              />
              {codeStatus?.checked && (
                <p
                  className={`flex items-center gap-1 text-xs font-medium ${
                    codeStatus.valid
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {codeStatus.valid ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {codeStatus.message}
                </p>
              )}
              {errors.signupCode && (
                <p className="text-xs text-red-600">{errors.signupCode.message}</p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner />
            ) : hasFee ? (
              `Create Account & Pay GHS ${signupFee.amount.toFixed(2)}`
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      )}

      <AuthFooterLink href="/login" prompt="Already have an account?" cta="Sign in" />
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><Spinner className="h-6 w-6 text-brand-600" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
