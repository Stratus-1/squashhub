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

/**
 * Unplayed games the withdrawal has to close out.
 *
 * A player may be entered in several leagues of the same tournament, so a
 * withdrawal is normally scoped to ONE league (`groupNumber`). Leaving it out
 * pulls them out of every league.
 */
export function matchesToClose<T extends WithdrawMatch>(
  matches: T[],
  memberId: string,
  groupNumber?: number | null,
): T[] {
  return (matches || []).filter(
    (m) =>
      !m.is_bye &&
      !FINISHED.has(String(m.status || "").toLowerCase()) &&
      sideOf(m, memberId) !== null &&
      (groupNumber == null || Number(m.group_number) === Number(groupNumber)),
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
  opts: { bestOf?: number; pointsPerGame?: number; groupNumber?: number | null } = {},
): { id: string; payload: Record<string, any>; bookingId: string | null }[] {
  const out: { id: string; payload: Record<string, any>; bookingId: string | null }[] = [];
  for (const m of matchesToClose(matches, memberId, opts.groupNumber ?? null)) {
    const side = sideOf(m, memberId)!;
    const absentId = side === "a" ? m.player_a_member_id : m.player_b_member_id;
    const opponentId = side === "a" ? m.player_b_member_id : m.player_a_member_id;
    if (!absentId || !opponentId) continue;
    out.push({
      id: m.id,
      bookingId: (m as any).booking_id ?? null,
      payload: {
        ...buildForfeitPayload({
          match: m as any,
          absentMemberId: absentId,
          rule: "walkover_win",
          points: { opponent: 0, player: 0 },
          bestOf: opts.bestOf ?? 3,
          pointsPerGame: opts.pointsPerGame ?? 11,
        }),
        // The game will never be played, so the court must go back into the
        // pool — a walkover may never leave a live booking behind.
        ...RELEASED_SLOT,
      },
    });
  }
  return out;
}

/** Court/time fields cleared when a fixture no longer needs a court. */
export const RELEASED_SLOT = {
  court_id: null,
  scheduled_date: null,
  scheduled_time: null,
  booking_id: null,
} as const;

/**
 * A withdrawn player must also disappear from the organiser's saved seeding
 * order and from any confirmed draw board — otherwise they keep reappearing in
 * the setup lists, and taking them off the board blocks "Confirm draw".
 */
export function removeFromSeedOrder(
  order: unknown,
  memberIds: string[],
): string[] | null {
  if (!Array.isArray(order)) return null;
  const drop = new Set(memberIds);
  const next = order.filter((id) => typeof id === "string" && !drop.has(id));
  return next.length === order.length ? null : (next as string[]);
}

type ManualDrawMatch = { a?: string | null; b?: string | null; [k: string]: any };

export function removeFromManualDraws(
  draws: unknown,
  memberIds: string[],
): Record<string, any> | null {
  if (!draws || typeof draws !== "object" || Array.isArray(draws)) return null;
  const drop = new Set(memberIds);
  let changed = false;
  const next: Record<string, any> = {};
  for (const [key, board] of Object.entries(draws as Record<string, any>)) {
    const matches = Array.isArray(board?.matches) ? (board.matches as ManualDrawMatch[]) : null;
    if (!matches) {
      next[key] = board;
      continue;
    }
    const cleaned = matches
      .map((m) => {
        const a = m.a && drop.has(m.a) ? null : m.a ?? null;
        const b = m.b && drop.has(m.b) ? null : m.b ?? null;
        if (a !== (m.a ?? null) || b !== (m.b ?? null)) changed = true;
        return { ...m, a, b };
      })
      // A matchup with nobody left in it is not a bye — it is nothing.
      .filter((m) => m.a || m.b);
    if (cleaned.length !== matches.length) changed = true;
    next[key] = { ...board, matches: cleaned };
  }
  return changed ? next : null;
}

