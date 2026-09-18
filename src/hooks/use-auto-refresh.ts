"use client";

import * as React from "react";

export interface UseAutoRefreshOptions {
  /** Refresh interval in seconds. 0 or null disables auto-refresh. Defaults to 30. */
  intervalSeconds?: number;
  /** Callback to invoke on each refresh. Can be synchronous or asynchronous. */
  onRefresh: () => void | Promise<void>;
  /** Master toggle to enable/disable auto-refresh. Defaults to true. */
  enabled?: boolean;
  /** Whether to pause the timer when the browser tab is hidden. Defaults to true. */
  pauseOnHidden?: boolean;
  /** Whether to refresh immediately when the tab becomes visible if elapsed. Defaults to true. */
  refreshOnVisible?: boolean;
  /** Whether to pause when offline. Defaults to true. */
  pauseOnOffline?: boolean;
}

export interface UseAutoRefreshReturn {
  /** Seconds remaining until the next automatic refresh. */
  secondsRemaining: number;
  /** Whether a refresh is currently executing. */
  isRefreshing: boolean;
  /** Whether auto-refresh is currently paused (by user, tab hidden, or offline). */
  isPaused: boolean;
  /** True if the user manually toggled pause. */
  isManuallyPaused: boolean;
  /** Toggle manual pause on or off. */
  togglePause: () => void;
  /** Set manual pause state explicitly. */
  setManuallyPaused: (paused: boolean) => void;
  /** Trigger an immediate refresh and reset the countdown timer. */
  triggerRefresh: () => void;
  /** Timestamp of the last successful refresh. */
  lastRefreshedAt: Date | null;
  /** Current active interval in seconds. */
  intervalSeconds: number;
  /** Set a new interval in seconds. */
  setIntervalSeconds: (seconds: number) => void;
}

export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const {
    intervalSeconds: initialInterval = 30,
    onRefresh,
    enabled = true,
    pauseOnHidden = true,
    refreshOnVisible = true,
    pauseOnOffline = true,
  } = options;

  const [intervalSeconds, setIntervalSecondsState] = React.useState(initialInterval);
  const [isManuallyPaused, setManuallyPaused] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState(initialInterval);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(null);
  const [isTabVisible, setIsTabVisible] = React.useState(true);
  const [isOnline, setIsOnline] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Keep latest onRefresh ref to prevent timer re-creations
  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Synchronize interval state when initial prop changes
  React.useEffect(() => {
    setIntervalSecondsState(initialInterval);
    setSecondsRemaining(initialInterval);
  }, [initialInterval]);

  const setIntervalSeconds = React.useCallback((seconds: number) => {
    setIntervalSecondsState(seconds);
    setSecondsRemaining(seconds);
  }, []);

  const isPaused =
    !enabled ||
    intervalSeconds <= 0 ||
    isManuallyPaused ||
    (pauseOnHidden && !isTabVisible) ||
    (pauseOnOffline && !isOnline);

  const triggerRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    setSecondsRemaining(intervalSeconds);
    try {
      await Promise.resolve(onRefreshRef.current());
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("Auto-refresh error:", err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 600);
    }
  }, [intervalSeconds]);

  // Track visibility state
  React.useEffect(() => {
    if (typeof document === "undefined" || !pauseOnHidden) return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);

      if (visible && refreshOnVisible && !isManuallyPaused && enabled && intervalSeconds > 0) {
        void triggerRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pauseOnHidden, refreshOnVisible, isManuallyPaused, enabled, intervalSeconds, triggerRefresh]);

  // Track online status
  React.useEffect(() => {
    if (typeof window === "undefined" || !pauseOnOffline) return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [pauseOnOffline]);

  const togglePause = React.useCallback(() => {
    setManuallyPaused((prev) => !prev);
  }, []);

  // 1-second countdown ticker
  React.useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused]);

  // Trigger refresh when timer reaches 0
  React.useEffect(() => {
    if (secondsRemaining === 0 && !isPaused && !isRefreshing) {
      void triggerRefresh();
    }
  }, [secondsRemaining, isPaused, isRefreshing, triggerRefresh]);

  return {
    secondsRemaining,
    isRefreshing,
    isPaused,
    isManuallyPaused,
    togglePause,
    setManuallyPaused,
    triggerRefresh,
    lastRefreshedAt,
    intervalSeconds,
    setIntervalSeconds,
  };
}
