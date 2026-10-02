"use client";

import * as React from "react";

/**
 * The current time, refreshed every `intervalMs`. For countdowns that must keep
 * moving while the page is open, like the 24-hour window in the Inbox.
 *
 * Starts at the render-time clock so server and client agree on first paint,
 * then ticks. The interval pauses itself when the tab is hidden and catches up
 * the moment it's visible again.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(() => {
      if (!document.hidden) tick();
    }, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return now;
}
