/**
 * Finishing order of a completed stage.
 *
 * A two-stage tournament (Durbanville's "Diamond League": a singles round robin
 * followed by a doubles round robin) builds the doubles pairs out of how the
 * singles stage finished. That means we need ONE agreed ordering, computed the
 * same way the standings table shows it, so 6+5 really is the pair the players
 * expect.
 *
 * Ordering is delegated to the tournament's own format strategy, so a timed
 * (Bells) stage ranks on points scored while a standard stage ranks on wins.
 */
import type { MatchLike, StandingsStats, TournamentFormat } from "@/lib/tournament-formats/types";

export type FinishingEntry = {
  memberId: string;
  name?: string | null;
  stats: StandingsStats;
};

const emptyStats = (): StandingsStats => ({
  played: 0,
  won: 0,
  lost: 0,
  gamesWon: 0,
  gamesLost: 0,
  byes: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});

/**
 * Rank the given members over the given (completed) matches.
 * Strongest first — index 0 is position 1.
 */
export function finishingOrder(opts: {
  members: { id: string; name?: string | null }[];
  matches: MatchLike[];
  format: Pick<TournamentFormat, "applyMatchToStats">;
  isDoubles?: boolean;
}): FinishingEntry[] {
  const { members, matches, format, isDoubles = false } = opts;
  const rows: FinishingEntry[] = members.map((m) => {
    const stats = emptyStats();
    for (const match of matches) format.applyMatchToStats(stats, match, m.id, isDoubles);
    return { memberId: m.id, name: m.name ?? null, stats };
  });
  return rows.sort((a, b) => {
    const s = a.stats;
    const t = b.stats;
    if (t.won !== s.won) return t.won - s.won;
    const sPts = s.pointsFor - s.pointsAgainst;
    const tPts = t.pointsFor - t.pointsAgainst;
    if (tPts !== sPts) return tPts - sPts;
    if (t.pointsFor !== s.pointsFor) return t.pointsFor - s.pointsFor;
    const sGames = s.gamesWon - s.gamesLost;
    const tGames = t.gamesWon - t.gamesLost;
    if (tGames !== sGames) return tGames - sGames;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}
