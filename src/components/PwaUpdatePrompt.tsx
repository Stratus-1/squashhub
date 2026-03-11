import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SNOOZE_KEY = "gb_update_prompt_snooze_until";

function readSnoozeUntil() {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(untilMs: number) {
  try {
    sessionStorage.setItem(SNOOZE_KEY, String(untilMs));
  } catch {
    // ignore
  }
}

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        const snoozeUntil = readSnoozeUntil();
        if (Date.now() < snoozeUntil) return;
        setNeedRefresh(true);
      },
    });

    (window as any).__gb_update_sw__ = updateSW;

    return () => {
      try {
        delete (window as any).__gb_update_sw__;
      } catch {
        // ignore
      }
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed left-0 right-0 z-[60] px-3 bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] sm:bottom-auto sm:top-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[min(680px,calc(100vw-1.5rem))]">
      <Card className="p-3 flex items-center justify-between gap-3 shadow-lg border border-border/70 bg-background/95 backdrop-blur">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Update available</p>
          <p className="text-[11px] text-muted-foreground">
            A new version is ready. Reload when you’re ready to get the latest changes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              try {
                writeSnoozeUntil(Date.now() + 60_000);
                const updateSW = (window as any).__gb_update_sw__ as undefined | ((reloadPage?: boolean) => Promise<void>);
                if (updateSW) await updateSW(true);
                else window.location.reload();
              } finally {
                setUpdating(false);
              }
            }}
          >
            {updating ? "Updating…" : "Reload"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              writeSnoozeUntil(Date.now() + 60_000);
              setNeedRefresh(false);
            }}
          >
            Later
          </Button>
        </div>
      </Card>
    </div>
  );
}
