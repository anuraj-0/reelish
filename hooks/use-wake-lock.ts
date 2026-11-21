"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type WakeLockState = "unsupported" | "pending" | "active" | "denied";

const noopSubscribe = () => () => {};

/** Keeps the screen on while `enabled`, re-acquiring after the tab becomes visible again. */
export function useWakeLock(enabled: boolean): WakeLockState {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "wakeLock" in navigator,
    () => true, // assume support during SSR; corrected on hydration
  );
  const [state, setState] = useState<Exclude<WakeLockState, "unsupported">>("pending");

  useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setState("active");
        s.addEventListener("release", () => {
          if (!cancelled) setState("pending");
        });
      } catch {
        if (!cancelled) setState("denied"); // e.g. battery saver, or not allowed in this context
      }
    };

    void acquire();
    // The browser releases the lock when the tab is hidden; take it back on return.
    const onVisible = () => {
      if (!sentinel || sentinel.released) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [enabled, supported]);

  return supported ? state : "unsupported";
}
