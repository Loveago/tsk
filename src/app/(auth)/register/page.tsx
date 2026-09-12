"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { CheckCircle2, XCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [signupCodeMode, setSignupCodeMode] = useState<"DISABLED" | "OPTIONAL" | "REQUIRED">("OPTIONAL");
  const [codeStatus, setCodeStatus] = useState<{ checked: boolean; valid: boolean; message?: string } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const enteredCode = watch("signupCode");

  useEffect(() => {
    fetch("/api/auth/signup-code-mode")
      .then((r) => r.json())
      .then((data) => {
        if (data.mode) setSignupCodeMode(data.mode);
      })
      .catch(() => {});
  }, []);

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
          message: data.valid ? "✓ Valid signup code" : (data.message || "Invalid or expired signup code"),
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
    toast("Account created. Welcome to Clickyfied!", "success");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <AuthShell title="Create your account" subtitle="Start sending data bundles in minutes">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {serverError}
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
          {isSubmitting && <Spinner />} Create account
        </Button>
      </form>
      <AuthFooterLink href="/login" prompt="Already have an account?" cta="Sign in" />
    </AuthShell>
  );
}
