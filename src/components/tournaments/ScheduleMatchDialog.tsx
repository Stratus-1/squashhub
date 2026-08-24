import { useMemo, useState } from "react";
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
  freeSlotsForCourt,
  type SelfScheduleMatchLike,
} from "@/lib/tournaments/self-schedule";

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

  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts-self-schedule", clubId],
    queryFn: async () => {
      const { data } = await fromExt("courts").select("id, name").eq("club_id", clubId!).order("name");
      return (data || []) as Array<{ id: number; name: string }>;
    },
    enabled: !!clubId && open,
  });

  const { data: bookings = [], isFetching } = useQuery({
    queryKey: ["court-bookings-self-schedule", clubId, date],
    queryFn: async () => {
      const { data } = await fromExt("bookings")
        .select("id, court_id, start_time, end_time, status")
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

  const freeSlots = useMemo(() => {
    if (!courtId) return [];
    return freeSlotsForCourt(slots, duration, courtId, bookings, match?.booking_id ?? null);
  }, [slots, duration, courtId, bookings, match?.booking_id]);

  const confirm = async (time: string) => {
    if (!match || !courtId) return;
    setSaving(true);
    const { error } = await rpcExt("self_schedule_champ_match", {
      p_match_id: match.id,
      p_court_id: courtId,
      p_date: date,
      p_time: time.length === 5 ? `${time}:00` : time,
      p_duration_minutes: duration,
    });
    setSaving(false);
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
            {alreadyScheduled ? "Reschedule this match" : canManage ? "Set court & time" : "Arrange your match"}
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
              max={match?.play_by || undefined}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Court</Label>
            <div className="flex flex-wrap gap-1.5">
              {courts.map((c) => (
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
              {courts.length === 0 && (
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

          <Badge variant="outline" className="text-[10px]">{duration} min match</Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
