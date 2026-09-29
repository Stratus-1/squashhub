import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Wand2, X } from "lucide-react";
import {
  DIAMOND_TEAM_DEFAULTS, DRAW_RULE_LABEL, TIE_BREAK_LABEL, FINAL_LEVEL_LABEL,
  tieGames, gameLabel, nightPlan, configIssues, autoSlotPlayers,
  type TeamLeagueConfig, type TieBreak, type DrawRule, type FinalLevelRule,
} from "@/lib/tournaments/team-league";

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
  Array.from({ length: n }, (_, i) => ({ id: uid(), name: `Team ${i + 1}`, pool: i < n / 2 ? "A" : "B", players: Array(size).fill(null) }));
export const newDiamondDraft = (): DiamondDraft => ({
  config: { ...DIAMOND_TEAM_DEFAULTS, dates: [] }, teams: newDiamondTeams(8, DIAMOND_TEAM_DEFAULTS.playersPerTeam), locked: [],
});

const sel = "w-full h-8 rounded border border-input bg-background px-2 text-xs";

/** Structure step: the Diamond League rules. */
export function DiamondRulesPanel({ draft, onChange, courts }: { draft: DiamondDraft; onChange: (d: DiamondDraft) => void; courts: number }) {
  const cfg = { ...draft.config, courts: courts || draft.config.courts };
  const set = (c: Partial<DiamondDraft["config"]>) => onChange({ ...draft, config: { ...draft.config, ...c } });
  const setSize = (n: number) => onChange({
    ...draft, config: { ...draft.config, playersPerTeam: n },
    teams: draft.teams.map((t) => ({ ...t, players: Array.from({ length: n }, (_, i) => t.players[i] ?? null) })),
    locked: draft.locked.filter((k) => Number(k.split(":")[1]) < n),
  });
  const setTeamCount = (n: number) => {
    const next = [...draft.teams];
    while (next.length < n) next.push(newDiamondTeams(1, cfg.playersPerTeam)[0]);
    next.length = n;
    onChange({ ...draft, teams: next.map((t, i) => ({ ...t, name: t.name, pool: i < n / 2 ? "A" : "B" })) });
  };
  const toggleTb = (tb: TieBreak) => set({ tieBreaks: cfg.tieBreaks.includes(tb) ? cfg.tieBreaks.filter((x) => x !== tb) : [...cfg.tieBreaks, tb] });
  const num = (k: keyof TeamLeagueConfig) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) } as any);
  const games = tieGames(cfg);
  const plan = nightPlan(cfg, draft.teams.length / 2);
  const locked = !!draft.started;
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
      <div><Label className="text-xs">Singles minutes</Label><Input className="h-8" type="number" value={cfg.singlesMinutes} onChange={num("singlesMinutes")} /></div>
      <div><Label className="text-xs">Doubles minutes</Label><Input className="h-8" type="number" value={cfg.doublesMinutes} onChange={num("doublesMinutes")} /></div>
      <div><Label className="text-xs">Win bonus</Label><Input className="h-8" type="number" value={cfg.winBonus} onChange={num("winBonus")} /></div>
      <div className="col-span-2"><Label className="text-xs">Level tie (same points)</Label>
        <select className={sel} value={cfg.drawRule} onChange={(e) => set({ drawRule: e.target.value as DrawRule })}>
          {Object.entries(DRAW_RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="col-span-2 md:col-span-1"><Label className="text-xs">Level final</Label>
        <select className={sel} value={cfg.finalLevelRule} onChange={(e) => set({ finalLevelRule: e.target.value as FinalLevelRule })}>
          {Object.entries(FINAL_LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="col-span-2 md:col-span-4"><Label className="text-xs">Tie-breaks when team totals are level (tap in order)</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {(Object.keys(TIE_BREAK_LABEL) as TieBreak[]).map((tb) => {
            const i = cfg.tieBreaks.indexOf(tb);
            return <Button key={tb} type="button" size="sm" variant={i >= 0 ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => toggleTb(tb)}>{i >= 0 ? `${i + 1}. ` : ""}{TIE_BREAK_LABEL[tb]}</Button>;
          })}
        </div></div>
      <div className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground">
        Each tie: {games.map(gameLabel).join(" → ")}. A tie takes {plan.tieMinutes} min on one court. Courts, dates and times come from the <strong>Courts</strong> step ({cfg.courts} court{cfg.courts === 1 ? "" : "s"}).
        {configIssues(cfg).map((i) => <div key={i} className="text-destructive">{i}</div>)}
      </div>
    </div>
  );
}

/**
 * Allocate step: registered players drop into team slots automatically by
 * strength; the admin drags (or taps) players between slots and teams.
 */
export function DiamondAllocationBoard({ draft, onChange, players, nameOf }: {
  draft: DiamondDraft; onChange: (d: DiamondDraft) => void;
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
    const r = autoSlotPlayers(players, draft.teams, lockedSet);
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
    const r = autoSlotPlayers(players, draft.teams, lockedSet);
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{placed.size} placed · {unallocated.length} unallocated · {draft.teams.length * draft.config.playersPerTeam} slots</Badge>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={autoFill} disabled={draft.started}><Wand2 className="w-3.5 h-3.5 mr-1" />Place by ranking</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clearUnlocked} disabled={draft.started}>Clear unlocked slots</Button>
        <span className="text-[11px] text-muted-foreground">Drag a player onto a slot, or tap a player then tap a slot. Moved players are locked 🔒 so automatic placement leaves them alone.</span>
      </div>
      {flagged.length > 0 && (
        <p className="text-[11px] text-destructive">Withdrawn — their slot is now empty: {flagged.map(nameOf).join(", ")}</p>
      )}
      <div className="rounded border border-dashed border-border p-2 min-h-10"
        onDragOver={(e) => e.preventDefault()} onDrop={onDrop(null, 0)}
        onClick={() => picked && moveTo(picked, null, 0)}>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">Unallocated (registered, not in a team)</div>
        <div className="flex flex-wrap gap-1 text-xs">{unallocated.length ? unallocated.map((id) => <span key={id}>{chip(id)}</span>) : <span className="text-muted-foreground">Nobody waiting</span>}</div>
      </div>
      {(["A", "B"] as const).map((pool) => (
        <div key={pool} className="space-y-1">
          <div className="text-xs font-semibold">Division {pool}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {draft.teams.filter((t) => t.pool === pool).map((t) => (
              <Card key={t.id}><CardHeader className="p-2 pb-1">
                <Input className="h-7 text-xs font-semibold" value={t.name}
                  onChange={(e) => onChange({ ...draft, teams: draft.teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} />
              </CardHeader>
                <CardContent className="p-2 pt-0 space-y-1">
                  {t.players.map((p, i) => {
                    const key = `${t.id}:${i}`;
                    return (
                      <div key={i} className="flex items-center gap-1 text-xs rounded border border-border px-1 py-0.5 min-h-7"
                        onDragOver={(e) => e.preventDefault()} onDrop={onDrop(t.id, i)}
                        onClick={() => picked && moveTo(picked, t.id, i)}>
                        <span className="w-6 text-muted-foreground">#{i + 1}</span>
                        <span className="flex-1 min-w-0">{p ? chip(p) : <span className="text-muted-foreground">{picked ? "Tap to place" : "empty"}</span>}</span>
                        {p && <button type="button" title={lockedSet.has(key) ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); toggleLock(key); }}>
                          {lockedSet.has(key) ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}</button>}
                        {p && !draft.started && <button type="button" title="Back to unallocated" onClick={(e) => { e.stopPropagation(); moveTo(p, null, 0); }}><X className="w-3 h-3" /></button>}
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
