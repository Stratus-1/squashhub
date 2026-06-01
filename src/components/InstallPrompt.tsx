import { useEffect, useState } from "react";
import { Download, X, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { useClubContext } from "@/contexts/ClubContext";
import { getDecision, setDecision, shouldAsk } from "@/lib/permission-cache";
import {
  isStandalone as detectStandalone,
  wasInstalled,
  handleReinstallSignal,
  recordInstalled,
} from "@/lib/pwa-detect";


type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && "ontouchend" in document);
}

export function InstallPrompt() {
  const { subdomain } = useClubContext();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosSheet, setIosSheet] = useState(false);

  // Restrict per project memory: only club subdomains trigger install prompts.
  const allowedHost = !!subdomain;

  useEffect(() => {
    if (!allowedHost) return;
    if (Capacitor.isNativePlatform()) return;
    // Already running as installed PWA — never show install card.
    if (detectStandalone()) return;

    // Android / Chromium
    const onBip = (e: Event) => {
      e.preventDefault();
      // Browser only fires this when app is NOT installed. If we had a
      // cached "installed/granted" state, the user uninstalled — wipe
      // the stale flags so we can prompt them again.
      handleReinstallSignal();
      setDeferred(e as BeforeInstallPromptEvent);
      if (shouldAsk("install-prompt-android")) {
        // Slight delay so it doesn't fight with auth UX
        setTimeout(() => setShow(true), 4000);
      }
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS — no `beforeinstallprompt`. If we previously cached "installed"
    // but we are clearly not running standalone, the user uninstalled —
    // reset the cached prompt decision so the A2HS hint can show again.
    if (isIos() && wasInstalled() && !detectStandalone()) {
      handleReinstallSignal();
    }

    // iOS — no event, show our own A2HS hint after a few seconds.
    if (isIos() && shouldAsk("install-prompt-ios")) {
      const t = setTimeout(() => {
        setIosSheet(true);
        setShow(true);
      }, 5000);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBip);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [allowedHost]);

  // Listen for actual installation
  useEffect(() => {
    const onInstalled = () => {
      recordInstalled();
      setShow(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);


  if (!allowedHost || !show) return null;

  const handleInstall = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        setDecision(
          "install-prompt-android",
          choice.outcome === "accepted" ? "granted" : "dismissed"
        );
      } catch {
        setDecision("install-prompt-android", "dismissed");
      }
      setDeferred(null);
      setShow(false);
    }
  };

  const handleDismiss = () => {
    if (iosSheet) setDecision("install-prompt-ios", "dismissed");
    else setDecision("install-prompt-android", "dismissed");
    setShow(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        className="fixed bottom-4 left-4 right-4 z-[60] max-w-md mx-auto"
      >
        <Card className="border-primary/30 shadow-xl">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {iosSheet ? <Share2 className="w-5 h-5 text-primary" /> : <Download className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Install the app</p>
                {iosSheet ? (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Tap <Share2 className="inline w-3 h-3 mx-0.5" /> <span className="font-medium">Share</span> in Safari,
                    then choose <span className="font-medium">"Add to Home Screen"</span>.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add SquashHub to your home screen for a faster, full-screen experience.
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  {!iosSheet && (
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
                    {iosSheet ? "Got it" : "Not now"}
                  </Button>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
