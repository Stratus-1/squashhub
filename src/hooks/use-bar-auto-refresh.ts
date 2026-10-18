import { useEffect, useRef } from "react";

/** Read-only refresh for PIN/token-scoped bar screens, including mobile resume. */
export function useBarAutoRefresh(enabled: boolean, refresh: () => Promise<unknown>) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    const check = async () => {
      if (stopped || running) return;
      running = true;
      try { await latest.current(); }
      catch { /* Preserve the last known state and retry after network failure. */ }
      finally { running = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const timer = window.setInterval(check, 5000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
}