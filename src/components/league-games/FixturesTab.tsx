import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Wand2, CalendarPlus, CalendarClock, Download, Share2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { RoundConfigDialog, type RoundDraft } from "./fixtures/RoundConfigDialog";
import { FixtureEditorTable, type EditableFixture } from "./fixtures/FixtureEditorTable";
import { ConfirmDeleteDialog } from "./fixtures/ConfirmDeleteDialog";
import { DuplicateRoundsDialog } from "./fixtures/DuplicateRoundsDialog";
import { PostponeMatchdayDialog } from "./fixtures/PostponeMatchdayDialog";
import {
  allocateRoundRobinByDate,
  allocatePairingsWithCourtFairness,
  buildPriorCourtUsage,
  reversePairingsFromPrior,
  inferTiersFromPriorFixtures,
  fairCourtAssignmentForExistingFixtures,
  roundRobin,
  type PriorFixture,
} from "./fixtures/scheduler";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsClubAdmin, useIsSuperAdmin } from "@/hooks/use-club";

type Props = {
  clubId: string;
  associationId: string;
};

type Round = RoundDraft & {
  id: string;
  status: string;
  club_id: string;
  association_id: string;
};

const hm = (time?: string | null) => (time ? String(time).slice(0, 5) : null);

const addMinutesToHm = (time: string, minutes: number) => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const timeSlotsBetween = (startTime: string, endTime: string, slotMinutes: number) => {
  const start = hm(startTime);
  const end = hm(endTime);
  if (!start || !end || slotMinutes <= 0) return [] as string[];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let cur = sh * 60 + sm;
  const limit = eh * 60 + em;
  const out: string[] = [];
  while (cur < limit) {
    out.push(`${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`);
    cur += slotMinutes;
  }
  return out;
};

const nextPlayDates = (startDate: string, count: number, playDows: number[] = [], skipDates: string[] = []) => {
  const out: string[] = [];
  const allowed = playDows.length ? new Set(playDows) : null;
  const skip = new Set((skipDates ?? []).map((d) => String(d).slice(0, 10)));
  const [y, m, d] = startDate.split("-").map(Number);
  let ms = Date.UTC(y, m - 1, d);
  let guard = 0;
  while (out.length < count && guard < count * 14 + 366) {
    const dt = new Date(ms);
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    if ((!allowed || allowed.has(dt.getUTCDay())) && !skip.has(iso)) {
      out.push(iso);
    }
    ms += 86400000;
    guard++;
  }
  return out;
};

const sameNumberSet = (a: number[] = [], b: number[] = []) => {
  const aa = [...a].sort((x, y) => x - y).join(",");
  const bb = [...b].sort((x, y) => x - y).join(",");
  return aa === bb;
};

const sameNumberList = (a: number[] = [], b: number[] = []) => (a ?? []).join(",") === (b ?? []).join(",");

export function FixturesTab({ clubId, associationId }: Props) {
  const qc = useQueryClient();
  const { activeMember, isAdmin: isClubAdmin } = useMemberContext();
  const isAdmin = useIsClubAdmin() || isClubAdmin;
  const isSuperAdmin = useIsSuperAdmin();
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Partial<RoundDraft> | undefined>();
  const [pendingDeleteRound, setPendingDeleteRound] = useState<Round | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const { data: rounds } = useQuery({
    queryKey: ["league-rounds", associationId],
    queryFn: async () => {
      const { data, error } = await fromExt("league_rounds")
        .select("*")
        .eq("association_id", associationId)
        .order("round_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Round[];
    },
    enabled: !!associationId,
  });

  const { data: leagues } = useQuery({
    queryKey: ["assoc-leagues-for-fixtures", associationId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select("id, code, name")
        .eq("club_id", clubId)
        .eq("association_id", associationId);
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
    enabled: !!associationId && !!clubId,
  });

  const teams = useMemo(
    () => (leagues ?? []).filter((l) => l.code).map((l) => ({ code: l.code, name: l.name })),
    [leagues],
  );

  const saveRound = useMutation({
    mutationFn: async (r: RoundDraft) => {
      const payload = {
        club_id: clubId,
        association_id: associationId,
        round_number: r.round_number,
        name: r.name,
        round_date: r.round_date,
        end_date: r.end_date,
        venue_name: r.venue_name,
        court_ids: r.court_ids,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_minutes: r.slot_minutes,
        play_dows: r.play_dows ?? [],
        skip_dates: (r.skip_dates ?? []).map((d) => String(d).slice(0, 10)),
        notes: r.notes ?? null,
        auto_create_bookings: r.auto_create_bookings ?? false,
        created_by: activeMember?.id ?? null,
      };
      if (r.id) {
        // Capture previous defaults to detect a time shift we should cascade.
        const prev = (rounds ?? []).find((x) => x.id === r.id);
        const prevStart = hm(prev?.start_time);
        const prevEnd = hm(prev?.end_time);
        const newStart = hm(r.start_time);
        const newEndDefault = hm(r.end_time);
        const prevRoundDate = prev?.round_date ?? null;
        const newRoundDate = r.round_date ?? null;

        const { error } = await fromExt("league_rounds").update(payload).eq("id", r.id);
        if (error) throw error;

        const timeChanged =
          !!newStart &&
          (prevStart !== newStart ||
            prevEnd !== newEndDefault ||
            Number(prev?.slot_minutes) !== Number(r.slot_minutes));
        const prevCourts: number[] = (prev as any)?.court_ids ?? [];
        const newCourts: number[] = r.court_ids ?? [];
        const courtsChanged = !sameNumberSet(prevCourts, newCourts) || !sameNumberList(prevCourts, newCourts);
        const dateWindowChanged = prevRoundDate !== newRoundDate || (prev?.end_date ?? prevRoundDate) !== (r.end_date ?? newRoundDate);
        const playDaysChanged = !sameNumberList((prev as any)?.play_dows ?? [], r.play_dows ?? []);
        const skipDatesChanged =
          ((prev as any)?.skip_dates ?? []).map((d: any) => String(d).slice(0, 10)).sort().join(",") !==
          (r.skip_dates ?? []).map((d) => String(d).slice(0, 10)).sort().join(",");
        const venueChanged = (prev?.venue_name ?? "") !== (r.venue_name ?? "");
        const regenerateDatesAndTimes = timeChanged || dateWindowChanged || playDaysChanged || skipDatesChanged;
        const shouldRescheduleFixtures = true;
        // Build a court->venue map that covers both the round's selected
        // courts AND any courts already referenced by existing fixtures
        // (so manual per-fixture court overrides get labelled correctly).
        const { data: existingCourtIdsRows } = await fromExt("platform_league_fixtures")
          .select("court_id")
          .eq("round_id", r.id);
        const allCourtIds = Array.from(new Set<number>([
          ...newCourts,
          ...(((existingCourtIdsRows ?? []) as any[]).map((x) => Number(x.court_id)).filter((n) => Number.isFinite(n) && n > 0)),
        ]));
        let venueByCourt = new Map<number, string>();
        if (allCourtIds.length) {
          const { data: courtRows, error: courtErr } = await supabase
            .from("courts")
            .select("id, venue_name, clubs(name)")
            .in("id", allCourtIds);
          if (courtErr) throw courtErr;
          venueByCourt = new Map(
            ((courtRows ?? []) as any[]).map((c) => [
              Number(c.id),
              c.venue_name?.trim() || c.clubs?.name || "Home",
            ]),
          );
        }
        const venueForCourt = (courtId?: number | null) =>
          courtId ? (venueByCourt.get(courtId) ?? "Home") : (r.venue_name || "Home");
        // NOTE: intentionally no blanket venue_name overwrite here — venue is
        // derived from each fixture's actual court_id below.
        void venueChanged;

        // Editing round settings must reproduce the saved fixture plan, not just
        // update the round header. Preserve existing pairings/results, but
        // regenerate dates/times/courts from the latest venue/court choices and
        // keep linked court bookings in sync.
        if (shouldRescheduleFixtures) {
          const { data: fixtureRows, error: fxLoadErr } = await fromExt("platform_league_fixtures")
            .select("id, home_team_code, away_team_code, booking_id, fixture_date, court_id, start_time, end_time, status")
            .eq("round_id", r.id)
            .order("fixture_date", { ascending: true })
            .order("start_time", { ascending: true });
          if (fxLoadErr) throw fxLoadErr;

          type FxRow = {
            id: string;
            home_team_code: string;
            away_team_code: string;
            booking_id: string | null;
            fixture_date: string | null;
            court_id: number | null;
            start_time: string | null;
            end_time: string | null;
            status: string | null;
          };
          const existingFx = (fixtureRows ?? []) as FxRow[];
          const playable = existingFx.filter((f) => f.away_team_code !== "__BYE__");
          const linkedRoundBookingIds = Array.from(new Set(existingFx.map((f) => f.booking_id).filter(Boolean) as string[]));
          const roundBookingIdsToRecreate = new Set<string>();
          const roundProtectedBookingIds = new Set<string>();
          if (payload.auto_create_bookings && linkedRoundBookingIds.length) {
            const { data: linkedBookings, error: linkedBookingsErr } = await supabase
              .from("bookings")
              .select("id, source")
              .in("id", linkedRoundBookingIds);
            if (linkedBookingsErr) throw linkedBookingsErr;
            for (const b of (linkedBookings ?? []) as Array<{ id: string; source: string | null }>) {
              if (b.source === "club_event" || b.source === "gobook") roundProtectedBookingIds.add(b.id);
              else roundBookingIdsToRecreate.add(b.id);
            }
            if (roundBookingIdsToRecreate.size) {
              const ids = Array.from(roundBookingIdsToRecreate);
              const { error: cancelErr } = await supabase.from("bookings").update({ status: "cancelled" }).in("id", ids);
              if (cancelErr) throw cancelErr;
            }
            const unlinkIds = [...Array.from(roundBookingIdsToRecreate), ...Array.from(roundProtectedBookingIds)];
            if (unlinkIds.length) {
              const { error: unlinkErr } = await fromExt("platform_league_fixtures")
                .update({ booking_id: null })
                .eq("round_id", r.id)
                .in("booking_id", unlinkIds);
              if (unlinkErr) throw unlinkErr;
            }
          }
          // Saving the round settings should make the saved schedule match the
          // selected round courts. Manual per-fixture overrides are still allowed
          // from the fixture editor, but the round-settings save is the explicit
          // "reproduce this round from these settings" action.
          const fixtureCourtMismatch = playable.some((f) => !!f.court_id && !newCourts.includes(f.court_id));
          const fixtureMissingCourt = playable.some((f) => !f.court_id && newCourts.length > 0);
          const existingGroupSizes = new Map<string, number>();
          for (const f of playable) {
            const key = `${f.fixture_date || r.round_date}|${hm(f.start_time) || newStart || "18:00"}`;
            existingGroupSizes.set(key, (existingGroupSizes.get(key) ?? 0) + 1);
          }
          const exceedsSelectedCourtCapacity = Array.from(existingGroupSizes.values()).some((n) => n > newCourts.length);
          const scheduleWillChange = regenerateDatesAndTimes || courtsChanged || fixtureCourtMismatch || fixtureMissingCourt || exceedsSelectedCourtCapacity;

          // Fixtures with saved scorecards/lineups/results must never be moved,
          // even when the round is only partially played — their date, time,
          // court, and booking are historical records.
          const playedProtectedIds = new Set<string>();
          if (playable.length) {
            const ids = playable.map((f) => f.id);
            const [{ data: resRows }, { data: lineupRows }, { data: matchRows }] = await Promise.all([
              fromExt("league_fixture_results").select("fixture_id").in("fixture_id", ids),
              fromExt("league_fixture_lineups").select("fixture_id").in("fixture_id", ids),
              fromExt("league_match_results").select("fixture_id").in("fixture_id", ids),
            ]);
            for (const x of ((resRows ?? []) as any[])) playedProtectedIds.add(x.fixture_id);
            for (const x of ((lineupRows ?? []) as any[])) playedProtectedIds.add(x.fixture_id);
            for (const x of ((matchRows ?? []) as any[])) playedProtectedIds.add(x.fixture_id);
          }

          if (playable.length && newCourts.length) {
            if (scheduleWillChange && playedProtectedIds.size) {
              // Only lock when the round has already fully finished (last match date in the past).
              // Partially-played rounds proceed, but played fixtures are frozen below.
              const today = new Date().toISOString().slice(0, 10);
              const lastDate = playable.reduce<string>((acc, f) => {
                const d = f.fixture_date || r.round_date;
                return d && d > acc ? d : acc;
              }, "");
              if (lastDate && lastDate < today) {
                throw new Error("This round has already finished and has saved scorecards/lineups, so its fixtures cannot be regenerated from round settings.");
              }
            }

            const fallbackStart = newStart ?? "18:00";
            const fallbackEnd = newEndDefault ?? addMinutesToHm(fallbackStart, Number(r.slot_minutes || 45));
            const nextById = new Map<string, { fixture_date: string; start_time: string; end_time: string; court_id: number }>();
            let byeDates = [r.round_date];

            // Fixtures already played (with saved results/lineups) keep their
            // original slot; only unplayed fixtures are re-slotted.
            const reschedulable = playable.filter((f) => !playedProtectedIds.has(f.id));
            if (regenerateDatesAndTimes || exceedsSelectedCourtCapacity) {
              const slotTimes = timeSlotsBetween(r.start_time, r.end_time, Number(r.slot_minutes || 45));
              if (!slotTimes.length) throw new Error("Check the round start/end time and slot length.");
              const matchesPerDay = Math.max(1, newCourts.length * slotTimes.length);
              const requiredDays = Math.max(1, Math.ceil(reschedulable.length / matchesPerDay));
              const playDates = nextPlayDates(r.round_date, requiredDays, r.play_dows ?? [], r.skip_dates ?? []);
              if (!playDates.length) throw new Error("Check the round start date and play days.");
              byeDates = playDates;
              reschedulable.forEach((f, idx) => {
                const dayIdx = Math.floor(idx / matchesPerDay);
                const withinDay = idx % matchesPerDay;
                const timeIdx = Math.floor(withinDay / newCourts.length);
                const courtIdx = withinDay % newCourts.length;
                const start = slotTimes[timeIdx] ?? fallbackStart;
                nextById.set(f.id, {
                  fixture_date: playDates[Math.min(dayIdx, playDates.length - 1)] ?? r.round_date,
                  start_time: start,
                  end_time: addMinutesToHm(start, Number(r.slot_minutes || 45)) || fallbackEnd,
                  court_id: newCourts[courtIdx] ?? newCourts[idx % newCourts.length],
                });
              });
            } else {
              // Court/venue-only edits should keep the league round dates intact;
              // just replace courts that are no longer allowed, spreading them
              // across the selected venue courts within each date/time cell.
              const groups = new Map<string, FxRow[]>();
              for (const f of reschedulable) {
                const key = `${f.fixture_date || r.round_date}|${hm(f.start_time) || fallbackStart}`;
                const arr = groups.get(key) ?? [];
                arr.push(f);
                groups.set(key, arr);
              }
              for (const group of groups.values()) {
                const used = new Set<number>();
                for (const f of group) {
                  if (f.court_id && newCourts.includes(f.court_id)) used.add(f.court_id);
                }
                let fallbackIdx = 0;
                for (const f of group) {
                  // Preserve existing selected courts, but move any fixture that
                  // is on a court no longer selected for this round.
                  let nextCourt: number | null = f.court_id ?? null;
                  if (!nextCourt || !newCourts.includes(nextCourt)) {
                    nextCourt = newCourts.find((c) => !used.has(c)) ?? newCourts[fallbackIdx % newCourts.length] ?? null;
                    fallbackIdx++;
                    if (nextCourt) used.add(nextCourt);
                  }
                  const start = hm(f.start_time) ?? fallbackStart;
                  nextById.set(f.id, {
                    fixture_date: f.fixture_date || r.round_date,
                    start_time: start,
                    end_time: hm(f.end_time) ?? addMinutesToHm(start, Number(r.slot_minutes || 45)) ?? fallbackEnd,
                    court_id: nextCourt ?? newCourts[0],
                  });
                }
              }
              byeDates = Array.from(new Set(existingFx.map((f) => f.fixture_date).filter(Boolean) as string[]));
              if (!byeDates.length) byeDates = [r.round_date];
            }

            for (const f of existingFx) {
              // Never rewrite already-played fixtures or their bookings — they
              // are historical records tied to saved scorecards/lineups.
              if (playedProtectedIds.has(f.id)) continue;
              const oldBookingId = f.booking_id && !roundBookingIdsToRecreate.has(f.booking_id) && !roundProtectedBookingIds.has(f.booking_id)
                ? f.booking_id
                : null;
              const next = f.away_team_code === "__BYE__"
                ? {
                    fixture_date: byeDates[0] ?? r.round_date,
                    start_time: null,
                    end_time: null,
                    court_id: null,
                    venue_name: r.venue_name || "Home",
                  }
                : {
                    ...(nextById.get(f.id) ?? {
                      fixture_date: f.fixture_date || r.round_date,
                      start_time: hm(f.start_time) ?? fallbackStart,
                      end_time: hm(f.end_time) ?? fallbackEnd,
                      court_id: f.court_id ?? newCourts[0],
                    }),
                    venue_name: venueForCourt((nextById.get(f.id)?.court_id ?? f.court_id ?? newCourts[0]) as number),
                  };

              const { error: upErr } = await fromExt("platform_league_fixtures")
                .update(next)
                .eq("id", f.id);
              if (upErr) throw upErr;

              if (f.away_team_code === "__BYE__") {
                if (oldBookingId) {
                  const { error: bCancelErr } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", oldBookingId);
                  if (bCancelErr) throw bCancelErr;
                  const { error: unlinkErr } = await fromExt("platform_league_fixtures").update({ booking_id: null }).eq("id", f.id);
                  if (unlinkErr) throw unlinkErr;
                }
                continue;
              }

              if (payload.auto_create_bookings && next.court_id && next.start_time && next.fixture_date) {
                const bookingEnd = next.end_time || addMinutesToHm(next.start_time, Number(r.slot_minutes || 45));
                const homeName = teams.find((t) => t.code === f.home_team_code)?.name?.trim();
                const awayName = teams.find((t) => t.code === f.away_team_code)?.name?.trim();
                const matchup = homeName && awayName ? `${homeName} vs ${awayName}` : "";
                const guestName = matchup ? `${r.name} - ${matchup}` : r.name;
                if (oldBookingId) {
                  const { error: bErr } = await supabase
                    .from("bookings")
                    .update({
                      court_id: next.court_id,
                      date: next.fixture_date,
                      start_time: `${next.start_time}:00`,
                      end_time: `${bookingEnd}:00`,
                      guest_name: guestName,
                      status: "active",
                    })
                    .eq("id", oldBookingId);
                  if (bErr) throw bErr;
                } else {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    const { data: conflicts, error: conflictErr } = await supabase
                      .from("bookings")
                      .select("id")
                      .eq("court_id", next.court_id)
                      .eq("date", next.fixture_date)
                      .eq("start_time", `${next.start_time}:00`)
                      .eq("status", "active")
                      .limit(1);
                    if (conflictErr) throw conflictErr;
                    if (conflicts?.length) continue;
                    const { data: booking, error: bErr } = await supabase
                      .from("bookings")
                      .insert({
                        court_id: next.court_id,
                        user_id: user.id,
                        club_id: clubId,
                        date: next.fixture_date,
                        start_time: `${next.start_time}:00`,
                        end_time: `${bookingEnd}:00`,
                        status: "active",
                        is_friendly: false,
                        guest_name: guestName,
                        source: "squashhub",
                        booking_type: "league",
                      })
                      .select("id")
                      .single();
                    if (!bErr && booking) {
                      const { error: linkErr } = await fromExt("platform_league_fixtures").update({ booking_id: booking.id }).eq("id", f.id);
                      if (linkErr) throw linkErr;
                    }
                  }
                }

                let staleQuery = supabase
                  .from("bookings")
                  .update({ status: "cancelled" })
                  .eq("club_id", clubId)
                  .eq("date", f.fixture_date || next.fixture_date)
                  .eq("court_id", f.court_id || next.court_id)
                  .eq("status", "active")
                  .like("guest_name", `${r.name} - %`)
                  .neq("id", oldBookingId || "00000000-0000-0000-0000-000000000000");
                const oldStart = hm(f.start_time);
                if (oldStart) staleQuery = staleQuery.eq("start_time", `${oldStart}:00`);
                const stale = await staleQuery;
                if (stale.error) throw stale.error;
              } else if (oldBookingId) {
                const { error: bCancelErr } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", oldBookingId);
                if (bCancelErr) throw bCancelErr;
                const { error: unlinkErr } = await fromExt("platform_league_fixtures").update({ booking_id: null }).eq("id", f.id);
                if (unlinkErr) throw unlinkErr;
              }
            }
          } else if (!newCourts.length) {
            for (const f of playable) {
              if (f.booking_id) {
                const { error: bCancelErr } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", f.booking_id);
                if (bCancelErr) throw bCancelErr;
              }
              const { error: clearErr } = await fromExt("platform_league_fixtures")
                .update({ court_id: null, booking_id: null, venue_name: r.venue_name || "Home" })
                .eq("id", f.id);
              if (clearErr) throw clearErr;
            }
          }
        }

        // If auto-bookings is enabled, ensure every playable fixture on this
        // round has a linked booking. Fixtures cloned from a "duplicate rounds"
        // action (or created before this toggle was on) may have court_id and
        // start_time but no booking_id yet — create them here.
        if (payload.auto_create_bookings) {
          const { data: allFx } = await fromExt("platform_league_fixtures")
            .select("id, booking_id, court_id, fixture_date, start_time, end_time, home_team_code, away_team_code")
            .eq("round_id", r.id);
          const needBooking = ((allFx ?? []) as any[]).filter(
            (f) => !f.booking_id && f.court_id && f.start_time && f.fixture_date && f.away_team_code !== "__BYE__",
          );
          if (needBooking.length) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const slotMin = Number(r.slot_minutes || 60);
              for (const f of needBooking) {
                const startStr = String(f.start_time).slice(0, 5);
                let endStr: string;
                if (f.end_time) {
                  endStr = String(f.end_time).slice(0, 5);
                } else {
                  const [h, m] = startStr.split(":").map(Number);
                  const em = h * 60 + m + slotMin;
                  endStr = `${String(Math.floor(em / 60)).padStart(2, "0")}:${String(em % 60).padStart(2, "0")}`;
                }
                const homeName = teams.find((t) => t.code === f.home_team_code)?.name?.trim();
                const awayName = teams.find((t) => t.code === f.away_team_code)?.name?.trim();
                const matchup = homeName && awayName ? `${homeName} vs ${awayName}` : "";
                const guestName = matchup ? `${r.name} - ${matchup}` : r.name;
                const { data: booking, error: bErr } = await supabase
                  .from("bookings")
                  .insert({
                    court_id: f.court_id,
                    user_id: user.id,
                    club_id: clubId,
                    date: f.fixture_date,
                    start_time: `${startStr}:00`,
                    end_time: `${endStr}:00`,
                    status: "active",
                    is_friendly: false,
                    guest_name: guestName,
                  })
                  .select("id")
                  .single();
                if (!bErr && booking) {
                  await fromExt("platform_league_fixtures")
                    .update({ booking_id: booking.id })
                    .eq("id", f.id);
                }
              }
            }
          }
        }

        // Cancel any stale active bookings on courts that were removed from
        // this round. Even if a fixture's linked booking was moved to a new
        // court above, older duplicate bookings (e.g. Court 3 for this round)
        // may still be sitting on the schedule — clean them up here.
        const removedCourts = prevCourts.filter((c) => !newCourts.includes(c));
        if (removedCourts.length) {
          const { data: staleRows } = await supabase
            .from("bookings")
            .select("id")
            .eq("club_id", clubId)
            .eq("status", "active")
            .in("court_id", removedCourts)
            .like("guest_name", `${r.name} - %`);
          const staleIds = ((staleRows ?? []) as any[]).map((x) => x.id);
          if (staleIds.length) {
            const { error: cancelErr } = await supabase
              .from("bookings")
              .update({ status: "cancelled" })
              .in("id", staleIds);
            if (cancelErr) throw cancelErr;
            // Ensure no fixture still points at these cancelled bookings.
            await fromExt("platform_league_fixtures")
              .update({ booking_id: null })
              .in("booking_id", staleIds);
          }
        }
      } else {
        const { error } = await fromExt("league_rounds").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
      qc.invalidateQueries({ queryKey: ["round-fixtures"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Round saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });


  const deleteRound = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpcExt("delete_league_round_cascade", { _round_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
      toast.success("Round deleted");
    },
  });

  const nextRoundNumber = (rounds?.length ?? 0) + 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rounds & fixtures</h3>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {(rounds?.length ?? 0) > 0 && (
              <Button size="sm" variant="outline" onClick={() => setDuplicateOpen(true)}>
                Create next rounds
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                {
                  const ord = (n: number) => {
                    const s = ["th", "st", "nd", "rd"], v = n % 100;
                    return n + (s[(v - 20) % 10] || s[v] || s[0]);
                  };
                  setEditingRound({ round_number: nextRoundNumber, name: `${ord(nextRoundNumber)} League Round ${nextRoundNumber}` });
                }
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add round
            </Button>
          </div>
        )}
      </div>

      {!rounds?.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAdmin ? <>No rounds scheduled yet. Click <strong>Add round</strong> to get started.</> : <>No rounds scheduled yet.</>}
        </Card>
      )}

      {(() => {
        const today = format(new Date(), "yyyy-MM-dd");
        const all = rounds ?? [];
        const upcoming = all.filter((r) => (r.end_date || r.round_date) >= today);
        const past = all.filter((r) => (r.end_date || r.round_date) < today);
        const renderCard = (r: Round) => {
          // Admin can only delete rounds that haven't started yet.
          // Super admin can always delete.
          const notStartedYet = r.round_date > today;
          const canDelete = isSuperAdmin || (isAdmin && notStartedYet);
          return (
            <RoundCard
              key={r.id}
              round={r}
              teams={teams}
              clubId={clubId}
              isAdmin={isAdmin}
              canDelete={canDelete}
              open={openRoundId === r.id}
              onToggle={() => setOpenRoundId(openRoundId === r.id ? null : r.id)}
              onEdit={() => {
                setEditingRound(r);
                setDialogOpen(true);
              }}
              onDelete={() => setPendingDeleteRound(r)}
            />
          );
        };
        return (
          <>
            {upcoming.map(renderCard)}
            {past.length > 0 && (
              <details className="rounded-lg border bg-muted/20">
                <summary className="cursor-pointer select-none p-3 text-sm font-medium flex items-center justify-between">
                  <span>Past rounds</span>
                  <Badge variant="secondary">{past.length}</Badge>
                </summary>
                <div className="p-2 space-y-2">{past.map(renderCard)}</div>
              </details>
            )}
          </>
        );
      })()}

      <RoundConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clubId={clubId}
        associationId={associationId}
        initial={editingRound}
        onSave={async (r) => {
          await saveRound.mutateAsync(r);
        }}
      />

      <ConfirmDeleteDialog
        open={!!pendingDeleteRound}
        onOpenChange={(o) => { if (!o) setPendingDeleteRound(null); }}
        title={`Delete ${pendingDeleteRound?.name ?? "round"}?`}
        description={
          <span>
            This permanently deletes <strong>{pendingDeleteRound?.name}</strong> and all its
            fixtures. This action cannot be undone.
          </span>
        }
        confirmLabel="Delete round"
        onConfirm={async () => {
          if (pendingDeleteRound) await deleteRound.mutateAsync(pendingDeleteRound.id);
          setPendingDeleteRound(null);
        }}
      />

      <DuplicateRoundsDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        clubId={clubId}
        associationId={associationId}
        rounds={(rounds ?? []) as any}
      />
    </div>
  );
}

function RoundCard({
  round,
  teams,
  clubId,
  isAdmin,
  canDelete = false,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  round: Round;
  teams: { code: string; name: string }[];
  clubId: string;
  isAdmin: boolean;
  canDelete?: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [autoCreateBookings, setAutoCreateBookings] = useState<boolean>(!!(round as any).auto_create_bookings);
  

  const { data: courts } = useQuery({
    queryKey: ["round-courts-all", clubId, round.court_ids?.join(",") ?? ""],
    queryFn: async () => {
      // Load this club's courts + any explicitly-referenced courts from other clubs
      // (so cross-venue courts picked in the round config still appear in the editor).
      const { data: mine, error: e1 } = await supabase
        .from("courts")
        .select("id, name, venue_name, club_id, clubs(name)")
        .eq("club_id", clubId);
      if (e1) throw e1;
      const mineIds = new Set((mine ?? []).map((c: any) => c.id));
      const extraIds = (round.court_ids ?? []).filter((id: number) => !mineIds.has(id));
      let extras: any[] = [];
      if (extraIds.length) {
        const { data, error } = await supabase
          .from("courts")
          .select("id, name, venue_name, club_id, clubs(name)")
          .in("id", extraIds);
        if (error) throw error;
        extras = data ?? [];
      }
      // Fallback: if a court has no venue_name, use the owning club's name as venue.
      const normalised = [...(mine ?? []), ...extras].map((c: any) => ({
        id: c.id,
        name: c.name,
        venue_name: c.venue_name?.trim() || c.clubs?.name || null,
      }));
      return normalised.sort((a, b) => {
        const va = a.venue_name ?? "";
        const vb = b.venue_name ?? "";
        if (va !== vb) return va.localeCompare(vb);
        return String(a.name).localeCompare(String(b.name));
      });
    },
    enabled: open,
  });

  const { data: fixtures, refetch } = useQuery({
    queryKey: ["round-fixtures", round.id],
    queryFn: async () => {
      const { data, error } = await fromExt("platform_league_fixtures")
        .select("id, home_team_code, away_team_code, court_id, start_time, end_time, fixture_date")
        .eq("round_id", round.id)
        .order("fixture_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EditableFixture[];
    },
    enabled: open,
  });

  // Lightweight count so the collapsed row can hint "click to create fixtures"
  // vs. showing "X fixtures" when they already exist.
  const { data: fixtureCount } = useQuery({
    queryKey: ["round-fixture-count", round.id],
    queryFn: async () => {
      const { count, error } = await fromExt("platform_league_fixtures")
        .select("id", { count: "exact", head: true })
        .eq("round_id", round.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [selectedTeams, setSelectedTeams] = useState<string[]>(teams.map((t) => t.code));
  const [draft, setDraft] = useState<EditableFixture[] | null>(null);
  const [tier, setTier] = useState<string>("__all__");
  const [reverseFromPrev, setReverseFromPrev] = useState<boolean>(false);
  const [showTeamGrid, setShowTeamGrid] = useState<boolean>(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [autoRun, setAutoRun] = useState(false);


  // Prior rounds in the same association (read-only — never mutated).
  const { data: priorFixtures } = useQuery({
    queryKey: ["prior-round-fixtures", round.association_id, round.round_number],
    queryFn: async () => {
      const { data: roundRows, error: rErr } = await fromExt("league_rounds")
        .select("id, round_number, name")
        .eq("association_id", round.association_id)
        .lt("round_number", round.round_number);
      if (rErr) throw rErr;
      const priorRoundIds = (roundRows ?? []).map((r: any) => r.id);
      if (!priorRoundIds.length) return [] as PriorFixture[];
      const meta = new Map<string, { round_number: number; name: string }>(
        (roundRows ?? []).map((r: any) => [r.id as string, { round_number: r.round_number, name: r.name }]),
      );
      const { data: fxs, error: fErr } = await fromExt("platform_league_fixtures")
        .select("home_team_code, away_team_code, court_id, fixture_date, start_time, round_id")
        .in("round_id", priorRoundIds);
      if (fErr) throw fErr;
      return ((fxs ?? []) as any[]).map((f) => ({
        ...f,
        round_number: meta.get(f.round_id)?.round_number ?? null,
        round_name: meta.get(f.round_id)?.name ?? null,
      })) as PriorFixture[];
    },
    enabled: open && !!round.association_id,
  });

  const tierGroups = useMemo(
    () => inferTiersFromPriorFixtures(priorFixtures ?? []),
    [priorFixtures],
  );

  // Keep the team checkboxes aligned with saved fixtures when viewing a round.
  useEffect(() => {
    if (!open || !teams.length || draft || fixtures === undefined) return;
    const savedCodes = new Set<string>();
    for (const fixture of fixtures) {
      if (fixture.home_team_code && fixture.home_team_code !== "__BYE__") savedCodes.add(fixture.home_team_code);
      if (fixture.away_team_code && fixture.away_team_code !== "__BYE__") savedCodes.add(fixture.away_team_code);
    }
    setSelectedTeams(savedCodes.size ? teams.filter((t) => savedCodes.has(t.code)).map((t) => t.code) : teams.map((t) => t.code));
  }, [open, fixtures, teams, draft]);

  // Selecting a tier auto-checks exactly that tier's teams.
  useEffect(() => {
    if (tier === "__all__" || tier === "__custom__") return;
    const codes = tierGroups.get(tier) ?? [];
    const valid = codes.filter((c) => teams.some((t) => t.code === c));
    if (valid.length) setSelectedTeams(valid);
  }, [tier, tierGroups, teams]);

  const list = draft ?? fixtures ?? [];

  const autoDistribute = () => {
    if (selectedTeams.length < 2) {
      toast.error("Select at least 2 teams to distribute.");
      return;
    }
    if (!round.court_ids?.length) {
      toast.error("No courts assigned to this round. Edit the round and pick at least one court.");
      return;
    }
    if (!round.start_time || !round.end_time || !round.slot_minutes) {
      toast.error("Round is missing start/end time or slot length.");
      return;
    }
    const teamSet = new Set(selectedTeams);
    const prior = priorFixtures ?? [];
    const priorUsage = buildPriorCourtUsage(prior, teamSet);
    const skipDatesForRound = (((round as any).skip_dates ?? []) as any[]).map((d) => String(d).slice(0, 10));

    let allocation;
    if (reverseFromPrev) {
      const reversed = reversePairingsFromPrior(prior, teamSet);
      if (!reversed) {
        toast.error("No matching previous round found for these teams. Falling back to round-robin.");
      }
      if (reversed) {
        // Treat as one batch (same matchday). Spread across dates if multiple.
        allocation = allocatePairingsWithCourtFairness(
          [reversed],
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          priorUsage,
          skipDatesForRound,
        );
      }
    }
    if (!allocation) {
      // Use fairness allocator over full round-robin batches when prior usage exists,
      // otherwise fall back to the simple modulo allocator.
      if (priorUsage.size > 0) {
        const batches = roundRobin(selectedTeams);
        allocation = allocatePairingsWithCourtFairness(
          batches,
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          priorUsage,
          skipDatesForRound,
        );
      } else {
        allocation = allocateRoundRobinByDate(
          selectedTeams,
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          false,
          skipDatesForRound,
        );
      }
    }
    const { slots, byes, error } = allocation;
    console.log("[autoDistribute]", { selectedTeams, court_ids: round.court_ids, start: round.start_time, end: round.end_time, slot: round.slot_minutes, range: [round.round_date, round.end_date], play_dows: (round as any).play_dows, slots, byes });
    if (error) {
      toast.error(error);
      return;
    }
    if (!slots.length) {
      toast.error("Couldn't generate fixtures — check the time window and slot length.");
      return;
    }
    const addMinutes = (hhmm: string, mins: number) => {
      const [h, m] = hhmm.split(":").map(Number);
      const total = h * 60 + m + mins;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const generated: EditableFixture[] = slots.map((s) => ({
      home_team_code: s.home,
      away_team_code: s.away,
      court_id: s.courtId,
      start_time: s.startTime,
      end_time: addMinutes(s.startTime, round.slot_minutes),
      fixture_date: s.date,
    }));

    const byeRows: EditableFixture[] = byes.map((bye) => ({
      home_team_code: bye.team,
      away_team_code: "__BYE__",
      court_id: null,
      start_time: null,
      end_time: null,
      fixture_date: bye.date,
    }));

    setDraft([...generated, ...byeRows]);
    const dayCount = new Set(slots.map((s) => s.date)).size;
    toast.success(
      `Generated ${generated.length} fixtures across ${dayCount} day(s)` +
        (byeRows.length ? ` · ${byeRows.length} bye(s)` : ""),
    );
  };

  // "Create fixtures" on the collapsed row: expand, then generate straight away
  // instead of leaving the organiser on an empty table wondering what happened.
  useEffect(() => {
    if (!autoRun || !open || fixtures === undefined) return;
    setAutoRun(false);
    autoDistribute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, open, fixtures]);


  /**
   * Re-balance courts on the current fixtures using a fairness scorer that
   * considers prior-round usage. Only court_id changes; pairings/dates/times
   * are preserved. Prior rounds are read only.
   */
  const rotateCourtsOnly = () => {
    const courtIds = round.court_ids ?? [];
    if (courtIds.length < 2) {
      toast.error("Need at least 2 courts assigned to this round to rotate.");
      return;
    }
    if (!list.length) {
      toast.error("No fixtures to rotate yet — generate or save fixtures first.");
      return;
    }
    const teamSet = new Set<string>();
    list.forEach((f) => { if (f.home_team_code) teamSet.add(f.home_team_code); if (f.away_team_code && f.away_team_code !== "__BYE__") teamSet.add(f.away_team_code); });
    const priorUsage = buildPriorCourtUsage(priorFixtures ?? [], teamSet);
    const assignments = fairCourtAssignmentForExistingFixtures(
      list.map((f, i) => ({ ...f, id: f.id ?? `idx:${i}` })) as any,
      courtIds,
      priorUsage,
    );
    const byKey = new Map(assignments.map((a) => [a.id, a.court_id] as const));
    const next = list.map((f, i) => {
      if (!f.fixture_date || !f.start_time || f.away_team_code === "__BYE__") return f;
      const k = f.id ?? `idx:${i}`;
      const c = byKey.get(k);
      return c ? { ...f, court_id: c } : f;
    });
    setDraft(next);
    const dateCount = new Set(list.map((f) => f.fixture_date).filter(Boolean)).size;
    toast.success(`Re-balanced courts across ${dateCount} date(s) using prior-round usage — pairings unchanged.`);
  };

  const saveFixtures = useMutation({
    mutationFn: async (opts?: { syncBookings?: boolean }) => {
      const syncBookings = !!opts?.syncBookings;

      // ─────────────────────────────────────────────────────────────
      // Non-destructive save (protects captain-submitted scorecards):
      //  • Existing fixtures are UPDATED in place — fixture_id stays
      //    stable so league_fixture_results / lineups stay linked.
      //  • Draft rows without an id are matched to an existing fixture
      //    by (home_team_code, away_team_code) and updated; otherwise
      //    inserted as new.
      //  • Existing fixtures missing from the draft are deleted only
      //    if they have NO saved results, lineups or match rubbers.
      //    If any do, the save aborts with a clear error.
      // ─────────────────────────────────────────────────────────────

      const { data: existingFixtures, error: existingErr } = await fromExt("platform_league_fixtures")
        .select("id, home_team_code, away_team_code, booking_id, fixture_date, court_id, start_time, end_time")
        .eq("round_id", round.id);
      if (existingErr) throw existingErr;
      type ExRow = { id: string; home_team_code: string; away_team_code: string; booking_id: string | null; fixture_date: string | null; court_id: number | null; start_time: string | null; end_time: string | null };
      const existing = (existingFixtures ?? []) as ExRow[];

      // Match draft rows to existing fixtures.
      const usedExistingIds = new Set<string>();
      const matchedPairs: { draft: EditableFixture; existingRow: ExRow }[] = [];
      const toInsert: EditableFixture[] = [];

      for (const d of list) {
        if (d.id) {
          const row = existing.find((e) => e.id === d.id && !usedExistingIds.has(e.id));
          if (row) { matchedPairs.push({ draft: d, existingRow: row }); usedExistingIds.add(row.id); continue; }
        }
        const pairMatch = existing.find(
          (e) => !usedExistingIds.has(e.id)
            && e.home_team_code === d.home_team_code
            && e.away_team_code === d.away_team_code,
        );
        if (pairMatch) { matchedPairs.push({ draft: d, existingRow: pairMatch }); usedExistingIds.add(pairMatch.id); }
        else { toInsert.push(d); }
      }

      const toDelete = existing.filter((e) => !usedExistingIds.has(e.id));

      // GUARD: refuse to drop fixtures that have any saved results / lineups / rubbers.
      if (toDelete.length) {
        const ids = toDelete.map((e) => e.id);
        const [{ data: resRows }, { data: lineupRows }, { data: matchRows }] = await Promise.all([
          fromExt("league_fixture_results").select("fixture_id").in("fixture_id", ids),
          fromExt("league_fixture_lineups").select("fixture_id").in("fixture_id", ids),
          fromExt("league_match_results").select("fixture_id").in("fixture_id", ids),
        ]);
        const protectedIds = new Set<string>([
          ...((resRows ?? []) as any[]).map((r) => r.fixture_id),
          ...((lineupRows ?? []) as any[]).map((r) => r.fixture_id),
          ...((matchRows ?? []) as any[]).map((r) => r.fixture_id),
        ]);
        const blocked = toDelete.filter((e) => protectedIds.has(e.id));
        if (blocked.length) {
          const labels = blocked.map((e) => `${e.home_team_code} vs ${e.away_team_code}`).join(", ");
          throw new Error(
            `${blocked.length} fixture(s) have saved scorecards or lineups and cannot be removed: ${labels}. ` +
            `Edit those fixtures in place instead, or clear their saved results first.`,
          );
        }
      }

      // Ensure platform association linkage (needed for inserts).
      const { data: platformAssocId, error: linkErr } = await supabase.rpc(
        "ensure_platform_association_for_league" as any,
        { _association_id: round.association_id },
      );
      if (linkErr) throw linkErr;
      if (!platformAssocId) throw new Error("Could not link league to platform association.");

      const fixtureCourtIds = Array.from(new Set<number>(
        list
          .map((f) => Number(f.court_id))
          .filter((n) => Number.isFinite(n) && n > 0),
      ));
      let saveVenueByCourt = new Map<number, string>();
      if (fixtureCourtIds.length) {
        const { data: courtRows, error: courtErr } = await supabase
          .from("courts")
          .select("id, venue_name, clubs(name)")
          .in("id", fixtureCourtIds);
        if (courtErr) throw courtErr;
        saveVenueByCourt = new Map(
          ((courtRows ?? []) as any[]).map((c) => [
            Number(c.id),
            c.venue_name?.trim() || c.clubs?.name || "Home",
          ]),
        );
      }
      const saveVenueForCourt = (courtId?: number | null) =>
        courtId ? (saveVenueByCourt.get(Number(courtId)) ?? "Home") : (round.venue_name || "Home");

      // 1) Delete safe (no-result) unmatched fixtures + cancel their bookings.
      const bookingIdsToCancel = toDelete.map((e) => e.booking_id).filter(Boolean) as string[];
      if (bookingIdsToCancel.length) {
        const { error: cancelErr } = await supabase
          .from("bookings").update({ status: "cancelled" }).in("id", bookingIdsToCancel);
        if (cancelErr) throw cancelErr;
      }
      if (toDelete.length) {
        const { error: delErr } = await fromExt("platform_league_fixtures")
          .delete().in("id", toDelete.map((e) => e.id));
        if (delErr) throw delErr;
      }

      // 2) In-place UPDATE for matched fixtures (id and saved results survive).
      type ActiveRow = { id: string; court_id: number | null; start_time: string | null; end_time: string | null; fixture_date: string | null; home_team_code: string; away_team_code: string; booking_id: string | null };
      const updatedRows: ActiveRow[] = [];
      for (const { draft: d, existingRow } of matchedPairs) {
        const isBye = d.away_team_code === "__BYE__";
        const patch = {
          fixture_date: d.fixture_date || round.round_date,
          venue_name: saveVenueForCourt(isBye ? null : d.court_id),
          home_team_code: d.home_team_code,
          away_team_code: d.away_team_code,
          division: d.home_team_code,
          status: isBye ? "bye" : "scheduled",
          court_id: isBye ? null : d.court_id,
          start_time: isBye ? null : d.start_time,
          end_time: isBye ? null : (d.end_time ?? null),
        };
        const { error: upErr } = await fromExt("platform_league_fixtures").update(patch).eq("id", existingRow.id);
        if (upErr) throw upErr;
        updatedRows.push({ ...existingRow, ...patch });
      }

      // 3) INSERT brand-new fixtures.
      let insertedRows: ActiveRow[] = [];
      if (toInsert.length) {
        const rows = toInsert.map((f) => {
          const isBye = f.away_team_code === "__BYE__";
          return {
            association_id: platformAssocId,
            round_id: round.id,
            fixture_date: f.fixture_date || round.round_date,
            venue_name: saveVenueForCourt(isBye ? null : f.court_id),
            home_team_code: f.home_team_code,
            away_team_code: f.away_team_code,
            division: f.home_team_code,
            status: isBye ? "bye" : "scheduled",
            court_id: isBye ? null : f.court_id,
            start_time: isBye ? null : f.start_time,
            end_time: isBye ? null : (f.end_time ?? null),
          };
        });
        const { data: inserted, error } = await fromExt("platform_league_fixtures")
          .insert(rows)
          .select("id, court_id, start_time, end_time, fixture_date, home_team_code, away_team_code, booking_id");
        if (error) throw error;
        insertedRows = (inserted ?? []) as any;
      }

      // 4) Booking sync — always keep linked bookings aligned with their
      //    fixture's current court/date/time. Cancel bookings for BYEs or
      //    fixtures that lost their court. Only *creating* brand-new bookings
      //    for previously-unbooked fixtures is gated on the auto-create toggle.
      const allActive = [...updatedRows, ...insertedRows];

      // If the admin asked for a full sync, recreate regular linked court
      // bookings instead of updating them in place. This avoids unique-slot
      // collisions when old bookings are currently attached to the wrong
      // fixture/court. Event and external bookings are never cancelled here.
      if (syncBookings) {
        const linkedBookingIds = Array.from(new Set(allActive.map((f) => f.booking_id).filter(Boolean) as string[]));
        if (linkedBookingIds.length) {
          const { data: linkedBookings, error: linkedErr } = await supabase
            .from("bookings")
            .select("id, source")
            .in("id", linkedBookingIds);
          if (linkedErr) throw linkedErr;
          const recreateIds = ((linkedBookings ?? []) as Array<{ id: string; source: string | null }>)
            .filter((b) => b.source !== "club_event" && b.source !== "gobook")
            .map((b) => b.id);
          const protectedIds = ((linkedBookings ?? []) as Array<{ id: string; source: string | null }>)
            .filter((b) => b.source === "club_event" || b.source === "gobook")
            .map((b) => b.id);
          if (recreateIds.length) {
            const { error: cancelErr } = await supabase.from("bookings").update({ status: "cancelled" }).in("id", recreateIds);
            if (cancelErr) throw cancelErr;
          }
          const unlinkIds = [...recreateIds, ...protectedIds];
          if (unlinkIds.length) {
            const { error: unlinkErr } = await fromExt("platform_league_fixtures")
              .update({ booking_id: null })
              .in("id", allActive.map((f) => f.id))
              .in("booking_id", unlinkIds);
            if (unlinkErr) throw unlinkErr;
            for (const f of allActive) {
              if (f.booking_id && unlinkIds.includes(f.booking_id)) f.booking_id = null;
            }
          }
        }
      }

      // 4a) Optional deep sync: cancel any stray active bookings on this round's
      //     courts within its date window that aren't linked to a current fixture,
      //     so manual/leftover bookings from prior schedules don't collide.
      if (syncBookings && round.court_ids?.length) {
        const startDate = round.round_date;
        const endDate = round.end_date || round.round_date;
        const keepIds = new Set(allActive.map((f) => f.booking_id).filter(Boolean) as string[]);
        const { data: existingBookings } = await supabase
          .from("bookings")
          .select("id, source")
          .in("court_id", round.court_ids)
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("status", "active")
          .not("source", "in", "(club_event,gobook)");

        const stray = ((existingBookings ?? []) as { id: string }[])
          .filter((b) => !keepIds.has(b.id))
          .map((b) => b.id);
        if (stray.length) {
          await supabase.from("bookings").update({ status: "cancelled" }).in("id", stray);
        }
      }

      if (allActive.length) {
        const { data: { user } } = await supabase.auth.getUser();
        for (const f of allActive) {
          const isBye = f.away_team_code === "__BYE__";
          const hasSlot = !!(f.court_id && f.start_time);

          if ((isBye || !hasSlot) && f.booking_id) {
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", f.booking_id);
            await fromExt("platform_league_fixtures").update({ booking_id: null }).eq("id", f.id);
            continue;
          }
          if (!hasSlot) continue;

          let endTime: string;
          if (f.end_time) {
            endTime = String(f.end_time).slice(0, 5);
          } else {
            const [h, m] = String(f.start_time).split(":").map(Number);
            const startMin = h * 60 + m;
            const endMin = startMin + round.slot_minutes;
            endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
          }
          const homeName = teams.find((t) => t.code === f.home_team_code)?.name?.trim();
          const awayName = teams.find((t) => t.code === f.away_team_code)?.name?.trim();
          const matchup = homeName && awayName ? `${homeName} vs ${awayName}` : "";
          const guestName = matchup ? `${round.name} - ${matchup}` : round.name;
          const startStr = String(f.start_time).slice(0, 5);

          if (f.booking_id) {
            await supabase.from("bookings").update({
              court_id: f.court_id,
              date: f.fixture_date || round.round_date,
              start_time: `${startStr}:00`,
              end_time: `${endTime}:00`,
              guest_name: guestName,
              status: "active",
            }).eq("id", f.booking_id);
          } else if ((autoCreateBookings || syncBookings) && user) {
            const { data: conflicts, error: conflictErr } = await supabase
              .from("bookings")
              .select("id")
              .eq("court_id", f.court_id)
              .eq("date", f.fixture_date || round.round_date)
              .eq("start_time", `${startStr}:00`)
              .eq("status", "active")
              .limit(1);
            if (conflictErr) throw conflictErr;
            if (conflicts?.length) continue;
            // Re-use a previously cancelled booking on this exact slot instead
            // of inserting a new row — avoids silent unique-slot failures that
            // would leave the fixture without a court booking.
            const { data: reusable } = await supabase
              .from("bookings")
              .select("id")
              .eq("court_id", f.court_id)
              .eq("date", f.fixture_date || round.round_date)
              .eq("start_time", `${startStr}:00`)
              .eq("status", "cancelled")
              .limit(1);
            if (reusable?.length) {
              const { error: reErr } = await supabase
                .from("bookings")
                .update({
                  status: "active",
                  booking_type: "league",
                  end_time: `${endTime}:00`,
                  guest_name: guestName,
                })
                .eq("id", reusable[0].id);
              if (!reErr) {
                await fromExt("platform_league_fixtures").update({ booking_id: reusable[0].id }).eq("id", f.id);
                continue;
              }
            }
            const { data: booking, error: bErr } = await supabase
              .from("bookings")
              .insert({
                court_id: f.court_id, user_id: user.id,
                date: f.fixture_date || round.round_date,
                start_time: `${startStr}:00`, end_time: `${endTime}:00`,
                status: "active", is_friendly: false,
                club_id: clubId, guest_name: guestName,
                source: "squashhub", booking_type: "league",
              })
              .select("id").single();
            if (bErr) {
              console.error("league booking create failed", bErr);
              toast.error(`Court booking failed for ${guestName}: ${bErr.message}`);
            } else if (booking) {
              await fromExt("platform_league_fixtures").update({ booking_id: booking.id }).eq("id", f.id);
            }

          }
        }
      }
    },

    onSuccess: () => {
      setDraft(null);
      refetch();
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Fixtures saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const buildAndExportPdf = async (mode: "download" | "share") => {
    try {
      const [{ data: fxRows, error: fxErr }, { data: courtRows }] = await Promise.all([
        fromExt("platform_league_fixtures")
          .select("home_team_code, away_team_code, court_id, start_time, fixture_date")
          .eq("round_id", round.id)
          .order("fixture_date", { ascending: true })
          .order("start_time", { ascending: true }),
        round.court_ids?.length
          ? supabase.from("courts").select("id, name").in("id", round.court_ids)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      if (fxErr) throw fxErr;
      const fx = (fxRows ?? []) as Array<{ home_team_code: string; away_team_code: string; court_id: string | null; start_time: string | null; fixture_date: string | null }>;
      if (!fx.length) { toast.error("No fixtures to export."); return; }

      const courtName = (id: string | null) => (courtRows ?? []).find((c: any) => c.id === id)?.name ?? "—";
      const teamName = (code: string) => teams.find((t) => t.code === code)?.name ?? code;

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const dateLine =
        format(parseISO(round.round_date), "EEE d MMM yyyy") +
        (round.end_date && round.end_date !== round.round_date ? ` – ${format(parseISO(round.end_date), "EEE d MMM yyyy")}` : "");

      doc.setFontSize(16);
      doc.text(round.name, 40, 50);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${dateLine}  ·  ${round.start_time}–${round.end_time}${round.venue_name ? `  ·  ${round.venue_name}` : ""}`, 40, 68);
      doc.setTextColor(0);

      const rows = fx.map((f) => {
        const isBye = f.away_team_code === "__BYE__";
        return [
          f.fixture_date ? format(parseISO(f.fixture_date), "EEE d MMM") : "—",
          isBye ? "—" : (f.start_time ?? "").slice(0, 5),
          isBye ? "—" : courtName(f.court_id),
          teamName(f.home_team_code),
          isBye ? "BYE" : "vs",
          isBye ? "" : teamName(f.away_team_code),
        ];
      });

      autoTable(doc, {
        startY: 90,
        head: [["Date", "Time", "Court", "Home", "", "Away"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [30, 58, 95] },
      });

      const filename = `${round.name.replace(/[^a-z0-9]+/gi, "-")}-fixtures.pdf`;

      if (mode === "share" && (navigator as any).canShare) {
        const blob = doc.output("blob");
        const file = new File([blob], filename, { type: "application/pdf" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({ files: [file], title: round.name, text: `${round.name} fixtures` });
          return;
        }
      }
      doc.save(filename);
      if (mode === "share") toast.message("Sharing not supported here — downloaded instead.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export fixtures");
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <div className="font-medium text-sm">{round.name}</div>
            <div className="text-xs text-muted-foreground">
              {format(parseISO(round.round_date), "EEE d MMM")}{round.end_date && round.end_date !== round.round_date ? ` – ${format(parseISO(round.end_date), "EEE d MMM")}` : ""} · {round.start_time}–{round.end_time} · {round.court_ids.length} court{round.court_ids.length === 1 ? "" : "s"}
              {round.venue_name && ` · ${round.venue_name}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(fixtureCount ?? 0) > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {fixtureCount} fixture{fixtureCount === 1 ? "" : "s"} · click to {open ? "hide" : "view"}
            </Badge>
          ) : isAdmin ? (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-primary hover:text-primary-foreground"
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setAutoRun(true);
                if (!open) onToggle();
              }}
            >
              Create fixtures
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">No fixtures yet</Badge>
          )}

          {(fixtureCount ?? 0) > 0 && (
            <>
              <Button
                size="icon"
                variant="ghost"
                title="Download as PDF"
                onClick={(e) => { e.stopPropagation(); void buildAndExportPdf("download"); }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Share"
                onClick={(e) => { e.stopPropagation(); void buildAndExportPdf("share"); }}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {isAdmin && (
            <>
              {(fixtureCount ?? 0) > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Postpone a match day (holiday)"
                  onClick={(e) => { e.stopPropagation(); setPostponeOpen(true); }}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {canDelete && (
                <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete round">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </button>

      {open && (
        <div className="p-3 border-t space-y-3">
          {isAdmin && (
            <div className="rounded border bg-muted/20 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-medium">Teams in this round</div>
                {tierGroups.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Tier</Label>
                    <Select value={tier} onValueChange={setTier}>
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="Pick a tier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All teams</SelectItem>
                        {Array.from(tierGroups.keys()).map((t) => (
                          <SelectItem key={t} value={t}>
                            {t} ({tierGroups.get(t)?.length ?? 0})
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {selectedTeams.length
                  ? selectedTeams
                      .map((c) => teams.find((t) => t.code === c)?.name ?? c)
                      .join(" · ")
                  : <span className="text-muted-foreground">No teams selected</span>}
              </div>
              <button
                type="button"
                className="text-[11px] underline text-muted-foreground"
                onClick={() => setShowTeamGrid((v) => !v)}
              >
                {showTeamGrid ? "Hide team list" : "Edit team list"}
              </button>
              {showTeamGrid && (
                <div className="flex flex-wrap gap-2 pt-1 border-t">
                  {teams.map((t) => (
                    <label key={t.code} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={selectedTeams.includes(t.code)}
                        onCheckedChange={(v) => {
                          setTier("__custom__");
                          setSelectedTeams((prev) =>
                            v ? [...new Set([...prev, t.code])] : prev.filter((x) => x !== t.code),
                          );
                        }}
                      />
                      {t.name}
                    </label>
                  ))}
                  {!teams.length && <span className="text-xs text-muted-foreground">No teams in this association</span>}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap border-t">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={autoCreateBookings} onCheckedChange={(v) => setAutoCreateBookings(!!v)} />
                    <CalendarPlus className="h-3.5 w-3.5" /> Auto-create court bookings on save
                  </label>
                  {(priorFixtures?.length ?? 0) > 0 && (
                    <label className="flex items-center gap-2 text-xs" title="Swap home/away from the most recent prior round covering these teams">
                      <Checkbox checked={reverseFromPrev} onCheckedChange={(v) => setReverseFromPrev(!!v)} />
                      Reverse home/away from previous round
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rotateCourtsOnly}
                    disabled={!list.length || (round.court_ids?.length ?? 0) < 2}
                    title="Shift courts across dates without changing pairings or times"
                  >
                    Re-balance courts
                  </Button>
                  <Button size="sm" variant="secondary" onClick={autoDistribute} disabled={selectedTeams.length < 2}>
                    <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-distribute
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isAdmin ? (
            <>
              <div className="flex justify-end gap-2">
                {draft && (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>
                )}
                <Button size="sm" onClick={() => {
                  const sync = window.confirm(
                    "Also sync court bookings?\n\nOK  – Cancel any existing bookings on this round's courts within its date range and recreate them to match these fixtures (replaces manual bookings).\nCancel – Only update bookings that are already linked to fixtures.",
                  );
                  saveFixtures.mutate({ syncBookings: sync });
                }} disabled={saveFixtures.isPending}>

                  {saveFixtures.isPending ? "Saving…" : "Save fixtures"}
                </Button>
              </div>
              <FixtureEditorTable
                fixtures={list}
                teams={teams}
                courts={courts ?? []}
                onChange={setDraft}
                defaultDate={round.round_date}
                minDate={round.round_date}
                maxDate={round.end_date || round.round_date}
                defaultStart={round.start_time as any}
                defaultEnd={(round as any).end_time}
              />
              <div className="flex justify-end gap-2">
                {draft && (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>
                )}
                <Button size="sm" onClick={() => {
                  const sync = window.confirm(
                    "Also sync court bookings?\n\nOK  – Cancel any existing bookings on this round's courts within its date range and recreate them to match these fixtures (replaces manual bookings).\nCancel – Only update bookings that are already linked to fixtures.",
                  );
                  saveFixtures.mutate({ syncBookings: sync });
                }} disabled={saveFixtures.isPending}>

                  {saveFixtures.isPending ? "Saving…" : "Save fixtures"}
                </Button>
              </div>
            </>
          ) : (
            <ReadOnlyFixtures fixtures={fixtures ?? []} courts={courts ?? []} teams={teams} fallbackDate={round.round_date} />
          )}
        </div>
      )}
      {isAdmin && (
        <PostponeMatchdayDialog
          open={postponeOpen}
          onOpenChange={setPostponeOpen}
          roundId={round.id}
          roundName={round.name ?? "Round"}
          onDone={() => { refetch(); }}
        />
      )}
    </Card>
  );
}

function ReadOnlyFixtures({
  fixtures,
  courts,
  teams,
  fallbackDate,
}: {
  fixtures: EditableFixture[];
  courts: { id: number; name: string; venue_name?: string | null }[];
  teams: { code: string; name: string }[];
  fallbackDate?: string;
}) {
  if (!fixtures.length) {
    return (
      <div className="rounded border p-4 text-center text-xs text-muted-foreground">
        No fixtures published yet.
      </div>
    );
  }
  const teamName = (code: string) => teams.find((t) => t.code === code)?.name ?? code;
  const courtOf = (id: number | null) => (id ? courts.find((c) => c.id === id) : null);
  const courtName = (id: number | null) => courtOf(id)?.name ?? (id ? `Court ${id}` : "—");
  const venueOf = (id: number | null) => courtOf(id)?.venue_name ?? "—";
  const fmtDate = (d?: string | null) => {
    const v = d || fallbackDate;
    if (!v) return "—";
    try { return format(parseISO(v), "EEE d MMM"); } catch { return v; }
  };
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">Date</th>
            <th className="p-2">Time</th>
            <th className="p-2">Venue</th>
            <th className="p-2">Court</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{fmtDate(f.fixture_date)}</td>
              <td className="p-2">{f.start_time?.slice(0, 5) ?? "—"}</td>
              <td className="p-2">{venueOf(f.court_id)}</td>
              <td className="p-2">{courtName(f.court_id)}</td>
              <td className="p-2">{teamName(f.home_team_code)}</td>
              <td className="p-2">{teamName(f.away_team_code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
