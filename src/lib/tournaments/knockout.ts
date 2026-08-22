/**
 * Knockout engine — Club Championship style.
 *
 * A knockout tournament here is:
 *
 *   tournament
 *     └── league / division   (group_number — e.g. "A Division", "B Division")
 *           └── section       (section_number — an independent sub-draw)
 *                 └── rounds  (round_number 1..n, bracket_position 1..slots/2)
 *
 * Each league can run a DIFFERENT number of sections. Seeds (by default the
 * club ladder order) are distributed BALANCED across the sections of a league
 * using a snake pattern, so the strongest players never collide early.
 *
 * Generation is PHASED: only the first round of every section is created up
 * front. Later rounds are materialised once their feeder round is complete,
 * which keeps the schedule honest (no rows for players who never got there).
 *
 * Nothing in here touches the network — it is pure so it can be unit tested
 * and reused by both the wizard preview and the live tournament view.
 */

export type KnockoutSeed = {
  memberId: string;
  partnerId?: string | null;
  /** 1 = strongest. Assigned by the caller (ladder order or manual). */
  seed: number;
};

export type SectionAssignment = {
  section: number;
  seeds: KnockoutSeed[];
};

export type KnockoutMatchRow = {
  champ_id: string;
  group_number: number;
  section_number: number;
  round_number: number;
  bracket_position: number;
  stage: "ko";
  stage_label: string;
  player_a_member_id: string | null;
  partner_a_member_id: string | null;
  player_b_member_id: string | null;
  partner_b_member_id: string | null;
  placeholder_a: string | null;
  placeholder_b: string | null;
  is_bye: boolean;
  bye_member_id: string | null;
  status: string;
  winner_member_id: string | null;
  /** Self-scheduled rounds: "must be played by" date. Court/time stay null. */
  play_by?: string | null;
};

/** Minimal shape of a persisted match row we need to read back. */
export type KnockoutMatchLike = {
  id?: string;
  group_number?: number | null;
  section_number?: number | null;
  round_number?: number | null;
  bracket_position?: number | null;
  stage?: string | null;
  status?: string | null;
  is_bye?: boolean | null;
  bye_member_id?: string | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  winner_member_id?: string | null;
  side_a_points?: number | null;
  side_b_points?: number | null;
};

/** Smallest power of two that fits `n` entrants (minimum 2). */
export function bracketSizeFor(n: number): number {
  if (n <= 2) return 2;
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** Number of rounds a section of `n` entrants needs. */
export function roundsFor(n: number): number {
  if (n <= 1) return 0;
  return Math.log2(bracketSizeFor(n));
}

/**
 * Suggested number of sections for a league, aiming at sections of roughly
 * 4–8 entrants (i.e. 2–3 rounds each) and always a power of two so section
 * winners can meet in a clean league final.
 */
export function suggestSectionCount(entrants: number): number {
  if (entrants <= 8) return 1;
  if (entrants <= 16) return 2;
  if (entrants <= 32) return 4;
  return 8;
}

/**
 * Snake ("boustrophedon") distribution — seed 1 to section 1, seed 2 to
 * section 2 … then back again. Guarantees each section carries a comparable
 * share of strong and weak players.
 */
export function distributeSeedsBalanced(seeds: KnockoutSeed[], sections: number): SectionAssignment[] {
  const count = Math.max(1, Math.floor(sections));
  const out: SectionAssignment[] = Array.from({ length: count }, (_, i) => ({ section: i + 1, seeds: [] }));
  const ordered = [...seeds].sort((a, b) => a.seed - b.seed);
  ordered.forEach((s, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    const idx = row % 2 === 0 ? col : count - 1 - col;
    out[idx].seeds.push(s);
  });
  return out;
}

/**
 * Standard seeded bracket slot order for a draw of `size` (power of two).
 * Returns the seed numbers in slot order, e.g. size 8 →
 * [1,8,4,5,3,6,2,7] so 1 and 2 can only meet in the final.
 */
export function seedSlotOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next: number[] = [];
    const rounds = order.length * 2;
    for (const s of order) {
      next.push(s);
      next.push(rounds + 1 - s);
    }
    order = next;
  }
  return order;
}

/** Human label for a knockout round given how many players start it. */
export function roundLabel(playersInRound: number): string {
  switch (playersInRound) {
    case 2:
      return "Final";
    case 4:
      return "Semi-final";
    case 8:
      return "Quarter-final";
    default:
      return `Round of ${playersInRound}`;
  }
}

/**
 * Drop repeat entrants. A player may legitimately play in SEVERAL divisions,
 * but may only occupy ONE slot inside a single division/section draw —
 * otherwise the bracket pairs them with themselves.
 */
export function dedupeSeeds(seeds: KnockoutSeed[]): KnockoutSeed[] {
  const seen = new Set<string>();
  const out: KnockoutSeed[] = [];
  for (const s of [...seeds].sort((a, b) => a.seed - b.seed)) {
    const key = String(s.memberId || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Hard invariant: a playable match must have two DIFFERENT entrants. A bye is
 * only ever a one-sided row (`is_bye`), never a fixture against yourself.
 */
export function assertNoSelfMatches(rows: KnockoutMatchRow[]): KnockoutMatchRow[] {
  for (const r of rows) {
    if (r.is_bye) continue;
    if (r.player_a_member_id && r.player_a_member_id === r.player_b_member_id) {
      throw new Error(
        `Invalid draw: a player was paired against themselves (division ${r.group_number}, section ${r.section_number}, round ${r.round_number}). Check for duplicate entries in this division.`,
      );
    }
  }
  return rows;
}

function slotSeeds(seeds: KnockoutSeed[]): (KnockoutSeed | null)[] {
  const unique = dedupeSeeds(seeds);
  const size = bracketSizeFor(unique.length);
  const bySeed = new Map<number, KnockoutSeed>();
  // Re-rank locally 1..n so section seeding is independent of global seed numbers.
  unique.forEach((s, i) => bySeed.set(i + 1, s));
  return seedSlotOrder(size).map((n) => bySeed.get(n) ?? null);
}

/**
 * First round of ONE section. Entrants without an opponent get a bye row
 * (already completed) so downstream generation can read winners uniformly.
 */
export function buildSectionFirstRound(opts: {
  champId: string;
  groupNumber: number;
  section: number;
  seeds: KnockoutSeed[];
  sectionLabel?: string;
}): KnockoutMatchRow[] {
  const { champId, groupNumber, section } = opts;
  const seeds = dedupeSeeds(opts.seeds);
  if (seeds.length < 2) return [];
  const slots = slotSeeds(seeds);

  const label = roundLabel(slots.length);
  const rows: KnockoutMatchRow[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    const position = i / 2 + 1;
    const bye = !a || !b;
    const present = a ?? b;
    rows.push({
      champ_id: champId,
      group_number: groupNumber,
      section_number: section,
      round_number: 1,
      bracket_position: position,
      stage: "ko",
      stage_label: opts.sectionLabel ? `${opts.sectionLabel} · ${label}` : label,
      player_a_member_id: a?.memberId ?? null,
      partner_a_member_id: a?.partnerId ?? null,
      player_b_member_id: b?.memberId ?? null,
      partner_b_member_id: b?.partnerId ?? null,
      placeholder_a: a ? null : "Bye",
      placeholder_b: b ? null : "Bye",
      is_bye: bye,
      bye_member_id: bye ? present?.memberId ?? null : null,
      status: bye ? "completed" : "scheduled",
      winner_member_id: bye ? present?.memberId ?? null : null,
    });
  }
  return rows;
}

/** Whole first phase for a league: every section's opening round. */
export function buildLeagueFirstRound(opts: {
  champId: string;
  groupNumber: number;
  assignments: SectionAssignment[];
  sectionLabels?: Record<number, string>;
}): KnockoutMatchRow[] {
  const multi = opts.assignments.length > 1;
  return opts.assignments.flatMap((a) =>
    buildSectionFirstRound({
      champId: opts.champId,
      groupNumber: opts.groupNumber,
      section: a.section,
      seeds: a.seeds,
      sectionLabel: multi ? opts.sectionLabels?.[a.section] ?? `Section ${sectionLetter(a.section)}` : undefined,
    }),
  );
}

/** A → "A", 2 → "B" … */
export function sectionLetter(section: number): string {
  return String.fromCharCode(64 + Math.max(1, section));
}

/** Winner of a finished match (explicit winner, else points). */
export function winnerOf(m: KnockoutMatchLike): string | null {
  if (!m) return null;
  if (m.is_bye) return m.bye_member_id ?? m.player_a_member_id ?? m.player_b_member_id ?? null;
  if (m.status !== "completed") return null;
  if (m.winner_member_id) return m.winner_member_id;
  const a = Number(m.side_a_points) || 0;
  const b = Number(m.side_b_points) || 0;
  if (a === b) return null;
  return a > b ? m.player_a_member_id ?? null : m.player_b_member_id ?? null;
}

function partnerOfWinner(m: KnockoutMatchLike, winner: string | null): string | null {
  if (!winner) return null;
  if (m.player_a_member_id === winner) return m.partner_a_member_id ?? null;
  if (m.player_b_member_id === winner) return m.partner_b_member_id ?? null;
  return null;
}

export type SectionRoundState = {
  groupNumber: number;
  section: number;
  /** Highest round that has rows. 0 when the section has not started. */
  latestRound: number;
  /** Rows of the latest round. */
  latestRoundMatches: KnockoutMatchLike[];
  /** Every latest-round match has a winner. */
  roundComplete: boolean;
  /** The section is decided (latest round was a single decided match). */
  sectionComplete: boolean;
  /** Winner of the section when complete. */
  sectionWinner: string | null;
  /** Next round can be generated now. */
  canGenerateNext: boolean;
};

/** Inspect persisted rows and report where each section stands. */
export function knockoutState(matches: KnockoutMatchLike[]): SectionRoundState[] {
  const ko = matches.filter((m) => (m.stage || "") === "ko");
  const keys = new Map<string, KnockoutMatchLike[]>();
  for (const m of ko) {
    const key = `${m.group_number ?? 0}|${m.section_number ?? 1}`;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key)!.push(m);
  }
  const out: SectionRoundState[] = [];
  for (const [key, rows] of keys) {
    const [g, s] = key.split("|").map(Number);
    const latestRound = rows.reduce((max, m) => Math.max(max, Number(m.round_number) || 0), 0);
    const latestRoundMatches = rows
      .filter((m) => (Number(m.round_number) || 0) === latestRound)
      .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
    const roundComplete = latestRoundMatches.length > 0 && latestRoundMatches.every((m) => !!winnerOf(m));
    const sectionComplete = roundComplete && latestRoundMatches.length === 1;
    out.push({
      groupNumber: g,
      section: s,
      latestRound,
      latestRoundMatches,
      roundComplete,
      sectionComplete,
      sectionWinner: sectionComplete ? winnerOf(latestRoundMatches[0]) : null,
      canGenerateNext: roundComplete && latestRoundMatches.length > 1,
    });
  }
  return out.sort((a, b) => a.groupNumber - b.groupNumber || a.section - b.section);
}

/**
 * Build the round that follows `roundMatches` (all from one section, all
 * decided). Returns [] when the round is not complete or the section is
 * already decided — so calling this repeatedly is safe/idempotent.
 */
export function buildNextRound(opts: {
  champId: string;
  groupNumber: number;
  section: number;
  roundMatches: KnockoutMatchLike[];
  sectionLabel?: string;
  /** Deadline for the round being created (self-scheduled knockouts). */
  playBy?: string | null;
}): KnockoutMatchRow[] {
  const rows = [...opts.roundMatches].sort(
    (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0),
  );
  if (rows.length < 2) return [];
  const winners = rows.map((m) => ({ match: m, winner: winnerOf(m) }));
  if (winners.some((w) => !w.winner)) return [];

  const round = (Number(rows[0].round_number) || 1) + 1;
  const label = roundLabel(rows.length);
  const out: KnockoutMatchRow[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const a = winners[i];
    const b = winners[i + 1];
    out.push({
      champ_id: opts.champId,
      group_number: opts.groupNumber,
      section_number: opts.section,
      round_number: round,
      bracket_position: i / 2 + 1,
      stage: "ko",
      stage_label: opts.sectionLabel ? `${opts.sectionLabel} · ${label}` : label,
      player_a_member_id: a?.winner ?? null,
      partner_a_member_id: a ? partnerOfWinner(a.match, a.winner) : null,
      player_b_member_id: b?.winner ?? null,
      partner_b_member_id: b ? partnerOfWinner(b.match, b.winner) : null,
      placeholder_a: a ? null : "Bye",
      placeholder_b: b ? null : "Bye",
      is_bye: !b,
      bye_member_id: !b ? a?.winner ?? null : null,
      status: !b ? "completed" : "scheduled",
      winner_member_id: !b ? a?.winner ?? null : null,
      play_by: opts.playBy ?? null,
    });
  }
  return out;
}

/**
 * Final stage of a league that ran more than one section: the section
 * winners meet. Only produced once EVERY section of the league is decided.
 */
export function buildLeagueFinals(opts: {
  champId: string;
  groupNumber: number;
  sectionWinners: { section: number; memberId: string; partnerId?: string | null }[];
  /** Round number to place the finals at (defaults to after the deepest section round). */
  round: number;
}): KnockoutMatchRow[] {
  const winners = [...opts.sectionWinners].sort((a, b) => a.section - b.section);
  if (winners.length < 2) return [];
  const seeds: KnockoutSeed[] = winners.map((w, i) => ({
    memberId: w.memberId,
    partnerId: w.partnerId ?? null,
    seed: i + 1,
  }));
  const rows = buildSectionFirstRound({
    champId: opts.champId,
    groupNumber: opts.groupNumber,
    section: 0, // section 0 = the league-wide finals bracket
    seeds,
    sectionLabel: "League finals",
  });
  return rows.map((r) => ({ ...r, round_number: opts.round }));
}

/**
 * How many court slots a league's knockout needs in TOTAL (all sections,
 * all rounds, byes excluded) — used by the capacity check.
 */
export function knockoutMatchCount(assignments: SectionAssignment[]): number {
  let total = 0;
  for (const a of assignments) {
    if (a.seeds.length >= 2) total += a.seeds.length - 1; // knockout: n-1 real matches
  }
  const sections = assignments.filter((a) => a.seeds.length > 0).length;
  if (sections > 1) total += sections - 1; // league finals bracket
  return total;
}
