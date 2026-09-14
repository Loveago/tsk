"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { ArrowLeft, KeyRound, RefreshCw } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  // OTP State
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [otpTicket, setOtpTicket] = useState<string>("");
  const [otpEmail, setOtpEmail] = useState<string>("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string>("");
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Login failed");
      return;
    }

    if (json.requireOtp) {
      setOtpTicket(json.ticket);
      setOtpEmail(json.email);
      if (json.devOtp) setDevOtp(json.devOtp);
      setStep("otp");
      toast("Verification code sent to your email", "info");
      return;
    }

    toast("Welcome back!", "success");
    router.push("/dashboard");
    router.refresh();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) return;

    setServerError(null);
    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: otpTicket, code: otpCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Verification failed");
        return;
      }
      toast("Welcome back!", "success");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Network error verifying code");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpTicket || resending) return;
    setServerError(null);
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: otpTicket }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Failed to resend code");
        return;
      }
      if (json.ticket) setOtpTicket(json.ticket);
      if (json.devOtp) setDevOtp(json.devOtp);
      toast("A new verification code has been sent", "success");
    } catch {
      setServerError("Network error requesting new code");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={step === "otp" ? "Two-Factor Verification" : "Welcome back"}
      subtitle={
        step === "otp"
          ? `Enter the 6-digit code sent to ${otpEmail}`
          : "Sign in to your Tskconnect account"
      }
    >
      {serverError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {serverError}
        </div>
      )}

      {step === "otp" ? (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-center dark:border-sky-950 dark:bg-sky-950/40">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-brand-600 dark:bg-sky-900/60 dark:text-brand-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              We sent a temporary code to <strong className="text-slate-900 dark:text-white">{otpEmail}</strong>.
            </p>
            {devOtp && (
              <div className="mt-2 text-xs font-mono font-medium text-amber-700 dark:text-amber-400">
                Dev OTP: <span className="underline">{devOtp}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="otpCode" className="text-center block">Verification Code</Label>
            <Input
              id="otpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="text-center font-mono text-2xl tracking-[0.5em] h-12 font-bold"
            />
          </div>

          <Button type="submit" className="w-full" disabled={otpCode.length !== 6 || verifyingOtp}>
            {verifyingOtp && <Spinner />} Verify & Sign In
          </Button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setOtpCode("");
                setServerError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </button>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resending}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} />
              {resending ? "Sending..." : "Resend code"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          <div className="flex justify-end">
            <a
              href="/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Forgot password?
            </a>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} Sign in
          </Button>
        </form>
      )}

      <AuthFooterLink href="/register" prompt="Don't have an account?" cta="Create one" />
    </AuthShell>
  );
}
