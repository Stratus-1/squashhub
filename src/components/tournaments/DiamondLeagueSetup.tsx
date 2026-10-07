import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Wand2, X } from "lucide-react";
import {
  DIAMOND_TEAM_DEFAULTS, DRAW_RULE_LABEL, TIE_BREAK_LABEL, FINAL_LEVEL_LABEL, DOUBLES_PAIRING_LABEL, FINALS_POINTS_LABEL, type FinalsPoints,
  tieGames, gameLabel, nightPlan, configIssues, autoSlotPlayers, autoSlotDiamond, poolRounds, buildPoolWeeks, diamondTeamName, diamondPlayingMinutes,
  diamondPlayoffsOn, divisionWeekDates, type DiamondDivisionSchedule,
  type TeamLeagueConfig, type TieBreak, type DrawRule, type FinalLevelRule, type DoublesPairing,
} from "@/lib/tournaments/team-league";
import { DOUBLES_SERVING_METHODS, type DoublesServingMethod } from "@/lib/marker/doubles-serving";

export type DiamondTeam = { id: string; name: string; pool: "A" | "B"; players: (string | null)[] };
export type DiamondDraft = {
  eventId?: string;
  config: TeamLeagueConfig & { dates?: string[] };
  teams: DiamondTeam[];
  /** Slots placed by hand (`teamId:index`) — auto-placement never moves these. */
  locked: string[];
  started?: boolean;
};

const uid = () => crypto.randomUUID().slice(0, 8);
export const newDiamondTeams = (n: number, size: number): DiamondTeam[] =>
  Array.from({ length: n }, (_, i) => ({ id: uid(), name: `${i < n / 2 ? "A" : "B"}${(i % (n / 2)) + 1}`, pool: i < n / 2 ? "A" : "B", players: Array(size).fill(null) }));
export const newDiamondDraft = (): DiamondDraft => ({
  config: { ...DIAMOND_TEAM_DEFAULTS, dates: [] }, teams: newDiamondTeams(8, DIAMOND_TEAM_DEFAULTS.playersPerTeam), locked: [],
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sel = "w-full h-8 rounded border border-input bg-background px-2 text-xs";

/** Structure step: configure team ties and weekly pool play; courts are selected on the Courts step. */
export function DiamondRulesPanel({ draft, onChange, courts, startTime, endTime, startDate }: { draft: DiamondDraft; onChange: (d: DiamondDraft) => void; courts: number; startTime: string; endTime: string; startDate?: string }) {
  const cfg = { ...draft.config, courts: courts || draft.config.courts, startTime: startTime || draft.config.startTime, endTime: endTime || draft.config.endTime };
  const set = (c: Partial<DiamondDraft["config"]>) => onChange({ ...draft, config: { ...draft.config, ...c } });
  const setSize = (n: number) => onChange({
    ...draft, config: { ...draft.config, playersPerTeam: n },
    teams: draft.teams.map((t) => ({ ...t, players: Array.from({ length: n }, (_, i) => t.players[i] ?? null) })),
    locked: draft.locked.filter((k) => Number(k.split(":")[1]) < n),
  });
  const setTeamCount = (n: number) => {
    const next = [...draft.teams];
    while (next.length < n) next.push({ id: uid(), name: "", pool: "B", players: Array(cfg.playersPerTeam).fill(null) });
    next.length = n;
    onChange({ ...draft, teams: next.map((t, i) => {
      const pool = i < n / 2 ? "A" : "B";
      return { ...t, name: t.name || `${pool}${i < n / 2 ? i + 1 : i - n / 2 + 1}`, pool };
    }) });
  };
  const toggleTb = (tb: TieBreak) => set({ tieBreaks: cfg.tieBreaks.includes(tb) ? cfg.tieBreaks.filter((x) => x !== tb) : [...cfg.tieBreaks, tb] });
  const num = (k: keyof TeamLeagueConfig) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) } as any);
  const games = tieGames(cfg);
  const plan = nightPlan(cfg, draft.teams.length / 2);
  const rounds = poolRounds(draft.teams.length / 2);
  const dates = draft.config.dates || [];
  const locked = !!draft.started;
  const playoffsOn = diamondPlayoffsOn(cfg);
  const schedules = draft.config.divisionSchedules || {};
  const setSchedule = (pool: string, patch: Partial<DiamondDivisionSchedule>) =>
    set({ divisionSchedules: { ...schedules, [pool]: { ...schedules[pool], ...patch } } });
  const effDates = (pool: "A" | "B") => divisionWeekDates(schedules[pool], rounds.length, dates, startDate);
  const ownDates = (pool: "A" | "B") => { const e = effDates(pool); return e.own ? e.dates : null; };
  /** Edit one division's week date; keeps the shared weekly dates = earliest night per week (window/play days). */
  const setWeekDate = (pool: "A" | "B", i: number, value: string) => {
    const cur = effDates(pool).dates.slice();
    cur[i] = value;
    const nextSchedules = { ...schedules, [pool]: { ...schedules[pool], dates: cur } };
    const other = pool === "A" ? "B" : "A";
    // If the other division has no schedule of its own, pin its current
    // effective dates as its own first, otherwise editing this division's
    // week earlier would silently move the other division's week too (it
    // falls back to the shared earliest-night list).
    const otherEff = divisionWeekDates(nextSchedules[other], rounds.length, dates, startDate);
    if (!otherEff.own) nextSchedules[other] = { ...nextSchedules[other], dates: otherEff.dates };
    const otherDates = divisionWeekDates(nextSchedules[other], rounds.length, dates, startDate).dates;
    const shared = cur.map((d, w) => [d, otherDates[w]].filter(Boolean).sort()[0] || "");
    set({ divisionSchedules: nextSchedules, dates: [...shared, ...dates.slice(rounds.length)] });
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div><Label className="text-xs">Players per team</Label>
        <select className={sel} value={cfg.playersPerTeam} disabled={locked} onChange={(e) => setSize(Number(e.target.value))}>
          {[2, 4, 6, 8].map((n) => <option key={n} value={n}>{n} ({n} singles + {n / 2} doubles)</option>)}
        </select></div>
      <div><Label className="text-xs">Teams</Label>
        <select className={sel} value={draft.teams.length} disabled={locked} onChange={(e) => setTeamCount(Number(e.target.value))}>
          {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} (2 divisions of {n / 2})</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground mt-0.5">Needs {draft.teams.length * cfg.playersPerTeam} players.</p></div>
       <div><Label className="text-xs">Singles slot (min)</Label><Input className="h-8" type="number" min={1} step={1} value={cfg.singlesMinutes} onChange={num("singlesMinutes")} /></div>
       <div><Label className="text-xs">Singles break (min)</Label><Input className="h-8" type="number" min={0} step={1} value={cfg.singlesBreakMinutes ?? 0} onChange={num("singlesBreakMinutes")} /></div>
       <div><Label className="text-xs">Doubles slot (min)</Label><Input className="h-8" type="number" min={1} step={1} value={cfg.doublesMinutes} onChange={num("doublesMinutes")} /></div>
       <div><Label className="text-xs">Doubles break (min)</Label><Input className="h-8" type="number" min={0} step={1} value={cfg.doublesBreakMinutes ?? 0} onChange={num("doublesBreakMinutes")} /></div>
      <div><Label className="text-xs">Win bonus</Label><Input className="h-8" type="number" value={cfg.winBonus} onChange={num("winBonus")} /></div>
      <div className="col-span-2"><Label className="text-xs">Level tie (same points)</Label>
        <select className={sel} value={cfg.drawRule} onChange={(e) => set({ drawRule: e.target.value as DrawRule })}>
          {Object.entries(DRAW_RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="col-span-2 md:col-span-1"><Label className="text-xs">Level final</Label>
        <select className={sel} value={cfg.finalLevelRule} onChange={(e) => set({ finalLevelRule: e.target.value as FinalLevelRule })}>
          {Object.entries(FINAL_LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="col-span-2"><Label className="text-xs">Points in finals</Label>
        <select className={sel} value={cfg.finalsPoints || "reset"} onChange={(e) => set({ finalsPoints: e.target.value as FinalsPoints })}>
          {(Object.keys(FINALS_POINTS_LABEL) as FinalsPoints[]).map((k) => <option key={k} value={k}>{FINALS_POINTS_LABEL[k]}</option>)}
        </select></div>
      <div className="col-span-2"><Label className="text-xs">Doubles pairs</Label>
        <select className={sel} value={cfg.doublesPairing || "singles_results"} onChange={(e) => set({ doublesPairing: e.target.value as DoublesPairing })}>
          {(Object.keys(DOUBLES_PAIRING_LABEL) as DoublesPairing[]).map((k) => <option key={k} value={k}>{DOUBLES_PAIRING_LABEL[k]}</option>)}
        </select></div>
      <div className="col-span-2"><Label className="text-xs">Doubles serving</Label>
        <select className={sel} value={cfg.doublesServing || "even_odd"} onChange={(e) => set({ doublesServing: e.target.value as DoublesServingMethod })}>
          {DOUBLES_SERVING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground mt-0.5">{DOUBLES_SERVING_METHODS.find((m) => m.value === (cfg.doublesServing || "even_odd"))?.hint}</p></div>
      <div className="col-span-2 md:col-span-4"><Label className="text-xs">Tie-breaks when team totals are level (tap in order)</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {(Object.keys(TIE_BREAK_LABEL) as TieBreak[]).map((tb) => {
            const i = cfg.tieBreaks.indexOf(tb);
            return <Button key={tb} type="button" size="sm" variant={i >= 0 ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => toggleTb(tb)}>{i >= 0 ? `${i + 1}. ` : ""}{TIE_BREAK_LABEL[tb]}</Button>;
          })}
        </div></div>
      <div className="col-span-2 md:col-span-4 rounded-lg border p-3 space-y-2">
        <p className="font-semibold">Weekly team ties</p>
        <p className="text-muted-foreground">Each division plays its own round robin. In every tie between two teams, position #1 plays position #1 on the opposing team, #2 plays #2, and so on — never teammates against each other. Singles and doubles follow in that order <strong>on the same night</strong>, not as separate tournament stages. Doubles pairs: {(cfg.doublesPairing || "singles_results") === "singles_results" ? "formed from the singles results — each team's top two scorers pair up, then the next two" : "always #5+#6, #3+#4, #1+#2 by team position, whatever the singles scores were"}.</p>
         <div className="flex flex-wrap gap-2">{games.map((g) => <Badge key={g.order} variant={g.kind === "singles" ? "secondary" : "outline"}>{gameLabel(g)} vs opposing team’s same position · {diamondPlayingMinutes(cfg, g.kind)} min play + {g.kind === "singles" ? cfg.singlesBreakMinutes ?? 0 : cfg.doublesBreakMinutes ?? 0} min break</Badge>)}</div>
        <p className="text-muted-foreground">One tie takes {plan.tieMinutes} min on one court. With {cfg.courts} court{cfg.courts === 1 ? "" : "s"}, estimated finish: {plan.finish} from {cfg.startTime}.
          {plan.overruns && <span className="text-destructive font-medium"> Later than {cfg.endTime} — adjust the time or courts on Dates &amp; Courts, or shorten the games.</span>}
        </p>
        <p className="text-muted-foreground">Court selection, session times and tournament window remain on <strong>Dates &amp; Courts</strong>. Weekly dates below are used when creating team fixtures; leave blank to choose them later in Diamond League (teams).</p>
      </div>
      <div className="col-span-2 md:col-span-4 rounded-lg border p-3 space-y-3">
        <p className="font-semibold">Divisions and round-robin weeks</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={playoffsOn} disabled={locked} onChange={(e) => set({ playoffs: e.target.checked })} />
          <span className="font-medium">Play-offs after the round robins</span>
          <span className="text-muted-foreground">{playoffsOn ? "crossover semi-finals then finals" : "off — each division ends on its own round-robin table"}</span></label>
        <div className="grid md:grid-cols-2 gap-2">{(["A", "B"] as const).map((pool) => {
          const sc = schedules[pool] || {};
          const days = sc.playDays || [];
          const own = ownDates(pool);
          return <div key={pool} className="rounded border p-2 space-y-1.5" data-field={`diamond-division-schedule-${pool}`}>
            <p className="font-semibold">Division {pool} schedule</p>
            <div className="flex flex-wrap gap-1">{WEEKDAYS.map((d, i) => <Button key={d} type="button" size="sm" disabled={locked} variant={days.includes(i) ? "default" : "outline"} className="h-6 px-2 text-[10px]"
              onClick={() => setSchedule(pool, { playDays: days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort() })}>{d}</Button>)}</div>
            {days.length > 0 ? <div className="flex flex-wrap gap-2 items-center">
              <Label className="text-[10px]">From</Label><Input type="date" className="h-7 w-36 text-xs" disabled={locked} value={sc.startDate || ""} placeholder={startDate} onChange={(e) => setSchedule(pool, { startDate: e.target.value || undefined })} />
              <Label className="text-[10px]">Start</Label><Input type="time" className="h-7 w-24 text-xs" disabled={locked} value={sc.startTime || ""} onChange={(e) => setSchedule(pool, { startTime: e.target.value || undefined })} />
              <span className="text-[10px] text-muted-foreground">Blank = tournament start date / {cfg.startTime}</span>
            </div> : <p className="text-[10px] text-muted-foreground">Pick a play day to fill this division's dates, or type them in the weeks below.</p>}
            {sc.dates?.some(Boolean) && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={locked} onClick={() => setSchedule(pool, { dates: undefined })}>Reset dates to the play-day pattern</Button>}
          </div>;
        })}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2 font-medium">Week</th><th className="py-1 pr-2 font-medium">Division A</th><th className="py-1 font-medium">Division B</th></tr></thead>
            <tbody>{rounds.map((round, i) => <tr key={i} className="border-t align-top">
              <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">Week {i + 1}</td>
              {(["A", "B"] as const).map((pool) => <td key={pool} className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <Input type="date" aria-label={`Division ${pool} week ${i + 1} date`} className="h-7 w-36 text-xs" disabled={locked} value={effDates(pool).dates[i] || ""} onChange={(e) => setWeekDate(pool, i, e.target.value)} />
                  <span className="text-[10px] text-muted-foreground">{schedules[pool]?.startTime || cfg.startTime}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{round.map(([a, b]) => `${pool}${a} v ${pool}${b}`).join(" · ")}</div>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {playoffsOn && draft.teams.length === 8 && <div className="space-y-2">
          <p className="text-muted-foreground">After the pool weeks: crossover semi-finals (points carry), then placing finals ({(cfg.finalsPoints || "reset") === "carry" ? "points carry on — running total decides places" : "points reset"}).</p>
          {["Semi-finals", "Finals"].map((label, j) => { const i = rounds.length + j; return <div key={label} className="flex flex-wrap items-center gap-2">
            <Label className="min-w-16 text-xs">{label}</Label>
            <Input type="date" aria-label={`${label} date`} className="h-8 w-40 text-xs" value={dates[i] || ""} disabled={locked} onChange={(e) => { const next = [...dates]; next[i] = e.target.value; set({ dates: next }); }} />
          </div>; })}
        </div>}
        {playoffsOn && draft.teams.length !== 8 && <p className="text-muted-foreground">Crossover semi-finals and placing finals are available for two divisions of four teams. Other team counts use the division round robins.</p>}
      </div>
      <div className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground">
        {configIssues(cfg).map((i) => <div key={i} className="text-destructive">{i}</div>)}
      </div>
    </div>
  );
}

/**
 * Allocate step: registered players drop into team slots automatically by
 * strength; the admin drags (or taps) players between slots and teams.
 */
export function DiamondAllocationBoard({ draft, onChange, players, nameOf, allocation = "snake", onAllocationChange }: {
  draft: DiamondDraft; onChange: (d: DiamondDraft) => void;
  /** snake = strength zig-zags across all teams; banded = Division A strongest band. */
  allocation?: "snake" | "banded"; onAllocationChange?: (m: "snake" | "banded") => void;
  /** Registered/selected players, strongest first. */
  players: string[]; nameOf: (id: string) => string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string[]>([]);
  const lockedSet = useMemo(() => new Set(draft.locked), [draft.locked]);
  const playersKey = players.join(",");

  // New registrations fill empty slots; withdrawn players leave an empty, flagged slot.
  useEffect(() => {
    if (draft.started) return;
    const r = autoSlotDiamond(players, draft.teams, lockedSet, allocation);
    if (r.removed.length) setFlagged((f) => [...f, ...r.removed]);
    if (JSON.stringify(r.teams) !== JSON.stringify(draft.teams)) onChange({ ...draft, teams: r.teams as DiamondTeam[] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersKey]);

  const placed = new Set(draft.teams.flatMap((t) => t.players.filter(Boolean) as string[]));
  const unallocated = players.filter((p) => !placed.has(p));

  const moveTo = (playerId: string, teamId: string | null, idx: number) => {
    let teams = draft.teams.map((t) => ({ ...t, players: [...t.players] }));
    let from: { t: number; i: number } | null = null;
    teams.forEach((t, ti) => t.players.forEach((p, i) => { if (p === playerId) from = { t: ti, i }; }));
    let locked = draft.locked.filter((k) => !(from && k === `${teams[from.t].id}:${from.i}`));
    if (teamId === null) {
      if (from) teams[from.t].players[from.i] = null;
    } else {
      const ti = teams.findIndex((t) => t.id === teamId);
      const occupant = teams[ti].players[idx];
      teams[ti].players[idx] = playerId;
      if (from) teams[from.t].players[from.i] = occupant ?? null; // swap
      if (from && occupant) locked.push(`${teams[from.t].id}:${from.i}`);
      locked = [...locked.filter((k) => k !== `${teamId}:${idx}`), `${teamId}:${idx}`];
    }
    onChange({ ...draft, teams, locked });
    setPicked(null);
  };
  const toggleLock = (key: string) =>
    onChange({ ...draft, locked: lockedSet.has(key) ? draft.locked.filter((k) => k !== key) : [...draft.locked, key] });
  const autoFill = () => {
    const r = autoSlotDiamond(players, draft.teams, lockedSet, allocation);
    onChange({ ...draft, teams: r.teams as DiamondTeam[] });
  };
  const changeAllocation = (m: "snake" | "banded") => {
    onAllocationChange?.(m);
    if (draft.started) return;
    const cleared = draft.teams.map((t) => ({ ...t, players: t.players.map((p, i) => (lockedSet.has(`${t.id}:${i}`) ? p : null)) }));
    const r = autoSlotDiamond(players, cleared, lockedSet, m);
    onChange({ ...draft, teams: r.teams as DiamondTeam[] });
  };
  const clearUnlocked = () => onChange({
    ...draft, teams: draft.teams.map((t) => ({ ...t, players: t.players.map((p, i) => (lockedSet.has(`${t.id}:${i}`) ? p : null)) })),
  });
  const onDrop = (teamId: string | null, idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveTo(id, teamId, idx);
  };
  const chip = (id: string) => (
    <span draggable={!draft.started} onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
      onClick={(e) => { e.stopPropagation(); setPicked(picked === id ? null : id); }}
      className={`truncate cursor-grab rounded px-1.5 py-0.5 ${picked === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
      {nameOf(id)}
    </span>
  );

  return (
    <div className="space-y-3">
      {onAllocationChange && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-2">
          <div className="text-xs font-medium">Team allocation</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { v: "snake" as const, t: "Snake through all teams", d: "Strength zig-zags across every team in every division, so all teams are of similar strength." },
              { v: "banded" as const, t: "Strength band per division", d: "Division A gets the strongest players, Division B the next band; strength zig-zags only inside each division." },
            ]).map((o) => (
              <label key={o.v} className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${allocation === o.v ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="diamond-allocation" className="mt-1" checked={allocation === o.v} disabled={draft.started} onChange={() => changeAllocation(o.v)} />
                <span className="text-xs"><span className="font-medium block">{o.t}</span><span className="text-muted-foreground">{o.d}</span></span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Changing this re-places everyone by ranking. Locked (moved by hand) players keep their spot.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{placed.size} placed · {unallocated.length} reserve{unallocated.length === 1 ? "" : "s"} · {draft.teams.length * draft.config.playersPerTeam} slots</Badge>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={autoFill} disabled={draft.started}><Wand2 className="w-3.5 h-3.5 mr-1" />Place by ranking</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clearUnlocked} disabled={draft.started}>Clear unlocked slots</Button>
        <span className="text-[11px] text-muted-foreground">Drag a player onto a slot, or tap a player then tap a slot. Moved players are locked (yellow) so automatic placement leaves them alone. To reshuffle by ranking: Clear unlocked slots, then Place by ranking.</span>
      </div>
      {flagged.length > 0 && (
        <p className="text-[11px] text-destructive">Withdrawn — their slot is now empty: {flagged.map(nameOf).join(", ")}. Drag a reserve into the empty slot to substitute them; or leave it empty and the tie is played with a forfeit in that slot.</p>
      )}
      <div className="rounded border border-dashed border-border p-2 min-h-10"
        onDragOver={(e) => e.preventDefault()} onDrop={onDrop(null, 0)}
        onClick={() => picked && moveTo(picked, null, 0)}>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">Reserves (registered, waiting for a team slot — drag or tap into any empty slot to substitute)</div>
        <div className="flex flex-wrap gap-1 text-xs">{unallocated.length ? unallocated.map((id) => <span key={id}>{chip(id)}</span>) : <span className="text-muted-foreground">No reserves waiting</span>}</div>
      </div>
      {(["A", "B"] as const).map((pool) => (
        <div key={pool} className="space-y-1">
          <div className="text-xs font-semibold">Division {pool}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
             {draft.teams.filter((t) => t.pool === pool).map((t) => (
              <Card key={t.id}><CardHeader className="p-2 pb-1">
                 <Input className="h-7 text-xs font-semibold" value={diamondTeamName(t, draft.teams.indexOf(t), draft.teams)}
                  onChange={(e) => onChange({ ...draft, teams: draft.teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} />
              </CardHeader>
                <CardContent className="p-2 pt-0 space-y-1">
                  {t.players.map((p, i) => {
                    const key = `${t.id}:${i}`;
                    return (
                      <div key={i} className={`flex items-center gap-1 text-xs rounded border px-1 py-0.5 min-h-7 ${lockedSet.has(key) ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-border"}`}
                        onDragOver={(e) => e.preventDefault()} onDrop={onDrop(t.id, i)}
                        onClick={() => picked && moveTo(picked, t.id, i)}>
                        <span className="w-6 text-muted-foreground">#{i + 1}</span>
                        <span className="flex-1 min-w-0">{p ? chip(p) : <span className="text-muted-foreground">{picked ? "Tap to place" : "empty"}</span>}</span>
                        {p && <button type="button" title={lockedSet.has(key) ? "Locked — click to unlock" : "Unlocked — click to lock"} onClick={(e) => { e.stopPropagation(); toggleLock(key); }}>
                          {lockedSet.has(key) ? <Lock className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}</button>}
                        {p && !draft.started && <button type="button" title="Move to reserves" onClick={(e) => { e.stopPropagation(); moveTo(p, null, 0); }}><X className="w-3 h-3" /></button>}
                      </div>
                    );
                  })}
                </CardContent></Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiamondFixturesPreview({ draft, nameOf, courtName, startDate }: {
  draft: DiamondDraft; startDate?: string; nameOf: (id: string) => string; courtName: (courtNumber: number) => string;
}) {
  const weeks = buildPoolWeeks(draft.teams, draft.config.dates || [], draft.config.courts, { schedules: draft.config.divisionSchedules, startDate });
  const games = tieGames(draft.config);
   const teamName = (id: string) => {
     const index = draft.teams.findIndex((team) => team.id === id);
     return index < 0 ? "Team" : diamondTeamName(draft.teams[index], index, draft.teams);
   };
  return <div className="space-y-3">
    <div><p className="text-sm font-semibold">Fixture preview</p><p className="text-[11px] text-muted-foreground">These games are created when you save the Diamond League. Scores are entered from Tournament Games.</p></div>
    {weeks.map((week) => <div key={week.week} className="rounded border border-border p-2 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold"><span>Week {week.week}</span><Badge variant="outline" className="text-[10px]">{week.date || "Date not set"}</Badge></div>
      <div className="grid md:grid-cols-2 gap-2">{week.ties.map((tie) => {
        const home = draft.teams.find((team) => team.id === tie.home);
        const away = draft.teams.find((team) => team.id === tie.away);
        return <div key={tie.id} className="rounded border border-border p-2 text-[11px]">
          <div className="flex justify-between gap-2 font-semibold mb-1"><span>{tie.label} · {courtName(tie.court)}{tie.date !== undefined ? ` · ${tie.date || "date not set"}${tie.time ? ` ${tie.time}` : ""}` : ""}</span><span>{teamName(tie.home)} v {teamName(tie.away)}</span></div>
          {games.map((game) => {
            const label = (team?: DiamondTeam) => game.positions.map((position) => nameOf(team?.players[position - 1] || "")).join(" & ");
            return <div key={game.order} className="grid grid-cols-[1fr_auto_1fr] gap-2 py-0.5"><span className="truncate">{label(home)}</span><span className="text-muted-foreground">v</span><span className="truncate text-right">{label(away)}</span></div>;
          })}
        </div>;
      })}</div>
    </div>)}
  </div>;
}
