import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gem, Plus, ArrowLeft, Save, Wand2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fromExt } from "@/lib/supabase-ext";
import { useClubMembers } from "@/hooks/use-club";
import {
  DIAMOND_TEAM_DEFAULTS, DRAW_RULE_LABEL, TIE_BREAK_LABEL, FINAL_LEVEL_LABEL, PLACING_FINALS,
  tieGames, gameLabel, poolRounds, tieResult, standings, nightPlan, configIssues, decideLevelFinal, diamondTeamName,
  diamondSemiTies, diamondFinalTies,
  type TeamLeagueConfig, type TieBreak, type GameScore, type DrawRule, type FinalLevelRule,
} from "@/lib/tournaments/team-league";
import { syncDiamondFixtures } from "@/lib/tournaments/diamond-fixtures";

type Team = { id: string; name: string; pool: "A" | "B"; players: (string | null)[] };
type Tie = { id: string; home: string; away: string; court: number; label?: string };
type Week = { week: number; date: string; stage: "pool" | "semi" | "final"; ties: Tie[] };
type EventRow = {
  id: string; club_id: string; name: string; status: string;
  config: TeamLeagueConfig & { dates?: string[] };
  teams: Team[]; weeks: Week[]; results: Record<string, GameScore[]>;
};

const uid = () => crypto.randomUUID().slice(0, 8);
const newTeams = (n: number, size: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({
    id: uid(), name: `${i < n / 2 ? "A" : "B"}${(i % (n / 2)) + 1}`, pool: i < n / 2 ? "A" : "B", players: Array(size).fill(null),
  }));

export function TeamLeagueManager({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: events = [] } = useQuery({
    queryKey: ["team-league-events", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("team_league_events").select("*").eq("club_id", clubId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EventRow[];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const cfg = { ...DIAMOND_TEAM_DEFAULTS, dates: [] as string[] };
      const { data, error } = await fromExt("team_league_events")
        .insert({ club_id: clubId, name: "Diamond League", config: cfg, teams: newTeams(8, cfg.playersPerTeam) })
        .select("*").single();
      if (error) throw error;
      return data as EventRow;
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["team-league-events", clubId] }); setOpenId(row.id); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("team_league_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Diamond League deleted"); qc.invalidateQueries({ queryKey: ["team-league-events", clubId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const standaloneEvents = events.filter((event: any) => !event.tournament_id);
  const open = standaloneEvents.find((e) => e.id === openId);
  if (open) return <Editor key={open.id} ev={open} onBack={() => setOpenId(null)} />;
  if (standaloneEvents.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gem className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">Diamond League (teams)</div>
              <p className="text-[11px] text-muted-foreground">Set up a new one in Plan New Tournament → Structure → Diamond League (teams). Open one here to create the weeks, enter scores and see the tables.</p>
            </div>
          </div>
        </div>
      </CardHeader>
      {standaloneEvents.length > 0 && (
        <CardContent className="space-y-1">
          {standaloneEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-1">
              <button onClick={() => setOpenId(e.id)} className="flex-1 flex items-center justify-between rounded border border-border px-3 py-2 text-left text-xs hover:bg-muted">
                <span className="font-medium">{e.name}{(e as any).tournament_id && <Badge variant="outline" className="ml-2 text-[10px]">From tournament setup</Badge>}</span>
                <span className="text-muted-foreground">{e.teams.length} teams · {e.weeks.length} weeks</span>
              </button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Delete this Diamond League"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${e.name}"? Its teams, fixtures and scores will be removed. This cannot be undone.`)) del.mutate(e.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function Editor({ ev, onBack }: { ev: EventRow; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: members = [] } = useClubMembers(ev.club_id);
  const [name, setName] = useState(ev.name);
  const [cfg, setCfg] = useState<EventRow["config"]>({ ...DIAMOND_TEAM_DEFAULTS, ...ev.config });
  const [teams, setTeams] = useState<Team[]>(ev.teams);
  const [weeks, setWeeks] = useState<Week[]>(ev.weeks || []);
  const [results, setResults] = useState<Record<string, GameScore[]>>(ev.results || {});
  const games = tieGames(cfg);
  const played = Object.values(results).some((r) => r?.some(Boolean));

  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    (members as any[]).forEach((x) => m.set(x.id, x.name || x.profiles?.name || "Member"));
    return m;
  }, [members]);
  const sortedMembers = useMemo(
    () => [...(members as any[])].filter((m) => m.status !== "resigned").sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [members],
  );
  const teamName = (id: string) => {
    const index = teams.findIndex((t) => t.id === id);
    return index < 0 ? "?" : diamondTeamName(teams[index], index, teams);
  };
  const used = new Set(teams.flatMap((t) => t.players.filter(Boolean) as string[]));

  // Mirror every Diamond game into the linked tournament's game list so it
  // shows under Upcoming and can be marked. Scored/started games are kept.
  const syncFixtures = (wk: Week[]) =>
    (ev as any).tournament_id
      ? syncDiamondFixtures({ champId: (ev as any).tournament_id as string, clubId: ev.club_id, cfg, teams, weeks: wk, teamName })
      : Promise.resolve(0);

  const save = useMutation({
    mutationFn: async (wkOverride?: Week[]) => {
      const timingIssues = configIssues(cfg);
      if (timingIssues.length) throw new Error(timingIssues.join(" "));
      const wk = wkOverride ?? weeks;
      const { error } = await fromExt("team_league_events").update({ name, config: cfg, teams, weeks: wk, results }).eq("id", ev.id);
      if (error) throw error;
      return syncFixtures(wk);
    },
    onSuccess: (n) => {
      toast.success((ev as any).tournament_id ? `Saved — fixtures updated in the tournament's games (${n} new)` : "Saved");
      qc.invalidateQueries({ queryKey: ["team-league-events", ev.club_id] });
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setSize = (n: number) => {
    setCfg({ ...cfg, playersPerTeam: n });
    setTeams(teams.map((t) => ({ ...t, players: Array.from({ length: n }, (_, i) => t.players[i] ?? null) })));
  };
  const setTeamCount = (n: number) => {
    const next = [...teams];
    while (next.length < n) next.push({ id: uid(), name: "", pool: "B", players: Array(cfg.playersPerTeam).fill(null) });
    next.length = n;
    setTeams(next.map((t, i) => {
      const pool = i < n / 2 ? "A" : "B";
      return { ...t, name: t.name || `${pool}${i < n / 2 ? i + 1 : i - n / 2 + 1}`, pool };
    }));
  };

  const pools = { A: teams.filter((t) => t.pool === "A"), B: teams.filter((t) => t.pool === "B") };
  const courtOf = (i: number) => (i % Math.max(1, cfg.courts)) + 1;
  const dates = cfg.dates ?? [];

  const generatePool = () => {
    if (played) return toast.error("Games have been scored — pool fixtures are locked.");
    const incomplete = teams.filter((t) => t.players.some((p) => !p));
    if (incomplete.length) return toast.error(`Fill every slot first: ${incomplete.map((t) => teamName(t.id)).join(", ")}`);
    const rA = poolRounds(pools.A.length), rB = poolRounds(pools.B.length);
    const n = Math.max(rA.length, rB.length);
    const w: Week[] = [];
    for (let i = 0; i < n; i++) {
      const ties: Tie[] = [];
      (["A", "B"] as const).forEach((p) => {
        const rounds = p === "A" ? rA : rB;
        (rounds[i] || []).forEach(([a, b]) => {
          const list = pools[p];
          ties.push({ id: `p${i + 1}-${list[a - 1].id}-${list[b - 1].id}`, home: list[a - 1].id, away: list[b - 1].id, court: 0, label: `${p}${a} v ${p}${b}` });
        });
      });
      ties.forEach((t, k) => (t.court = courtOf(k)));
      w.push({ week: i + 1, date: dates[i] || "", stage: "pool", ties });
    }
    setWeeks(w);
    save.mutate(w);
  };

  const clean = (tieId: string): GameScore[] =>
    ((results[tieId] || []) as any[]).map((g) => (g && Number.isFinite(g.home) && Number.isFinite(g.away) ? g : null));
  const tieRes = (t: Tie) => tieResult(clean(t.id), games.length, cfg.winBonus, cfg.drawRule);
  const poolTies = weeks.filter((w) => w.stage === "pool").flatMap((w) => w.ties);
  const poolTable = (p: "A" | "B") =>
    standings(pools[p].map((t) => t.id), poolTies.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })), undefined, cfg.tieBreaks);
  const poolDone = poolTies.length > 0 && poolTies.every((t) => tieRes(t).complete);
  const semiWeek = weeks.find((w) => w.stage === "semi");
  const finalWeek = weeks.find((w) => w.stage === "final");
  const twoByFour = pools.A.length === 4 && pools.B.length === 4;

  const generateSemis = () => {
    const a = poolTable("A"), b = poolTable("B");
    if (a.undecided.length || b.undecided.length) return toast.error("Some teams are level and the tie-breaks can't separate them. Add a tie-break in the settings.");
    const ties = diamondSemiTies(a.rows.map((r) => r.teamId), b.rows.map((r) => r.teamId), courtOf);
    const n = weeks.filter((w) => w.stage === "pool").length;
    const nw: Week[] = [...weeks.filter((w) => w.stage === "pool"), { week: n + 1, date: dates[n] || "", stage: "semi", ties }];
    setWeeks(nw); save.mutate(nw);
  };
  const semiWinner = (m: number) => {
    const t = semiWeek?.ties.find((x) => x.id === `s${m}`);
    if (!t) return null;
    const r = tieRes(t);
    if (!r.complete) return null;
    // Semis carry points but the tie itself is won on the night; a level tie falls back to the final rule.
    const w = r.winner === "draw" ? decideLevelFinal(clean(t.id), r, cfg.finalLevelRule) : r.winner;
    if (!w) return null;
    return { W: w === "home" ? t.home : t.away, L: w === "home" ? t.away : t.home };
  };
  const generateFinals = () => {
    const s = [1, 2, 3, 4].map(semiWinner);
    if (s.some((x) => !x)) return toast.error("Every semi needs a decided result first.");
    const ties = diamondFinalTies(s as Array<{ W: string; L: string }>, courtOf);
    const n = weeks.filter((w) => w.stage !== "final").length;
    const nw: Week[] = [...weeks.filter((w) => w.stage !== "final"), { week: n + 1, date: dates[n] || "", stage: "final", ties }];
    setWeeks(nw); save.mutate(nw);
  };

  const semiTable = semiWeek && (() => {
    const carry = new Map<string, number>();
    (["A", "B"] as const).forEach((p) => poolTable(p).rows.forEach((r) => carry.set(r.teamId, r.total)));
    return standings(teams.map((t) => t.id), semiWeek.ties.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })), carry, cfg.tieBreaks);
  })();

  const setScore = (tieId: string, gi: number, side: "home" | "away", v: string) => {
    const arr: any[] = [...(results[tieId] || [])];
    while (arr.length < games.length) arr.push(null);
    const cur = arr[gi] || { home: null, away: null };
    arr[gi] = { ...cur, [side]: v === "" || isNaN(Number(v)) ? null : Number(v) };
    setResults({ ...results, [tieId]: arr });
  };
  const tieResClean = tieRes;

  const plan = nightPlan(cfg, Math.max(...weeks.map((w) => w.ties.length), teams.length / 2));
  const issues = configIssues(cfg);
  const toggleTb = (tb: TieBreak) =>
    setCfg({ ...cfg, tieBreaks: cfg.tieBreaks.includes(tb) ? cfg.tieBreaks.filter((x) => x !== tb) : [...cfg.tieBreaks, tb] });
  const num = (k: keyof TeamLeagueConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: Number(e.target.value) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5 mr-1" />All</Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs text-sm font-semibold" />
        <Button size="sm" onClick={() => save.mutate(undefined)} disabled={save.isPending}><Save className="w-3.5 h-3.5 mr-1" />Save</Button>
      </div>

      <Card><CardHeader className="pb-2 text-sm font-semibold">1. Rules</CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><Label className="text-xs">Players per team</Label>
            <select className="w-full h-8 rounded border border-input bg-background px-2" value={cfg.playersPerTeam} disabled={played} onChange={(e) => setSize(Number(e.target.value))}>
              {[2, 4, 6, 8].map((n) => <option key={n} value={n}>{n} ({n} singles + {n / 2} doubles)</option>)}
            </select></div>
          <div><Label className="text-xs">Teams</Label>
            <select className="w-full h-8 rounded border border-input bg-background px-2" value={teams.length} disabled={weeks.length > 0} onChange={(e) => setTeamCount(Number(e.target.value))}>
              {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} (2 pools of {n / 2})</option>)}
            </select></div>
           <div><Label className="text-xs">Singles slot (min)</Label><Input className="h-8" type="number" min={1} step={1} value={cfg.singlesMinutes} onChange={num("singlesMinutes")} /></div>
           <div><Label className="text-xs">Singles break (min)</Label><Input className="h-8" type="number" min={0} step={1} value={cfg.singlesBreakMinutes ?? 0} onChange={num("singlesBreakMinutes")} /></div>
           <div><Label className="text-xs">Doubles slot (min)</Label><Input className="h-8" type="number" min={1} step={1} value={cfg.doublesMinutes} onChange={num("doublesMinutes")} /></div>
           <div><Label className="text-xs">Doubles break (min)</Label><Input className="h-8" type="number" min={0} step={1} value={cfg.doublesBreakMinutes ?? 0} onChange={num("doublesBreakMinutes")} /></div>
          <div><Label className="text-xs">Win bonus</Label><Input className="h-8" type="number" value={cfg.winBonus} onChange={num("winBonus")} /></div>
          <div><Label className="text-xs">Courts</Label><Input className="h-8" type="number" value={cfg.courts} onChange={num("courts")} /></div>
          <div><Label className="text-xs">Start</Label><Input className="h-8" type="time" value={cfg.startTime} onChange={(e) => setCfg({ ...cfg, startTime: e.target.value })} /></div>
          <div><Label className="text-xs">End</Label><Input className="h-8" type="time" value={cfg.endTime} onChange={(e) => setCfg({ ...cfg, endTime: e.target.value })} /></div>
          <div className="col-span-2"><Label className="text-xs">Level tie (same points)</Label>
            <select className="w-full h-8 rounded border border-input bg-background px-2" value={cfg.drawRule} onChange={(e) => setCfg({ ...cfg, drawRule: e.target.value as DrawRule })}>
              {Object.entries(DRAW_RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="col-span-2"><Label className="text-xs">Level final (points reset)</Label>
            <select className="w-full h-8 rounded border border-input bg-background px-2" value={cfg.finalLevelRule} onChange={(e) => setCfg({ ...cfg, finalLevelRule: e.target.value as FinalLevelRule })}>
              {Object.entries(FINAL_LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="col-span-2 md:col-span-4"><Label className="text-xs">Tie-breaks when team totals are level (tap in order)</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(Object.keys(TIE_BREAK_LABEL) as TieBreak[]).map((tb) => {
                const i = cfg.tieBreaks.indexOf(tb);
                return <Button key={tb} type="button" size="sm" variant={i >= 0 ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => toggleTb(tb)}>{i >= 0 ? `${i + 1}. ` : ""}{TIE_BREAK_LABEL[tb]}</Button>;
              })}
            </div></div>
          <div className="col-span-2 md:col-span-4"><Label className="text-xs">Dates (one per week)</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {Array.from({ length: 5 }, (_, i) => (
                <Input key={i} type="date" className="h-8 w-40" value={dates[i] || ""} onChange={(e) => { const d = [...dates]; d[i] = e.target.value; setCfg({ ...cfg, dates: d }); }} />
              ))}
            </div></div>
          <div className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground">
            Each tie: {games.map(gameLabel).join(" → ")}. A tie takes {plan.tieMinutes} min; the night finishes about {plan.finish}
            {plan.overruns && <span className="text-destructive font-medium"> — later than {cfg.endTime}, add courts or shorten games</span>}.
            {issues.map((i) => <div key={i} className="text-destructive">{i}</div>)}
          </div>
        </CardContent></Card>

      <Card><CardHeader className="pb-2 text-sm font-semibold">2. Teams and players (#1 = strongest)</CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          {teams.map((t, ti) => (
            <div key={t.id} className="rounded border border-border p-2 space-y-1">
              <div className="flex gap-1">
                 <Input className="h-7 text-xs font-semibold" value={teamName(t.id)} onChange={(e) => setTeams(teams.map((x, i) => (i === ti ? { ...x, name: e.target.value } : x)))} />
                <select className="h-7 rounded border border-input bg-background px-1 text-xs" value={t.pool} disabled={weeks.length > 0} onChange={(e) => setTeams(teams.map((x, i) => (i === ti ? { ...x, pool: e.target.value as "A" | "B" } : x)))}>
                  <option value="A">Pool A</option><option value="B">Pool B</option>
                </select>
              </div>
              {t.players.map((p, pi) => (
                <div key={pi} className="flex items-center gap-1 text-xs">
                  <span className="w-6 text-muted-foreground">#{pi + 1}</span>
                  <select className="flex-1 h-7 rounded border border-input bg-background px-1" value={p || ""} disabled={played}
                    onChange={(e) => setTeams(teams.map((x, i) => (i === ti ? { ...x, players: x.players.map((y, j) => (j === pi ? e.target.value || null : y)) } : x)))}>
                    <option value="">— choose player —</option>
                    {sortedMembers.filter((m) => m.id === p || !used.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name || "Member"}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </CardContent></Card>

      <Card><CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <span className="text-sm font-semibold">3. Fixtures and scores</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={generatePool} disabled={played}><Wand2 className="w-3.5 h-3.5 mr-1" />Create pool weeks</Button>
            {twoByFour && poolDone && <Button size="sm" variant="outline" onClick={generateSemis} disabled={!!semiWeek && semiWeek.ties.some((t) => tieResClean(t).complete)}>Create semis</Button>}
            {semiWeek && <Button size="sm" variant="outline" onClick={generateFinals} disabled={!!finalWeek && finalWeek.ties.some((t) => tieResClean(t).complete)}>Create finals</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Tap <span className="font-medium text-foreground">Create pool weeks</span> once every team slot is filled — that generates the fixtures below.
            Each row is one game: home players on the left, away players on the right, and the two small boxes between them are that game's score
            (left box = left team's points, right box = right team's points). Empty boxes mean the game hasn't been scored yet. Scores save when you tap Save at the top.
          </p>
          {!twoByFour && weeks.length > 0 && <p className="text-[11px] text-muted-foreground">Crossover semis and placing finals are set up for 2 pools of 4 teams.</p>}
          {weeks.map((w) => (
            <div key={w.week} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                Week {w.week} <Badge variant="outline" className="text-[10px]">{w.stage === "pool" ? "Pool" : w.stage === "semi" ? "Semi-finals (points carry)" : "Finals (points reset)"}</Badge>
                <Input type="date" className="h-7 w-36" value={w.date} onChange={(e) => setWeeks(weeks.map((x) => (x.week === w.week ? { ...x, date: e.target.value } : x)))} />
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {w.ties.map((t) => {
                  const r = tieResClean(t);
                  const H = teams.find((x) => x.id === t.home), A = teams.find((x) => x.id === t.away);
                  return (
                    <div key={t.id} className="rounded border border-border p-2 text-xs">
                      <div className="flex justify-between font-medium mb-1">
                        <span>{diamondTieLabel(t.label)} · Court {t.court}</span>
                        <span>{teamName(t.home)} {r.homePoints + r.homeBonus} – {r.awayPoints + r.awayBonus} {teamName(t.away)}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_3rem_3rem_1fr] gap-1 text-[10px] text-muted-foreground">
                        <span>{teamName(t.home)}</span><span className="text-center">score</span><span className="text-center">score</span><span className="text-right">{teamName(t.away)}</span>
                      </div>
                      {games.map((g, gi) => {
                        const nm = (tm?: Team) => g.positions.map((pos) => memberName.get(tm?.players[pos - 1] || "") || `#${pos}`).join(" & ");
                        const s = (results[t.id] || [])[gi] as any;
                        return (
                          <div key={gi} className="grid grid-cols-[1fr_3rem_3rem_1fr] items-center gap-1 py-0.5">
                            <span className="truncate" title={gameLabel(g)}>{nm(H)}</span>
                            <Input className="h-6 px-1 text-center" inputMode="numeric" placeholder="pts" title={`${gameLabel(g)} — home points`} value={Number.isFinite(s?.home) ? s.home : ""} onChange={(e) => setScore(t.id, gi, "home", e.target.value)} />
                            <Input className="h-6 px-1 text-center" inputMode="numeric" placeholder="pts" title={`${gameLabel(g)} — away points`} value={Number.isFinite(s?.away) ? s.away : ""} onChange={(e) => setScore(t.id, gi, "away", e.target.value)} />
                            <span className="truncate text-right">{nm(A)}</span>
                          </div>
                        );
                      })}
                      {r.complete && <div className="text-[11px] text-muted-foreground mt-1">
                        {r.winner === "draw" ? `Level — ${DRAW_RULE_LABEL[cfg.drawRule]}` : `${teamName(r.winner === "home" ? t.home : t.away)} win +${cfg.winBonus}`}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent></Card>

      {poolTies.length > 0 && (
        <Card><CardHeader className="pb-2 text-sm font-semibold">4. Tables</CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-xs">
            {(["A", "B"] as const).map((p) => <Table key={p} title={`Pool ${p}`} t={poolTable(p)} name={teamName} />)}
            {semiTable && <Table title="After semi-finals (carried + semi points)" t={semiTable} name={teamName} />}
            {finalWeek && (
              <div><div className="font-semibold mb-1">Final places</div>
                {finalWeek.ties.map((t, k) => {
                  const res = results[t.id] ? tieResClean(t) : null;
                  const w = res?.complete ? decideLevelFinal(clean(t.id), res, cfg.finalLevelRule) : null;
                  const pl = PLACING_FINALS[k].places;
                  return <div key={t.id}>{pl[0]}. {w ? teamName(w === "home" ? t.home : t.away) : "—"} · {pl[1]}. {w ? teamName(w === "home" ? t.away : t.home) : "—"}
                    {res?.complete && !w && <span className="text-destructive"> (level — organiser decides)</span>}</div>;
                })}
              </div>
            )}
          </CardContent></Card>
      )}
    </div>
  );
}

function Table({ title, t, name }: { title: string; t: ReturnType<typeof standings>; name: (id: string) => string }) {
  const level = new Set(t.undecided.flat());
  return (
    <div>
      <div className="font-semibold mb-1">{title}</div>
      <table className="w-full">
        <thead className="text-muted-foreground"><tr><th className="text-left">#</th><th className="text-left">Team</th><th>P</th><th>W</th><th>Pts</th><th>Bonus</th><th>Total</th></tr></thead>
        <tbody>{t.rows.map((r, i) => (
          <tr key={r.teamId} className={level.has(r.teamId) ? "text-destructive" : ""}>
            <td>{i + 1}</td><td>{name(r.teamId)}</td><td className="text-center">{r.played}</td><td className="text-center">{r.won}</td>
            <td className="text-center">{r.points}</td><td className="text-center">{r.bonus}</td><td className="text-center font-semibold">{r.total}</td>
          </tr>))}</tbody>
      </table>
      {t.undecided.length > 0 && t.rows.some((r) => r.played) && <p className="text-[11px] text-destructive">Level teams in red — add or change a tie-break.</p>}
    </div>
  );
}
