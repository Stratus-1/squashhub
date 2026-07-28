import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trophy, Copy, Flame, Repeat, TrendingUp, Zap, Shield, Swords, Timer } from "lucide-react";
import { toast } from "sonner";
import {
  computeImprovement,
  computePlayerAwards,
  computeTeamStandings,
  leagueLabelFromRoundName,
  rankPlayers,
  winPct,
  type AwardFixtureMeta,
  type AwardRoundMeta,
  type PlayerAward,
} from "@/lib/league-awards";

interface Props {
  clubId: string;
}

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣"];

export function LeagueAwardsTab({ clubId }: Props) {
  const [leagueLabel, setLeagueLabel] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["league-awards", clubId],
    queryFn: async () => {
      const { data: rounds, error: rErr } = await supabase
        .from("league_rounds")
        .select("id, name, round_number, round_date")
        .eq("club_id", clubId)
        .order("round_number");
      if (rErr) throw rErr;
      const roundIds = (rounds || []).map((r) => r.id);
      if (!roundIds.length) return { rounds: [], fixtures: [], matches: [], fixtureResults: [], teams: [] };

      const { data: fixtures, error: fErr } = await supabase
        .from("platform_league_fixtures")
        .select("id, round_id, fixture_date, home_team_code, away_team_code")
        .in("round_id", roundIds);
      if (fErr) throw fErr;
      const fixtureIds = (fixtures || []).map((f) => f.id);

      const chunks: string[][] = [];
      for (let i = 0; i < fixtureIds.length; i += 200) chunks.push(fixtureIds.slice(i, i + 200));

      const matches: any[] = [];
      const fixtureResults: any[] = [];
      for (const chunk of chunks) {
        const [{ data: mr, error: mErr }, { data: fr, error: frErr }] = await Promise.all([
          supabase
            .from("league_match_results")
            .select(
              "fixture_id, position, home_player_code, away_player_code, home_player_name, away_player_name, home_games_won, away_games_won, winner, is_forfeit, game_scores",
            )
            .in("fixture_id", chunk),
          supabase
            .from("league_fixture_results")
            .select("fixture_id, home_total_games, away_total_games, home_total_points, away_total_points, winner, status")
            .in("fixture_id", chunk),
        ]);
        if (mErr) throw mErr;
        if (frErr) throw frErr;
        matches.push(...(mr || []));
        fixtureResults.push(...(fr || []));
      }

      const { data: teams } = await supabase.from("leagues").select("name, code, nsa_team_code").eq("club_id", clubId);

      return { rounds: rounds || [], fixtures: fixtures || [], matches, fixtureResults, teams: teams || [] };
    },
  });

  const leagueOptions = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of (data?.rounds || []) as AwardRoundMeta[]) {
      const label = leagueLabelFromRoundName(r.name);
      set.set(label, (set.get(label) || 0) + 1);
    }
    return [...set.entries()].map(([label, count]) => ({ label, count }));
  }, [data]);

  const activeLabel = leagueLabel || leagueOptions[0]?.label || "";

  const computed = useMemo(() => {
    if (!data) return null;
    const rounds = (data.rounds as AwardRoundMeta[]).filter((r) => leagueLabelFromRoundName(r.name) === activeLabel);
    const roundMap = new Map(rounds.map((r) => [r.id, r]));
    const fixtures = (data.fixtures as AwardFixtureMeta[]).filter((f) => f.round_id && roundMap.has(f.round_id));
    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
    const matches = (data.matches as any[]).filter((m) => fixtureMap.has(m.fixture_id));
    const results = (data.fixtureResults as any[]).filter((r) => fixtureMap.has(r.fixture_id));

    const teamNames = new Map<string, string>();
    for (const t of data.teams as any[]) {
      if (t.code) teamNames.set(String(t.code).toUpperCase(), t.name);
      if (t.nsa_team_code) teamNames.set(String(t.nsa_team_code).toUpperCase(), t.name);
    }

    const players = computePlayerAwards(matches, fixtureMap, roundMap);
    const ranked = rankPlayers(players);
    const roundNumbers = rounds.map((r) => r.round_number).sort((a, b) => a - b);
    const labels: Record<number, string> = {};
    rounds.forEach((r) => (labels[r.round_number] = r.name));
    const improvement = computeImprovement(players, roundNumbers, labels);
    const standings = computeTeamStandings(results, fixtureMap, teamNames);

    return { rounds, players, ranked, improvement, standings, teamNames, matchCount: matches.length };
  }, [data, activeLabel]);

  const top = <T,>(list: T[], pick: (t: T) => number, minPlayed?: (t: T) => boolean): T[] => {
    const filtered = minPlayed ? list.filter(minPlayed) : list;
    const sorted = [...filtered].sort((a, b) => pick(b) - pick(a));
    const best = sorted.length ? pick(sorted[0]) : 0;
    if (best <= 0) return [];
    return sorted.filter((x) => pick(x) === best).slice(0, 3);
  };

  const awards = useMemo(() => {
    if (!computed) return [];
    const p = computed.players;
    const named = (list: PlayerAward[], detail: (x: PlayerAward) => string) =>
      list.map((x) => ({ name: x.name, detail: detail(x) }));

    return [
      {
        icon: Trophy,
        title: "Player of the League",
        hint: "Most wins, then win %, then game difference",
        winners: named(computed.ranked.slice(0, 1), (x) => `${x.won}/${x.played} wins · ${winPct(x).toFixed(0)}%`),
      },
      {
        icon: Shield,
        title: "Most appearances",
        hint: "Turned out most often for the team",
        winners: named(top(p, (x) => x.played), (x) => `${x.played} matches`),
      },
      {
        icon: Timer,
        title: "Most 5-setters played",
        hint: "The marathon player",
        winners: named(top(p, (x) => x.fiveSetters), (x) => `${x.fiveSetters} five-setters (${x.fiveSetterWins} won)`),
      },
      {
        icon: Swords,
        title: "5-set king",
        hint: "Most five-setters won",
        winners: named(top(p, (x) => x.fiveSetterWins), (x) => `${x.fiveSetterWins} of ${x.fiveSetters} won`),
      },
      {
        icon: Zap,
        title: "Best win rate",
        hint: "Minimum 3 matches played",
        winners: named(
          top(p, (x) => Math.round(winPct(x) * 10), (x) => x.played >= 3),
          (x) => `${winPct(x).toFixed(0)}% (${x.won}/${x.played})`,
        ),
      },
      {
        icon: Flame,
        title: "Longest winning streak",
        hint: "Consecutive wins across the league",
        winners: named(top(p, (x) => x.bestStreak), (x) => `${x.bestStreak} in a row`),
      },
      {
        icon: Zap,
        title: "Most 3-0 sweeps",
        hint: "Won without dropping a game",
        winners: named(top(p, (x) => x.sweeps), (x) => `${x.sweeps} clean sweeps`),
      },
      {
        icon: Repeat,
        title: "Comeback of the season",
        hint: "Won after losing the first two games",
        winners: named(top(p, (x) => x.comebacks), (x) => `${x.comebacks} comeback win(s)`),
      },
      {
        icon: TrendingUp,
        title: "Most improved",
        hint: "Win % in the last round vs the first round (min 2 matches each)",
        winners: computed.improvement
          .filter((r) => r.delta > 0)
          .slice(0, 3)
          .map((r) => ({
            name: r.player.name,
            detail: `${r.firstWinPct.toFixed(0)}% → ${r.lastWinPct.toFixed(0)}% (+${r.delta.toFixed(0)} pts)`,
          })),
      },
    ];
  }, [computed]);

  const copySummary = () => {
    if (!computed) return;
    const lines: string[] = [`*${activeLabel} — Prize giving*`, ""];
    lines.push("*Top 4 players*");
    computed.ranked.slice(0, 4).forEach((p, i) => {
      lines.push(`${MEDALS[i] || `${i + 1}.`} ${p.name} — ${p.won}/${p.played} wins, ${winPct(p).toFixed(0)}%`);
    });
    lines.push("");
    for (const a of awards) {
      if (!a.winners.length) continue;
      lines.push(`*${a.title}*: ${a.winners.map((w) => `${w.name} (${w.detail})`).join(", ")}`);
    }
    if (computed.standings.length) {
      lines.push("", "*Team standings*");
      computed.standings.slice(0, 8).forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.points} pts`));
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Prize-giving summary copied");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading league results…
      </div>
    );
  }

  if (!leagueOptions.length) {
    return <Card className="p-6 text-sm text-muted-foreground">No league rounds found for this club yet.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">League</span>
        <Select value={activeLabel} onValueChange={setLeagueLabel}>
          <SelectTrigger className="w-[240px] h-8 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {leagueOptions.map((o) => (
              <SelectItem key={o.label} value={o.label}>
                {o.label} ({o.count} round{o.count === 1 ? "" : "s"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{computed?.matchCount ?? 0} matches scored</Badge>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={copySummary} className="h-8">
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy for WhatsApp
          </Button>
        </div>
      </Card>

      {/* Awards */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a) => {
          const Icon = a.icon;
          return (
            <Card key={a.title} className="p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{a.title}</h3>
              </div>
              {a.winners.length ? (
                <ul className="space-y-0.5">
                  {a.winners.map((w, i) => (
                    <li key={`${w.name}-${i}`} className="text-[13px]">
                      <span className="font-medium">{w.name}</span>{" "}
                      <span className="text-muted-foreground">— {w.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted-foreground">No qualifying player yet.</p>
              )}
              <p className="text-[11px] text-muted-foreground/80">{a.hint}</p>
            </Card>
          );
        })}
      </div>

      {/* Player ranking */}
      <Card className="p-3 space-y-2">
        <h3 className="text-sm font-semibold">Player ranking — who is No 1, 2, 3, 4?</h3>
        <p className="text-[11px] text-muted-foreground">
          Sorted on wins first, then win %, then game difference, then points difference.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">P</TableHead>
                <TableHead className="text-center">W</TableHead>
                <TableHead className="text-center">L</TableHead>
                <TableHead className="text-center">Win %</TableHead>
                <TableHead className="text-center">Games</TableHead>
                <TableHead className="text-center">Pts diff</TableHead>
                <TableHead className="text-center">5-set</TableHead>
                <TableHead className="text-center">Streak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(computed?.ranked || []).map((p, i) => (
                <TableRow key={p.key} className={i < 4 ? "bg-accent/10" : undefined}>
                  <TableCell className="font-semibold">{MEDALS[i] || i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.code && <span className="text-muted-foreground text-[11px] ml-1">{p.code}</span>}
                  </TableCell>
                  <TableCell className="text-center">{p.played}</TableCell>
                  <TableCell className="text-center">{p.won}</TableCell>
                  <TableCell className="text-center">{p.lost}</TableCell>
                  <TableCell className="text-center">{winPct(p).toFixed(0)}%</TableCell>
                  <TableCell className="text-center">
                    {p.gamesWon}–{p.gamesLost}
                  </TableCell>
                  <TableCell className="text-center">{p.pointsFor - p.pointsAgainst}</TableCell>
                  <TableCell className="text-center">
                    {p.fiveSetterWins}/{p.fiveSetters}
                  </TableCell>
                  <TableCell className="text-center">{p.bestStreak}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Improvement */}
      {!!computed?.improvement.length && (
        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Improvement — first round vs last round</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-center">{computed.improvement[0].firstLabel}</TableHead>
                  <TableHead className="text-center">{computed.improvement[0].lastLabel}</TableHead>
                  <TableHead className="text-center">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.improvement.map((r) => (
                  <TableRow key={r.player.key}>
                    <TableCell className="font-medium">{r.player.name}</TableCell>
                    <TableCell className="text-center">
                      {r.firstWinPct.toFixed(0)}% <span className="text-muted-foreground text-[11px]">({r.firstPlayed})</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.lastWinPct.toFixed(0)}% <span className="text-muted-foreground text-[11px]">({r.lastPlayed})</span>
                    </TableCell>
                    <TableCell
                      className={
                        "text-center font-semibold " +
                        (r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : r.delta < 0 ? "text-destructive" : "")
                      }
                    >
                      {r.delta > 0 ? "+" : ""}
                      {r.delta.toFixed(0)} pts
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Team standings */}
      {!!computed?.standings.length && (
        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Team standings</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">P</TableHead>
                  <TableHead className="text-center">W</TableHead>
                  <TableHead className="text-center">L</TableHead>
                  <TableHead className="text-center">Games</TableHead>
                  <TableHead className="text-center">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.standings.map((t, i) => (
                  <TableRow key={t.code} className={i === 0 ? "bg-accent/10" : undefined}>
                    <TableCell className="font-semibold">{MEDALS[i] || i + 1}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-center">{t.played}</TableCell>
                    <TableCell className="text-center">{t.won}</TableCell>
                    <TableCell className="text-center">{t.lost}</TableCell>
                    <TableCell className="text-center">
                      {t.gamesFor}–{t.gamesAgainst}
                    </TableCell>
                    <TableCell className="text-center font-semibold">{t.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
