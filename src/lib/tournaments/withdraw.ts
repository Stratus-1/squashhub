/**
 * A player pulls OUT of the whole tournament.
 *
 * One action, not a match-by-match clean-up: the entry is cancelled and every
 * game of theirs that has not been played yet is closed as a walkover to the
 * opponent, so the opponent stays alive and the withdrawing player drops out of
 * the draw. Games already played keep their real result — history never moves.
 */
import { buildForfeitPayload } from "./forfeit";

export type WithdrawMatch = {
  id: string;
  status?: string | null;
  is_bye?: boolean | null;
  group_number?: number | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
};

const FINISHED = new Set(["completed", "complete", "walkover", "forfeit", "cancelled"]);

/** Which side of the fixture the member (or their doubles partner) is on. */
export function sideOf(match: WithdrawMatch, memberId: string): "a" | "b" | null {
  if (match.player_a_member_id === memberId || match.partner_a_member_id === memberId) return "a";
  if (match.player_b_member_id === memberId || match.partner_b_member_id === memberId) return "b";
  return null;
}

/** Unplayed games the withdrawal has to close out. */
export function matchesToClose<T extends WithdrawMatch>(matches: T[], memberId: string): T[] {
  return (matches || []).filter(
    (m) =>
      !m.is_bye &&
      !FINISHED.has(String(m.status || "").toLowerCase()) &&
      sideOf(m, memberId) !== null,
  );
}

/**
 * Database updates for a withdrawal: a straight-games walkover to the opponent
 * on every unplayed game. Fixtures with no opponent yet are skipped — there is
 * nobody to advance.
 */
export function withdrawalUpdates(
  matches: WithdrawMatch[],
  memberId: string,
  opts: { bestOf?: number; pointsPerGame?: number } = {},
): { id: string; payload: Record<string, any> }[] {
  const out: { id: string; payload: Record<string, any> }[] = [];
  for (const m of matchesToClose(matches, memberId)) {
    const side = sideOf(m, memberId)!;
    const absentId = side === "a" ? m.player_a_member_id : m.player_b_member_id;
    const opponentId = side === "a" ? m.player_b_member_id : m.player_a_member_id;
    if (!absentId || !opponentId) continue;
    out.push({
      id: m.id,
      payload: buildForfeitPayload({
        match: m as any,
        absentMemberId: absentId,
        rule: "walkover_win",
        points: { opponent: 0, player: 0 },
        bestOf: opts.bestOf ?? 3,
        pointsPerGame: opts.pointsPerGame ?? 11,
      }),
    });
  }
  return out;
}
