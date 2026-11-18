import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** After this long on the opening spinner we offer a retry. */
export const STARTUP_SLOW_AFTER_MS = 12_000;

/**
 * Full-screen loading spinner used while the app opens. If loading takes
 * longer than usual (e.g. the backend is busy on a league night) it says so
 * and offers a retry instead of spinning forever. Display-only: retrying just
 * reloads the page.
 */
// Opening the app passes through several loading gates in a row, each showing
// this spinner. Treat back-to-back spinners as one wait so the timer does not
// restart at every gate.
let chainStartedAt = 0;
let lastHiddenAt = 0;
const CHAIN_GAP_MS = 1_000;

export function StartupSpinner({ slowAfterMs = STARTUP_SLOW_AFTER_MS }: { slowAfterMs?: number }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (!chainStartedAt || now - lastHiddenAt > CHAIN_GAP_MS) chainStartedAt = now;
    const remaining = Math.max(0, slowAfterMs - (now - chainStartedAt));
    const t = window.setTimeout(() => setSlow(true), remaining);
    return () => {
      window.clearTimeout(t);
      lastHiddenAt = Date.now();
    };
  }, [slowAfterMs]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" />
      {slow && (
        <div role="status" className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Taking longer than usual…</p>
          <Button size="sm" onClick={() => window.location.reload()}>
            Tap to retry
          </Button>
        </div>
      )}
    </div>
  );
}

export default StartupSpinner;
