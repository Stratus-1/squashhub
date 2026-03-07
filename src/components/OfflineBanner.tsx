import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { flushOutbox } from "@/lib/outbox";
import { useOutboxCounts } from "@/hooks/use-outbox";
import { toast } from "sonner";

export function OfflineBanner() {
  const { pending } = useOutboxCounts();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const show = useMemo(() => !online || pending > 0, [online, pending]);
  if (!show) return null;

  return (
    <div className="fixed top-3 left-3 right-3 z-50 max-w-lg mx-auto">
      <Card className="p-3 border-primary/20 bg-background/95 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {online ? "Sync pending" : "You’re offline"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {online
                ? "Some actions were saved offline and will sync automatically."
                : "Bookings and match submissions will be saved and synced when you’re back online."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pending > 0 && (
              <Badge variant="secondary">
                {pending} queued
              </Badge>
            )}
            {online && pending > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const res = await flushOutbox();
                    if (res.flushed > 0) toast.success(`Synced ${res.flushed} action${res.flushed === 1 ? "" : "s"}`);
                    if (res.remaining > 0) toast.message("Some actions still pending", { description: "Try again once the network is stable." });
                  } catch (e: any) {
                    toast.error(e?.message || "Failed to sync");
                  }
                  setSyncing(false);
                }}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

