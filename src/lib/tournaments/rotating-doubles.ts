/**
 * Rotating-partner doubles ("Bells Americano").
 *
 * A social doubles format where players enter INDIVIDUALLY — there are no
 * fixed pairs. Every round re-pairs everybody so that, given enough rounds,
 * each player partners every other player and faces everybody else.
 * Standings are individual: each player banks the points their side scored.
 *
 * Persisted as:
 *   club_champs.match_type   = 'rotating_doubles'
 *   club_champs.scoring_mode = 'time_capped_points'   (Bells)
 *
 * Each side of a generated fixture is an ad-hoc pair encoded as a synthetic
 * entity id (`rot:<p1>|<p2>`) so the existing scheduler — which reasons about
 * "entities" and asks for the players behind one — needs no structural change.
 */

export const ROTATING_DOUBLES_MATCH_TYPE = "rotating_doubles";

const PREFIX = "rot:";

/** Encode an ad-hoc pair as a scheduler entity id. */
export function rotationEntityId(p1: string, p2: string): string {
  return `${PREFIX}${p1}|${p2}`;
}

/** Decode `rot:a|b` back into its two players. Returns null for other ids. */
export function parseRotationEntity(id: string): { player1Id: string; player2Id: string } | null {
  if (!id || !id.startsWith(PREFIX)) return null;
  const [player1Id, player2Id] = id.slice(PREFIX.length).split("|");
  if (!player1Id || !player2Id) return null;
  return { player1Id, player2Id };
}

export function isRotationEntity(id: string): boolean {
  return !!id && id.startsWith(PREFIX);
}

export type RotationGame = {
  /** 1-based round this game belongs to. */
  round: number;
  sideA: [string, string];
  sideB: [string, string];
};

export type RotationSchedule = {
  games: RotationGame[];
  /** Players resting in each round (index 0 = round 1). */
  sittingOut: string[][];
  rounds: number;
};

/**
 * Balanced whist designs: every player partners every other exactly once.
 * Indices are 0-based positions into the player list.
 */
const WHIST: Record<number, number[][][]> = {
  4: [
    [[0, 1, 2, 3]],
    [[0, 2, 1, 3]],
    [[0, 3, 1, 2]],
  ],
  8: [
    [[0, 1, 2, 3], [4, 5, 6, 7]],
    [[0, 2, 4, 6], [1, 3, 5, 7]],
    [[0, 3, 5, 6], [1, 2, 4, 7]],
    [[0, 4, 1, 5], [2, 6, 3, 7]],
    [[0, 5, 3, 4], [1, 6, 2, 7]],
    [[0, 6, 1, 7], [2, 4, 3, 5]],
    [[0, 7, 2, 5], [1, 4, 3, 6]],
  ],
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Build the rotation.
 *
 * `maxRounds` caps the schedule when the session is shorter than a full
 * rotation (the early rounds still spread partners as widely as possible).
 *
 * `maxMatchesPerPlayer` is an INDIVIDUAL participation cap: no player is
 * scheduled for more than that many games. It is not a round count — with
 * an odd number of players some people sit out a round, so rounds and
 * matches-per-player diverge. When set, the schedule is built by the fair
 * capped builder which balances games played, partner variety and opponent
 * variety, and stops as soon as no further legal game can be formed.
 */
export function generateRotatingDoublesSchedule(
  playerIds: string[],
  opts: {
    maxRounds?: number;
    maxMatchesPerPlayer?: number;
    /** Player pairs that must never be drawn as partners (e.g. family members). */
    avoidPartners?: Array<[string, string] | string[]>;
    /**
     * How strength is used when the per-player cap means not every partner
     * combination can be played. `playerIds` is assumed to be in seeded order
     * (strongest first).
     *   "mixed"    — a stronger player partners a weaker one; weak+weak
     *                combinations are the ones left out (default when capped).
     *   "balanced" — partners of a similar standard play together.
     *   "any"      — ignore strength entirely.
     */
    strengthMode?: "any" | "mixed" | "balanced";
    /** Deprecated alias for strengthMode: true = "mixed", false = "any". */
    preferStrongPartnerships?: boolean;
    /**
     * Games already PLAYED (a live rebuild). They count toward each active
     * player's match target and repeat-avoidance; only the remaining games are
     * returned. Players in history who are no longer active are ignored.
     */
    history?: Array<{ sideA: string[]; sideB: string[] }>;
  } = {},
): RotationSchedule {
  const players = playerIds.filter(Boolean);
  if (players.length < 4) return { games: [], sittingOut: [], rounds: 0 };

  const perPlayerCap =
    opts.maxMatchesPerPlayer && opts.maxMatchesPerPlayer > 0
      ? Math.floor(opts.maxMatchesPerPlayer)
      : 0;

  const avoid = new Set<string>();
  for (const pair of opts.avoidPartners || []) {
    if (pair && pair[0] && pair[1]) avoid.add(pairKey(pair[0], pair[1]));
  }
  // Strength only matters once combinations have to be left out.
  const strengthMode: "any" | "mixed" | "balanced" =
    opts.strengthMode ??
    (opts.preferStrongPartnerships === false
      ? "any"
      : opts.preferStrongPartnerships || perPlayerCap > 0
        ? "mixed"
        : "any");

  const history = (opts.history || []).filter((g) => g && g.sideA && g.sideB);
  const table = perPlayerCap || avoid.size || strengthMode !== "any" || history.length ? null : WHIST[players.length];
  const built = table
    ? fromWhist(players, table)
    : greedyRotation(players, perPlayerCap || undefined, { avoid, strengthMode, history });

  const cap = opts.maxRounds && opts.maxRounds > 0 ? opts.maxRounds : built.rounds;
  if (cap >= built.rounds) return built;
  return {
    games: built.games.filter((g) => g.round <= cap),
    sittingOut: built.sittingOut.slice(0, cap),
    rounds: cap,
  };
}



function fromWhist(players: string[], table: number[][][]): RotationSchedule {
  const games: RotationGame[] = [];
  table.forEach((round, ri) => {
    for (const [a1, a2, b1, b2] of round) {
      games.push({
        round: ri + 1,
        sideA: [players[a1], players[a2]],
        sideB: [players[b1], players[b2]],
      });
    }
  });
  return { games, sittingOut: table.map(() => []), rounds: table.length };
}

/**
 * Generic fallback for player counts without a known design (5, 6, 7, 9…),
 * and the builder used whenever an individual match cap applies.
 *
 * Greedily builds each round from the players who have played least (and
 * rested longest) and picks the quadruple/split that repeats the fewest
 * partnerships and opponent meetings.
 *
 * When `perPlayerCap` is set, a player is simply no longer eligible once they
 * have played that many games; the schedule ends as soon as fewer than four
 * eligible players remain.
 */
function greedyRotation(
  players: string[],
  perPlayerCap?: number,
  bias: {
    avoid?: Set<string>;
    strengthMode?: "any" | "mixed" | "balanced";
    history?: Array<{ sideA: string[]; sideB: string[] }>;
  } = {},
): RotationSchedule {
  const n = players.length;
  const courts = Math.floor(n / 4);
  const targetPartnerships = (n * (n - 1)) / 2;
  const partnered = new Set<string>();
  const opposed = new Map<string, number>();
  const playedCount = new Map<string, number>(players.map((p) => [p, 0]));
  const restedSince = new Map<string, number>(players.map((p) => [p, 0]));
  const avoid = bias.avoid ?? new Set<string>();
  // Prime counters with games already played (live rebuild). Only ACTIVE
  // players are counted — a withdrawn player's history never shapes the draw.
  const active = new Set(players);
  for (const g of bias.history || []) {
    const [a1, a2] = g.sideA;
    const [b1, b2] = g.sideB;
    if (a1 && a2 && active.has(a1) && active.has(a2)) partnered.add(pairKey(a1, a2));
    if (b1 && b2 && active.has(b1) && active.has(b2)) partnered.add(pairKey(b1, b2));
    for (const x of [a1, a2]) for (const y of [b1, b2]) {
      if (x && y && active.has(x) && active.has(y)) opposed.set(pairKey(x, y), (opposed.get(pairKey(x, y)) || 0) + 1);
    }
    for (const p of [a1, a2, b1, b2]) if (p && active.has(p)) playedCount.set(p, (playedCount.get(p) || 0) + 1);
  }
  // Seeded order: index 0 is the strongest. 0 = strongest, 1 = weakest.
  const weakness = new Map<string, number>(
    players.map((p, i) => [p, n > 1 ? i / (n - 1) : 0]),
  );
  // "mixed": squared so a weak+weak partnership costs far more than a
  // strong+weak one — when combinations must be left out, the weakest ones go
  // first. "balanced": penalise the gap so similar standards play together.
  const partnerQuality = (a: string, b: string) => {
    const mode = bias.strengthMode || "any";
    if (mode === "any") return 0;
    const wa = weakness.get(a) || 0;
    const wb = weakness.get(b) || 0;
    if (mode === "balanced") return Math.abs(wa - wb) * Math.abs(wa - wb) * 6;
    const w = wa + wb;
    return w * w * 3;
  };

  const games: RotationGame[] = [];
  const sittingOut: string[][] = [];
  const capped = !!perPlayerCap && perPlayerCap > 0;
  const eligible = (p: string) => !capped || (playedCount.get(p) || 0) < perPlayerCap!;
  // Enough rounds for everyone to partner everyone; hard-capped so a pathological
  // count can never spin. With an individual cap the total games are bounded by
  // players × cap / 4, so allow enough rounds to reach it.
  const maxRounds = capped
    ? Math.min(200, Math.ceil((n * perPlayerCap!) / 4) + n)
    : Math.min(60, Math.ceil((targetPartnerships / (2 * Math.max(1, courts))) * 2) + n);

  for (let round = 1; round <= maxRounds; round++) {
    if (!capped && partnered.size >= targetPartnerships) break;

    const available = players.filter(eligible);
    if (available.length < 4) break;
    const roundCourts = capped ? Math.min(courts || 1, Math.floor(available.length / 4)) : courts;
    if (roundCourts < 1) break;

    const pool = [...available].sort(
      (a, b) =>
        (playedCount.get(a)! - playedCount.get(b)!) ||
        (restedSince.get(b)! - restedSince.get(a)!) ||
        a.localeCompare(b),
    );
    const playing = pool.slice(0, roundCourts * 4);
    const resting = players.filter((p) => !playing.includes(p));
    sittingOut.push(resting);
    for (const p of resting) restedSince.set(p, (restedSince.get(p) || 0) + 1);

    // Build each court's foursome from the players who have played least,
    // choosing companions that repeat the fewest partnerships/meetings. Simply
    // slicing the sorted pool into consecutive fours would lock the same four
    // people together round after round (so the same pairs keep recurring).
    const unassigned = [...playing];
    const meetCost = (a: string, b: string) =>
      (partnered.has(pairKey(a, b)) ? 6 : 0) +
      (opposed.get(pairKey(a, b)) || 0) +
      // Keep an excluded couple apart where possible; if they do land on the
      // same court the split below always puts them on opposite sides.
      (avoid.has(pairKey(a, b)) ? 4 : 0) +
      partnerQuality(a, b) * 0.5;

    for (let c = 0; c < roundCourts; c++) {
      if (unassigned.length < 4) break;
      const anchor = unassigned.shift()!;
      const quad = [anchor];
      while (quad.length < 4) {
        let bestIdx = 0;
        let bestCost = Number.MAX_SAFE_INTEGER;
        unassigned.forEach((cand, i) => {
          let cost = quad.reduce((sum, q) => sum + meetCost(q, cand), 0);
          // keep games-played balanced within the round
          cost += (playedCount.get(cand) || 0) * 0.01;
          if (cost < bestCost) {
            bestCost = cost;
            bestIdx = i;
          }
        });
        quad.push(unassigned.splice(bestIdx, 1)[0]);
      }
      const splits: Array<[number, number, number, number]> = [
        [0, 1, 2, 3],
        [0, 2, 1, 3],
        [0, 3, 1, 2],
      ];
      let best = splits[0];
      let bestCost = Number.MAX_SAFE_INTEGER;
      for (const s of splits) {
        const [a1, a2, b1, b2] = s.map((i) => quad[i]);
        let cost = 0;
        if (partnered.has(pairKey(a1, a2))) cost += 10;
        if (partnered.has(pairKey(b1, b2))) cost += 10;
        // Never partner an excluded couple — they play as opponents instead.
        if (avoid.has(pairKey(a1, a2))) cost += 1000;
        if (avoid.has(pairKey(b1, b2))) cost += 1000;
        cost += partnerQuality(a1, a2) + partnerQuality(b1, b2);
        for (const x of [a1, a2]) {
          for (const y of [b1, b2]) cost += opposed.get(pairKey(x, y)) || 0;
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = s;
        }
      }
      const [a1, a2, b1, b2] = best.map((i) => quad[i]);
      partnered.add(pairKey(a1, a2));
      partnered.add(pairKey(b1, b2));
      for (const x of [a1, a2]) {
        for (const y of [b1, b2]) {
          const k = pairKey(x, y);
          opposed.set(k, (opposed.get(k) || 0) + 1);
        }
      }
      for (const p of [a1, a2, b1, b2]) {
        playedCount.set(p, (playedCount.get(p) || 0) + 1);
        restedSince.set(p, 0);
      }
      games.push({ round, sideA: [a1, a2], sideB: [b1, b2] });
    }

  }

  // The saved number is a HARD MAXIMUM per player. When players × max is not a
  // multiple of four, top up short players only with others who are also below
  // the max, so nobody ever exceeds it (a few may finish one game short).
  if (capped && n >= 4) {
    for (let guard = 0; guard < n; guard++) {
      const short = players
        .filter((p) => (playedCount.get(p) || 0) < perPlayerCap!)
        .sort((a, b) => playedCount.get(a)! - playedCount.get(b)!);
      if (short.length === 0) break;
      const quad = short.slice(0, 4);
      const fillers = players
        .filter((p) => !quad.includes(p) && (playedCount.get(p) || 0) < perPlayerCap!)
        .sort((a, b) =>
          (playedCount.get(a)! - playedCount.get(b)!) ||
          quad.reduce((s2, q) => s2 + (partnered.has(pairKey(q, a)) ? 1 : 0), 0) -
            quad.reduce((s2, q) => s2 + (partnered.has(pairKey(q, b)) ? 1 : 0), 0),
        );
      while (quad.length < 4 && fillers.length) quad.push(fillers.shift()!);
      if (quad.length < 4) break;
      const splits: Array<[number, number, number, number]> = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
      let best = splits[0];
      let bestCost = Number.MAX_SAFE_INTEGER;
      for (const sp of splits) {
        const [a1, a2, b1, b2] = sp.map((i) => quad[i]);
        let cost = (partnered.has(pairKey(a1, a2)) ? 10 : 0) + (partnered.has(pairKey(b1, b2)) ? 10 : 0);
        if (avoid.has(pairKey(a1, a2))) cost += 1000;
        if (avoid.has(pairKey(b1, b2))) cost += 1000;
        if (cost < bestCost) { bestCost = cost; best = sp; }
      }
      const [a1, a2, b1, b2] = best.map((i) => quad[i]);
      partnered.add(pairKey(a1, a2));
      partnered.add(pairKey(b1, b2));
      for (const p of [a1, a2, b1, b2]) playedCount.set(p, (playedCount.get(p) || 0) + 1);
      const round = sittingOut.length + 1;
      sittingOut.push(players.filter((p) => ![a1, a2, b1, b2].includes(p)));
      games.push({ round, sideA: [a1, a2], sideB: [b1, b2] });
    }
  }

  return { games, sittingOut, rounds: sittingOut.length };
}


/** Games produced by a full rotation — used for capacity/time estimates. */
export function rotatingDoublesGameCount(playerCount: number): number {
  if (playerCount < 4) return 0;
  const table = WHIST[playerCount];
  if (table) return table.reduce((n, r) => n + r.length, 0);
  return generateRotatingDoublesSchedule(
    Array.from({ length: playerCount }, (_, i) => `p${i}`),
  ).games.length;
}
