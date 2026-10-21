import { useEffect, useRef } from "react";
import { isBusy } from "@/lib/app-activity";
import { SW_UPDATE_EVENT, applyPendingUpdate, hasPendingUpdate } from "@/lib/pwa-update";

/**
 * Counter tablets stay open all day, so they never get a "safe moment" to show
 * the update pill. Check for a new app build every few minutes and reload
 * automatically while the counter is idle (no tab open, nothing being saved).
 */
export function useCounterAutoUpdate(idle: boolean) {
  const idleRef = useRef(idle);
  idleRef.current = idle;
  useEffect(() => {
    const tryApply = () => {
      if (idleRef.current && hasPendingUpdate() && !isBusy()) void applyPendingUpdate();
    };
    const checkForBuild = () => {
      void navigator.serviceWorker?.getRegistration?.().then(r => r?.update()).catch(() => {});
      tryApply();
    };
    window.addEventListener(SW_UPDATE_EVENT, tryApply);
    const timer = window.setInterval(checkForBuild, 3 * 60_000);
    checkForBuild();
    return () => { window.removeEventListener(SW_UPDATE_EVENT, tryApply); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (idle && hasPendingUpdate() && !isBusy()) void applyPendingUpdate(); }, [idle]);
}
