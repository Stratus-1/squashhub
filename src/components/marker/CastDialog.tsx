import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Tv, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  pairCode: string | null;
  paired: boolean;
  onStop: () => void;
}

export function CastDialog({ open, onClose, pairCode, paired, onStop }: Props) {
  const tvUrl = pairCode ? `${window.location.origin}/tv/${pairCode}` : "";
  const tvBaseUrl = `${window.location.origin}/tv`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-primary" />
            Cast to TV
          </DialogTitle>
          <DialogDescription>
            {paired ? "Connected — score is live on the TV." : "Open the URL on the TV browser, then enter the code."}
          </DialogDescription>
        </DialogHeader>

        {paired ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-16 h-16 text-[hsl(var(--win))]" />
            <p className="text-sm font-medium">TV is now showing the live scoreboard</p>
            <p className="text-xs text-muted-foreground text-center">
              Every point you mark will appear on the TV instantly.
            </p>
            <Button variant="outline" size="sm" onClick={onStop} className="gap-1.5 mt-2">
              <X className="w-3.5 h-3.5" />
              Stop casting
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            {pairCode && (
              <>
                <div className="bg-white p-3 rounded-lg">
                  <QRCodeSVG value={tvUrl} size={160} />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Scan with the TV browser, or visit
                </p>
                <p className="font-mono text-sm font-semibold">{tvBaseUrl}</p>
                <p className="text-xs text-muted-foreground">and enter this code:</p>
                <div className="text-4xl font-heading font-bold tracking-widest tabular-nums bg-muted px-4 py-2 rounded-lg">
                  {pairCode}
                </div>
                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  Waiting for TV to pair…
                </p>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onStop} className="mt-2">
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
