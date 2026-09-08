import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { publicHolidays, schoolBreaks, weekDates, weekStart } from "@/lib/leagues/calendar";


export type RoundDraft = {
  id?: string;
  round_number: number;
  name: string;
  round_date: string;       // start date yyyy-MM-dd
  end_date: string;         // end date yyyy-MM-dd
  venue_name: string;
  court_ids: number[];
  start_time: string;
  end_time: string;
  slot_minutes: number;
  play_dows: number[];      // 0=Sun..6=Sat; empty = any day
  skip_dates: string[];     // yyyy-MM-dd dates to skip (holidays / breaks)
  notes?: string | null;
  auto_create_bookings?: boolean;
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minutes between two HH:mm strings (start -> end). */
const minutesBetween = (startTime: string, endTime: string) => {
  const [sh, sm] = (startTime || "").split(":").map(Number);
  const [eh, em] = (endTime || "").split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return (eh * 60 + em) - (sh * 60 + sm);
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  associationId: string;
  initial?: Partial<RoundDraft>;
  onSave: (r: RoundDraft) => Promise<void> | void;
};

export function RoundConfigDialog({ open, onOpenChange, clubId, associationId, initial, onSave }: Props) {
  const { data: courts } = useQuery({
    queryKey: ["club-courts-for-rounds", clubId, associationId],
    queryFn: async () => {
      // Collect club IDs: this club + every club in the same association (via leagues
      // and via association_affiliated_clubs so cross-club courts show up even when
      // that club isn't fielding a team in this specific association season).
      const clubIds = new Set<string>([clubId]);
      if (associationId) {
        const [{ data: assocLeagueClubs }, { data: assocAffiliated }] = await Promise.all([
          fromExt("leagues").select("club_id").eq("association_id", associationId),
          supabase
            .from("association_affiliated_clubs")
            .select("club_id")
            .eq("association_tenant_id", associationId)
            .eq("status", "active"),
        ]);
        (assocLeagueClubs ?? []).forEach((r: any) => r?.club_id && clubIds.add(r.club_id));
        (assocAffiliated ?? []).forEach((r: any) => r?.club_id && clubIds.add(r.club_id));
      }
      // Include external courts too — admins use these to represent visitor venues.
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, venue_name, club_id, is_external, clubs(name)")
        .in("club_id", Array.from(clubIds))
        .order("venue_name", { ascending: true, nullsFirst: true })
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        ...c,
        venue_label: c.venue_name?.trim() || c.clubs?.name || "Other",
      }));
    },
    enabled: !!clubId && open,
  });

  // Venue options: derived from the courts list so external + affiliated venues appear
  const venueOptions = (() => {
    const names = new Set<string>();
    for (const c of (courts ?? []) as any[]) {
      if (c.venue_label) names.add(c.venue_label);
    }
    return Array.from(names).sort();
  })();

  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<RoundDraft>({
    round_number: initial?.round_number ?? 1,
    name: initial?.name ?? "1st League Round 1",
    round_date: initial?.round_date ?? today,
    end_date: initial?.end_date ?? initial?.round_date ?? today,
    venue_name: initial?.venue_name ?? "",
    court_ids: initial?.court_ids ?? [],
    start_time: initial?.start_time ?? "18:00",
    end_time: initial?.end_time ?? "20:00",
    slot_minutes:
      initial?.slot_minutes ??
      minutesBetween(initial?.start_time ?? "18:00", initial?.end_time ?? "20:00") ??
      120,
    play_dows: initial?.play_dows ?? [],
    skip_dates: (initial?.skip_dates ?? []).map((d) => String(d).slice(0, 10)),
    notes: initial?.notes ?? "",
    auto_create_bookings: initial?.auto_create_bookings ?? true,
    id: initial?.id,
  });

  // Default assumption: a team plays once an evening, so one fixture fills the
  // whole window on a court. Unticking exposes the manual slot length again.
  const [oneFixturePerNight, setOneFixturePerNight] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft((d) => ({
        ...d,
        ...initial,
        end_date: initial.end_date ?? initial.round_date ?? d.end_date,
      } as RoundDraft));
    }
    const start = initial?.start_time ?? draft.start_time;
    const end = initial?.end_time ?? draft.end_time;
    const slot = Number(initial?.slot_minutes ?? draft.slot_minutes);
    const window = minutesBetween(start, end);
    setOneFixturePerNight(!slot || !window || slot >= window);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


  // Selected venues drive which court groups appear.
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);

  // Seed selected venues when opening: parse existing venue_name (comma-joined)
  // and also include any venue implied by pre-selected courts.
  useEffect(() => {
    if (!open) return;
    const fromName = (draft.venue_name ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fromCourts = (courts ?? [])
      .filter((c: any) => draft.court_ids.includes(c.id))
      .map((c: any) => c.venue_label);
    const merged = Array.from(new Set([...fromName, ...fromCourts])).filter(
      (v) => !venueOptions.length || venueOptions.includes(v),
    );
    if (merged.length) {
      setSelectedVenues(merged);
    } else if (venueOptions.length) {
      setSelectedVenues([venueOptions[0]]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueOptions.join("|")]);

  const toggleVenue = (name: string) =>
    setSelectedVenues((prev) => {
      const next = prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name];
      // Drop any selected courts whose venue is no longer selected
      setDraft((d) => ({
        ...d,
        court_ids: d.court_ids.filter((cid) => {
          const c = (courts ?? []).find((x: any) => x.id === cid);
          return c ? next.includes(c.venue_label) : true;
        }),
      }));
      return next;
    });

  const toggleCourt = (id: number) =>
    setDraft((d) => ({
      ...d,
      court_ids: d.court_ids.includes(id) ? d.court_ids.filter((x) => x !== id) : [...d.court_ids, id],
    }));

  const [saving, setSaving] = useState(false);
  const datesInvalid = draft.end_date < draft.round_date;

  // Same calendar rules as the association season builder: public holidays (and
  // optionally school-break weeks) are switched off by default.
  const [holidayWeekOff, setHolidayWeekOff] = useState(true);
  const [breakWeekOff, setBreakWeekOff] = useState(false);
  // Dates the admin deliberately ticked back on, so auto-skip never re-skips them.
  const [manualOn, setManualOn] = useState<string[]>([]);
  // Dates the admin deliberately unticked, so removing an auto-skip reason
  // (unticking the holiday/break switches) doesn't silently bring them back.
  const [manualOff, setManualOff] = useState<string[]>([]);

  // Re-opening a saved round must keep the weeks the admin already excluded:
  // treat every stored skip date as a deliberate manual exclusion.
  useEffect(() => {
    if (!open) return;
    const saved = (initial?.skip_dates ?? []).map((d) => String(d).slice(0, 10));
    setManualOff(saved);
    setManualOn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Weekly matchday preview from the start date, honouring the selected play
  // days. Admins untick holiday weeks; those land in `skip_dates`.
  const upcomingPlayDates = (() => {
    if (!draft.round_date) return [] as string[];
    const allowed = draft.play_dows.length ? new Set(draft.play_dows) : null;
    const [y, m, d] = draft.round_date.split("-").map(Number);
    if (!y || !m || !d) return [] as string[];
    let ms = Date.UTC(y, m - 1, d);
    const out: string[] = [];
    const limit = draft.end_date && draft.end_date > draft.round_date ? draft.end_date : null;
    let guard = 0;
    while (out.length < 16 && guard < 400) {
      const dt = new Date(ms);
      const iso = dt.toISOString().slice(0, 10);
      if (limit && iso > limit) break;
      if (!allowed || allowed.has(dt.getUTCDay())) out.push(iso);
      ms += 86400000;
      guard++;
    }
    return out;
  })();

  // Reason (if any) a given play date should be skipped by default.
  const calendarNotes = (() => {
    const notes = new Map<string, string>();
    if (!upcomingPlayDates.length) return notes;
    const years = new Set(upcomingPlayDates.map((d) => Number(d.slice(0, 4))));
    const holidayMap = new Map<string, string>();
    const breaks: { start: string; end: string; name: string }[] = [];
    for (const year of years) {
      for (const h of publicHolidays(year)) holidayMap.set(h.date, h.name);
      for (const y2 of [year - 1, year, year + 1]) breaks.push(...schoolBreaks(y2));
      for (const h of publicHolidays(year + 1)) holidayMap.set(h.date, h.name);
    }
    for (const date of upcomingPlayDates) {
      const week = weekDates(weekStart(date));
      const hit = week.map((d) => holidayMap.get(d) && { d, name: holidayMap.get(d)! }).find(Boolean) as
        | { d: string; name: string }
        | undefined;
      if (holidayMap.has(date)) {
        notes.set(date, holidayMap.get(date)!);
      } else if (holidayWeekOff && hit) {
        notes.set(date, `${hit.name} week`);
      } else if (breakWeekOff) {
        const br = breaks.find((b) => week.some((d) => d >= b.start && d <= b.end));
        if (br) notes.set(date, br.name);
      }
    }
    return notes;
  })();

  // Recompute skip_dates from the calendar rules plus the admin's manual
  // overrides. This replaces (not unions) so unticking a holiday/break switch
  // restores the weeks it had auto-skipped, while dates the admin personally
  // unticked stay skipped.
  const autoKey = `${Array.from(calendarNotes.keys()).sort().join(",")}|${manualOn.join(",")}|${manualOff.join(",")}|${upcomingPlayDates.join(",")}`;
  useEffect(() => {
    if (!open) return;
    setDraft((prev) => {
      const inRange = new Set(upcomingPlayDates);
      const preserved = prev.skip_dates.filter((d) => !inRange.has(d));
      const auto = Array.from(calendarNotes.keys()).filter((d) => !manualOn.includes(d));
      const manual = manualOff.filter((d) => inRange.has(d));
      const next = Array.from(new Set([...preserved, ...auto, ...manual])).sort();
      return next.join(",") === [...prev.skip_dates].sort().join(",") ? prev : { ...prev, skip_dates: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoKey]);

  const formatPlayDate = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit round" : "Add round"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Round #</Label>
              <Input
                type="number"
                min={1}
                value={draft.round_number}
                onChange={(e) => setDraft({ ...draft, round_number: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>From date</Label>
            <div className="relative">
              <Input
                type="date"
                className="pr-9 cursor-pointer"
                value={draft.round_date}
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, round_date: v, end_date: v }));
                }}
              />
              <CalendarIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              The end date is calculated automatically from the play days and number of teams.
            </p>
          </div>

          <div>
            <Label>Venue</Label>
            <div className="mt-1 rounded border p-2 grid grid-cols-2 gap-1.5">
              {venueOptions.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-2">No venues found</p>
              )}
              {venueOptions.map((n) => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedVenues.includes(n)}
                    onCheckedChange={() => toggleVenue(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Tick every venue whose courts you want to make available for this round.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={draft.start_time}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    start_time: v,
                    slot_minutes: oneFixturePerNight ? (minutesBetween(v, d.end_time) || d.slot_minutes) : d.slot_minutes,
                  }));
                }}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="time"
                value={draft.end_time}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    end_time: v,
                    slot_minutes: oneFixturePerNight ? (minutesBetween(d.start_time, v) || d.slot_minutes) : d.slot_minutes,
                  }));
                }}
              />
            </div>
          </div>
          <div className="rounded border p-2 bg-muted/30 space-y-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={oneFixturePerNight}
                onCheckedChange={(v) => {
                  const on = !!v;
                  setOneFixturePerNight(on);
                  if (on) {
                    setDraft((d) => ({
                      ...d,
                      slot_minutes: minutesBetween(d.start_time, d.end_time) || d.slot_minutes,
                    }));
                  }
                }}
              />
              <span>
                <span className="font-medium">One fixture per court per evening</span>
                <span className="block text-xs text-muted-foreground">
                  Each court hosts a single team fixture for the whole {minutesBetween(draft.start_time, draft.end_time) || "—"} minute window
                  ({draft.start_time}–{draft.end_time}). Untick only if you want several fixtures back-to-back on the same court.
                </span>
              </span>
            </label>
            {!oneFixturePerNight && (
              <div className="max-w-[180px]">
                <Label className="flex items-center gap-1">
                  Match slot (min)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 opacity-70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Length of one fixture block on a court. The evening window is split into back-to-back blocks of this length, and auto-created court bookings use the same length.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min={15}
                  step={5}
                  value={draft.slot_minutes}
                  onChange={(e) => setDraft({ ...draft, slot_minutes: Number(e.target.value) })}
                />
              </div>
            )}
          </div>

          <div>
            <Label>Play days</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DOW_LABELS.map((lbl, i) => {
                const active = draft.play_dows.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        play_dows: active
                          ? d.play_dows.filter((x) => x !== i)
                          : [...d.play_dows, i].sort((a, b) => a - b),
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Select which weekdays fixtures may be scheduled on. Leave all unselected to allow any day.
            </p>
          </div>
          <div>
            <Label>Match days (untick holidays / breaks)</Label>
            <div className="mt-1 grid gap-1.5">
              <label className="flex items-center gap-2 rounded border p-2 text-xs">
                <Checkbox
                  checked={holidayWeekOff}
                  onCheckedChange={(v) => setHolidayWeekOff(!!v)}
                />
                Skip the whole week when a public holiday falls in it
              </label>
              <label className="flex items-center gap-2 rounded border p-2 text-xs">
                <Checkbox
                  checked={breakWeekOff}
                  onCheckedChange={(v) => setBreakWeekOff(!!v)}
                />
                Also skip school-holiday weeks
              </label>
            </div>
            <div className="mt-1 rounded border p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-auto">
              {upcomingPlayDates.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-2">Pick a start date (and play days) to see the weekly schedule.</p>
              )}
              {upcomingPlayDates.map((d) => {
                const skipped = draft.skip_dates.includes(d);
                const note = calendarNotes.get(d);
                return (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!skipped}
                      onCheckedChange={() => {
                        if (skipped) {
                          // Re-tick: override any auto-skip, clear manual skip.
                          setManualOn((prev) => Array.from(new Set([...prev, d])));
                          setManualOff((prev) => prev.filter((x) => x !== d));
                        } else {
                          // Untick: manual skip, clear any re-tick override.
                          setManualOff((prev) => Array.from(new Set([...prev, d])));
                          setManualOn((prev) => prev.filter((x) => x !== d));
                        }
                      }}
                    />
                    <span className={skipped ? "line-through text-muted-foreground" : ""}>
                      {formatPlayDate(d)}
                    </span>
                    {note && (
                      <span className="text-[10px] text-destructive truncate" title={note}>{note}</span>
                    )}
                  </label>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground mt-1">
              Unticked dates are skipped when fixtures are generated — the schedule rolls on to the next available week.
            </p>
          </div>
          <div>
            <Label>Courts</Label>
            <div className="mt-1 max-h-56 overflow-auto rounded border p-2 space-y-2">
              {(() => {
                const groups = new Map<string, any[]>();
                for (const c of (courts ?? []) as any[]) {
                  const key = c.venue_label || "Other";
                  if (selectedVenues.length && !selectedVenues.includes(key)) continue;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(c);
                }
                if (!groups.size) return <p className="text-xs text-muted-foreground">Select a venue above to see its courts.</p>;
                return Array.from(groups.entries()).map(([venue, list]) => (
                  <div key={venue}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{venue}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {list.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={draft.court_ids.includes(c.id)}
                            onCheckedChange={() => toggleCourt(c.id)}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
            />
          </div>
          <label className="flex items-start gap-2 text-sm rounded border p-2 bg-muted/30 cursor-pointer">
            <Checkbox
              checked={!!draft.auto_create_bookings}
              onCheckedChange={(v) => setDraft({ ...draft, auto_create_bookings: !!v })}
            />
            <span>
              <span className="font-medium">Auto-create court bookings</span>
              <span className="block text-xs text-muted-foreground">
                When fixtures are saved for this round, automatically block off the selected courts at the scheduled times.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!draft.name?.trim()) { toast.error("Please enter a round name."); return; }
              if (!draft.round_date) { toast.error("Please pick a start date."); return; }
              if (!selectedVenues.length) { toast.error("Please select at least one venue."); return; }
              if (!draft.court_ids.length) { toast.error("Please select at least one court."); return; }
              const venueLabel = selectedVenues.join(", ");
              const slotMinutes = oneFixturePerNight
                ? (minutesBetween(draft.start_time, draft.end_time) || draft.slot_minutes)
                : draft.slot_minutes;
              if (!slotMinutes || slotMinutes <= 0) { toast.error("End time must be after the start time."); return; }
              setSaving(true);
              try {
                await onSave({ ...draft, venue_name: venueLabel, slot_minutes: slotMinutes });
                onOpenChange(false);
              } catch (e: any) {
                toast.error(e?.message ?? "Could not save round");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
