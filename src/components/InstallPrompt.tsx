import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, X, Share2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import {
  canShowInstallPrompt,
  detectPlatform,
  isIosSafariUa,
  isPreviewContext,
  markInstallCompleted,
  readInstallCompleted,
  readSnoozedUntil,
  writeSnooze,
  clearInstallCompleted,
  clearSnooze,
} from "@/lib/pwa-install";
import { isStandalone as detectStandalone, recordInstalled } from "@/lib/pwa-detect";
import {
  consumeInstallPromptEvent,
  getInstallPromptEvent,
  subscribeToInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install-event";

// Routes where the install prompt must never appear — it can overlap
// form buttons and block the user from finishing a task.
const BLOCKED_PATH_PREFIXES = [
  "/auth",
  "/club-auth",
  "/register-club",
  "/reset-password",
  "/set-password",
  "/onboarding",
  "/league-signup",
  "/booking-response",
  "/marker",
  "/bells-marker",
  "/match-marker",
  "/match-tracker",
];

/**
 * First-party INSTALL prompt (distinct from the update banner).
 * Desktop Chromium/Edge, Android Chromium: driven by a real captured
 * `beforeinstallprompt`. iOS Safari: manual Add-to-Home-Screen guidance.
 */
export function InstallPrompt() {
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => getInstallPromptEvent());
  const [iosSheet, setIosSheet] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const blockedRoute = BLOCKED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const platform = detectPlatform(ua, typeof document !== "undefined" && "ontouchend" in document);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || isPreviewContext()) return;

    const onBip = (e: BeforeInstallPromptEvent | null) => {
      if (!e) {
        setDeferred(null);
        return;
      }
      // The browser only fires this when the app is NOT installed. If we had
      // stale "installed"/snooze state, the user uninstalled — reset it.
      if (!detectStandalone() && readInstallCompleted()) {
        clearInstallCompleted();
        clearSnooze();
      }
      setDeferred(e);
    };
    const onInstalled = () => {
      markInstallCompleted();
      recordInstalled();
      setDeferred(null);
      setIosSheet(false);
    };

    const unsubscribe = subscribeToInstallPrompt(onBip);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — offer the manual guidance once
    // per browser session, in Safari only.
    let t: number | undefined;
    if (platform === "ios" && isIosSafariUa(ua) && !detectStandalone()) {
      const dismissedThisSession =
        window.sessionStorage.getItem("sh.install.ios.dismissed") === "1";
      if (!dismissedThisSession) {
        t = window.setTimeout(() => setIosSheet(true), 4000);
      }
    }

    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, [platform, ua]);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") markInstallCompleted();
      else writeSnooze();
    } catch {
      writeSnooze();
    }
    consumeInstallPromptEvent();
  }, [deferred]);

  const handleDismiss = () => {
    if (iosSheet) {
      try {
        window.sessionStorage.setItem("sh.install.ios.dismissed", "1");
      } catch {
        /* ignore */
      }
      setIosSheet(false);
    } else {
      writeSnooze();
    }
    setDismissed(true);
  };

  const showNative = canShowInstallPrompt({
    standalone: detectStandalone(),
    native: Capacitor.isNativePlatform(),
    preview: isPreviewContext(),
    blockedRoute,
    alreadyInstalled: readInstallCompleted(),
    snoozedUntil: readSnoozedUntil(),
    hasDeferredPrompt: !!deferred,
    now: Date.now(),
  });

  const showIos = iosSheet && !blockedRoute && !detectStandalone();
  const visible = !dismissed && (showNative || showIos);
  if (!visible) return null;

  const desktop = platform === "desktop";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className={
          desktop
            ? // Sit above the small update pill (bottom-4) so the two never overlap.
              "fixed bottom-20 right-6 z-[55] w-[22rem] max-w-[calc(100vw-3rem)]"
            : "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+13rem)] left-4 right-4 z-[55] max-w-md mx-auto"
        }

      >
        <Card className="border-primary/30 shadow-xl">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {showIos ? (
                  <Share2 className="w-5 h-5 text-primary" />
                ) : desktop ? (
                  <Monitor className="w-5 h-5 text-primary" />
                ) : (
                  <Download className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Install SquashHub</p>
                {showIos ? (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Tap <Share2 className="inline w-3 h-3 mx-0.5" />{" "}
                    <span className="font-medium">Share</span> in Safari, then choose{" "}
                    <span className="font-medium">"Add to Home Screen"</span>.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {desktop
                      ? "Install SquashHub on this computer for quicker access."
                      : "Add SquashHub to your home screen for a faster, full-screen experience."}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  {!showIos && (
                    <Button size="sm" onClick={handleInstall} className="text-xs h-8">
                      Install
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    className="text-xs h-8 text-muted-foreground"
                  >
                    {showIos ? "Got it" : "Not now"}
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="-m-2 p-2 text-muted-foreground hover:text-foreground touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
