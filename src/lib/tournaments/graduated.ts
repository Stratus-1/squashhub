/**
 * Graduated ("fair entry") knockout.
 *
 * A STRAIGHT knockout pairs the seeded bracket immediately: #1 v the weakest
 * entrant, #2 v the next weakest and so on. It is quick, but the opening round
 * is full of mismatches and every entrant plays in round 1.
 *
 * A GRADUATED knockout staggers entry instead:
 *
 *   • only the WEAKEST slice of the field plays the opening round, and they are
 *     paired against their nearest-ranked neighbour, so the play-in matches are
 *     the most even matches in the draw;
 *   • everyone above that slice sits out with a bye and enters later;
 *   • each round only admits as many extra (stronger) players as the bracket
 *     needs, so the field narrows towards a clean power-of-two bracket.
 *
 * Result: fewer, closer matches per round, more rounds, and the top seeds meet
 * real opposition only once the weaker half has been sifted — which is exactly
 * how the Nelspruit organiser built round 1 by hand.
 *
 * Pure logic: no React, no network.
 */
import {
  type KnockoutSeed,
  type KnockoutMatchRow,
  type KnockoutMatchLike,
  dedupeSeeds,
  assertNoSelfMatches,
  roundLabel,
  winnerOf,
} from "./knockout";

export type DrawStyle = "straight" | "graduated";

export function isDrawStyle(v: unknown): v is DrawStyle {
  return v === "straight" || v === "graduated";
}

/** Largest power of two that is <= n (minimum 1). */
export function lowerPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return Math.max(1, p);
}

/**
 * How many play-in matches the opening round of a graduated draw needs.
 *
 * Default: just enough to bring the survivors down to the next power of two
 * (e.g. 22 entrants → 6 matches → 16 survivors → clean bracket from there).
 * When the field is ALREADY a power of two we still play the weakest quarter,
 * so a graduated draw never collapses back into a straight one.
 */
export function graduatedPlayInMatches(entrants: number): number {
  if (entrants < 2) return 0;
  const base = lowerPowerOfTwo(entrants);
  if (entrants > base) return entrants - base;
  // Power-of-two field: sift the weakest quarter (at least one match).
  return Math.max(1, Math.floor(entrants / 4));
}

/** The sensible range an organiser may pick from for the opening round. */
export function playInMatchOptions(entrants: number): number[] {
  const max = Math.floor(entrants / 2);
  const out: number[] = [];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}

/**
 * Pair the weakest `matches * 2` seeds against their nearest-ranked neighbour
 * and give everyone else a bye. Returns slot pairs in bracket order (byes for
 * the strongest first, so the board reads top-seed-down).
 */
export function graduatedPairs(
  seeds: KnockoutSeed[],
  matches: number,
): { a: KnockoutSeed; b: KnockoutSeed | null }[] {
  const ordered = dedupeSeeds(seeds); // sorted strongest → weakest
  const count = Math.max(0, Math.min(Math.floor(matches), Math.floor(ordered.length / 2)));
  const playInFrom = ordered.length - count * 2;
  const resting = ordered.slice(0, playInFrom);
  const playIn = ordered.slice(playInFrom);

  const out: { a: KnockoutSeed; b: KnockoutSeed | null }[] = resting.map((s) => ({ a: s, b: null }));
  // Adjacent pairing inside the play-in slice: (1,2), (3,4) … closest ranks meet.
  for (let i = 0; i < playIn.length; i += 2) {
    out.push({ a: playIn[i], b: playIn[i + 1] ?? null });
  }
  return out;
}

/** Opening round of ONE section, graduated style. */
export function buildGraduatedFirstRound(opts: {
  champId: string;
  groupNumber: number;
  section: number;
  seeds: KnockoutSeed[];
  sectionLabel?: string;
  /** Override the number of play-in matches. Defaults to the suggestion. */
  playInMatches?: number;
  roundNumber?: number;
  playBy?: string | null;
}): KnockoutMatchRow[] {
  const seeds = dedupeSeeds(opts.seeds);
  if (seeds.length < 2) return [];
  const matches =
    opts.playInMatches != null ? opts.playInMatches : graduatedPlayInMatches(seeds.length);
  const pairs = graduatedPairs(seeds, matches);
  const round = opts.roundNumber ?? 1;
  const label = round === 1 ? "Play-in round" : roundLabel(pairs.length * 2);

  const rows: KnockoutMatchRow[] = pairs.map((pair, i) => {
    const bye = !pair.b;
    return {
      champ_id: opts.champId,
      group_number: opts.groupNumber,
      section_number: opts.section,
      round_number: round,
      bracket_position: i + 1,
      stage: "ko",
      stage_label: opts.sectionLabel ? `${opts.sectionLabel} · ${label}` : label,
      player_a_member_id: pair.a.memberId,
      partner_a_member_id: pair.a.partnerId ?? null,
      player_b_member_id: pair.b?.memberId ?? null,
      partner_b_member_id: pair.b?.partnerId ?? null,
      placeholder_a: null,
      placeholder_b: pair.b ? null : "Bye",
      is_bye: bye,
      bye_member_id: bye ? pair.a.memberId : null,
      status: bye ? "completed" : "scheduled",
      winner_member_id: bye ? pair.a.memberId : null,
      play_by: opts.playBy ?? null,
    };
  });
  return assertNoSelfMatches(rows);
}

/** Whole opening phase for a division, graduated style. */
export function buildGraduatedLeagueFirstRound(opts: {
  champId: string;
  groupNumber: number;
  assignments: { section: number; seeds: KnockoutSeed[] }[];
  sectionLabels?: Record<number, string>;
  playInMatches?: Record<number, number>;
}): KnockoutMatchRow[] {
  const multi = opts.assignments.length > 1;
  return opts.assignments.flatMap((a) =>
    buildGraduatedFirstRound({
      champId: opts.champId,
      groupNumber: opts.groupNumber,
      section: a.section,
      seeds: a.seeds,
      sectionLabel: multi
        ? opts.sectionLabels?.[a.section] ?? `Section ${String.fromCharCode(64 + a.section)}`
        : undefined,
      playInMatches: opts.playInMatches?.[a.section],
    }),
  );
}

/**
 * Next round of a graduated section: survivors are re-ranked by their original
 * seed, and only as many of the WEAKEST as the bracket needs play — the rest
 * (the stronger survivors) rest again until the field is a power of two. Once
 * the survivor count IS a power of two the draw pairs everyone adjacently and
 * behaves like a normal bracket from there.
 */
export function buildGraduatedNextRound(opts: {
  champId: string;
  groupNumber: number;
  section: number;
  roundMatches: KnockoutMatchLike[];
  /** Strength order for the survivors: memberId → seed (1 = strongest). */
  seedOf: (memberId: string) => number;
  sectionLabel?: string;
  playBy?: string | null;
}): KnockoutMatchRow[] {
  const rows = [...opts.roundMatches];
  if (rows.length < 2) return [];
  const winners: KnockoutSeed[] = [];
  for (const m of rows) {
    const w = winnerOf(m);
    if (!w) return []; // round not finished
    const partner =
      m.player_a_member_id === w ? m.partner_a_member_id ?? null : m.partner_b_member_id ?? null;
    winners.push({ memberId: w, partnerId: partner, seed: opts.seedOf(w) });
  }
  const survivors = dedupeSeeds(winners);
  if (survivors.length < 2) return [];

  const round = (Number(rows[0].round_number) || 1) + 1;
  const base = lowerPowerOfTwo(survivors.length);
  const matches =
    survivors.length > base ? survivors.length - base : Math.floor(survivors.length / 2);

  const pairs = graduatedPairs(survivors, matches);
  const label = survivors.length === base ? roundLabel(survivors.length) : `Round ${round}`;

  const out: KnockoutMatchRow[] = pairs.map((pair, i) => {
    const bye = !pair.b;
    return {
      champ_id: opts.champId,
      group_number: opts.groupNumber,
      section_number: opts.section,
      round_number: round,
      bracket_position: i + 1,
      stage: "ko",
      stage_label: opts.sectionLabel ? `${opts.sectionLabel} · ${label}` : label,
      player_a_member_id: pair.a.memberId,
      partner_a_member_id: pair.a.partnerId ?? null,
      player_b_member_id: pair.b?.memberId ?? null,
      partner_b_member_id: pair.b?.partnerId ?? null,
      placeholder_a: null,
      placeholder_b: pair.b ? null : "Bye",
      is_bye: bye,
      bye_member_id: bye ? pair.a.memberId : null,
      status: bye ? "completed" : "scheduled",
      winner_member_id: bye ? pair.a.memberId : null,
      play_by: opts.playBy ?? null,
    };
  });
  return assertNoSelfMatches(out);
}

/** Plain-language summary for the wizard. */
export function describeGraduated(entrants: number, matches: number): string {
  if (entrants < 2) return "Not enough entrants yet.";
  const playing = matches * 2;
  const resting = entrants - playing;
  const survivors = entrants - matches;
  return `${playing} of ${entrants} play the opening round (${matches} close match${matches === 1 ? "" : "es"}); ${resting} stronger ${resting === 1 ? "player rests" : "players rest"} and enter next round. ${survivors} go through.`;
}
