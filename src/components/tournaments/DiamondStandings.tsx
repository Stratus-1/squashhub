import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gem, Trophy, TrendingDown, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { fromExt } from "@/lib/supabase-ext";
import {
  DIAMOND_TEAM_DEFAULTS, CROSSOVER, PLACING_FINALS,
  tieGames, gameLabel, tieResult, standings, decideLevelFinal, diamondTeamName,
  diamondSemiTies, diamondFinalTies,
  type TeamLeagueConfig, type GameScore,
} from "@/lib/tournaments/team-league";
import { syncDiamondFixtures } from "@/lib/tournaments/diamond-fixtures";

type Team = { id: string; name: string; pool: "A" | "B"; players: (string | null)[] };
type Tie = { id: string; home: string; away: string; court: number; label?: string };
type Week = { week: number; date: string; stage: "pool" | "semi" | "final"; ties: Tie[] };
type EventRow = {
  id: string; club_id: string; name: string;
  config: TeamLeagueConfig & { dates?: string[] };
  teams: Team[]; weeks: Week[]; results: Record<string, GameScore[]>;
};

/** Diamond League standings for the tournament page: pool tables with
 *  team totals, the semi-final table (points carried), and final places.
 *  Admins can create the crossover semi-finals and placing finals right here
 *  once every league week (or every semi) is decided. */
export function DiamondStandings({ tournamentId, canManage = false }: { tournamentId: string; canManage?: boolean }) {
  const qc = useQueryClient();
  const { data: ev } = useQuery({
    queryKey: ["team-league-event-for-tournament", tournamentId],
    queryFn: async () => {
      const { data, error } = await fromExt("team_league_events")
        .select("*").eq("tournament_id", tournamentId).maybeSingle();
      if (error) throw error;
      return (data || null) as EventRow | null;
    },
    enabled: !!tournamentId,
  });
  const { data: markedGames = [] } = useQuery({
    queryKey: ["diamond-marked-games", tournamentId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("stage_key, status, side_a_points, side_b_points, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id")
        .eq("champ_id", tournamentId)
        .like("stage_key", "dl:%");
      if (error) throw error;
      return data || [];
    },
    enabled: !!tournamentId,
    refetchInterval: 10000,
  });
  const playerIds = [...new Set((ev?.teams || []).flatMap((t) => t.players).filter(Boolean))] as string[];
  const { data: names = {} } = useQuery({
    queryKey: ["diamond-player-names", tournamentId, playerIds.join("|")],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members").select("id, name").in("id", playerIds);
      if (error) throw error;
      return Object.fromEntries((data || []).map((m: any) => [m.id, m.name || "Member"])) as Record<string, string>;
    },
    enabled: playerIds.length > 0,
  });
  const generatePlayoff = useMutation({
    mutationFn: async (stage: "semi" | "final") => {
      if (!ev) throw new Error("Event not loaded yet.");
      const weeksNow = ev.weeks || [];
      let nw: Week[];
      if (stage === "semi") {
        const a = poolTable("A"), b = poolTable("B");
        if (a.undecided.length || b.undecided.length) throw new Error("Some teams are level and the tie-breaks can't separate them. Add a tie-break in the settings.");
        const n = weeksNow.filter((w) => w.stage === "pool").length;
        nw = [
          ...weeksNow.filter((w) => w.stage === "pool"),
          { week: n + 1, date: (ev.config.dates || [])[n] || "", stage: "semi", ties: diamondSemiTies(a.rows.map((r) => r.teamId), b.rows.map((r) => r.teamId), courtOf) },
        ];
      } else {
        const s = [1, 2, 3, 4].map(semiWinner);
        if (s.some((x) => !x)) throw new Error("Every semi-final needs a decided result first.");
        const n = weeksNow.filter((w) => w.stage !== "final").length;
        nw = [
          ...weeksNow.filter((w) => w.stage !== "final"),
          { week: n + 1, date: (ev.config.dates || [])[n] || "", stage: "final", ties: diamondFinalTies(s as Array<{ W: string; L: string }>, courtOf) },
        ];
      }
      const { error } = await fromExt("team_league_events").update({ weeks: nw }).eq("id", ev.id);
      if (error) throw error;
      const champId = (ev as any).tournament_id as string | null;
      if (champId) await syncDiamondFixtures({ champId, clubId: ev.club_id, cfg, teams, weeks: nw, teamName });
      return stage;
    },
    onSuccess: (stage) => {
      qc.invalidateQueries({ queryKey: ["team-league-event-for-tournament", tournamentId] });
      qc.invalidateQueries({ queryKey: ["diamond-marked-games", tournamentId] });
      qc.invalidateQueries({ queryKey: ["champ-matches"] });
      toast.success(stage === "semi" ? "Semi-finals created" : "Finals created");
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the play-offs."),
  });
  if (!ev) return null;

  const cfg: TeamLeagueConfig = { ...DIAMOND_TEAM_DEFAULTS, ...ev.config };
  const teams = ev.teams || [];
  const weeks = ev.weeks || [];
  const results: Record<string, GameScore[]> = { ...(ev.results || {}) };
  for (const match of markedGames as any[]) {
    if (match.status !== "completed") continue;
    const key = String(match.stage_key || "");
    const parsed = key.match(/^dl:(.+):(\d+)$/);
    if (!parsed) continue;
    const tieId = parsed[1];
    const gameIndex = Number(parsed[2]);
    const scores = [...(results[tieId] || [])];
    while (scores.length <= gameIndex) scores.push(null);
    scores[gameIndex] = { home: Number(match.side_a_points) || 0, away: Number(match.side_b_points) || 0 };
    results[tieId] = scores;
  }
  const games = tieGames(cfg);
  const teamName = (id: string) => {
    const index = teams.findIndex((t) => t.id === id);
    return index < 0 ? "?" : diamondTeamName(teams[index], index, teams);
  };
  const courtOf = (i: number) => (i % Math.max(1, cfg.courts)) + 1;

  const clean = (tieId: string): GameScore[] =>
    ((results[tieId] || []) as any[]).map((g) => (g && Number.isFinite(g.home) && Number.isFinite(g.away) ? g : null));
  const tieRes = (t: Tie) => tieResult(clean(t.id), games.length, cfg.winBonus, cfg.drawRule);

  const poolTies = weeks.filter((w) => w.stage === "pool").flatMap((w) => w.ties);
  const inProgress = new Set<string>();
  for (const t of poolTies) {
    const sc = clean(t.id);
    if (sc.some(Boolean) && !tieRes(t).complete) {
      inProgress.add(t.home);
      inProgress.add(t.away);
    }
  }
  const poolTable = (p: "A" | "B") =>
    standings(
      teams.filter((t) => t.pool === p).map((t) => t.id),
      poolTies.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })),
      undefined,
      cfg.tieBreaks,
      true,
    );

  const semiWeek = weeks.find((w) => w.stage === "semi");
  const finalWeek = weeks.find((w) => w.stage === "final");
  const semiTable = semiWeek && (() => {
    const carry = new Map<string, number>();
    (["A", "B"] as const).forEach((p) => poolTable(p).rows.forEach((r) => carry.set(r.teamId, r.total)));
    return standings(teams.map((t) => t.id), semiWeek.ties.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })), carry, cfg.tieBreaks);
  })();
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
  const poolDone = poolTies.length > 0 && poolTies.every((t) => tieRes(t).complete);
  const semisDecided = !!semiWeek && semiWeek.ties.length > 0 && [1, 2, 3, 4].every((m) => semiWinner(m) !== null);

  const anyScores = Object.values(results).some((r) => r?.some(Boolean));
  // Fun stats: the single team on top and at the bottom across both divisions (live totals).
  const combinedRows = [...poolTable("A").rows, ...poolTable("B").rows].sort((a, b) => b.total - a.total);
  const frontRunner = anyScores ? combinedRows[0] : undefined;
  const woodenSpoon = anyScores && combinedRows.length > 1 ? combinedRows[combinedRows.length - 1] : undefined;
  // Individual player totals: points scored in every marked game, singles and doubles alike.
  const playerTotals = new Map<string, number>();
  for (const m of markedGames as any[]) {
    const a = Number(m.side_a_points) || 0;
    const b = Number(m.side_b_points) || 0;
    if (!a && !b) continue;
    for (const id of [m.player_a_member_id, m.partner_a_member_id].filter(Boolean)) playerTotals.set(id, (playerTotals.get(id) || 0) + a);
    for (const id of [m.player_b_member_id, m.partner_b_member_id].filter(Boolean)) playerTotals.set(id, (playerTotals.get(id) || 0) + b);
  }
  const playersRanked = [...playerTotals.entries()].sort((x, y) => y[1] - x[1]);
  const topPlayer = playersRanked[0];
  const lastPlayer = playersRanked.length > 1 ? playersRanked[playersRanked.length - 1] : undefined;

  return (
    <CollapsibleCard
      defaultOpen
      className="border-primary/40"
      titleClassName="text-lg"
      title={
        <span className="flex items-center gap-2">
          <Gem className="w-4 h-4 text-primary" /> {ev.name} — Team Standings
          <Badge variant="outline" className="text-[10px]">{teams.length} teams</Badge>
        </span>
      }
      contentClassName="space-y-4"
    >
      {!anyScores && (
        <p className="text-xs text-muted-foreground italic">No scores yet — the tables fill in as games are marked.</p>
      )}
      {anyScores && (
        <p className="text-[11px] text-muted-foreground">Live: points update as each game is marked. P, W and the win bonus are added when a team match is finished.</p>
      )}
      {canManage && !semiWeek && poolTies.length > 0 && (
        poolDone ? (
          <div className="flex items-center gap-2 flex-wrap rounded border border-primary/40 bg-primary/5 p-2 text-xs">
            <span className="font-medium">All league weeks are played.</span>
            <Button size="sm" className="h-7 text-xs" disabled={generatePlayoff.isPending} onClick={() => generatePlayoff.mutate("semi")}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Create semi-finals
            </Button>
            <span className="text-muted-foreground">Top two of each division cross over: A1 v B2, A2 v B1, A3 v B4, A4 v B3.</span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {poolTies.filter((t) => tieRes(t).complete).length} of {poolTies.length} team ties played — semi-finals unlock when every league week is finished.
          </p>
        )
      )}
      {canManage && semiWeek && !finalWeek && (
        semisDecided ? (
          <div className="flex items-center gap-2 flex-wrap rounded border border-primary/40 bg-primary/5 p-2 text-xs">
            <span className="font-medium">Semi-finals are decided.</span>
            <Button size="sm" className="h-7 text-xs" disabled={generatePlayoff.isPending} onClick={() => generatePlayoff.mutate("final")}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Create finals
            </Button>
            <span className="text-muted-foreground">Places 1–8 from the semi results; points reset for the finals.</span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Finals unlock when every semi-final is decided.</p>
        )
      )}
      {frontRunner && woodenSpoon && (
        <div className="grid grid-cols-2 gap-2" data-field="diamond-fun-stats">
          <div className="rounded border border-primary/40 bg-primary/5 p-2 text-xs flex items-start gap-2">
            <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Front runner</div>
              <div className="font-semibold truncate">
                {teamName(frontRunner.teamId)}
                {inProgress.has(frontRunner.teamId) && <span className="ml-1 text-[10px] font-normal text-primary">● live</span>}
              </div>
              <div className="text-muted-foreground">
                Division {teams.find((t) => t.id === frontRunner.teamId)?.pool} · {frontRunner.points} pts + {frontRunner.bonus} bonus = {frontRunner.total}
              </div>
            </div>
          </div>
          <div className="rounded border border-border bg-muted/30 p-2 text-xs flex items-start gap-2">
            <TrendingDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Wooden spooner</div>
              <div className="font-semibold truncate">
                {teamName(woodenSpoon.teamId)}
                {inProgress.has(woodenSpoon.teamId) && <span className="ml-1 text-[10px] font-normal text-primary">● live</span>}
              </div>
              <div className="text-muted-foreground">
                Division {teams.find((t) => t.id === woodenSpoon.teamId)?.pool} · {woodenSpoon.points} pts + {woodenSpoon.bonus} bonus = {woodenSpoon.total}
              </div>
            </div>
          </div>
          {topPlayer && lastPlayer && (
            <>
              <div className="rounded border border-primary/40 bg-primary/5 p-2 text-xs flex items-start gap-2">
                <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top player</div>
                  <div className="font-semibold truncate">{names[topPlayer[0]] || "Member"}</div>
                  <div className="text-muted-foreground">{topPlayer[1]} points scored</div>
                </div>
              </div>
              <div className="rounded border border-border bg-muted/30 p-2 text-xs flex items-start gap-2">
                <TrendingDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last player</div>
                  <div className="font-semibold truncate">{names[lastPlayer[0]] || "Member"}</div>
                  <div className="text-muted-foreground">{lastPlayer[1]} points scored</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {(["A", "B"] as const).map((p) => (
          <TeamTable key={p} title={`Division ${p}`} t={poolTable(p)} name={teamName} inProgress={inProgress} />
        ))}
      </div>
      {semiTable && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">
            Semi-finals: {CROSSOVER.map((c) => `A${c.a} v B${c.b}`).join(" · ")} — pool points carry over, +{cfg.winBonus} for the win.
          </p>
          <TeamTable title="After semi-finals (carried + semi points)" t={semiTable} name={teamName} />
        </div>
      )}
      <div>
        <div className="font-semibold text-sm mb-1">Teams</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {teams.map((t) => (
            <div key={t.id} className="rounded border border-border p-2 text-xs">
              <div className="font-semibold mb-0.5">{teamName(t.id)} <span className="text-muted-foreground font-normal">· Division {t.pool}</span></div>
              {t.players.map((pid, i) => (
                <div key={i}>
                  <span className="text-muted-foreground">#{i + 1}</span> {pid ? names[pid] || "Member" : "—"}
                  {pid && anyScores && (
                    <span className="text-muted-foreground ml-1">· {playerTotals.get(pid) || 0} pts</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {weeks.length > 0 && (
        <div className="space-y-3">
          <div className="font-semibold text-sm">Schedule and scores</div>
          {weeks.map((w) => (
            <div key={`${w.stage}-${w.week}`}>
              <div className="text-xs font-semibold text-primary mb-1">
                {w.stage === "pool" ? `Week ${w.week}` : w.stage === "semi" ? "Semi-finals" : "Finals"}
                {w.date ? ` · ${w.date}` : ""}
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {w.ties.map((t) => {
                  const home = teams.find((x) => x.id === t.home);
                  const away = teams.find((x) => x.id === t.away);
                  const sc = clean(t.id);
                  const res = tieRes(t);
                  const nm = (tm: Team | undefined, pos: number[]) =>
                    pos.map((p) => (tm?.players[p - 1] && names[tm.players[p - 1]!]) || `#${p}`).join(" & ");
                  const rowNames = (gi: number, side: "a" | "b") => {
                    const m = (markedGames as any[]).find((x) => x.stage_key === `dl:${t.id}:${gi}`);
                    const ids = m ? [m[`player_${side}_member_id`], m[`partner_${side}_member_id`]].filter(Boolean) : [];
                    return ids.length ? ids.map((id: string) => names[id] || "Member").join(" & ") : null;
                  };
                  return (
                    <div key={t.id} className="rounded border border-border p-2 text-xs">
                      <div className="flex justify-between font-semibold mb-1">
                        <span>{teamName(t.home)} v {teamName(t.away)}{t.label ? ` · ${t.label}` : ""}</span>
                        <span className="text-muted-foreground">Court {t.court}</span>
                      </div>
                      <table className="w-full">
                        <tbody>
                          {games.map((g, gi) => {
                            const s = sc[gi];
                            return (
                              <tr key={gi}>
                                <td className="text-muted-foreground pr-1 whitespace-nowrap">{gameLabel(g)}</td>
                                <td className="text-right">{rowNames(gi, "a") ?? nm(home, g.positions)}</td>
                                <td className="text-center font-semibold px-1 whitespace-nowrap">{s ? `${s.home} – ${s.away}` : "–"}</td>
                                <td>{rowNames(gi, "b") ?? nm(away, g.positions)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {sc.some(Boolean) && (
                        <div className="text-right mt-1 font-semibold">Points {res.homePoints ?? ""} – {res.awayPoints ?? ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {finalWeek && (
        <div>
          <div className="font-semibold text-sm mb-1">Final places <span className="text-[11px] font-normal text-muted-foreground">(points reset for finals)</span></div>
          <div className="text-xs space-y-0.5">
            {finalWeek.ties.map((t, k) => {
              const res = results[t.id] ? tieRes(t) : null;
              const w = res?.complete ? decideLevelFinal(clean(t.id), res, cfg.finalLevelRule) : null;
              const pl = PLACING_FINALS[k]?.places ?? [k * 2 + 1, k * 2 + 2];
              return (
                <div key={t.id}>
                  {pl[0]}. {w ? teamName(w === "home" ? t.home : t.away) : "—"} · {pl[1]}. {w ? teamName(w === "home" ? t.away : t.home) : "—"}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

function TeamTable({ title, t, name, inProgress }: { title: string; t: ReturnType<typeof standings>; name: (id: string) => string; inProgress?: Set<string> }) {
  const level = new Set(t.undecided.flat());
  return (
    <div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr><th className="text-left">#</th><th className="text-left">Team</th><th>P</th><th>W</th><th>Pts</th><th>Bonus</th><th>Total</th></tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={r.teamId} className={level.has(r.teamId) ? "text-destructive" : ""}>
              <td className="py-0.5">{i + 1}</td>
              <td className="py-0.5 font-medium">
                {name(r.teamId)}
                {inProgress?.has(r.teamId) && (
                  <span className="ml-1 text-[10px] font-normal text-primary" title="Team match still in progress">● live</span>
                )}
              </td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.won}</td>
              <td className="text-center">{r.points}</td>
              <td className="text-center">{r.bonus}</td>
              <td className="text-center font-semibold">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
