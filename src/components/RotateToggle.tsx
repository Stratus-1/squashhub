import { useEffect, useState } from "react";
import { Smartphone, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";

/**
 * Toggle to force landscape orientation on the current screen.
 * Uses the Capacitor ScreenOrientation plugin on native builds, and
 * falls back to the web Screen Orientation API on PWA / browsers.
 * Always unlocks orientation on unmount so other pages aren't stuck.
 */
export function RotateToggle({ className }: { className?: string }) {
  const [landscape, setLandscape] = useState(false);
  const [busy, setBusy] = useState(false);

  const lock = async (orientation: "landscape" | "portrait") => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const { ScreenOrientation } = await import("@capacitor/screen-orientation");
        await ScreenOrientation.lock({ orientation });
      } else if (typeof screen !== "undefined" && (screen.orientation as any)?.lock) {
        try {
          // Some browsers require fullscreen first; ignore failures.
          if (orientation === "landscape" && document.fullscreenEnabled && !document.fullscreenElement) {
            await document.documentElement.requestFullscreen().catch(() => {});
          }
          await (screen.orientation as any).lock(orientation);
        } catch {
          /* unsupported on this browser */
        }
      }
      setLandscape(orientation === "landscape");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { ScreenOrientation } = await import("@capacitor/screen-orientation");
        await ScreenOrientation.unlock();
      } else if (typeof screen !== "undefined" && (screen.orientation as any)?.unlock) {
        try { (screen.orientation as any).unlock(); } catch { /* noop */ }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } finally {
      setLandscape(false);
    }
  };

  // Always release orientation lock when the page unmounts.
  useEffect(() => () => { void unlock(); }, []);

  const toggle = () => (landscape ? unlock() : lock("landscape"));

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={toggle}
      className={className}
      title={landscape ? "Return to portrait" : "Rotate to landscape"}
    >
      {landscape ? <Smartphone className="h-4 w-4 mr-1" /> : <RotateCw className="h-4 w-4 mr-1" />}
      {landscape ? "Portrait" : "Landscape"}
    </Button>
  );
}
