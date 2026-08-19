import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Gavel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useChampMarkerLock, CHAMP_TAKEOVER_WAIT_MS } from "@/hooks/use-champ-marker-lock";

interface Props {
  matchId: string | null;
  matchLabel?: string;
  markRoute: string;
  markerName?: string;
  requesterName?: string;
  isAdmin?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown when someone taps "Mark" on a tournament game that another person is
 * already marking. They can watch live, or ask the current marker to hand over.
 * The lock only moves when the current marker approves — or after 60s of
 * silence / a stale heartbeat, so a live night is never blocked.
 */
export function MarkerTakeoverDialog({
  matchId, matchLabel, markRoute, markerName, requesterName, isAdmin, open, onOpenChange,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lock, fresh, requestTakeover } = useChampMarkerLock(open ? matchId : null, user?.id, requesterName);
  const [requestedAt, setRequestedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) { setRequestedAt(null); return; }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const holder = lock?.user_name || markerName || "Another marker";
  const stillHeld = !!lock && fresh && lock.user_id !== user?.id;

  // Marker released the lock (approved the hand-over) → go straight in.
  useEffect(() => {
    if (!open || !requestedAt) return;
    if (!stillHeld) {
      onOpenChange(false);
      toast.success("Marking handed over to you");
      navigate(markRoute);
    }
  }, [open, requestedAt, stillHeld, markRoute, navigate, onOpenChange]);

  useEffect(() => {
    if (!open || !requestedAt || !lock?.takeover_declined_at) return;
    toast.error(`${holder} declined the hand-over`, { description: "You can still watch the game live." });
    setRequestedAt(null);
  }, [lock?.takeover_declined_at, open, requestedAt, holder]);

  const waited = requestedAt ? now - requestedAt : 0;
  const canForce = !!requestedAt && waited >= CHAMP_TAKEOVER_WAIT_MS;
  const secondsLeft = useMemo(
    () => Math.max(0, Math.ceil((CHAMP_TAKEOVER_WAIT_MS - waited) / 1000)),
    [waited],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holder} is marking this game</DialogTitle>
          <DialogDescription>
            {matchLabel ? `${matchLabel}. ` : ""}
            You can watch the live score, or ask {holder} to hand the marking over to you.
          </DialogDescription>
        </DialogHeader>

        {requestedAt && (
          <div className="rounded-md bg-muted/60 p-3 text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>
              Waiting for {holder} to accept…
              {!canForce && <> You can take over anyway in {secondsLeft}s.</>}
            </span>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => { onOpenChange(false); if (matchId) navigate(`/tournament-live/${matchId}`); }}
          >
            <Eye className="w-4 h-4" /> Watch live
          </Button>

          {!requestedAt && (
            <Button
              className="gap-1"
              onClick={async () => { await requestTakeover(); setRequestedAt(Date.now()); toast.info(`Asked ${holder} to hand over`); }}
            >
              <Gavel className="w-4 h-4" /> Ask to take over
            </Button>
          )}

          {(canForce || isAdmin) && (
            <Button
              variant="destructive"
              className="gap-1"
              onClick={() => { onOpenChange(false); navigate(`${markRoute}${markRoute.includes("?") ? "&" : "?"}takeover=1`); }}
            >
              <Gavel className="w-4 h-4" /> {isAdmin && !canForce ? "Force take over (admin)" : "Take over now"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
