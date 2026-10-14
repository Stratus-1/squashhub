import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useClubBetaFeature } from "@/hooks/use-club-beta-feature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { TournamentViewSwitchesCard } from "@/components/tournaments/viewer/TournamentViewSwitchesCard";
import {
  generateCategoryDraw, resolveCategoryDraw, recordDrawResult, scheduleDraws, scheduleConflicts,
  type CategoryDraw, type DrawResults, type FixtureSchedule, type ResultSide,
} from "@/lib/tournaments/swiss-positional-draw";

/** Riverside-only pilot: fixed-position Swiss full draws on SYNTHETIC entrants. Never touches live tournaments. */
const RIVERSIDE = "11111111-1111-1111-1111-111111111111";
const FEATURE = "tournament_swiss_positional_draw";

type CatInput = { key: string; label: string; entrants: number; rounds: number };
type Row = { id: string; pilot_label: string; category_key: string; category_label: string; rounds: number; entrants: CategoryDraw["entrants"]; fixtures: CategoryDraw["fixtures"]; byes: CategoryDraw["byes"]; schedule: Record<string, FixtureSchedule>; results: DrawResults };

const synthetic = (c: CatInput) => Array.from({ length: c.entrants }, (_, i) => ({ id: `${c.key}-p${i + 1}`, name: `PILOT ${c.label} ${i + 1}` }));
const toDraw = (r: Row): CategoryDraw => ({ categoryKey: r.category_key, label: r.category_label, rounds: r.rounds, entrants: r.entrants, fixtures: r.fixtures, byes: r.byes, issues: [] });
const fmtSched = (s?: FixtureSchedule) => !s ? "Not scheduled" : s.kind === "planned" ? `${s.date} ${s.time} · ${s.courtName} (planned)` : s.kind === "play_by" ? `Play by ${s.date}` : s.reason;

export default function PositionalSwissPilot() {
  const qc = useQueryClient();
  const flag = useClubBetaFeature(RIVERSIDE, FEATURE);
  const [pilot, setPilot] = useState("Positional Swiss pilot 1");
  const [cats, setCats] = useState<CatInput[]>([
    { key: "mens-a", label: "Men's A", entrants: 10, rounds: 4 },
    { key: "mens-b", label: "Men's B", entrants: 15, rounds: 5 },
    { key: "mens-c", label: "Men's C", entrants: 24, rounds: 6 },
  ]);
  const [dates, setDates] = useState("2026-11-04, 2026-11-11, 2026-11-18, 2026-11-25, 2026-12-02, 2026-12-09");
  const [times, setTimes] = useState("17:00, 17:45, 18:30, 19:15, 20:00, 20:45");
  const [courtIds, setCourtIds] = useState<number[] | null>(null);
  const [matchMin, setMatchMin] = useState(45);
  const [restMin, setRestMin] = useState(45);
  const [saving, setSaving] = useState(false);

  const courts = useQuery({
    queryKey: ["pilot-courts", RIVERSIDE],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("id, name, active").eq("club_id", RIVERSIDE).order("id");
      if (error) throw error;
      return (data ?? []).filter((c) => c.active !== false);
    },
  });
  const saved = useQuery({
    queryKey: ["swiss-pilot-draws", RIVERSIDE],
    enabled: !!flag.data,
    queryFn: async () => {
      const { data, error } = await fromExt("swiss_positional_pilot_draws").select("*").eq("club_id", RIVERSIDE).order("created_at");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const selectedCourts = (courts.data ?? []).filter((c) => (courtIds ?? (courts.data ?? []).map((x) => x.id)).includes(c.id)).map((c) => ({ id: c.id, name: c.name ?? `Court ${c.id}` }));
  const preview = useMemo(() => {
    const draws = cats.map((c) => generateCategoryDraw({ categoryKey: c.key, label: c.label, entrants: synthetic(c), rounds: c.rounds }));
    const dl = dates.split(",").map((s) => s.trim()).filter(Boolean);
    const opts = { roundDates: Object.fromEntries(cats.map((c) => [c.key, dl])), courts: selectedCourts, times: times.split(",").map((s) => s.trim()).filter(Boolean), matchMinutes: matchMin, restMinutes: restMin };
    const sched = scheduleDraws(draws.filter((d) => !d.issues.length), opts);
    return { draws, sched, conflicts: scheduleConflicts(draws, sched, opts) };
  }, [cats, dates, times, matchMin, restMin, selectedCourts.map((c) => c.id).join()]);

  const existingForPilot = (saved.data ?? []).filter((r) => r.pilot_label === pilot.trim());

  async function save() {
    if (preview.draws.some((d) => d.issues.length) || preview.conflicts.length) return toast.error("Fix the issues first.");
    if (existingForPilot.length) return toast.error("This pilot name already has a draw. Draws are generated once — use a new name.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = preview.draws.map((d) => ({
      club_id: RIVERSIDE, pilot_label: pilot.trim(), category_key: d.categoryKey, category_label: d.label, rounds: d.rounds,
      entrants: d.entrants, fixtures: d.fixtures, byes: d.byes, created_by: u.user?.id ?? null,
      schedule: Object.fromEntries(d.fixtures.map((f) => [f.key, preview.sched[`${d.categoryKey}:${f.key}`]])),
    }));
    const { error } = await fromExt("swiss_positional_pilot_draws").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pilot draw generated and saved.");
    qc.invalidateQueries({ queryKey: ["swiss-pilot-draws"] });
  }

  async function record(row: Row, key: string, side: ResultSide) {
    try { recordDrawResult(toDraw(row), row.results ?? {}, key, side, null); } catch (e) { return toast.error((e as Error).message); }
    const { error } = await supabase.rpc("swiss_pilot_record_result", { _draw_id: row.id, _key: key, _winner: side, _score: null });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["swiss-pilot-draws"] });
  }

  if (flag.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4 max-w-7xl">
      <Link to="/admin/tournaments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="w-3 h-3" /> Tournaments</Link>
      <div>
        <h2 className="text-lg font-semibold">Fixed-position Swiss — full draw pilot (Riverside)</h2>
        <p className="text-xs text-muted-foreground">Synthetic players only. Kept separate from every real tournament, booking, ranking and result. Dates/courts are planned slots, not court bookings.</p>
      </div>
      {!flag.data ? (
        <div className="rounded-xl bg-card p-3 text-sm text-card-foreground space-y-2">
          <p>Riverside's “Fixed-position Swiss draw (pilot)” switch is off. Turn it on below to use this pilot.</p>
          <TournamentViewSwitchesCard />
        </div>
      ) : (
        <>
          <section className="rounded-xl bg-card p-3 text-card-foreground space-y-3 text-xs">
            <h3 className="font-semibold text-sm">1. Set up a new pilot draw</h3>
            <label className="block">Pilot name <Input className="h-8 mt-1 max-w-sm" value={pilot} onChange={(e) => setPilot(e.target.value)} /></label>
            <table className="text-xs"><thead><tr className="text-left text-muted-foreground"><th className="pr-2">Category</th><th className="pr-2">Entrants (8–32)</th><th className="pr-2">Rounds</th><th>Matches</th><th /></tr></thead>
              <tbody>{cats.map((c, i) => (
                <tr key={c.key}>
                  <td className="pr-2 py-1"><Input className="h-7 w-32" value={c.label} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
                  <td className="pr-2"><Input type="number" className="h-7 w-20" value={c.entrants} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, entrants: Number(e.target.value) } : x))} /></td>
                  <td className="pr-2"><Input type="number" className="h-7 w-16" value={c.rounds} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, rounds: Number(e.target.value) } : x))} /></td>
                  <td className="pr-2">{preview.draws[i]?.fixtures.length ?? 0} <span className="text-muted-foreground">(suggested {Math.ceil(Math.log2(Math.max(2, c.entrants)))} rounds)</span></td>
                  <td><Button size="sm" variant="ghost" className="h-7" onClick={() => setCats(cats.filter((_, j) => j !== i))}>Remove</Button></td>
                </tr>))}</tbody></table>
            <Button size="sm" variant="outline" onClick={() => setCats([...cats, { key: `cat-${Date.now()}`, label: `Category ${cats.length + 1}`, entrants: 8, rounds: 3 }])}>Add category</Button>
            <div className="grid gap-2 md:grid-cols-2">
              <label>Round dates (round 1, 2, …) <Input className="h-8 mt-1" value={dates} onChange={(e) => setDates(e.target.value)} /></label>
              <label>Start times each date <Input className="h-8 mt-1" value={times} onChange={(e) => setTimes(e.target.value)} /></label>
              <label>Match length (min) <Input type="number" className="h-8 mt-1 w-24" value={matchMin} onChange={(e) => setMatchMin(Number(e.target.value))} /></label>
              <label>Rest between a player's matches (min) <Input type="number" className="h-8 mt-1 w-24" value={restMin} onChange={(e) => setRestMin(Number(e.target.value))} /></label>
            </div>
            <div className="flex flex-wrap gap-2 items-center">Courts:
              {(courts.data ?? []).map((c) => {
                const on = selectedCourts.some((s) => s.id === c.id);
                return <Button key={c.id} size="sm" className="h-7" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => setCourtIds((courtIds ?? (courts.data ?? []).map((x) => x.id)).filter((x) => x !== c.id).concat(on ? [] : [c.id]))}>{c.name ?? `Court ${c.id}`}</Button>;
              })}
            </div>
            {preview.draws.flatMap((d) => d.issues.map((m) => <p key={d.categoryKey + m} className="text-destructive">{d.label}: {m}</p>))}
            {preview.conflicts.map((m) => <p key={m} className="text-destructive">{m}</p>)}
            <p className="text-muted-foreground">{Object.values(preview.sched).filter((s) => s.kind === "planned").length} of {Object.keys(preview.sched).length} matches get a planned court/time; the rest show “Not scheduled”.</p>
            <Button size="sm" onClick={save} disabled={saving}>Generate full draw once &amp; save</Button>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">2. Saved pilot draws — click a player's name to record them as winner</h3>
            {!saved.data?.length && <p className="text-xs text-muted-foreground">None yet.</p>}
            {(saved.data ?? []).map((row) => <DrawGrid key={row.id} row={row} onWin={(k, s) => record(row, k, s)} />)}
          </section>
        </>
      )}
    </div>
  );
}

function DrawGrid({ row, onWin }: { row: Row; onWin: (key: string, side: ResultSide) => void }) {
  const out = resolveCategoryDraw(toDraw(row), row.results ?? {});
  return (
    <div className="rounded-xl bg-card p-3 text-card-foreground" data-testid="positional-draw">
      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
        <Badge variant="outline">Pilot · synthetic</Badge><span className="font-semibold">{row.pilot_label} — {row.category_label}</span>
        <span className="text-muted-foreground">{row.entrants.length} entrants · {row.rounds} rounds · fixed full draw</span>
        {out.rematches.length > 0 && <Badge variant="secondary">{out.rematches.length} repeat pairing(s)</Badge>}
      </div>
      <TournamentInteractiveViewer title={`${row.category_label} — positional draw`} inlineHeight={420} defaultFit="none">
        <div className="flex gap-4 p-2 bg-background text-foreground text-xs">
          {out.rounds.map((rd) => (
            <div key={rd.round} className="min-w-[220px]">
              <div className="font-semibold mb-1">Round {rd.round}</div>
              {rd.fixtures.map((f) => (
                <div key={f.key} className="border-y-4 border-foreground/70 mb-1">
                  {(["a", "b"] as const).map((side) => {
                    const p = side === "a" ? f.a : f.b, slot = side === "a" ? f.slotA : f.slotB;
                    const won = f.winner === side, lost = f.winner && !won;
                    return (
                      <div key={side} className="flex items-center gap-1 px-1 py-0.5 border-b border-border">
                        <span className="w-6 text-muted-foreground">{slot}</span>
                        {p && f.status !== "awaiting" ? (
                          <button className={`text-left flex-1 hover:underline ${won ? "font-semibold text-primary" : lost ? "text-muted-foreground" : ""}`} onClick={() => onWin(f.key, side)}>{p.name}</button>
                        ) : <span className="flex-1">{p ? p.name : <span className="text-muted-foreground">Position {slot} (TBD)</span>}</span>}
                        <span className="w-4">{won ? "W" : lost ? "L" : ""}</span>
                      </div>
                    );
                  })}
                  <div className="px-1 text-[11px] text-muted-foreground">{fmtSched(row.schedule?.[f.key])}</div>
                </div>
              ))}
              {rd.bye && <div className="px-1 text-muted-foreground">Bye: position {rd.bye.slot} {rd.bye.entrant ? `· ${rd.bye.entrant.name}` : "(TBD)"}</div>}
            </div>
          ))}
          <div className="min-w-[180px]">
            <div className="font-semibold mb-1">Final places</div>
            {out.finalRanking.map((x) => <div key={x.position}>{x.position}. {x.entrant?.name ?? "TBD"}</div>)}
          </div>
        </div>
      </TournamentInteractiveViewer>
    </div>
  );
}
