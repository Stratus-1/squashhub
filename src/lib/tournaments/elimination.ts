/**
 * Knockout elimination display rules.
 *
 * In a knockout (or play-off) stage a loss ends that player's run in the
 * division, so their name stays visible in the draw but is struck through.
 * Pool / group / league-stage losses are NOT eliminations — those players keep
 * playing, so they must never be struck through.
 *
 * Pure logic only, so the same rule can be reused by every surface that lists
 * matches (tournament games list, championship view, my matches).
 */

export interface EliminationMatchLike {
  status?: string | null;
  /** "ko", "playoff_qf", "playoff_sf", "playoff_final", "group", ... */
  stage?: string | null;
  is_bye?: boolean | null;
  winner_member_id?: string | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
}

/** True when the match belongs to a knockout / play-off bracket. */
export function isKnockoutStage(
  m: EliminationMatchLike,
  opts: { knockout?: boolean } = {},
): boolean {
  const stage = String(m.stage || "").toLowerCase();
  if (stage.startsWith("ko") || stage.startsWith("playoff")) return true;
  // Pool / group stages are never knockouts, even in a knockout tournament.
  if (stage === "group" || stage === "pool" || stage === "league") return false;
  return !!opts.knockout;
}

/**
 * Which side was knocked out by this match, or null when nobody was.
 * A bye, an unfinished match, or a match with no recorded winner eliminates
 * nobody. Third/fourth play-offs still eliminate the loser from the title.
 */
export function eliminatedSide(
  m: EliminationMatchLike,
  opts: { knockout?: boolean } = {},
): "a" | "b" | null {
  if (m.is_bye) return null;
  if (m.status !== "completed" && m.status !== "walkover") return null;
  if (!isKnockoutStage(m, opts)) return null;
  const w = m.winner_member_id;
  if (!w) return null;
  if (w === m.player_a_member_id && m.player_b_member_id) return "b";
  if (w === m.player_b_member_id && m.player_a_member_id) return "a";
  return null;
}

/** Convenience: is this specific side eliminated by this match? */
export function isEliminated(
  m: EliminationMatchLike,
  side: "a" | "b",
  opts: { knockout?: boolean } = {},
): boolean {
  return eliminatedSide(m, opts) === side;
}

/** Tailwind classes applied to a knocked-out player's name. */
export const ELIMINATED_NAME_CLASS = "line-through decoration-2 opacity-70";
