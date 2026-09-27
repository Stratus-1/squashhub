/**
 * Doubles substitution eligibility.
 *
 * A sub may come from the league reserve team (at its reserve rank) and/or
 * from a team on bye that week (rank = the pair number they play in their own
 * team). The rank rule is admin-chosen: any, same rank only, or same-or-lower
 * (never a stronger player: a higher rank number is weaker).
 */

export type SubRankRule = "any" | "same" | "same_or_lower";

export interface DoublesSubRules {
  enforce: boolean;
  fromReserves: boolean;
  fromByeTeam: boolean;
  rankRule: SubRankRule;
}

export interface SubCandidateInfo {
  /** Rank from the reserve team, if on it. */
  reserveRank?: number | null;
  /** Pair number in their own team, if that team has a bye this week. */
  byeRank?: number | null;
}

export type SubCheck = { ok: true } | { ok: false; reason: string };

const rankOk = (rule: SubRankRule, rank: number, slot: number) =>
  rule === "any" || (rule === "same" ? rank === slot : rank >= slot);

export function checkDoublesSub(rules: DoublesSubRules, info: SubCandidateInfo, slot: number): SubCheck {
  if (!rules.enforce) return { ok: true };
  const sources: Array<{ label: string; rank: number }> = [];
  if (rules.fromReserves && info.reserveRank != null) sources.push({ label: "reserve", rank: info.reserveRank });
  if (rules.fromByeTeam && info.byeRank != null) sources.push({ label: "bye", rank: info.byeRank });
  if (!sources.length) {
    const allowed = [rules.fromReserves && "the reserve team", rules.fromByeTeam && "a team on bye"].filter(Boolean);
    return {
      ok: false,
      reason: allowed.length ? `Not on ${allowed.join(" or ")} this week` : "Substitutes are not allowed in this league",
    };
  }
  if (sources.some((s) => rankOk(rules.rankRule, s.rank, slot))) return { ok: true };
  const best = sources[0].rank;
  return { ok: false, reason: `Rank ${best} can't sub into pair ${slot}` };
}
