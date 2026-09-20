"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastClickRef = React.useRef<{ href: string; time: number }>({ href: "", time: 0 });

  // Reset and hide progress bar when route transition finishes
  React.useEffect(() => {
    if (visible) {
      setProgress(100);
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      return () => clearTimeout(hideTimer);
    }
  }, [pathname]);

  const startProgress = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);

    setVisible(true);
    setProgress(15);

    // Eased animation advancing by (90 - prev) / 8 every 120ms
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const next = prev + (90 - prev) / 8;
        return Math.min(next, 90);
      });
    }, 120);

    // 10-second safety auto-dismiss timeout to prevent frozen progress bars
    safetyTimeoutRef.current = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
    }, 10000);
  }, []);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignore modified clicks (cmd, ctrl, shift, alt) or non-primary mouse clicks
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      // Find closest anchor
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external, target=_blank, download, mailto, tel, hash-only
      if (
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
      ) {
        return;
      }

      // Check external URLs
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      // If linking to current URL with hash only, ignore
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
        return;
      }

      // Debounce same-href clicks within 600ms (prevents double-clicks)
      const now = Date.now();
      if (lastClickRef.current.href === href && now - lastClickRef.current.time < 600) {
        e.preventDefault();
        return;
      }
      lastClickRef.current = { href, time: now };

      // Don't animate if clicking link to current exact route
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      startProgress();
    };

    window.addEventListener("click", handleClick, { capture: true });
    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, [startProgress]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 bg-transparent overflow-hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-blue-600 via-violet-600 to-amber-400 shadow-[0_0_8px_rgba(124,58,237,0.8)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
