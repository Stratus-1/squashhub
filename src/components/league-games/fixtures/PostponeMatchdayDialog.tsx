import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roundId: string;
  roundName: string;
  onDone: () => void;
};

type Fx = {
  id: string;
  fixture_date: string | null;
  start_time: string | null;
  end_time: string | null;
  court_id: number | null;
  booking_id: string | null;
};

const isoAddDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(ms);
  return dt.toISOString().slice(0, 10);
};

const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
};

export function PostponeMatchdayDialog({ open, onOpenChange, roundId, roundName, onDone }: Props) {
  const [fromDate, setFromDate] = useState<string>("");
  const [weeks, setWeeks] = useState<string>("1");
  const [customDate, setCustomDate] = useState<string>("");
  const [shiftLater, setShiftLater] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: fixtures = [], refetch } = useQuery({
    queryKey: ["round-fixtures-postpone", roundId],
    queryFn: async () => {
      const { data, error } = await fromExt("platform_league_fixtures")
        .select("id, fixture_date, start_time, end_time, court_id, booking_id")
        .eq("round_id", roundId)
        .order("fixture_date");
      if (error) throw error;
      return (data ?? []) as Fx[];
    },
    enabled: open && !!roundId,
  });

  const dates = useMemo(
    () => Array.from(new Set(fixtures.map((f) => f.fixture_date).filter(Boolean) as string[])).sort(),
    [fixtures],
  );

  useEffect(() => {
    if (open && dates.length && !dates.includes(fromDate)) {
      const today = new Date().toISOString().slice(0, 10);
      setFromDate(dates.find((d) => d >= today) ?? dates[0]);
    }
  }, [open, dates, fromDate]);

  const targetFor = (iso: string) => {
    if (weeks === "custom") return customDate;
    return isoAddDays(iso, Number(weeks) * 7);
  };

  const affected = fixtures.filter((f) =>
    f.fixture_date && (shiftLater ? f.fixture_date >= fromDate : f.fixture_date === fromDate),
  );

  const run = async () => {
    if (!fromDate) return;
    const newFirst = targetFor(fromDate);
    if (!newFirst) { toast.error("Pick a new date."); return; }
    if (newFirst <= fromDate) { toast.error("The new date must be after the original date."); return; }
    setBusy(true);
    try {
      // Skip fixtures that already have results/lineups — those are history.
      const ids = affected.map((f) => f.id);
      const played = new Set<string>();
      if (ids.length) {
        const [{ data: res }, { data: lu }, { data: mr }] = await Promise.all([
          fromExt("league_fixture_results").select("fixture_id").in("fixture_id", ids),
          fromExt("league_fixture_lineups").select("fixture_id").in("fixture_id", ids),
          fromExt("league_match_results").select("fixture_id").in("fixture_id", ids),
        ]);
        for (const r of ((res ?? []) as any[])) played.add(r.fixture_id);
        for (const r of ((lu ?? []) as any[])) played.add(r.fixture_id);
        for (const r of ((mr ?? []) as any[])) played.add(r.fixture_id);
      }

      const movable = affected.filter((f) => !played.has(f.id));
      if (!movable.length) {
        toast.error("Nothing to move — those fixtures already have saved results or line-ups.");
        return;
      }

      const shiftDays = weeks === "custom"
        ? Math.round((Date.parse(`${newFirst}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000)
        : Number(weeks) * 7;

      let moved = 0;
      for (const f of movable) {
        const newDate = isoAddDays(f.fixture_date!, shiftDays);
        const { error } = await fromExt("platform_league_fixtures")
          .update({ fixture_date: newDate })
          .eq("id", f.id);
        if (error) throw error;
        moved++;
        if (f.booking_id) {
          await supabase.from("bookings").update({ date: newDate }).eq("id", f.booking_id);
        }
      }

      // Remember the skipped day(s) on the round and widen its end date.
      const { data: roundRow } = await fromExt("league_rounds")
        .select("skip_dates, end_date, round_date")
        .eq("id", roundId)
        .maybeSingle();
      const skip = new Set(
        (((roundRow as any)?.skip_dates ?? []) as any[]).map((d) => String(d).slice(0, 10)),
      );
      const skippedDays = Array.from(new Set(movable.map((f) => f.fixture_date!)));
      skippedDays.forEach((d) => skip.add(d));
      const latest = movable
        .map((f) => isoAddDays(f.fixture_date!, shiftDays))
        .reduce((a, b) => (b > a ? b : a), (roundRow as any)?.end_date ?? fromDate);
      await fromExt("league_rounds")
        .update({ skip_dates: Array.from(skip).sort(), end_date: latest })
        .eq("id", roundId);

      toast.success(`Moved ${moved} fixture${moved === 1 ? "" : "s"} to ${pretty(newFirst)}`);
      await refetch();
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not postpone the matchday");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw]">
        <DialogHeader>
          <DialogTitle>Postpone a match day</DialogTitle>
          <DialogDescription className="text-xs">
            {roundName} — move a holiday-affected match day to a later date. Fixtures with saved
            results or line-ups stay where they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Match day to move</Label>
            <Select value={fromDate} onValueChange={setFromDate}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick a date" /></SelectTrigger>
              <SelectContent>
                {dates.map((d) => (
                  <SelectItem key={d} value={d}>{pretty(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!dates.length && <p className="text-xs text-muted-foreground mt-1">This round has no scheduled fixtures.</p>}
          </div>
          <div>
            <Label>Move it</Label>
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">To the next week (same evening)</SelectItem>
                <SelectItem value="2">Two weeks later</SelectItem>
                <SelectItem value="3">Three weeks later</SelectItem>
                <SelectItem value="custom">To a specific date…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {weeks === "custom" && (
            <div>
              <Label>New date</Label>
              <Input type="date" value={customDate} min={fromDate} onChange={(e) => setCustomDate(e.target.value)} />
            </div>
          )}
          <label className="flex items-start gap-2 text-sm rounded border p-2 bg-muted/30 cursor-pointer">
            <Checkbox checked={shiftLater} onCheckedChange={(v) => setShiftLater(!!v)} />
            <span>
              <span className="font-medium">Also push every later match day</span>
              <span className="block text-xs text-muted-foreground">
                Keeps the weekly rhythm by shifting the rest of the round by the same amount.
              </span>
            </span>
          </label>
          {fromDate && (
            <p className="text-xs text-muted-foreground">
              {affected.length} fixture{affected.length === 1 ? "" : "s"} will move
              {targetFor(fromDate) ? ` — ${pretty(fromDate)} → ${pretty(targetFor(fromDate))}` : ""}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={busy || !fromDate}>{busy ? "Moving…" : "Postpone"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
