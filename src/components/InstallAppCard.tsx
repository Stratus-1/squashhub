import { useEffect, useState } from "react";
import { Download, Share2, Smartphone, CheckCircle2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Capacitor } from "@capacitor/core";
import { isStandalone } from "@/lib/pwa-detect";
import { setDecision } from "@/lib/permission-cache";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && "ontouchend" in document);
}

/** iOS only allows "Add to Home Screen" from Safari — not Chrome/Firefox/Edge/in-app browsers. */
function isIosSafari(): boolean {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent || "";
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\//i.test(ua);
}

/**
 * Always-available install helper. iPhones never fire `beforeinstallprompt`,
 * so the only reliable path is showing the Share → Add to Home Screen steps
 * on demand instead of relying on an automatic popup.
 */
export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (Capacitor.isNativePlatform()) return null;

  const alreadyRunningInstalled = installed || isStandalone();
  const ios = isIosDevice();
  const iosSafari = isIosSafari();

  const handleInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDecision("install-prompt-android", choice.outcome === "accepted" ? "granted" : "dismissed");
    } catch {
      /* ignore */
    }
    setDeferred(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          Install on your phone
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground space-y-2">
        {alreadyRunningInstalled ? (
          <p className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            You're already using the installed app.
          </p>
        ) : ios ? (
          iosSafari ? (
            <ol className="list-decimal pl-4 space-y-1 leading-relaxed">
              <li>
                Tap <Share2 className="inline w-3 h-3 mx-0.5" />{" "}
                <span className="font-medium text-foreground">Share</span> at the bottom of Safari.
              </li>
              <li>
                Scroll down and choose{" "}
                <span className="font-medium text-foreground">"Add to Home Screen"</span>.
              </li>
              <li>
                Tap <span className="font-medium text-foreground">Add</span> — the icon appears on your
                home screen.
              </li>
            </ol>
          ) : (
            <p className="flex items-start gap-2 leading-relaxed">
              <Compass className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                On iPhone, apps can only be added to the home screen from{" "}
                <span className="font-medium text-foreground">Safari</span>. Open this page in Safari,
                then tap Share → "Add to Home Screen".
              </span>
            </p>
          )
        ) : deferred ? (
          <div className="space-y-3">
            <p>Add SquashHub to your home screen for a faster, full-screen experience.</p>
            <Button size="sm" className="h-8 text-xs" onClick={handleInstall}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Install app
            </Button>
          </div>
        ) : (
          <p className="leading-relaxed">
            Open your browser menu and choose{" "}
            <span className="font-medium text-foreground">"Install app"</span> or{" "}
            <span className="font-medium text-foreground">"Add to Home screen"</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
