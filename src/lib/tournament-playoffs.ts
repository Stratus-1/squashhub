// Playoff bracket builder for Club Champs when `enable_playoffs` is on.
//
// Two modes, mirroring the tooltip in ClubChampsTab ("matching positions play
// off (e.g. #1 vs #1, #2 vs #2). With 4+ groups, semi-finals and a final are
// added."):
//
//   • Single-league tournament  → in-league knockout of the top N finishers
//     (top 2 → Final; top 4 → SF + F + 3rd; top 8 → QF/SF/F/3rd).
//   • Multi-league tournament   → per-position playoff: for each finishing
//     position P from 1 to min-league-size, the league-#P finishers meet in
//     a knockout bracket (K=2 → Final; K=3 → L1 bye + SF + F; K≥4 → seeded
//     SF/QF bracket with Final and 3rd place).
//
// The builder is pure — it takes standings and returns match rows ready to
// insert. Rows for later rounds where the players aren't known yet leave
// player IDs null (that's why the migration made them nullable) and are
// filled in by a follow-up run once the previous round completes.

export type StandingEntity = {
  memberId: string;
  partnerId?: string | null;
  rank: number; // 1-based finish position within their league
};

export type PlayoffMatchRow = {
  champ_id: string;
  group_number: number;
  round_number: number;
  stage: string;
  stage_label: string;
  bracket_position: number | null;
  player_a_member_id: string | null;
  partner_a_member_id: string | null;
  player_b_member_id: string | null;
  partner_b_member_id: string | null;
  placeholder_a?: string | null;
  placeholder_b?: string | null;
  status: "scheduled";
  is_bye: false;
};

const emptyRow = (
  champId: string,
  groupNumber: number,
  round: number,
  stage: string,
  label: string,
  bracketPosition: number | null,
): PlayoffMatchRow => ({
  champ_id: champId,
  group_number: groupNumber,
  round_number: round,
  stage,
  stage_label: label,
  bracket_position: bracketPosition,
  player_a_member_id: null,
  partner_a_member_id: null,
  player_b_member_id: null,
  partner_b_member_id: null,
  status: "scheduled",
  is_bye: false,
});

const setSide = (
  row: PlayoffMatchRow,
  side: "a" | "b",
  ent: StandingEntity | null | undefined,
  isDoubles: boolean,
) => {
  if (!ent) return;
  if (side === "a") {
    row.player_a_member_id = ent.memberId;
    row.partner_a_member_id = isDoubles ? ent.partnerId ?? null : null;
  } else {
    row.player_b_member_id = ent.memberId;
    row.partner_b_member_id = isDoubles ? ent.partnerId ?? null : null;
  }
};

/**
 * Given finishers seeded 1..K (K ≥ 2), return the bracket pairings for the
 * FIRST knockout round only. Callers append Final / 3rd-place placeholders
 * separately (players unknown at generation time).
 */
function firstRoundPairs(seeded: StandingEntity[]): Array<[StandingEntity, StandingEntity]> {
  const K = seeded.length;
  if (K < 2) return [];
  // Nearest power of 2 ≥ K, capped at 8 to keep it sensible.
  const size = K <= 2 ? 2 : K <= 4 ? 4 : 8;
  // Standard seed order for a bracket of `size`: 1, size, 2, size-1, ...
  const seedOrder: number[] = [];
  for (let i = 1; i <= size / 2; i++) {
    seedOrder.push(i);
    seedOrder.push(size - i + 1);
  }
  const bySeed = new Map<number, StandingEntity>();
  seeded.forEach((s, i) => bySeed.set(i + 1, s));
  const pairs: Array<[StandingEntity, StandingEntity]> = [];
  for (let i = 0; i < seedOrder.length; i += 2) {
    const a = bySeed.get(seedOrder[i]);
    const b = bySeed.get(seedOrder[i + 1]);
    if (a && b) pairs.push([a, b]); // both present → real match
    // if only one is present, that seed gets a bye — we simply skip the row
  }
  return pairs;
}

/** How many playoff matches will be generated end-to-end for a K-way bracket. */
export function playoffMatchesForBracket(K: number): number {
  if (K < 2) return 0;
  if (K === 2) return 1;                // Final only
  if (K === 3) return 3;                // SF + F + 3rd (SF has 1 bye)
  if (K <= 4) return 4;                 // 2×SF + F + 3rd
  return 8;                             // 4×QF + 2×SF + F + 3rd (cap at 8)
}

export type BuildInput = {
  champId: string;
  isDoubles: boolean;
  standingsByLeague: Map<number, StandingEntity[]>; // league# → seeded entities (rank 1 first)
  numLeagues: number;
  // Optional Swiss pool mode. When any league has >1 pool, playoffs run
  // intra-league across pools (Pool A #P vs Pool B #P) instead of
  // cross-league. If present and any pool count > 1, this overrides the
  // standard mode. Standings must be provided per pool.
  poolsByLeague?: Record<number, number>;
  standingsByLeaguePool?: Map<number, Map<number, StandingEntity[]>>;
  leagueLabels?: string[]; // 1-indexed labels for leagues in pool-mode output
};

// Encode league scope onto bracket_position so downstream feed logic
// (winnerOf/loserOf) can match SFs → Finals per league × position.
const POOL_BRACKET_STRIDE = 1000;
const poolBracketPos = (leagueNum: number, pos: number) =>
  leagueNum * POOL_BRACKET_STRIDE + pos;

const hasPoolMode = (poolsByLeague?: Record<number, number>): boolean =>
  !!poolsByLeague && Object.values(poolsByLeague).some((n) => (n || 0) > 1);

const poolLetter = (p: number) => String.fromCharCode(64 + p); // 1→A, 2→B

/**
 * Build ALL playoff match rows for the tournament. Later-round rows have
 * null players (Final / 3rd-place placeholders). Regenerating after the SFs
 * finish and passing the resolved winners in `standingsByLeague` isn't
 * needed — the caller instead patches those specific rows with winner IDs.
 */
export function buildPlayoffMatches(input: BuildInput): PlayoffMatchRow[] {
  const { champId, isDoubles, standingsByLeague, numLeagues } = input;
  const rows: PlayoffMatchRow[] = [];

  // ── Single-league mode → in-league knockout of the top finishers ──────
  if (numLeagues <= 1) {
    const league = standingsByLeague.get(1) ?? [];
    if (league.length < 2) return rows;
    const K = league.length >= 8 ? 8 : league.length >= 4 ? 4 : 2;
    const seeded = league.slice(0, K);
    const pairs = firstRoundPairs(seeded);

    const firstRoundStage = K === 8 ? "playoff_qf" : K === 4 ? "playoff_sf" : "playoff_final";
    const firstRoundLabel = K === 8 ? "Quarter-final" : K === 4 ? "Semi-final" : "Final";
    pairs.forEach(([a, b], i) => {
      const r = emptyRow(champId, 1, K === 2 ? 1 : 1, firstRoundStage, firstRoundLabel, null);
      setSide(r, "a", a, isDoubles);
      setSide(r, "b", b, isDoubles);
      rows.push(r);
    });

    if (K >= 4) {
      // Semi-final round exists only when K = 8
      if (K === 8) {
        for (let i = 0; i < 2; i++) rows.push(emptyRow(champId, 1, 2, "playoff_sf", "Semi-final", null));
      }
      // Final + 3rd place
      rows.push(emptyRow(champId, 1, K === 8 ? 3 : 2, "playoff_final", "Final", null));
      rows.push(emptyRow(champId, 1, K === 8 ? 3 : 2, "playoff_3rd", "3rd Place Play-off", null));
    }
    return rows;
  }

  // ── Multi-league mode → per-position playoff ─────────────────────────
  const minSize = Math.min(
    ...Array.from(standingsByLeague.values()).map((v) => v.length),
  );
  if (!Number.isFinite(minSize) || minSize < 1) return rows;

  for (let pos = 1; pos <= minSize; pos++) {
    const seeded: StandingEntity[] = [];
    for (let lg = 1; lg <= numLeagues; lg++) {
      const league = standingsByLeague.get(lg) ?? [];
      const finisher = league[pos - 1];
      if (finisher) seeded.push(finisher);
    }
    const K = seeded.length;
    if (K < 2) continue;

    const pairs = firstRoundPairs(seeded);
    // Determine stage naming based on bracket size
    const size = K <= 2 ? 2 : K <= 4 ? 4 : 8;
    const firstRoundStage =
      size === 8 ? "playoff_qf" : size === 4 ? "playoff_sf" : "playoff_final";
    const firstRoundLabel =
      size === 8
        ? `Position ${pos} · Quarter-final`
        : size === 4
        ? `Position ${pos} · Semi-final`
        : `Position ${pos} · Final`;

    pairs.forEach(([a, b]) => {
      const r = emptyRow(champId, 1, 1, firstRoundStage, firstRoundLabel, pos);
      setSide(r, "a", a, isDoubles);
      setSide(r, "b", b, isDoubles);
      rows.push(r);
    });

    if (size === 8) {
      for (let i = 0; i < 2; i++) {
        rows.push(emptyRow(champId, 1, 2, "playoff_sf", `Position ${pos} · Semi-final`, pos));
      }
    }
    if (size >= 4) {
      const finalRound = size === 8 ? 3 : 2;
      rows.push(emptyRow(champId, 1, finalRound, "playoff_final", `Position ${pos} · Final`, pos));
      rows.push(emptyRow(champId, 1, finalRound, "playoff_3rd", `Position ${pos} · 3rd Place`, pos));
    }
    // K == 2 case: the "Final" row is already the one we inserted above.
  }
  return rows;
}

// ─── Placeholder builder ────────────────────────────────────────────────────
// Emits the SAME set of rows `buildPlayoffMatches` would produce for a given
// tournament shape, but with player IDs left null and human-readable
// `placeholder_a` / `placeholder_b` labels ("Winner Pool A", "Winner SF1", …).
// Used at fixture-generation time to reserve court slots for the play-offs.

export type PlaceholderInput = {
  champId: string;
  numLeagues: number;
  entriesPerLeague: number[]; // 1-indexed by league (element 0 = league 1)
  leagueLabels?: string[];    // optional per-league display labels (Pool A, League 1, …)
};

const bracketSizeFor = (K: number): 2 | 4 | 8 =>
  (K <= 2 ? 2 : K <= 4 ? 4 : 8);

// Seed order for a bracket of `size`: 1, size, 2, size-1, … (matches
// firstRoundPairs) so placeholder text ("Seed 1 vs Seed 4", etc.) lines up
// with the real bracket once players are resolved.
function seededPairs(size: 2 | 4 | 8): Array<[number, number]> {
  const order: number[] = [];
  for (let i = 1; i <= size / 2; i++) {
    order.push(i);
    order.push(size - i + 1);
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

const placeholderRow = (
  champId: string,
  round: number,
  stage: string,
  label: string,
  bracketPosition: number | null,
  placeholderA: string,
  placeholderB: string,
): PlayoffMatchRow => ({
  champ_id: champId,
  group_number: 1,
  round_number: round,
  stage,
  stage_label: label,
  bracket_position: bracketPosition,
  player_a_member_id: null,
  partner_a_member_id: null,
  player_b_member_id: null,
  partner_b_member_id: null,
  placeholder_a: placeholderA,
  placeholder_b: placeholderB,
  status: "scheduled",
  is_bye: false,
});

/**
 * How many playoff placeholder rows the tournament will need given its shape.
 * Mirrors buildPlayoffPlaceholders exactly — use it to size court reservations.
 */
export function countPlayoffPlaceholders(input: Omit<PlaceholderInput, "champId">): number {
  const { numLeagues, entriesPerLeague } = input;
  if (numLeagues <= 1) {
    const K = entriesPerLeague[0] ?? 0;
    if (K < 2) return 0;
    const cap = K >= 8 ? 8 : K >= 4 ? 4 : 2;
    return playoffMatchesForBracket(cap);
  }
  const minSize = Math.min(...entriesPerLeague.filter((n) => n > 0));
  if (!Number.isFinite(minSize) || minSize < 1) return 0;
  const size = bracketSizeFor(numLeagues);
  return minSize * playoffMatchesForBracket(size);
}

export function buildPlayoffPlaceholders(input: PlaceholderInput): PlayoffMatchRow[] {
  const { champId, numLeagues, entriesPerLeague, leagueLabels } = input;
  const rows: PlayoffMatchRow[] = [];
  const labelFor = (lg: number) => leagueLabels?.[lg - 1] || `League ${lg}`;

  // ── Single-league mode: knockout of top finishers ───────────────────────
  if (numLeagues <= 1) {
    const K = entriesPerLeague[0] ?? 0;
    if (K < 2) return rows;
    const size = K >= 8 ? 8 : K >= 4 ? 4 : 2;
    const lg = labelFor(1);

    if (size === 2) {
      rows.push(placeholderRow(champId, 1, "playoff_final", "Final", null,
        `Winner ${lg}`, `Runner-up ${lg}`));
      return rows;
    }

    if (size === 4) {
      const pairs = seededPairs(4); // [[1,4],[2,3]]
      pairs.forEach(([a, b], i) => {
        rows.push(placeholderRow(champId, 1, "playoff_sf", `Semi-final ${i + 1}`,
          null, `${lg} Seed ${a}`, `${lg} Seed ${b}`));
      });
      rows.push(placeholderRow(champId, 2, "playoff_final", "Final", null,
        "Winner SF1", "Winner SF2"));
      rows.push(placeholderRow(champId, 2, "playoff_3rd", "3rd Place Play-off", null,
        "Loser SF1", "Loser SF2"));
      return rows;
    }

    // size === 8
    const qfPairs = seededPairs(8); // [[1,8],[4,5],[2,7],[3,6]]
    qfPairs.forEach(([a, b], i) => {
      rows.push(placeholderRow(champId, 1, "playoff_qf", `Quarter-final ${i + 1}`,
        null, `${lg} Seed ${a}`, `${lg} Seed ${b}`));
    });
    rows.push(placeholderRow(champId, 2, "playoff_sf", "Semi-final 1", null,
      "Winner QF1", "Winner QF2"));
    rows.push(placeholderRow(champId, 2, "playoff_sf", "Semi-final 2", null,
      "Winner QF3", "Winner QF4"));
    rows.push(placeholderRow(champId, 3, "playoff_final", "Final", null,
      "Winner SF1", "Winner SF2"));
    rows.push(placeholderRow(champId, 3, "playoff_3rd", "3rd Place Play-off", null,
      "Loser SF1", "Loser SF2"));
    return rows;
  }

  // ── Multi-league mode: per-position playoff ─────────────────────────────
  const validSizes = entriesPerLeague.filter((n) => n > 0);
  if (validSizes.length === 0) return rows;
  const minSize = Math.min(...validSizes);
  if (!Number.isFinite(minSize) || minSize < 1) return rows;

  const size = bracketSizeFor(numLeagues);

  for (let pos = 1; pos <= minSize; pos++) {
    const posLabel = `Pos ${pos}`;

    if (size === 2) {
      // Two leagues: single Final per position
      rows.push(placeholderRow(champId, 1, "playoff_final", `${posLabel} · Final`,
        pos, `${labelFor(1)} #${pos}`, `${labelFor(2)} #${pos}`));
      continue;
    }

    if (size === 4) {
      const pairs = seededPairs(4); // [[1,4],[2,3]]
      pairs.forEach(([a, b], i) => {
        // seed a & b are league indices when numLeagues ≥ size
        const lgA = a <= numLeagues ? labelFor(a) : `Seed ${a}`;
        const lgB = b <= numLeagues ? labelFor(b) : `Seed ${b}`;
        rows.push(placeholderRow(champId, 1, "playoff_sf",
          `${posLabel} · Semi-final ${i + 1}`, pos,
          `${lgA} #${pos}`, `${lgB} #${pos}`));
      });
      rows.push(placeholderRow(champId, 2, "playoff_final", `${posLabel} · Final`,
        pos, `Winner ${posLabel} SF1`, `Winner ${posLabel} SF2`));
      rows.push(placeholderRow(champId, 2, "playoff_3rd", `${posLabel} · 3rd Place`,
        pos, `Loser ${posLabel} SF1`, `Loser ${posLabel} SF2`));
      continue;
    }

    // size === 8
    const qfPairs = seededPairs(8);
    qfPairs.forEach(([a, b], i) => {
      const lgA = a <= numLeagues ? labelFor(a) : `Seed ${a}`;
      const lgB = b <= numLeagues ? labelFor(b) : `Seed ${b}`;
      rows.push(placeholderRow(champId, 1, "playoff_qf",
        `${posLabel} · Quarter-final ${i + 1}`, pos,
        `${lgA} #${pos}`, `${lgB} #${pos}`));
    });
    rows.push(placeholderRow(champId, 2, "playoff_sf", `${posLabel} · Semi-final 1`,
      pos, `Winner ${posLabel} QF1`, `Winner ${posLabel} QF2`));
    rows.push(placeholderRow(champId, 2, "playoff_sf", `${posLabel} · Semi-final 2`,
      pos, `Winner ${posLabel} QF3`, `Winner ${posLabel} QF4`));
    rows.push(placeholderRow(champId, 3, "playoff_final", `${posLabel} · Final`,
      pos, `Winner ${posLabel} SF1`, `Winner ${posLabel} SF2`));
    rows.push(placeholderRow(champId, 3, "playoff_3rd", `${posLabel} · 3rd Place`,
      pos, `Loser ${posLabel} SF1`, `Loser ${posLabel} SF2`));
  }

  return rows;
}
