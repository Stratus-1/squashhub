import { useQuery } from "@tanstack/react-query";
import { Gem } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { fromExt } from "@/lib/supabase-ext";
import {
  DIAMOND_TEAM_DEFAULTS, CROSSOVER, PLACING_FINALS,
  tieGames, gameLabel, tieResult, standings, decideLevelFinal,
  type TeamLeagueConfig, type GameScore,
} from "@/lib/tournaments/team-league";

type Team = { id: string; name: string; pool: "A" | "B"; players: (string | null)[] };
type Tie = { id: string; home: string; away: string; court: number; label?: string };
type Week = { week: number; date: string; stage: "pool" | "semi" | "final"; ties: Tie[] };
type EventRow = {
  id: string; name: string;
  config: TeamLeagueConfig & { dates?: string[] };
  teams: Team[]; weeks: Week[]; results: Record<string, GameScore[]>;
};

/** Read-only Diamond League standings for the tournament page: pool tables with
 *  team totals, the semi-final table (points carried), and final places. */
export function DiamondStandings({ tournamentId }: { tournamentId: string }) {
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
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";

  const clean = (tieId: string): GameScore[] =>
    ((results[tieId] || []) as any[]).map((g) => (g && Number.isFinite(g.home) && Number.isFinite(g.away) ? g : null));
  const tieRes = (t: Tie) => tieResult(clean(t.id), games.length, cfg.winBonus, cfg.drawRule);

  const poolTies = weeks.filter((w) => w.stage === "pool").flatMap((w) => w.ties);
  const poolTable = (p: "A" | "B") =>
    standings(
      teams.filter((t) => t.pool === p).map((t) => t.id),
      poolTies.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })),
      undefined,
      cfg.tieBreaks,
    );

  const semiWeek = weeks.find((w) => w.stage === "semi");
  const finalWeek = weeks.find((w) => w.stage === "final");
  const semiTable = semiWeek && (() => {
    const carry = new Map<string, number>();
    (["A", "B"] as const).forEach((p) => poolTable(p).rows.forEach((r) => carry.set(r.teamId, r.total)));
    return standings(teams.map((t) => t.id), semiWeek.ties.map((t) => ({ homeId: t.home, awayId: t.away, result: tieRes(t) })), carry, cfg.tieBreaks);
  })();

  const anyScores = Object.values(results).some((r) => r?.some(Boolean));

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
      <div className="grid md:grid-cols-2 gap-4">
        {(["A", "B"] as const).map((p) => (
          <TeamTable key={p} title={`Division ${p}`} t={poolTable(p)} name={teamName} />
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
              <div className="font-semibold mb-0.5">{t.name} <span className="text-muted-foreground font-normal">· Division {t.pool}</span></div>
              {t.players.map((pid, i) => (
                <div key={i}><span className="text-muted-foreground">#{i + 1}</span> {pid ? names[pid] || "Member" : "—"}</div>
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

function TeamTable({ title, t, name }: { title: string; t: ReturnType<typeof standings>; name: (id: string) => string }) {
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
              <td className="py-0.5 font-medium">{name(r.teamId)}</td>
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
