/**
 * Refine club ladder rankings from regional league statistics.
 *
 * Source data: `nsa_rubber_history` — every rubber a player played in the
 * regional league, with the league level ("1st".."13th") and the position they
 * played in their team (1 = strongest string, 4 = weakest).
 *
 * Idea: a player who regularly plays #1 in the 3rd league is stronger than a
 * player who plays #4 in the 6th league. We convert every rubber into an
 * absolute "string number" (league level x team size + position), weight it by
 * recency, then nudge it by the player's win rate.
 *
 * IMPORTANT (ladder immutability): these helpers only ever PROPOSE an order.
 * Nothing here writes to the database — the admin reviews the suggestion and
 * saves it explicitly.
 */

export interface RubberRow {
  player_code: string | null;
  league_label: string | null;
  position: number | null;
  season_year: number | null;
  won: boolean | null;
}

export interface LeagueStrength {
  /** Lower = stronger. */
  score: number;
  /** Weighted average team position played (1 = number one string). */
  avgPosition: number;
  /** Weighted average league level (1 = 1st league). */
  avgLeague: number;
  rubbers: number;
  winRate: number;
}

/** Players per team in the regional league (positions 1..4). */
const TEAM_SIZE = 4;

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
};

/** "3rd", "3rd League", "League 3", "Third" -> 3. Unknown -> null. */
export function parseLeagueLevel(label: string | null | undefined): number | null {
  if (!label) return null;
  const text = String(label).toLowerCase().trim();
  const digits = text.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  for (const [word, n] of Object.entries(ORDINALS)) {
    if (text.includes(word)) return n;
  }
  return null;
}

/**
 * Recency weight. The most recent season counts fully, each season further
 * back counts half as much, so current form dominates without discarding
 * history.
 */
export function seasonWeight(seasonYear: number | null | undefined, latestYear: number): number {
  if (!seasonYear || !Number.isFinite(seasonYear)) return 0.25;
  const gap = Math.max(0, latestYear - seasonYear);
  return Math.pow(0.5, gap);
}

/**
 * Turn a player's rubber history into a strength score.
 * Returns null when there is nothing usable to learn from.
 */
export function computeLeagueStrength(rows: RubberRow[], latestYear: number): LeagueStrength | null {
  let weight = 0;
  let stringSum = 0;
  let leagueSum = 0;
  let positionSum = 0;
  let winWeight = 0;
  let wins = 0;

  for (const row of rows) {
    const level = parseLeagueLevel(row.league_label);
    const position = row.position;
    if (!level || !position || position < 1) continue;
    const w = seasonWeight(row.season_year, latestYear);
    if (w <= 0) continue;
    weight += w;
    leagueSum += level * w;
    positionSum += position * w;
    stringSum += ((level - 1) * TEAM_SIZE + position) * w;
    if (row.won !== null && row.won !== undefined) {
      winWeight += w;
      if (row.won) wins += w;
    }
  }

  if (weight <= 0) return null;

  const avgString = stringSum / weight;
  const winRate = winWeight > 0 ? wins / winWeight : 0.5;
  // A strong winning record pulls a player up by at most one string, a poor
  // record pushes them down by at most one.
  const formAdjustment = (0.5 - winRate) * 2;

  return {
    score: avgString + formAdjustment,
    avgPosition: positionSum / weight,
    avgLeague: leagueSum / weight,
    rubbers: rows.length,
    winRate,
  };
}

export interface RefinableMember {
  id: string;
  name: string;
}

export interface RefinedEntry<T extends RefinableMember> {
  member: T;
  /** 0-based index before refining. */
  from: number;
  /** 0-based index after refining. */
  to: number;
  strength: LeagueStrength | null;
}

export interface RefineResult<T extends RefinableMember> {
  order: T[];
  entries: RefinedEntry<T>[];
  /** Members that had no usable league history and were left where they were. */
  unchangedWithoutData: number;
  moved: number;
}

/**
 * Rebind a pending proposed order to freshly loaded member rows without losing
 * that order. New members are appended; members no longer present are removed.
 */
export function reconcilePendingOrder<T extends RefinableMember>(
  pending: T[] | null,
  fresh: T[]
): T[] | null {
  if (!pending) return null;
  const freshById = new Map(fresh.map((member) => [member.id, member]));
  const retained = pending
    .map((member) => freshById.get(member.id))
    .filter((member): member is T => Boolean(member));
  const retainedIds = new Set(retained.map((member) => member.id));
  return [...retained, ...fresh.filter((member) => !retainedIds.has(member.id))];
}

/**
 * Re-order only the members that have league history, keeping every member
 * without history in the exact slot they already hold. This keeps the ladder
 * stable for social members while sorting the league players accurately.
 */
export function refineOrderFromLeagueStats<T extends RefinableMember>(
  current: T[],
  strengthByMember: Map<string, LeagueStrength | null>
): RefineResult<T> {
  const slots: number[] = [];
  const ranked: T[] = [];

  current.forEach((member, index) => {
    const strength = strengthByMember.get(member.id);
    if (strength) {
      slots.push(index);
      ranked.push(member);
    }
  });

  ranked.sort((a, b) => {
    const sa = strengthByMember.get(a.id)!;
    const sb = strengthByMember.get(b.id)!;
    if (sa.score !== sb.score) return sa.score - sb.score;
    if (sa.rubbers !== sb.rubbers) return sb.rubbers - sa.rubbers;
    return a.name.localeCompare(b.name);
  });

  const order = [...current];
  slots.forEach((slot, i) => {
    order[slot] = ranked[i];
  });

  const entries: RefinedEntry<T>[] = order.map((member, index) => ({
    member,
    from: current.findIndex((m) => m.id === member.id),
    to: index,
    strength: strengthByMember.get(member.id) ?? null,
  }));

  return {
    order,
    entries,
    unchangedWithoutData: current.length - ranked.length,
    moved: entries.filter((e) => e.from !== e.to).length,
  };
}

/** Human summary such as "avg #2.1 in the 3rd league · 68% won (24 rubbers)". */
export function describeStrength(strength: LeagueStrength | null): string {
  if (!strength) return "No regional league history";
  const league = Math.round(strength.avgLeague * 10) / 10;
  const position = Math.round(strength.avgPosition * 10) / 10;
  const pct = Math.round(strength.winRate * 100);
  return `Usually #${position} in league ${league} · ${pct}% won (${strength.rubbers} rubbers)`;
}
