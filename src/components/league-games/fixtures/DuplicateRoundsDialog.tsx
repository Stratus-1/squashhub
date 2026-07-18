import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useMemberContext } from "@/contexts/MemberContext";

type RoundRow = {
  id: string;
  round_number: number;
  name: string;
  round_date: string;
  end_date: string | null;
  venue_name: string | null;
  court_ids: number[] | null;
  start_time: string | null;
  end_time: string | null;
  slot_minutes: number | null;
  play_dows: number[] | null;
  notes: string | null;
};

type FixtureRow = {
  id: string;
  round_id: string | null;
  association_id: string;
  fixture_date: string | null;
  venue_name: string | null;
  home_team_code: string;
  away_team_code: string;
  division: string | null;
  court_id: number | null;
  start_time: string | null;
  end_time: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  associationId: string;
  rounds: RoundRow[];
};

export function DuplicateRoundsDialog({ open, onOpenChange, clubId, associationId, rounds }: Props) {
  const qc = useQueryClient();
  const { activeMember } = useMemberContext();

  // Sort ascending by round_date to make the "start from" auto-fill intuitive.
  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => (a.round_date || "").localeCompare(b.round_date || "")),
    [rounds],
  );

  // Fetch earliest fixture date per round — the "first game played" date the
  // admin cares about (round_date is just when the round was created).
  const { data: firstFixtureByRound } = useQuery({
    queryKey: ["duplicate-rounds-first-fixture", rounds.map((r) => r.id).sort()],
    enabled: open && rounds.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("platform_league_fixtures")
        .select("round_id, fixture_date")
        .in("round_id", rounds.map((r) => r.id))
        .not("fixture_date", "is", null)
        .order("fixture_date", { ascending: true });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { round_id: string; fixture_date: string }[]) {
        if (row.round_id && !map[row.round_id]) map[row.round_id] = row.fixture_date;
      }
      return map;
    },
  });

  const originalDateFor = (r: RoundRow): string =>
    (firstFixtureByRound?.[r.id]) || r.round_date;

  const earliestDate = sortedRounds.length
    ? [...sortedRounds.map((r) => originalDateFor(r)).filter(Boolean)].sort()[0]
    : undefined;

  const defaultStart = earliestDate
    ? format(addDays(parseISO(earliestDate), 7 * (rounds.length || 1)), "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  const [startFrom, setStartFrom] = useState<string>(defaultStart);
  const [swapVenues, setSwapVenues] = useState<boolean>(true);
  const [createBookings, setCreateBookings] = useState<boolean>(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Team code → name lookup for booking guest_name.
  const { data: teamMap } = useQuery({
    queryKey: ["dup-rounds-teams", clubId, associationId],
    enabled: open && !!clubId && !!associationId,
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select("code, name")
        .eq("club_id", clubId)
        .eq("association_id", associationId);
      if (error) throw error;
      const m: Record<string, string> = {};
      for (const l of (data ?? []) as { code: string; name: string }[]) {
        if (l.code) m[l.code] = l.name;
      }
      return m;
    },
  });

  useEffect(() => {
    if (!open) return;
    setStartFrom(defaultStart);
    setSwapVenues(true);
    setCreateBookings(true);
    const sel: Record<string, boolean> = {};
    const dates: Record<string, string> = {};
    sortedRounds.forEach((r) => {
      sel[r.id] = true;
      dates[r.id] = "";
    });
    setSelected(sel);
    setNewDates(dates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, earliestDate]);

  const autoFill = () => {
    if (!startFrom || !earliestDate) return;
    const base = parseISO(startFrom);
    const anchor = parseISO(earliestDate);
    const anchorDow = anchor.getDay();
    const baseDow = base.getDay();
    const dates: Record<string, string> = {};
    sortedRounds.forEach((r) => {
      const orig = originalDateFor(r);
      if (!orig) return;
      const o = parseISO(orig);
      // Preserve each round's own weekday. Bucket rounds into weeks that start
      // on the anchor's weekday, then in the new series apply the round's own
      // weekday offset relative to the chosen start date's weekday.
      const diffFromWeekStart = (o.getDay() - anchorDow + 7) % 7;
      const weekStartOfOrig = addDays(o, -diffFromWeekStart);
      const weeksBetween = Math.round(
        differenceInCalendarDays(weekStartOfOrig, anchor) / 7,
      );
      const newWeekdayOffset = (o.getDay() - baseDow + 7) % 7;
      const newDate = addDays(base, weeksBetween * 7 + newWeekdayOffset);
      dates[r.id] = format(newDate, "yyyy-MM-dd");
    });
    setNewDates(dates);
  };

  const selectedIds = sortedRounds.filter((r) => selected[r.id]).map((r) => r.id);
  const canSubmit = selectedIds.length > 0 && selectedIds.every((id) => !!newDates[id]);

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Set a new date for every selected round (use Auto-fill).");
      return;
    }
    setSaving(true);
    try {
      // Fetch fixtures for selected rounds in one shot.
      const { data: fxRows, error: fxErr } = await fromExt("platform_league_fixtures")
        .select("id, round_id, association_id, fixture_date, venue_name, home_team_code, away_team_code, division, court_id, start_time, end_time")
        .in("round_id", selectedIds);
      if (fxErr) throw fxErr;
      const fixtures = (fxRows ?? []) as FixtureRow[];

      // Determine starting round_number for the clones.
      const maxNum = rounds.reduce((m, r) => Math.max(m, r.round_number || 0), 0);
      let nextNum = maxNum + 1;

      for (const src of sortedRounds) {
        if (!selected[src.id]) continue;
        const newStart = newDates[src.id];
        // Anchor fixture shifting on the ACTUAL first-fixture date (same
        // reference the auto-fill uses), not the round_date — a duplicated
        // round's round_date is the chosen start date, and the first fixture
        // must land on it.
        const oldStart = parseISO(originalDateFor(src));
        const oldRoundStart = parseISO(src.round_date);
        const oldEnd = src.end_date ? parseISO(src.end_date) : oldRoundStart;
        const span = differenceInCalendarDays(oldEnd, oldRoundStart);
        const newStartD = parseISO(newStart);
        const newEnd = format(addDays(newStartD, span), "yyyy-MM-dd");

        const ord = (n: number) => {
          const s = ["th", "st", "nd", "rd"], v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        // Try to preserve the original naming pattern by swapping the ordinal
        // and trailing round number. Falls back to "<name> (return)".
        const patternMatch = src.name.match(/^(\d+)(st|nd|rd|th)\s+(.*?)(\d+)\s*$/i);
        const cloneName = patternMatch
          ? `${ord(nextNum)} ${patternMatch[3]}${nextNum}`
          : /return/i.test(src.name)
            ? `${src.name} (v${nextNum})`
            : `${src.name} (return)`;

        const { data: inserted, error: rErr } = await fromExt("league_rounds")
          .insert({
            club_id: clubId,
            association_id: associationId,
            round_number: nextNum,
            name: cloneName,
            round_date: newStart,
            end_date: newEnd,
            venue_name: src.venue_name,
            court_ids: src.court_ids,
            start_time: src.start_time,
            end_time: src.end_time,
            slot_minutes: src.slot_minutes,
            play_dows: src.play_dows ?? [],
            notes: src.notes,
            auto_create_bookings: false,
            created_by: activeMember?.id ?? null,
          })
          .select("id")
          .single();
        if (rErr) throw rErr;

        const newRoundId = (inserted as any).id as string;

        const roundFixtures = fixtures.filter((f) => f.round_id === src.id);
        if (roundFixtures.length) {
          const newFxRows = roundFixtures.map((f) => {
            const deltaDays = f.fixture_date
              ? differenceInCalendarDays(parseISO(f.fixture_date), oldStart)
              : 0;
            const newFixtureDate = format(addDays(newStartD, deltaDays), "yyyy-MM-dd");
            const isBye = f.away_team_code === "__BYE__";
            return {
              association_id: f.association_id,
              round_id: newRoundId,
              fixture_date: newFixtureDate,
              venue_name: f.venue_name,
              home_team_code: swapVenues && !isBye ? f.away_team_code : f.home_team_code,
              away_team_code: swapVenues && !isBye ? f.home_team_code : f.away_team_code,
              division: f.division,
              court_id: f.court_id,
              start_time: f.start_time,
              end_time: f.end_time,
              status: "scheduled",
            };
          });
          const { error: iErr } = await fromExt("platform_league_fixtures").insert(newFxRows);
          if (iErr) throw iErr;
        }
        nextNum += 1;
      }

      toast.success(`Duplicated ${selectedIds.length} round${selectedIds.length === 1 ? "" : "s"}${swapVenues ? " with home/visitor swapped" : ""}.`);
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
      qc.invalidateQueries({ queryKey: ["round-fixtures"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Duplication failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Duplicate rounds</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Start return series from</Label>
                <Input
                  type="date"
                  value={startFrom}
                  onChange={(e) => setStartFrom(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={autoFill}>
                Auto-fill weekly
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Auto-fill preserves each round's original spacing and each league's weekday
              (e.g. League 1 stays on Tuesdays, League 2 on Wednesdays). Tweak individual
              dates below for public holidays.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={swapVenues}
                onCheckedChange={(v) => setSwapVenues(!!v)}
              />
              <span>Swap home / visitor for the return series</span>
            </label>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2 text-left">Round</th>
                  <th className="p-2 text-left">Original date</th>
                  <th className="p-2 text-left">New date</th>
                </tr>
              </thead>
              <tbody>
                {sortedRounds.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <Checkbox
                        checked={!!selected[r.id]}
                        onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))}
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">Round {r.round_number}</div>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {(() => {
                        const d = originalDateFor(r);
                        return d ? format(parseISO(d), "EEE dd MMM yyyy") : "—";
                      })()}
                    </td>
                    <td className="p-2">
                      <Input
                        type="date"
                        value={newDates[r.id] || ""}
                        disabled={!selected[r.id]}
                        onChange={(e) => setNewDates((d) => ({ ...d, [r.id]: e.target.value }))}
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Duplicating…" : `Duplicate ${selectedIds.length} round${selectedIds.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
