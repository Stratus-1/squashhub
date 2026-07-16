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
};

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
