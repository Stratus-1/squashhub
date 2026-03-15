import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppPushNotifications } from "@/hooks/use-app-push-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { permission, isSubscribed, loading, subscribe, kind } = useAppPushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  // Auto-subscribe on first visit if permission hasn't been asked yet
  useEffect(() => {
    if (!user || isSubscribed || loading || permission === "denied" || permission === "unsupported") return;

    const autoSubscribed = localStorage.getItem("push-auto-subscribed");
    if (autoSubscribed) {
      // Already attempted auto-subscribe; fall back to manual prompt
      const dismissedAt = localStorage.getItem("push-prompt-dismissed");
      if (dismissedAt) {
        const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) return;
      }
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }

    // Auto-subscribe after a short delay
    const timer = setTimeout(async () => {
      localStorage.setItem("push-auto-subscribed", "1");
      const success = await subscribe();
      if (!success) {
        // If user denied or it failed, show the manual prompt later
        setShow(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [user, isSubscribed, permission, loading]);

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
    localStorage.setItem("push-prompt-dismissed", Date.now().toString());
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setShow(false);
    }
  };

  if (!show || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto"
      >
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Stay in the game!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get notified about new challenges, match results, and court availability.
                  {kind === "native" ? " (Android/iOS)" : " (PWA)"}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleEnable}
                    disabled={loading}
                    className="text-xs h-8"
                  >
                    {loading ? "Enabling..." : "Enable Notifications"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    className="text-xs h-8 text-muted-foreground"
                  >
                    Not now
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
