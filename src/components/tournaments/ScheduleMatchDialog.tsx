import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Loader2 } from "lucide-react";
import {
  buildSlots,
  champsSlotStarts,
  isSlotFreeForMatch,
  isChampsReservation,
  type SelfScheduleMatchLike,
} from "@/lib/tournaments/self-schedule";
import { matchParticipantIds, bookingConflictsWithParticipants } from "@/lib/tournaments/self-schedule";
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

  // Tournament games: the server resolves the bookable courts (stage override →
  // selected venue courts → host club's normal courts). The same function guards
  // saving, so the window can never offer a court the booking then refuses.
  const champId: string | null = (match as any)?.champ_id ?? null;
  const { data: resolved } = useQuery({
    queryKey: ["tournament-bookable-courts", champId, (match as any)?.stage ?? null, (match as any)?.round_label ?? null],
    queryFn: async () => {
      const { data, error } = await rpcExt("tournament_bookable_court_ids", {
        _champ: champId, _stage: (match as any)?.stage ?? null, _round_label: (match as any)?.round_label ?? null,
      });
      if (error) throw error;
      return ((data as number[] | null) ?? []).map(Number);
    },
    enabled: !!champId && open,
  });
  const effectiveAllowed = champId ? resolved ?? null : allowedCourtIds;
  const allowedKey = (effectiveAllowed || []).join(",");

  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts-self-schedule", clubId, champId, allowedKey],
    queryFn: async () => {
      const ids = (effectiveAllowed || []).filter((n) => Number.isFinite(n));
      if (champId) {
        if (ids.length === 0) return [];
        const { data } = await fromExt("courts").select("id, name, is_external, club_id").in("id", ids).order("name");
        return (data || []) as Array<{ id: number; name: string; is_external?: boolean; club_id?: string }>;
      }
      let q = fromExt("courts").select("id, name, is_external, club_id").eq("club_id", clubId!);
      if (ids.length > 0) q = q.in("id", ids);
      else q = q.eq("is_external", false);
      const { data } = await q.order("name");
      return (data || []) as Array<{ id: number; name: string; is_external?: boolean; club_id?: string }>;
    },
    enabled: open && (champId ? resolved !== undefined : !!clubId),
  });

  const courtOptions = useMemo(() => {
    if (champId) return courts;
    const allowed = effectiveAllowed && effectiveAllowed.length > 0 ? new Set(effectiveAllowed) : null;
    return courts.filter((court) => {
      if (allowed) return allowed.has(court.id);
      return !court.is_external;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey, courts, champId]);
  // The venue's diary (may differ from the acting admin's club or the owner).
  const bookingClubId = courts.find((c) => c.id === courtId)?.club_id || clubId;


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
    queryKey: ["court-bookings-self-schedule", bookingClubId, date, match?.id, durationMinutes],
    queryFn: async () => {
      const { data } = await fromExt("bookings")
        .select("id, court_id, start_time, end_time, status, user_id, opponent_id, club_member_id, opponent_member_id, external_booker_name")
        .eq("club_id", bookingClubId!)
        .eq("date", date)
        .eq("status", "active");
      // Scheduled games without a booking row still hold their court.
      const { data: champs } = await fromExt("club_champs").select("id").eq("club_id", bookingClubId!);
      const champIds = ((champs || []) as any[]).map((c) => c.id);
      let fixtures: any[] = [];
      if (champIds.length) {
        const { data: fx } = await fromExt("club_champs_matches")
          .select("id, court_id, scheduled_time, booking_id, status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id")
          .in("champ_id", champIds)
          .eq("scheduled_date", date)
          .not("court_id", "is", null);
        fixtures = (fx || []) as any[];
      }
      const dur = Math.max(15, durationMinutes || Number(club?.booking_slot_minutes) || 45);
      return [...((data || []) as any[]), ...scheduledFixtureBlockers(fixtures, dur, match?.id ?? null)];
    },
    enabled: !!bookingClubId && !!date && open,
  });

  // Upcoming "Club Championships" holds at the venue. While any exist, players
  // may only book their match into those reserved slots (organisers keep the
  // full picker). Clubs without holds are unaffected.
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: reservedDates = [], isFetched: reservedChecked } = useQuery({
    queryKey: ["champs-reserved-dates", bookingClubId, today],
    queryFn: async () => {
      const { data } = await fromExt("bookings")
        .select("date, external_booker_name, user_id, opponent_id, club_member_id, opponent_member_id")
        .eq("club_id", bookingClubId!)
        .eq("status", "active")
        .gte("date", today)
        .ilike("external_booker_name", "club championship%");
      return [...new Set(((data || []) as any[]).filter((b) => isChampsReservation(b)).map((b) => String(b.date)))].sort();
    },
    enabled: !!bookingClubId && open,
  });
  // Organisers also start in Champs-only mode and must opt in to the full list,
  // so nobody books a Champs match outside the reserved slots by accident.
  const [showAllTimes, setShowAllTimes] = useState(false);
  const champsOnly = reservedDates.length > 0 && !(canManage && showAllTimes);
  useEffect(() => {
    if (champsOnly && !reservedDates.includes(date)) setDate(reservedDates[0]);
  }, [champsOnly, reservedDates, date]);

  const slotMinutes = Number(club?.booking_slot_minutes) || 60;
  const duration = Math.max(15, durationMinutes || slotMinutes);
  // Club Champs has its own slots: games book into the match-length grid
  // (e.g. 35 minutes), not the club's normal booking slots.
  const stepMinutes = champId && durationMinutes ? duration : slotMinutes;
  const slots = useMemo(
    () => buildSlots(stepMinutes, club?.booking_open_time, club?.booking_last_slot_time),
    [stepMinutes, club?.booking_open_time, club?.booking_last_slot_time],
  );

  const alreadyScheduled = !!match && fixtureScheduleState(match) === "scheduled";
  const pastPlayBy = !!match?.play_by && date > String(match.play_by).slice(0, 10);


  const freeSlots = useMemo(() => {
    if (!courtId) return [];
    return slots.filter((slot) =>
      match
        ? isSlotFreeForMatch(slot, duration, courtId, match, bookings, match?.booking_id ?? null)
        : false
    );
  }, [slots, duration, courtId, bookings, match]);


  // Club Championships holds on any tournament court this day: free for Champs players.
  // The evening's holds merge into one span per court and the Champs' own
  // match-length slots (e.g. 35 minutes) are offered inside it.
  const champsSlots = useMemo(() => {
    if (!match) return [] as { courtId: number; courtName: string; time: string }[];
    const ids = new Set(courtOptions.map((c) => c.id));
    const starts = champsSlotStarts((bookings as any[]).filter((b) => ids.has(b.court_id)), duration);
    const out: { courtId: number; courtName: string; time: string }[] = [];
    for (const [court, times] of starts) {
      for (const time of times) {
        if (isSlotFreeForMatch(time, duration, court, match, bookings, match?.booking_id ?? null))
          out.push({ courtId: court, time, courtName: courtOptions.find((c) => c.id === court)?.name || `Court ${court}` });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time) || a.courtName.localeCompare(b.courtName));
  }, [bookings, courtOptions, duration, match]);

  // The players' own existing bookings that day. Times overlapping them are
  // hidden (the server refuses them too), so say why instead of silently
  // leaving a gap — e.g. a player's earlier GoBook booking at 18:00.
  const playerClashes = useMemo(() => {
    if (!match) return [] as { id: string; time: string; court: string }[];
    const ids = matchParticipantIds(match);
    return (bookings as any[])
      .filter((b) => b.id !== match.booking_id && bookingConflictsWithParticipants(b, ids))
      .map((b) => ({
        id: String(b.id),
        time: `${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)}`,
        court: courts.find((c) => c.id === b.court_id)?.name || `Court ${b.court_id}`,
      }))
      .sort((x, y) => x.time.localeCompare(y.time));
  }, [bookings, match, courts]);

  const selectedCourtId = courtId;
  const confirm = async (time: string, courtOverride?: number) => {
    const courtId = courtOverride ?? selectedCourtId;
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
            {champsOnly ? (
              <div className="flex flex-wrap gap-1.5">
                {reservedDates.map((d) => (
                  <Button key={d} type="button" size="sm" variant={date === d ? "default" : "outline"} className="h-7 text-xs" onClick={() => setDate(d)}>
                    {format(new Date(`${d}T00:00:00`), "EEE d MMM")}
                  </Button>
                ))}
              </div>
            ) : (
            <Input
              type="date"
              value={date}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
            )}
            {pastPlayBy && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This is after the round's play-by date ({match?.play_by}). You can still book, but let the organiser
                know so the round isn't closed without your result.
              </p>
            )}
          </div>


          {playerClashes.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-[11px]" data-testid="player-clash-note" role="note">
              <p className="font-semibold">A player in this match already has a booking this day</p>
              <ul className="mt-1 space-y-0.5">
                {playerClashes.map((c) => <li key={c.id} className="tabular-nums">{c.time} · {c.court}</li>)}
              </ul>
              <p className="mt-1 text-muted-foreground">Times that overlap these are not offered. To use one of them for this match, cancel that booking first, then come back here.</p>
            </div>
          )}

          {champsSlots.length > 0 && (
            <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2">
              <Label className="text-xs font-semibold">Club Champs slots — free</Label>
              <p className="text-[11px] text-muted-foreground">
                The club reserved these for the Champs. Tap one to book it for free — it will show your names instead of "Club Championships".
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {champsSlots.map((s) => (
                  <Button
                    key={`${s.courtId}-${s.time}`}
                    type="button"
                    size="sm"
                    disabled={saving}
                    className="h-7 text-xs"
                    onClick={() => confirm(s.time, s.courtId)}
                  >
                    {s.time} · {s.courtName}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {champsOnly && champsSlots.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {isFetching ? "Checking availability…" : "All Club Champs slots on this day are taken — try the other day."}
            </p>
          )}
          {champsOnly && (
            <p className="text-[11px] text-muted-foreground">
              Club Champs matches can only be booked in the slots the club reserved. Contact the organiser if none suit you.
            </p>
          )}
          {canManage && reservedDates.length > 0 && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={() => setShowAllTimes((v) => !v)}>
              {showAllTimes ? "Show only Club Champs slots" : "Organiser: show all courts and times"}
            </Button>
          )}

          {!champsOnly && !reservedChecked && !!bookingClubId && (
            <p className="text-xs text-muted-foreground">Checking Club Champs slots…</p>
          )}
          {!champsOnly && (reservedChecked || !bookingClubId) && (<>
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
          </>)}

          {alreadyScheduled && (
            <div className="flex items-center justify-end gap-2">
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
            </div>
          )}


        </div>
      </DialogContent>
    </Dialog>
  );
}
