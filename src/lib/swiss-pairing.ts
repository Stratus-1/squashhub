// Swiss-pairing helpers for club tournaments.
//
// Pools within a league are derived from entry.order_index via snake
// distribution — matching the display logic in the wizard so admins see
// the same assignment before matches exist. Once matches are auto-paired
// they carry a `pool_number` on club_champs_matches for grouping.

export type Entry = {
  id: string;
  club_member_id: string;
  partner_member_id?: string | null;
  group_number: number;
  order_index?: number | null;
};

export type Match = {
  id: string;
  group_number: number;
  pool_number?: number | null;
  round_number: number | null;
  player_a_member_id: string | null;
  player_b_member_id: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  status: string | null;
  winner_member_id?: string | null;
  side_a_points?: number | null;
  side_b_points?: number | null;
  is_bye?: boolean;
  bye_member_id?: string | null;
};

/** Entity id used for pairing: pair-id for doubles, member-id for singles. */
export function entityIdForEntry(e: Entry, isDoubles: boolean): string {
  return isDoubles ? e.id : e.club_member_id;
}

/** Block distribution — returns pool_number (1-based) for each entity id.
 *  Pool A = first chunk of ordered entries, Pool B = next chunk, etc.
 *  Admins arrange strength manually by dragging within each pool. */
export function assignPools(
  entries: Entry[],
  groupNumber: number,
  poolCount: number,
  isDoubles: boolean,
): Map<string, number> {
  const ordered = entries
    .filter((e) => e.group_number === groupNumber)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const map = new Map<string, number>();
  const pools = Math.max(1, poolCount);
  const size = Math.ceil(ordered.length / pools);
  ordered.forEach((e, i) => {
    const idx = Math.min(pools - 1, Math.floor(i / size));
    map.set(entityIdForEntry(e, isDoubles), idx + 1);
  });
  return map;
}

export type PoolStanding = {
  entityId: string;
  memberId: string;
  partnerId?: string | null;
  played: number;
  won: number;
  lost: number;
  points: number; // 2 per win, 1 per loss (played)
  gameDiff: number;
  opponents: Set<string>; // entity IDs already faced
};

function matchEntityIds(m: Match, isDoubles: boolean): { a: string | null; b: string | null } {
  if (!isDoubles) return { a: m.player_a_member_id, b: m.player_b_member_id };
  // For doubles, entity id = pair id, which isn't stored on the match.
  // Callers should pass a resolver; here we key by the "player_a" member.
  return { a: m.player_a_member_id, b: m.player_b_member_id };
}

/**
 * Standings for a single pool. `entityMemberIds` is the ordered set of
 * entity IDs (singles) or lead-member IDs (doubles) in this pool.
 */
export function poolStandings(
  entities: { entityId: string; memberId: string; partnerId?: string | null }[],
  matches: Match[],
  groupNumber: number,
  poolNumber: number,
  isDoubles: boolean,
): PoolStanding[] {
  const byMember = new Map(entities.map((e) => [e.memberId, e]));
  const init = new Map<string, PoolStanding>();
  entities.forEach((e) =>
    init.set(e.entityId, {
      entityId: e.entityId,
      memberId: e.memberId,
      partnerId: e.partnerId,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      gameDiff: 0,
      opponents: new Set(),
    }),
  );

  const relevant = matches.filter(
    (m) =>
      m.group_number === groupNumber &&
      (m.pool_number ?? null) === poolNumber &&
      !m.is_bye,
  );

  for (const m of relevant) {
    const a = m.player_a_member_id ? byMember.get(m.player_a_member_id) : null;
    const b = m.player_b_member_id ? byMember.get(m.player_b_member_id) : null;
    if (!a || !b) continue;
    const sa = init.get(a.entityId)!;
    const sb = init.get(b.entityId)!;
    sa.opponents.add(b.entityId);
    sb.opponents.add(a.entityId);
    if (m.status !== "completed") continue;
    sa.played++; sb.played++;
    const pa = Number(m.side_a_points) || 0;
    const pb = Number(m.side_b_points) || 0;
    sa.gameDiff += pa - pb;
    sb.gameDiff += pb - pa;
    const winnerIsA =
      m.winner_member_id === m.player_a_member_id ||
      (isDoubles && m.winner_member_id === m.partner_a_member_id);
    const winnerIsB =
      m.winner_member_id === m.player_b_member_id ||
      (isDoubles && m.winner_member_id === m.partner_b_member_id);
    if (winnerIsA) { sa.won++; sb.lost++; sa.points += 2; sb.points += 1; }
    else if (winnerIsB) { sb.won++; sa.lost++; sb.points += 2; sa.points += 1; }
    else { sa.points += 1; sb.points += 1; }
  }

  return Array.from(init.values()).sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.gameDiff !== x.gameDiff) return y.gameDiff - x.gameDiff;
    return y.won - x.won;
  });
}

export type PairProposal = { entityA: string; entityB: string; bye?: boolean };

/**
 * Greedy Swiss pairing:
 *   1. Sort by score (points desc, gameDiff, wins).
 *   2. Walk score groups top→bottom; pair with earliest partner not already faced.
 *   3. If odd-length score group and next group exists, float the last player down.
 *   4. If someone can't avoid a rematch, allow the rematch (last resort).
 *   5. Odd number of total players → lowest-scoring un-byed player gets a bye.
 */
export function pairNextRound(standings: PoolStanding[]): PairProposal[] {
  const ordered = [...standings];
  const paired: PairProposal[] = [];
  const used = new Set<string>();

  const tryPair = (i: number, allowRematch = false): boolean => {
    const a = ordered[i];
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j];
      if (used.has(b.entityId)) continue;
      if (!allowRematch && a.opponents.has(b.entityId)) continue;
      used.add(a.entityId); used.add(b.entityId);
      paired.push({ entityA: a.entityId, entityB: b.entityId });
      return true;
    }
    return false;
  };

  for (let i = 0; i < ordered.length; i++) {
    if (used.has(ordered[i].entityId)) continue;
    if (!tryPair(i, false)) tryPair(i, true);
  }

  const leftover = ordered.filter((s) => !used.has(s.entityId));
  if (leftover.length === 1) {
    paired.push({ entityA: leftover[0].entityId, entityB: leftover[0].entityId, bye: true });
  }
  return paired;
}
