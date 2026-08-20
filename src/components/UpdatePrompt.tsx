import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { SW_UPDATE_EVENT, applyPendingUpdate, hasPendingUpdate } from "@/lib/pwa-update";
import { isScoringActive } from "@/lib/scoring-lock";

/**
 * UPDATE banner — shown only when a newer deployed build is waiting.
 * Completely separate from the install prompt: this never appears for
 * users who have not yet installed/loaded a service worker, and it never
 * reloads without an explicit click.
 */
export function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onUpdate = () => setShow(true);
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    if (hasPendingUpdate()) setShow(true);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  if (!show) return null;

  const scoring = isScoringActive();

  const handleUpdate = async () => {
    setBusy(true);
    try {
      await applyPendingUpdate();
    } finally {
      setBusy(false);
      setShow(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        className="fixed top-4 left-4 right-4 z-[70] max-w-md mx-auto"
      >
        <Card className="border-primary/30 shadow-xl">
          <CardContent className="p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">A new version is available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scoring
                  ? "Finish scoring first — updating will reload the app."
                  : "Update now to get the latest SquashHub."}
              </p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={handleUpdate}>
                  Update now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setShow(false)}
                >
                  Later
                </Button>
              </div>
            </div>
            <button
              onClick={() => setShow(false)}
              aria-label="Dismiss update banner"
              className="-m-2 p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
