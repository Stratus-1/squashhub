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
  opts: { maxRounds?: number; maxMatchesPerPlayer?: number } = {},
): RotationSchedule {
  const players = playerIds.filter(Boolean);
  if (players.length < 4) return { games: [], sittingOut: [], rounds: 0 };

  const perPlayerCap =
    opts.maxMatchesPerPlayer && opts.maxMatchesPerPlayer > 0
      ? Math.floor(opts.maxMatchesPerPlayer)
      : 0;

  const table = perPlayerCap ? null : WHIST[players.length];
  const built = table
    ? fromWhist(players, table)
    : greedyRotation(players, perPlayerCap || undefined);

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
function greedyRotation(players: string[], perPlayerCap?: number): RotationSchedule {
  const n = players.length;
  const courts = Math.floor(n / 4);
  const targetPartnerships = (n * (n - 1)) / 2;
  const partnered = new Set<string>();
  const opposed = new Map<string, number>();
  const playedCount = new Map<string, number>(players.map((p) => [p, 0]));
  const restedSince = new Map<string, number>(players.map((p) => [p, 0]));

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

    for (let c = 0; c < roundCourts; c++) {
      const quad = playing.slice(c * 4, c * 4 + 4);
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
