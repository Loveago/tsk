"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Send,
  ClipboardList,
  FileWarning,
  CheckCircle2,
  MessageCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Check,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TourStep {
  id: string;
  badge: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  description: string;
  tip: string;
  targetHref: string;
  targetLabel: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "wallet",
    badge: "Step 1 of 6 • Getting Started",
    title: "Fund Your Wallet & Top Up",
    icon: Wallet,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    description:
      "Your available balance is displayed at the top of every screen. Before sending orders, click '+ Top up' to deposit funds instantly via Mobile Money (MoMo) or Card on the Billing page.",
    tip: "Your balance updates instantly in real time once your payment is confirmed.",
    targetHref: "/dashboard/billing",
    targetLabel: "Go to Billing & Top Up",
  },
  {
    id: "send",
    badge: "Step 2 of 6 • Core Dispatch",
    title: "Place & Dispatch Data Orders",
    icon: Send,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/20",
    description:
      "This is your dispatch hub. Select your network (MTN, Telecel, AT), paste numbers with GB (e.g. 0244123456 5gb), or upload Excel/CSV files. We automatically check and clean phone numbers for you!",
    tip: "You can send single orders or paste hundreds of numbers at once.",
    targetHref: "/dashboard/send",
    targetLabel: "Go to Send Orders",
  },
  {
    id: "orders",
    badge: "Step 3 of 6 • Live Tracking",
    title: "Track Sent Orders in Real-Time",
    icon: ClipboardList,
    iconColor: "text-violet-500",
    iconBg: "bg-violet-500/10 dark:bg-violet-500/20",
    description:
      "Monitor all your dispatched orders in live view. Check pending, processing, and completed batches, search by phone number, filter by date, download official receipts, and retry failed dispatches.",
    tip: "The status indicators update automatically without needing to reload the page.",
    targetHref: "/dashboard/orders",
    targetLabel: "View Sent Orders",
  },
  {
    id: "not-received",
    badge: "Step 4 of 6 • Protection",
    title: "Report 'Not Received' Issues",
    icon: FileWarning,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
    description:
      "If a customer didn't receive their bundle within 24 hours of completion, easily submit a 'Not Received' report here. Our support team investigates and responds with proof of delivery or a refund.",
    tip: "You can monitor admin responses and resolution status directly inside the report.",
    targetHref: "/dashboard/not-received",
    targetLabel: "View Not Received Reports",
  },
  {
    id: "mtn-api",
    badge: "Step 5 of 6 • Verification & Tools",
    title: "Verify Numbers & Developer API",
    icon: CheckCircle2,
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10 dark:bg-indigo-500/20",
    description:
      "Use our MTN Verification tool to check subscriber eligibility and prevent failed transfers. If you have your own website or app, generate API keys and integrate automatic dispatching.",
    tip: "Full documentation and ready-to-use curl and JavaScript examples are included.",
    targetHref: "/dashboard/api",
    targetLabel: "Explore Developer API",
  },
  {
    id: "support",
    badge: "Step 6 of 6 • 24/7 Assistance",
    title: "Instant Live Support & Help",
    icon: MessageCircle,
    iconColor: "text-rose-500",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/20",
    description:
      "Have questions or need assistance? Click the chat widget in the bottom right corner anytime to speak directly with our team. You can also reach us via WhatsApp, Telegram, or phone in the footer.",
    tip: "Our support agents are available around the clock to help keep your business running.",
    targetHref: "/dashboard/send",
    targetLabel: "Got It!",
  },
];

const STORAGE_KEY = "tsk_user_walkthrough_completed_v1";

export function UserWalkthrough({ userName }: { userName?: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"welcome" | "tour" | "completed">("welcome");
  const [currentStep, setCurrentStep] = React.useState(0);

  // Check if first-time visitor on mount
  React.useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Small delay so page finishes initial layout before showing friendly welcome
        const timer = setTimeout(() => {
          setMode("welcome");
          setIsOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage disabled or not available
    }
  }, []);

  // Listen for custom trigger event (e.g. from header "Tour" button)
  React.useEffect(() => {
    const handleOpen = () => {
      setCurrentStep(0);
      setMode("tour");
      setIsOpen(true);
    };

    window.addEventListener("open-user-walkthrough", handleOpen);
    return () => window.removeEventListener("open-user-walkthrough", handleOpen);
  }, []);

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (mode === "tour") {
        if (e.key === "ArrowRight") {
          handleNext();
        } else if (e.key === "ArrowLeft") {
          handlePrev();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, mode, currentStep]);

  const handleClose = () => {
    setIsOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
  };

  const handleStartTour = () => {
    setCurrentStep(0);
    setMode("tour");
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setMode("completed");
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinish = (targetHref?: string) => {
    handleClose();
    if (targetHref) {
      router.push(targetHref);
    }
  };

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step?.icon;
  const progressPercent = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Dimmed backdrop with subtle blur */}
      <div
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Main interactive tour card */}
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl transition-all duration-300 dark:border-white/10 dark:bg-[#0f172a] dark:text-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-heading"
      >
        {/* Top Accent Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />

        {/* ── MODE 1: WELCOME SCREEN ── */}
        {mode === "welcome" && (
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-600 text-white shadow-md shadow-brand-500/25">
                <Sparkles className="h-6 w-6" />
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close welcome guide"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-600 dark:text-brand-400">
                <Zap className="h-3.5 w-3.5" /> Welcome to TSK Connect
              </div>
              <h2 id="tour-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {userName ? `Hi, ${userName}!` : "Welcome Aboard!"} 👋
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                We’re excited to have you! TSK Connect makes it fast and reliable to send bulk data bundles, top up your wallet, and manage deliveries.
              </p>
            </div>

            {/* Feature quick highlights */}
            <div className="grid grid-cols-2 gap-3 py-1 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-white/5 dark:bg-white/5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Instant Top Up</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">MoMo & Card</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-white/5 dark:bg-white/5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Fast Orders</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">MTN, Telecel, AT</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-white/5 dark:bg-white/5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Live Tracking</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Real-time status</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-white/5 dark:bg-white/5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <FileWarning className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Buyer Protection</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Not Received flow</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                onClick={handleStartTour}
                className="w-full sm:flex-1 h-11 gap-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold shadow-lg shadow-blue-600/25 hover:opacity-95 cursor-pointer"
              >
                <span>Take a 60-Sec Tour</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="w-full sm:w-auto h-11 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Skip for now
              </Button>
            </div>
          </div>
        )}

        {/* ── MODE 2: INTERACTIVE TOUR STEPS ── */}
        {mode === "tour" && step && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Header with progress & close */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                {step.badge}
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Skip tour"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Step Icon & Headline */}
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-xs",
                  step.iconBg,
                  step.iconColor
                )}
              >
                <StepIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 id="tour-heading" className="text-xl font-bold text-slate-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
              </div>
            </div>

            {/* Pro tip callout */}
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-3.5 text-xs text-brand-900 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-200">
              <span className="font-semibold">{step.tip}</span>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer",
                  currentStep === 0
                    ? "opacity-30 cursor-not-allowed text-slate-400"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>

              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => setCurrentStep(idx)}
                    aria-label={`Go to step ${idx + 1}`}
                    className={cn(
                      "h-2 rounded-full transition-all cursor-pointer",
                      idx === currentStep
                        ? "w-6 bg-brand-600 dark:bg-brand-400"
                        : "w-2 bg-slate-200 hover:bg-slate-300 dark:bg-white/20 dark:hover:bg-white/30"
                    )}
                  />
                ))}
              </div>

              <Button
                onClick={handleNext}
                className="h-9 gap-1.5 bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-xs font-bold text-white shadow hover:opacity-95 cursor-pointer"
              >
                <span>{currentStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── MODE 3: CELEBRATION / COMPLETION SCREEN ── */}
        {mode === "completed" && (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-inner">
              <Check className="h-8 w-8 stroke-[3]" />
            </div>

            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" /> Tour Completed!
              </span>
              <h2 id="tour-heading" className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                You&apos;re All Set to Go! 🚀
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                You can revisit this quick guide anytime by clicking the <span className="font-semibold text-brand-600 dark:text-brand-400">💡 Tour</span> button in the top navigation bar.
              </p>
            </div>

            {/* Quick action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
              <button
                type="button"
                onClick={() => handleFinish("/dashboard/billing")}
                className="group relative flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-brand-500 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:border-brand-400 cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600 dark:group-hover:text-brand-400" />
                </div>
                <div className="mt-4">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Top Up Wallet</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Fund your account via MoMo or Card</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleFinish("/dashboard/send")}
                className="group relative flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-brand-500 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:border-brand-400 cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Send className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600 dark:group-hover:text-brand-400" />
                </div>
                <div className="mt-4">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Place Orders</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Select bundles and dispatch</div>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => handleFinish()}
                className="w-full h-11 bg-slate-900 font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 cursor-pointer"
              >
                Get Started
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Header trigger button allowing users to reopen the walkthrough at any time. */
export function TourLauncherButton({ className }: { className?: string }) {
  const triggerTour = () => {
    window.dispatchEvent(new CustomEvent("open-user-walkthrough"));
  };

  return (
    <button
      type="button"
      onClick={triggerTour}
      title="Take a quick tour of the platform"
      aria-label="Take a quick tour of the platform"
      className={cn(
        "group flex h-7 items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50/80 px-2.5 text-[11px] font-bold text-amber-900 transition-all hover:bg-amber-100 hover:shadow-xs active:scale-95 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20 cursor-pointer",
        className
      )}
    >
      <HelpCircle className="h-3.5 w-3.5 text-amber-600 transition-transform group-hover:rotate-12 dark:text-amber-400" />
      <span>Tour</span>
    </button>
  );
}
