import { tieGames, type DiamondTeam, type DiamondWeek, type TeamLeagueConfig } from "@/lib/tournaments/team-league";

export type DiamondScoredMatch = {
  stage_key: string | null;
  status: string | null;
  side_a_points: number | null;
  side_b_points: number | null;
  player_a_member_id: string | null;
  player_b_member_id: string | null;
  partner_a_member_id: string | null;
  partner_b_member_id: string | null;
};

/** Scores belong to a team slot. Historical match participants remain unchanged when a substitute takes that slot. */
export function diamondPositionPoints(
  teams: DiamondTeam[], weeks: DiamondWeek[], config: TeamLeagueConfig, matches: DiamondScoredMatch[],
): Map<string, number> {
  const points = new Map<string, number>();
  const ties = new Map(weeks.flatMap((week) => week.ties.map((tie) => [tie.id, tie] as const)));
  const games = tieGames(config);
  const knownSlots = new Map<string, Set<number>>();
  const key = (teamId: string, position: number) => `${teamId}:${position}`;
  const remember = (teamId: string, position: number, memberId: string | null) => {
    if (!memberId) return;
    const memberKey = `${teamId}:${memberId}`;
    const slots = knownSlots.get(memberKey) || new Set<number>();
    slots.add(position);
    knownSlots.set(memberKey, slots);
  };
  for (const team of teams) team.players.forEach((id, i) => remember(team.id, i + 1, id));

  const parsed = matches.map((match) => {
    const parts = match.stage_key?.match(/^dl:(.+):(\d+)$/);
    const tie = parts ? ties.get(parts[1]) : undefined;
    const game = parts ? games[Number(parts[2])] : undefined;
    return { match, tie, game };
  });
  // Singles identify the historical occupant of a position even after a squad substitution.
  for (const { match, tie, game } of parsed) {
    if (!tie || !game || game.kind !== "singles") continue;
    remember(tie.home, game.positions[0], match.player_a_member_id);
    remember(tie.away, game.positions[0], match.player_b_member_id);
  }
  for (const { match, tie, game } of parsed) {
    if (!tie || !game || match.status !== "completed") continue;
    const add = (teamId: string, memberId: string | null, amount: number, position?: number) => {
      if (!memberId) return;
      // Do not guess a slot when a player has moved positions across the event.
      const slots = knownSlots.get(`${teamId}:${memberId}`);
      const resolved = position ?? (slots?.size === 1 ? [...slots][0] : undefined);
      if (!resolved) return;
      const slotKey = key(teamId, resolved);
      points.set(slotKey, (points.get(slotKey) || 0) + amount);
    };
    const home = Number(match.side_a_points) || 0;
    const away = Number(match.side_b_points) || 0;
    const position = game.kind === "singles" ? game.positions[0] : undefined;
    add(tie.home, match.player_a_member_id, home, position);
    add(tie.away, match.player_b_member_id, away, position);
    if (game.kind === "doubles") {
      add(tie.home, match.partner_a_member_id, home);
      add(tie.away, match.partner_b_member_id, away);
    }
  }
  return points;
}