import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Tv, X } from "lucide-react";
import { useClubContext } from "@/contexts/ClubContext";

interface Props {
  open: boolean;
  onClose: () => void;
  pairCode: string | null;
  paired: boolean;
  onStop: () => void;
  courtNumber: string | null;
  onCourtChange: (court: string | null) => void;
}

export function CastDialog({ open, onClose, pairCode, paired, onStop, courtNumber, onCourtChange }: Props) {
  const { subdomain } = useClubContext();
  const [courtInput, setCourtInput] = useState(courtNumber ?? "");

  useEffect(() => {
    setCourtInput(courtNumber ?? "");
  }, [courtNumber]);

  const origin = window.location.origin;
  const codeUrl = pairCode ? `${origin}/tv/${pairCode}` : "";
  const pickerUrl = subdomain ? `${origin}/tv/club/${subdomain}` : null;
  const fixedCourtUrl = subdomain && courtNumber ? `${origin}/tv/club/${subdomain}/court/${encodeURIComponent(courtNumber)}` : null;

  const commitCourt = () => {
    const next = courtInput.trim();
    if ((next || null) !== (courtNumber || null)) {
      onCourtChange(next || null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-primary" />
            Cast to TV
          </DialogTitle>
          <DialogDescription>
            {paired ? "Connected — score is live on the TV." : "Pick a TV setup option below."}
          </DialogDescription>
        </DialogHeader>

        {paired ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-16 h-16 text-[hsl(var(--win))]" />
            <p className="text-sm font-medium">TV is now showing the live scoreboard</p>
            <p className="text-xs text-muted-foreground text-center">
              Every point you mark will appear on the TV instantly.
            </p>
            <div className="w-full pt-2">
              <Label htmlFor="court-input" className="text-xs">Court name / number</Label>
              <Input
                id="court-input"
                value={courtInput}
                onChange={(e) => setCourtInput(e.target.value)}
                onBlur={commitCourt}
                onKeyDown={(e) => { if (e.key === "Enter") commitCourt(); }}
                placeholder="e.g. 1"
                className="h-8 mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Lets clubhouse TVs find this match by court.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onStop} className="gap-1.5 mt-2">
              <X className="w-3.5 h-3.5" />
              Stop casting
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {/* Court number (also enables fixed-court URL) */}
            <div>
              <Label htmlFor="court-input" className="text-xs">Court name / number (optional)</Label>
              <Input
                id="court-input"
                value={courtInput}
                onChange={(e) => setCourtInput(e.target.value)}
                onBlur={commitCourt}
                onKeyDown={(e) => { if (e.key === "Enter") commitCourt(); }}
                placeholder="e.g. 1"
                className="h-9 mt-1"
              />
            </div>

            {/* Option 1: Pair code (works on any TV) */}
            {pairCode && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Option 1 · Pair code
                </p>
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded">
                    <QRCodeSVG value={codeUrl} size={90} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground">Open on TV:</p>
                    <p className="font-mono text-xs font-semibold break-all">{origin}/tv</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Code:</p>
                    <p className="text-2xl font-heading font-bold tracking-widest tabular-nums">{pairCode}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Option 2: Fixed court URL — bookmark on the TV above the court */}
            {fixedCourtUrl && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Option 2 · Bookmark on TV (Court {courtNumber})
                </p>
                <p className="text-[11px] text-muted-foreground">
                  This TV will auto-show any match on Court {courtNumber}.
                </p>
                <p className="font-mono text-[11px] font-semibold break-all bg-muted px-2 py-1 rounded">
                  {fixedCourtUrl}
                </p>
              </div>
            )}

            {/* Option 3: Court picker — clubhouse TV */}
            {pickerUrl && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Option 3 · Court picker (clubhouse)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Shows all live courts; staff/spectators pick one.
                </p>
                <p className="font-mono text-[11px] font-semibold break-all bg-muted px-2 py-1 rounded">
                  {pickerUrl}
                </p>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={onStop} className="self-center">
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
