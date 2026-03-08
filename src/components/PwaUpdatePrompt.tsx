import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
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
    <div className="fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] z-[60] px-3">
      <Card className="p-3 flex items-center justify-between gap-3 shadow-lg">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Update available</p>
          <p className="text-[11px] text-muted-foreground">
            Reload to get the latest version (helps avoid “different data” issues).
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
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </Button>
        </div>
      </Card>
    </div>
  );
}

