import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { generateSeasonFixtures, type DivisionPlan, type SeasonPlanResult } from "@/lib/leagues/season-fixtures";
import { expandRange, publicHolidays, schoolBreaks } from "@/lib/leagues/calendar";
import type { AssocTeam } from "@/lib/leagues/association-tree";
import type { PlatformAssociation } from "@/hooks/use-platform-association";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blankExclusions = (year: number): Record<string, string> =>
  Object.fromEntries([
    ...publicHolidays(year).map((h) => [h.date, h.name]),
    ...schoolBreaks(year).flatMap((r) => expandRange(r).map((date) => [date, r.name])),
  ]);

type Props = { tenantId: string; association: PlatformAssociation; teams: AssocTeam[]; open: boolean; onOpenChange: (open: boolean) => void };

type PreviewFixture = { fixture_date: string; division: string; home_team_name: string; away_team_name: string; venue_name: string; round_number: number };

export function SeasonFixtureBuilder({ tenantId, association, teams, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [seasonId, setSeasonId] = useState("");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-03-01`);
  const [secondLegStart, setSecondLegStart] = useState("");
  const [twoLegs, setTwoLegs] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [playNights, setPlayNights] = useState<Record<string, number[]>>({});
  const [manualDates, setManualDates] = useState("");
  const [excludedHolidays, setExcludedHolidays] = useState<Record<string, boolean>>({});
  const [excludedBreaks, setExcludedBreaks] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const { data: seasons = [] } = useQuery({
    queryKey: ["association-fixture-seasons", association.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_seasons")
        .select("id, season_year, label, status, is_current, starts_on, ends_on")
        .eq("platform_association_id", association.id)
        .order("season_year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const year = Number(startDate.slice(0, 4)) || new Date().getFullYear();
  const holidayItems = useMemo(() => publicHolidays(year), [year]);
  const breakItems = useMemo(() => schoolBreaks(year), [year]);
  const scopedTeams = useMemo(() => teams.filter((t) => selected[t.team_id]), [teams, selected]);
  const divisions = useMemo(() => {
    const map = new Map<string, DivisionPlan>();
    for (const team of scopedTeams) {
      const key = `${team.category || "League"} ${team.level ?? "Unassigned"}`;
      const current = map.get(key) ?? { division: key, teams: [], playDows: playNights[key] ?? [3] };
      current.teams.push({ team_id: team.team_id, team_name: team.team_name, team_code: team.team_code, club_id: team.club_id, club_name: team.club_name });
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => a.division.localeCompare(b.division, undefined, { numeric: true }));
  }, [scopedTeams, playNights]);

  const exclusions = useMemo(() => {
    const result = blankExclusions(year);
    for (const holiday of holidayItems) {
      if (excludedHolidays[holiday.date] === false) delete result[holiday.date];
    }
    for (const range of breakItems) {
      if (excludedBreaks[range.start] === false) for (const date of expandRange(range)) delete result[date];
    }
    for (const date of manualDates.split(/[\s,]+/).map((value) => value.trim()).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) result[date] = "Manual exclusion";
    return result;
  }, [year, holidayItems, breakItems, excludedHolidays, excludedBreaks, manualDates]);

  const plan = useMemo<SeasonPlanResult>(() => generateSeasonFixtures({ divisions, startDate, exclusions, twoLegs, secondLegStart: secondLegStart || undefined }), [divisions, startDate, exclusions, twoLegs, secondLegStart]);

  // Step 1 groups every submitted team under its league, e.g. "Men's 2nd League",
  // so the association ticks whole leagues instead of hunting through a flat list.
  const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th"];
  const teamGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; teams: AssocTeam[] }>();
    for (const team of teams) {
      const key = `${team.category || "League"} ${team.level ?? "Unassigned"}`;
      const category = team.category || "League";
      const label = team.level == null
        ? `${category} · Needs league assignment`
        : `${category} ${ORDINALS[team.level] ?? `${team.level}th`} League`;
      const group = map.get(key) ?? { key, label, teams: [] };
      group.teams.push(team);
      map.set(key, group);
    }
    return [...map.values()]
      .map((group) => ({ ...group, teams: [...group.teams].sort((a, b) => a.club_name.localeCompare(b.club_name) || a.team_name.localeCompare(b.team_name)) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [teams]);
  const groupSelected = (group: { teams: AssocTeam[] }) => group.teams.filter((team) => selected[team.team_id]).length;
  const toggleGroup = (group: { teams: AssocTeam[] }, value: boolean) => setSelected((current) => {
    const next = { ...current };
    for (const team of group.teams) next[team.team_id] = value;
    return next;
  });

  const reset = () => { setStep(1); setSeasonId(""); setSelected({}); setManualDates(""); setExcludedHolidays({}); setExcludedBreaks({}); setSaving(false); };
  const close = (value: boolean) => { if (!value) reset(); onOpenChange(value); };
  const toggleAll = (value: boolean) => setSelected(Object.fromEntries(teams.map((team) => [team.team_id, value])));
  const toggleNight = (division: string, day: number) => setPlayNights((current) => ({ ...current, [division]: (current[division] ?? [3]).includes(day) ? (current[division] ?? [3]).filter((item) => item !== day) : [...(current[division] ?? [3]), day] }));

  const save = async () => {
    if (!seasonId) return toast.error("Select a season first");
    if (!plan.fixtures.length) return toast.error("There are no fixtures to save");
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("association_save_season_fixtures", {
      _tenant_id: tenantId, _platform_association_id: association.id, _season_id: seasonId, _fixtures: plan.fixtures, _replace_unplayed: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} fixtures saved; existing results were preserved`);
    qc.invalidateQueries({ queryKey: ["assoc-platform-fixtures"] });
    close(false);
  };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Build season rounds &amp; fixtures</DialogTitle>
        <div className="space-y-1 pt-1"><Progress value={step * 25} /><p className="text-[11px] text-muted-foreground">Step {step} of 4 · no emails are sent by saving fixtures</p></div>
      </DialogHeader>
      {step === 1 && <div className="space-y-4">
        <div><Label className="text-xs">Season</Label><Select value={seasonId} onValueChange={setSeasonId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select a season" /></SelectTrigger><SelectContent>{seasons.map((season) => <SelectItem key={season.id} value={season.id}>{season.label} · {season.season_year}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-center justify-between border-b pb-2"><div><p className="text-sm font-medium">Submitted teams</p><p className="text-[11px] text-muted-foreground">Choose the teams that will participate in this season, grouped per league.</p></div><Button type="button" variant="outline" size="sm" onClick={() => toggleAll(scopedTeams.length !== teams.length)}>{scopedTeams.length === teams.length ? "Clear all" : "Select all"}</Button></div>
        <div className="space-y-2">{teamGroups.map((group) => { const count = groupSelected(group); return (
          <div key={group.key} className="rounded-md border">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
              <Checkbox
                checked={count === group.teams.length ? true : count === 0 ? false : "indeterminate"}
                onCheckedChange={(value) => toggleGroup(group, !!value)}
                aria-label={`Select all ${group.label} teams`}
              />
              <p className="min-w-0 flex-1 truncate text-xs font-medium">{group.label}</p>
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-normal shrink-0">{count}/{group.teams.length} teams</Badge>
            </div>
            <div className="grid gap-1 p-1.5 sm:grid-cols-2">{group.teams.map((team) => <label key={team.team_id} className="flex items-center gap-2 rounded border p-2 text-xs"><Checkbox checked={!!selected[team.team_id]} onCheckedChange={(value) => setSelected((current) => ({ ...current, [team.team_id]: !!value }))} /><span className="min-w-0 flex-1 truncate">{team.team_name}</span><span className="text-muted-foreground truncate">{team.club_name}</span></label>)}</div>
          </div>); })}</div>
      </div>}
      {step === 2 && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label className="text-xs">First possible play date</Label><Input type="date" className="mt-1" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><div><Label className="text-xs">Return leg may start from (optional)</Label><Input type="date" className="mt-1" value={secondLegStart} onChange={(event) => setSecondLegStart(event.target.value)} /></div></div><label className="flex items-center gap-2 text-xs"><Checkbox checked={twoLegs} onCheckedChange={(value) => setTwoLegs(!!value)} />Generate home and away rounds with reversed venues</label><div className="space-y-2">{divisions.map((division) => <Card key={division.division}><CardHeader className="py-2"><CardTitle className="text-xs">{division.division} <Badge variant="secondary" className="ml-1">{division.teams.length} teams</Badge></CardTitle></CardHeader><CardContent className="pt-0"><div className="flex flex-wrap gap-1">{DOWS.map((day, index) => <Button key={day} type="button" size="sm" variant={(playNights[division.division] ?? [3]).includes(index) ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => toggleNight(division.division, index)}>{day}</Button>)}</div></CardContent></Card>)}</div></div>}
      {step === 3 && <div className="space-y-4"><div><p className="text-sm font-medium">Calendar exclusions</p><p className="text-[11px] text-muted-foreground">Public holidays are selected by default. Turn off a school break if the league will continue during that period.</p></div><div className="grid gap-2 sm:grid-cols-2">{holidayItems.map((holiday) => <label key={holiday.date} className="flex items-center gap-2 text-xs"><Checkbox checked={excludedHolidays[holiday.date] !== false} onCheckedChange={(value) => setExcludedHolidays((current) => ({ ...current, [holiday.date]: !!value }))} /><span>{holiday.date} · {holiday.name}</span></label>)}{breakItems.map((range) => <label key={range.start} className="flex items-center gap-2 text-xs"><Checkbox checked={excludedBreaks[range.start] !== false} onCheckedChange={(value) => setExcludedBreaks((current) => ({ ...current, [range.start]: !!value }))} /><span>{range.start} to {range.end} · {range.name}</span></label>)}</div><div><Label className="text-xs">Additional dates to exclude</Label><Input className="mt-1" placeholder="2026-05-04, 2026-08-10" value={manualDates} onChange={(event) => setManualDates(event.target.value)} /></div></div>}
      {step === 4 && <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{plan.fixtures.length} fixtures</Badge><Badge variant="outline">{new Set(plan.fixtures.map((fixture) => fixture.fixture_date)).size} play nights</Badge><Badge variant={plan.conflicts.length ? "destructive" : "secondary"}>{plan.conflicts.length ? `${plan.conflicts.length} checks need attention` : "Checks passed"}</Badge></div>{plan.conflicts.length > 0 && <div className="space-y-1 rounded border border-destructive/40 p-2 text-xs">{plan.conflicts.map((conflict, index) => <p key={`${conflict.kind}-${index}`} className="flex gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />{conflict.detail}</p>)}</div>}<div className="max-h-80 overflow-y-auto rounded border divide-y">{(plan.fixtures as PreviewFixture[]).map((fixture, index) => <div key={index} className="grid grid-cols-[90px_1fr_auto] gap-2 p-2 text-[11px]"><span className="text-muted-foreground">{fixture.fixture_date}</span><span className="truncate">{fixture.division}: {fixture.home_team_name} vs {fixture.away_team_name}</span><span className="text-muted-foreground">{fixture.venue_name}</span></div>)}</div><p className="text-[11px] text-muted-foreground">Saving replaces only unplayed fixtures in this season. Completed or scored fixtures are never deleted or rewritten. Saving does not send invitations or emails.</p></div>}
      <DialogFooter className="gap-2"><Button variant="outline" onClick={() => step === 1 ? close(false) : setStep((value) => value - 1)}>{step === 1 ? "Cancel" : <><ChevronLeft className="mr-1 h-4 w-4" />Back</>}</Button>{step < 4 ? <Button onClick={() => setStep((value) => value + 1)} disabled={step === 1 && (!seasonId || !scopedTeams.length)}><ChevronRight className="mr-1 h-4 w-4" />Next</Button> : <Button onClick={save} disabled={saving || !plan.fixtures.length || !!plan.conflicts.length}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save fixtures</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
