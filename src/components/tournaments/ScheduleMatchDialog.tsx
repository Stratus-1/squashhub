import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Loader2 } from "lucide-react";
import {
  buildSlots,
  isSlotFreeForMatch,
  type SelfScheduleMatchLike,
} from "@/lib/tournaments/self-schedule";
import { fixtureScheduleState } from "@/lib/tournaments/fixture-scheduling";


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId?: string | null;
  match: (SelfScheduleMatchLike & { id: string; booking_id?: string | null }) | null;
  opponentName?: string;
  /** Match length in minutes; falls back to the club's slot size. */
  durationMinutes?: number;
  /** Organiser/admin override — also allows clearing the court & time. */
  canManage?: boolean;
  /**
   * Courts explicitly chosen in tournament setup. When provided (non-empty)
   * only those courts are offered; otherwise external courts are excluded.
   */
  allowedCourtIds?: number[] | null;
}


/**
 * Court picker for a single tournament fixture.
 *
 * Used by players (self-scheduling) and by organisers (authoritative override
 * on any generated fixture — first round, semi-final or final). Saving links
 * the booking to the existing fixture id via `self_schedule_champ_match`, so a
 * reschedule moves the same booking and never creates a duplicate fixture.
 * The final availability re-check happens server-side, so a stale slot is
 * rejected cleanly.
 */
export function ScheduleMatchDialog({
  open,
  onOpenChange,
  clubId,
  match,
  opponentName,
  durationMinutes,
  canManage,
  allowedCourtIds,
}: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(
    match?.scheduled_date || format(new Date(), "yyyy-MM-dd"),
  );
  const [courtId, setCourtId] = useState<number | null>(match?.court_id ?? null);
  const [saving, setSaving] = useState(false);


  const { data: club } = useQuery({
    queryKey: ["club-booking-window", clubId],
    queryFn: async () => {
      const { data } = await fromExt("clubs")
        .select("booking_slot_minutes, booking_open_time, booking_last_slot_time")
        .eq("id", clubId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!clubId && open,
  });

  const allowedKey = (allowedCourtIds || []).join(",");

  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts-self-schedule", clubId, allowedKey],
    queryFn: async () => {
      const ids = (allowedCourtIds || []).filter((n) => Number.isFinite(n));
      let q = fromExt("courts").select("id, name, is_external").eq("club_id", clubId!);
      // Tournament setup wins: only the chosen courts (which may include an
      // external venue). Otherwise never offer external courts.
      if (ids.length > 0) q = q.in("id", ids);
      else q = q.eq("is_external", false);
      const { data } = await q.order("name");
      return (data || []) as Array<{ id: number; name: string; is_external?: boolean }>;
    },
    enabled: !!clubId && open,
  });

  const courtOptions = useMemo(() => {
    const allowed = allowedCourtIds && allowedCourtIds.length > 0 ? new Set(allowedCourtIds) : null;
    return courts.filter((court) => {
      if (allowed) return allowed.has(court.id);
      return !court.is_external;
    });
  }, [allowedCourtIds, courts]);


  useEffect(() => {
    if (courtOptions.length === 0) return;
    if (courtId != null && courtOptions.some((c) => c.id === courtId)) return;

    if (courtId != null) {
      const current = courts.find((c) => c.id === courtId);
      if (current) {
        const replacement = courtOptions.find(
          (c) => String(c.name || "").trim().toLowerCase() === String(current.name || "").trim().toLowerCase(),
        );
        if (replacement) {
          setCourtId(replacement.id);
          return;
        }
      }
    }

    setCourtId(courtOptions[0].id);
  }, [courtOptions, courtId, courts]);

  const { data: bookings = [], isFetching, refetch: refetchBookings } = useQuery({
    queryKey: ["court-bookings-self-schedule", clubId, date],
    queryFn: async () => {
      const { data } = await fromExt("bookings")
        .select("id, court_id, start_time, end_time, status, user_id, opponent_id, club_member_id, opponent_member_id")
        .eq("club_id", clubId!)
        .eq("date", date)
        .eq("status", "active");
      return (data || []) as any[];
    },
    enabled: !!clubId && !!date && open,
  });

  const slotMinutes = Number(club?.booking_slot_minutes) || 60;
  const duration = Math.max(15, durationMinutes || slotMinutes);
  const slots = useMemo(
    () => buildSlots(slotMinutes, club?.booking_open_time, club?.booking_last_slot_time),
    [slotMinutes, club?.booking_open_time, club?.booking_last_slot_time],
  );

  const alreadyScheduled = !!match && fixtureScheduleState(match) === "scheduled";

  const freeSlots = useMemo(() => {
    if (!courtId) return [];
    return slots.filter((slot) =>
      match
        ? isSlotFreeForMatch(slot, duration, courtId, match, bookings, match?.booking_id ?? null)
        : false
    );
  }, [slots, duration, courtId, bookings, match]);


  const confirm = async (time: string) => {
    if (!match || !courtId) return;
    if (courtOptions.length > 0 && !courtOptions.some((c) => c.id === courtId)) {
      toast.error("That court is not available for this tournament.");
      return;
    }

    setSaving(true);
    try {
      const normalizedTime = time.length === 5 ? time : time.slice(0, 5);
      const fresh = await refetchBookings();
      const freshBookings = (fresh.data || []) as any[];
      const stillFree = isSlotFreeForMatch(
        normalizedTime,
        duration,
        courtId,
        match,
        freshBookings,
        match?.booking_id ?? null,
      );
      if (!stillFree) {
        toast.error("That slot is no longer available. Please pick another time.");
        qc.invalidateQueries({ queryKey: ["court-bookings-self-schedule", clubId, date] });
        return;
      }

      const { error } = await rpcExt("self_schedule_champ_match", {
        p_match_id: match.id,
        p_court_id: courtId,
        p_date: date,
        p_time: `${normalizedTime}:00`,
        p_duration_minutes: duration,
      });
      if (error) {
        toast.error(error.message || "Could not book that slot — please try another one.");
        qc.invalidateQueries({ queryKey: ["court-bookings-self-schedule"] });
        return;
      }
      toast.success(
        alreadyScheduled
          ? "Match rescheduled — the court booking was moved."
          : "Match scheduled — both players have been notified.",
      );
      invalidateAll();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Could not book that slot — please try another one.");
    } finally {
      setSaving(false);
    }
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my-champ-matches-dashboard"] });
    qc.invalidateQueries({ queryKey: ["club-champ-matches"] });
    qc.invalidateQueries({ queryKey: ["court-bookings-self-schedule"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  const clearSlot = async () => {
    if (!match) return;
    setSaving(true);
    const { error } = await rpcExt("unschedule_champ_match", { p_match_id: match.id });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Could not clear this match's court and time.");
      return;
    }
    toast.success("Court and time cleared — the fixture and any result are unchanged.");
    invalidateAll();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-4 h-4" />{" "}
            {alreadyScheduled ? "Reschedule your court booking" : "Make your court booking"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {opponentName ? <>vs {opponentName}. </> : null}
            Pick a court and time — the court is booked immediately and both players are notified.
            {match?.play_by && <> Play by {match.play_by}.</>}
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
            {pastPlayBy && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This is after the round's play-by date ({match?.play_by}). You can still book, but let the organiser
                know so the round isn't closed without your result.
              </p>
            )}
          </div>


          <div className="space-y-1">
            <Label className="text-xs">Court</Label>
            <div className="flex flex-wrap gap-1.5">
              {courtOptions.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={courtId === c.id ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setCourtId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
              {courtOptions.length === 0 && (
                <span className="text-xs text-muted-foreground">No courts configured for this club.</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Available times</Label>
            {!courtId ? (
              <p className="text-xs text-muted-foreground">Choose a court first.</p>
            ) : isFetching ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
              </p>
            ) : freeSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No free slots on this court that day — try another date or court.</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto">
                {freeSlots.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    className="h-7 text-xs"
                    onClick={() => confirm(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-[10px]">{duration} min match</Badge>
            {alreadyScheduled && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={clearSlot}
                title="Remove the court and time — the fixture and any result are kept"
              >
                Clear court & time
              </Button>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
