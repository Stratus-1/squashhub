import { useEffect, useMemo, useRef, useState } from "react";
import { useClubContext } from "@/contexts/ClubContext";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share2, PlusSquare, Smartphone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "gb-install-prompt-dismissed";

function isStandalone() {
  try {
    const mm = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const iosStandalone = (window.navigator as any)?.standalone === true;
    return !!mm || !!iosStandalone;
  } catch {
    return false;
  }
}

function isIosDevice() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua) && !(window as any).MSStream;
}

function isAndroidDevice() {
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua);
}

export function InstallAppPrompt() {
  const { subdomain, club } = useClubContext();
  const appName = club?.name || "SquashHub";
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const installInFlight = useRef(false);

  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);
  const isIos = useMemo(() => (!isNative ? isIosDevice() : false), [isNative]);
  const isAndroid = useMemo(() => (!isNative ? isAndroidDevice() : false), [isNative]);
  const isMobile = isIos || isAndroid;

  useEffect(() => {
    if (isNative) return;

    setInstalled(isStandalone());

    const onBip = (e: Event) => {
      e.preventDefault?.();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setShow(false);
      try {
        localStorage.setItem(DISMISSED_KEY, Date.now().toString());
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeinstallprompt", onBip as any);
    window.addEventListener("appinstalled", onAppInstalled as any);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip as any);
      window.removeEventListener("appinstalled", onAppInstalled as any);
    };
  }, [isNative]);

  useEffect(() => {
    if (installed || isNative) return;
    try {
      const dismissedAt = localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
        if (daysSince < 3) return;
      }
    } catch {
      // ignore
    }

    const t = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(t);
  }, [installed, isNative]);

  const onDismiss = () => {
    setDismissed(true);
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  const canAndroidPromptInstall = isAndroid && !!deferredPrompt;

  const onAndroidInstall = async () => {
    if (!canAndroidPromptInstall || !deferredPrompt) return;
    if (installInFlight.current) return;
    installInFlight.current = true;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      onDismiss();
    } finally {
      installInFlight.current = false;
    }
  };

  // Only show on club subdomains, not the root marketing site
  if (!show || dismissed || installed || isNative || !isMobile || !subdomain) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom,0px)+120px)] z-[60] px-3"
        >
          <Card className="p-3 shadow-lg border-primary/20">
            <div className="flex items-start gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", "bg-primary/10")}>
                {isIos ? <Share2 className="w-5 h-5 text-primary" /> : <Download className="w-5 h-5 text-primary" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{`Install ${appName}`}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {`Install ${appName} so it opens faster and feels like a real app.`}
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  {canAndroidPromptInstall ? (
                    <Button size="sm" className="h-8 text-xs" onClick={onAndroidInstall}>
                      Install
                    </Button>
                  ) : (
                    <Button size="sm" className="h-8 text-xs" onClick={() => setHelpOpen(true)}>
                      How to install
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onDismiss}>
                    Not now
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{`Install ${appName}`}</DialogTitle>
            <DialogDescription>
              {isIos
                ? "On iPhone, use Safari's \"Add to Home Screen\" feature."
                : "Use your browser menu to add this app to your home screen."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {isIos ? (
              <>
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-primary mt-0.5" />
                  <p>Open this site in <strong>Safari</strong> (recommended).</p>
                </div>
                <div className="flex items-start gap-3">
                  <Share2 className="w-5 h-5 text-primary mt-0.5" />
                  <p>Tap the <strong>Share</strong> button.</p>
                </div>
                <div className="flex items-start gap-3">
                  <PlusSquare className="w-5 h-5 text-primary mt-0.5" />
                  <p>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-primary mt-0.5" />
                  <p>Tap the <strong>three-dot menu</strong> (&#8942;) in the top-right of your browser.</p>
                </div>
                <div className="flex items-start gap-3">
                  <PlusSquare className="w-5 h-5 text-primary mt-0.5" />
                  <p>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-primary mt-0.5" />
                  <p>Tap <strong>Install</strong> to confirm.</p>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: Push notifications only work reliably when the app is installed to your Home Screen.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setHelpOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
