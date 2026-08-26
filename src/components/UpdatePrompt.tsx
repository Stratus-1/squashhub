import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SW_UPDATE_EVENT,
  applyPendingUpdate,
  hasPendingUpdate,
  isCriticalUpdate,
  isUpdateOfferable,
  setPendingWriteFlusher,
  setUpdateClubContext,
  snoozeUpdate,
} from "@/lib/pwa-update";
import { useClubContext } from "@/contexts/ClubContext";
import { isBusy, subscribeActivity } from "@/lib/app-activity";

/**
 * Safe silent update surface.
 *
 * Deliberately tiny: a small pill in the bottom corner, never an overlay and
 * never a blocking banner. It only appears at a "safe moment" — after a route
 * change, after the current task finishes, or when the user returns to the tab
 * — so nobody is interrupted mid-flow. Critical security releases are the one
 * exception and reload after a short countdown.
 */
export function UpdatePrompt() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { club } = useClubContext();

  useEffect(() => {
    setUpdateClubContext(club?.id ?? null);
  }, [club?.id]);

  const [pending, setPending] = useState(hasPendingUpdate);
  const [armed, setArmed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const pendingPath = useRef<string | null>(null);
  const critical = pending && isCriticalUpdate();

  // Let the update engine wait for in-flight writes before reloading.
  useEffect(() => {
    setPendingWriteFlusher(async () => {
      const start = Date.now();
      while (queryClient.isMutating() > 0 && Date.now() - start < 3000) {
        await new Promise((r) => setTimeout(r, 150));
      }
    });
    return () => setPendingWriteFlusher(null);
  }, [queryClient]);

  // Track the waiting-worker / cohort / snooze state.
  useEffect(() => {
    const sync = () => {
      const has = hasPendingUpdate();
      setPending(has);
      if (has && pendingPath.current === null) {
        pendingPath.current = location.pathname;
      }
      if (!has) {
        pendingPath.current = null;
        setArmed(false);
      }
    };
    sync();
    window.addEventListener(SW_UPDATE_EVENT, sync);
    return () => window.removeEventListener(SW_UPDATE_EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safe moment #1: the user navigated to another page.
  useEffect(() => {
    if (!pending) return;
    if (pendingPath.current === null) {
      pendingPath.current = location.pathname;
      return;
    }
    if (location.pathname !== pendingPath.current) setArmed(true);
  }, [location.pathname, pending]);

  // Safe moment #2: the current task finished (activity dropped to idle).
  useEffect(() => {
    const wasBusy = { current: isBusy() };
    return subscribeActivity((nowBusy) => {
      if (wasBusy.current && !nowBusy) setArmed(true);
      wasBusy.current = nowBusy;
    });
  }, []);

  // Safe moment #3: the user came back to the tab / app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isBusy()) setArmed(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const doUpdate = useCallback(async () => {
    setBusy(true);
    try {
      await applyPendingUpdate();
    } finally {
      setBusy(false);
    }
  }, []);

  // Critical release: short countdown, then a graceful forced reload.
  useEffect(() => {
    if (!critical) return;
    setCountdown(20);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(t);
          void doUpdate();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [critical, doUpdate]);

  const offerable = pending && isUpdateOfferable();
  const show = offerable && (critical || armed);
  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed right-3 z-40 print:hidden",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:bottom-4",
      )}
    >
      {expanded || critical ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur px-3 py-1.5 shadow-lg">
          {critical ? (
            <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span className="text-xs text-muted-foreground">
            {critical
              ? `Security update${countdown !== null ? ` in ${countdown}s` : ""}`
              : "Update to the latest version?"}
          </span>
          <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={doUpdate}>
            {busy ? "Updating…" : "Update"}
          </Button>
          {!critical && (
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                snoozeUpdate();
                setPending(hasPendingUpdate());
                setArmed(false);
              }}
              aria-label="Later"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="A new version is available — update"
          className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-primary" />
          Update
        </button>
      )}
    </div>
  );
}
