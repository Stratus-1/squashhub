/**
 * Visual draw / manual seeding board.
 *
 * A controlled DRAW stage that sits between "players are allocated" and
 * "fixtures exist". The engine proposes a bracket (normal seeding rules), the
 * organiser may re-arrange it by hand, and only a CONFIRMED board is turned
 * into `club_champs_matches` rows.
 *
 * Everything here is pure: the same model drives the first knockout round in
 * the setup wizard and the "review next round" step in the live tournament,
 * so a manual pairing can never diverge from what actually gets generated.
 *
 * Rules that are enforced (validation errors):
 *  - an entrant may occupy at most ONE slot of a division draw;
 *  - only entrants eligible for THIS division/round may appear (no cross
 *    division, and for later rounds only the winners that came through);
 *  - every eligible entrant must be somewhere on the board (no silent drops);
 *  - a slot may be deliberately left empty — that side becomes a BYE, and a
 *    matchup with both sides empty is simply not generated.
 *
 * Everything else (a "wrong" looking pairing, a bye for a mid seed) is a
 * WARNING only: the organiser's arrangement is authoritative.
 */
import {
  assertNoSelfMatches,
  buildSectionFirstRound,
  roundLabel,
  sectionLetter,
  winnerOf,
  type KnockoutMatchLike,
  type KnockoutMatchRow,
  type KnockoutSeed,
  type SectionAssignment,
} from "./knockout";

export interface DrawEntrant {
  id: string;
  name: string;
  /** Doubles: the partner that travels with this entrant. */
  partnerId?: string | null;
  partnerName?: string | null;
  /** 1 = strongest inside this division. */
  seed?: number | null;
  /** Free-form context shown on the card ("Ladder 12", "B League"). */
  rankLabel?: string | null;
  divisionLabel?: string | null;
}

export interface DrawSlotRef {
  section: number;
  round: number;
  position: number;
  side: "a" | "b";
}

export interface DrawMatchup {
  section: number;
  round: number;
  position: number;
  a: string | null;
  b: string | null;
}

export interface DrawBoard {
  groupNumber: number;
  round: number;
  matches: DrawMatchup[];
}

export const slotKey = (r: DrawSlotRef) => `slot:${r.section}:${r.round}:${r.position}:${r.side}`;

export function parseSlotKey(key: string): DrawSlotRef | null {
  const parts = String(key || "").split(":");
  if (parts.length !== 5 || parts[0] !== "slot") return null;
  const [, section, round, position, side] = parts;
  if (side !== "a" && side !== "b") return null;
  return { section: Number(section), round: Number(round), position: Number(position), side };
}

const same = (a: DrawSlotRef, b: DrawSlotRef) =>
  a.section === b.section && a.round === b.round && a.position === b.position && a.side === b.side;

const cloneBoard = (b: DrawBoard): DrawBoard => ({ ...b, matches: b.matches.map((m) => ({ ...m })) });

const readSlot = (b: DrawBoard, r: DrawSlotRef): string | null => {
  const m = b.matches.find((x) => x.section === r.section && x.round === r.round && x.position === r.position);
  if (!m) return null;
  return r.side === "a" ? m.a : m.b;
};

const writeSlot = (b: DrawBoard, r: DrawSlotRef, value: string | null) => {
  const m = b.matches.find((x) => x.section === r.section && x.round === r.round && x.position === r.position);
  if (!m) return;
  if (r.side === "a") m.a = value;
  else m.b = value;
};

/** Every slot of the board, in reading order. */
export function drawSlots(board: DrawBoard): DrawSlotRef[] {
  return board.matches.flatMap((m) => [
    { section: m.section, round: m.round, position: m.position, side: "a" as const },
    { section: m.section, round: m.round, position: m.position, side: "b" as const },
  ]);
}

/** Where an entrant currently sits (null when benched). */
export function findSlot(board: DrawBoard, entrantId: string): DrawSlotRef | null {
  for (const r of drawSlots(board)) if (readSlot(board, r) === entrantId) return r;
  return null;
}

/** Entrants not placed anywhere on the board. */
export function benchedEntrants(board: DrawBoard, entrants: DrawEntrant[]): DrawEntrant[] {
  const placed = new Set(drawSlots(board).map((r) => readSlot(board, r)).filter(Boolean) as string[]);
  return entrants.filter((e) => !placed.has(e.id));
}

/**
 * Suggested draw for a division: normal seeded bracket per section, byes going
 * to the top seeds exactly as the automatic generator would.
 */
export function suggestDrawBoard(opts: {
  groupNumber: number;
  assignments: SectionAssignment[];
  round?: number;
}): DrawBoard {
  const round = opts.round ?? 1;
  const matches: DrawMatchup[] = [];
  for (const a of opts.assignments) {
    const rows = buildSectionFirstRound({
      champId: "draft",
      groupNumber: opts.groupNumber,
      section: a.section,
      seeds: a.seeds,
    });
    for (const r of rows) {
      matches.push({
        section: a.section,
        round,
        position: r.bracket_position,
        // A bye is simply an empty side — no synthetic opponent.
        a: r.player_a_member_id ?? null,
        b: r.player_b_member_id ?? null,
      });
    }
    // A single entrant gets no row from the engine — keep them visible.
    if (rows.length === 0 && a.seeds.length === 1) {
      matches.push({ section: a.section, round, position: 1, a: a.seeds[0].memberId, b: null });
    }
  }
  return { groupNumber: opts.groupNumber, round, matches };
}

/** Convenience: build a one-section suggestion straight from entrants. */
export function suggestFromEntrants(groupNumber: number, entrants: DrawEntrant[], round = 1): DrawBoard {
  const seeds: KnockoutSeed[] = entrants.map((e, i) => ({
    memberId: e.id,
    partnerId: e.partnerId ?? null,
    seed: e.seed ?? i + 1,
  }));
  return suggestDrawBoard({ groupNumber, assignments: [{ section: 1, seeds }], round });
}

/**
 * Move an entrant into a slot. Occupied targets SWAP (never overwrite), so no
 * entrant can be lost by a careless drag — the same rule the pool board uses.
 */
export function moveEntrant(board: DrawBoard, entrantId: string, to: DrawSlotRef): DrawBoard {
  const next = cloneBoard(board);
  const from = findSlot(next, entrantId);
  if (from && same(from, to)) return next;
  const occupant = readSlot(next, to);
  writeSlot(next, to, entrantId);
  if (from) writeSlot(next, from, occupant ?? null);
  return next;
}

/** Empty a slot — that side of the matchup becomes a BYE. */
export function clearSlot(board: DrawBoard, ref: DrawSlotRef): DrawBoard {
  const next = cloneBoard(board);
  writeSlot(next, ref, null);
  return next;
}

/** Take an entrant off the board entirely (back to the bench). */
export function benchEntrant(board: DrawBoard, entrantId: string): DrawBoard {
  const ref = findSlot(board, entrantId);
  return ref ? clearSlot(board, ref) : cloneBoard(board);
}

/**
 * Append an empty matchup to a section. Used when the organiser wants more
 * first-round byes than the suggested bracket hands out: add a slot, drag a
 * benched player into it, and the other side stays empty (a bye).
 */
export function addMatchup(board: DrawBoard, section: number): DrawBoard {
  const next = cloneBoard(board);
  const positions = next.matches.filter((m) => m.section === section).map((m) => m.position);
  const position = positions.length ? Math.max(...positions) + 1 : 1;
  next.matches.push({ section, round: next.round, position, a: null, b: null });
  return next;
}

/** True when a matchup holds nobody and may be removed. */
export function matchupIsEmpty(board: DrawBoard, section: number, position: number): boolean {
  const m = board.matches.find((x) => x.section === section && x.position === position);
  return !!m && !m.a && !m.b;
}

/** Remove an empty matchup and renumber the remaining positions in that section. */
export function removeMatchup(board: DrawBoard, section: number, position: number): DrawBoard {
  if (!matchupIsEmpty(board, section, position)) return cloneBoard(board);
  const next = cloneBoard(board);
  next.matches = next.matches.filter((m) => !(m.section === section && m.position === position));
  next.matches
    .filter((m) => m.section === section)
    .sort((a, b) => a.position - b.position)
    .forEach((m, i) => { m.position = i + 1; });
  return next;
}



export interface DrawValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Matchups that will actually be generated (byes included, empties dropped). */
  playable: number;
  byes: number;
}

/**
 * Integrity gate for Confirm Draw. `entrants` is the authoritative, division
 * scoped population for this round (for later rounds: only the winners).
 */
export function validateDrawBoard(board: DrawBoard, entrants: DrawEntrant[]): DrawValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const nameOf = (id: string) => byId.get(id)?.name || "Unknown player";

  const counts = new Map<string, number>();
  for (const ref of drawSlots(board)) {
    const id = readSlot(board, ref);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
    if (!byId.has(id)) {
      errors.push(`A player who is not entered in this division appears in the draw (${id}).`);
    }
  }
  for (const [id, n] of counts) {
    if (n > 1) errors.push(`${nameOf(id)} appears ${n} times in this draw — an entrant may only hold one slot.`);
  }
  const missing = benchedEntrants(board, entrants);
  if (missing.length > 0) {
    errors.push(
      `${missing.length} entrant${missing.length === 1 ? " is" : "s are"} not placed in the draw: ${missing
        .map((e) => e.name)
        .join(", ")}.`,
    );
  }

  let playable = 0;
  let byes = 0;
  for (const m of board.matches) {
    if (m.a && m.b) {
      if (m.a === m.b) errors.push(`${nameOf(m.a)} is drawn against themselves.`);
      else playable += 1;
    } else if (m.a || m.b) {
      byes += 1;
      const id = (m.a || m.b) as string;
      const seed = byId.get(id)?.seed ?? null;
      if (seed && seed > Math.max(2, Math.ceil(entrants.length / 4))) {
        warnings.push(`${nameOf(id)} (seed ${seed}) receives a bye — normally a bye goes to a top seed.`);
      }
    }
  }
  if (playable === 0 && byes <= 1) {
    errors.push("This draw has no playable match.");
  }

  // Structural check: what comes out of this round must fit a bracket.
  const advancing = playable + byes;
  if (advancing > 1 && !Number.isInteger(Math.log2(nextPowerOfTwo(advancing)))) {
    errors.push("The draw does not produce a valid bracket.");
  }

  // Purely informational: unusually lopsided first-round pairings.
  for (const m of board.matches) {
    if (!m.a || !m.b) continue;
    const sa = byId.get(m.a)?.seed ?? null;
    const sb = byId.get(m.b)?.seed ?? null;
    if (sa && sb && Math.abs(sa - sb) >= Math.max(4, Math.ceil(entrants.length / 2))) {
      warnings.push(`${nameOf(m.a)} (seed ${sa}) v ${nameOf(m.b)} (seed ${sb}) is a big seeding gap.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, playable, byes };
}

function nextPowerOfTwo(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** Turn a confirmed board into insertable knockout rows. */
export function drawToMatchRows(opts: {
  champId: string;
  board: DrawBoard;
  entrants: DrawEntrant[];
  /** Show "Section A · Semi-final" when the division runs several sections. */
  multiSection?: boolean;
  sectionLabels?: Record<number, string>;
  playBy?: string | null;
  roundId?: string | null;
}): KnockoutMatchRow[] {
  const { champId, board, entrants } = opts;
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const bySection = new Map<number, DrawMatchup[]>();
  for (const m of board.matches) {
    if (!m.a && !m.b) continue; // an empty matchup is simply not created
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section)!.push(m);
  }

  const rows: KnockoutMatchRow[] = [];
  for (const [section, all] of [...bySection.entries()].sort((x, y) => x[0] - y[0])) {
    const ordered = [...all].sort((a, b) => a.position - b.position);
    const label = roundLabel(Math.max(2, nextPowerOfTwo(ordered.length * 2)));
    const sectionLabel = opts.multiSection
      ? opts.sectionLabels?.[section] ?? `Section ${sectionLetter(section)}`
      : undefined;
    ordered.forEach((m, i) => {
      const a = m.a ? byId.get(m.a) : null;
      const b = m.b ? byId.get(m.b) : null;
      const bye = !a || !b;
      const present = a ?? b;
      rows.push({
        champ_id: champId,
        group_number: board.groupNumber,
        section_number: section,
        round_number: board.round,
        bracket_position: i + 1,
        stage: "ko",
        stage_label: sectionLabel ? `${sectionLabel} · ${label}` : label,
        player_a_member_id: a?.id ?? null,
        partner_a_member_id: a?.partnerId ?? null,
        player_b_member_id: b?.id ?? null,
        partner_b_member_id: b?.partnerId ?? null,
        placeholder_a: a ? null : "Bye",
        placeholder_b: b ? null : "Bye",
        is_bye: bye,
        bye_member_id: bye ? present?.id ?? null : null,
        status: bye ? "completed" : "scheduled",
        winner_member_id: bye ? present?.id ?? null : null,
        play_by: opts.playBy ?? null,
        ...(opts.roundId ? ({ round_id: opts.roundId } as any) : {}),
      });
    });
  }
  return assertNoSelfMatches(rows);
}

/**
 * Entrants for the NEXT round of a section: the winners of the completed round,
 * seeded by bracket position. Completed matches themselves are never touched —
 * this only reads them.
 */
export function winnersAsEntrants(
  roundMatches: KnockoutMatchLike[],
  nameOf: (id: string) => string,
): DrawEntrant[] {
  return [...roundMatches]
    .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0))
    .map((m) => {
      const w = winnerOf(m);
      if (!w) return null;
      const partnerId =
        m.player_a_member_id === w ? m.partner_a_member_id ?? null
          : m.player_b_member_id === w ? m.partner_b_member_id ?? null
            : null;
      return { id: w, name: nameOf(w), partnerId } as DrawEntrant;
    })
    .filter(Boolean)
    .map((e, i) => ({ ...(e as DrawEntrant), seed: i + 1 }));
}

/** Suggested next-round board: winners paired 1v2, 3v4 … (engine default). */
export function suggestNextRoundBoard(opts: {
  groupNumber: number;
  section: number;
  round: number;
  winners: DrawEntrant[];
}): DrawBoard {
  const matches: DrawMatchup[] = [];
  for (let i = 0; i < opts.winners.length; i += 2) {
    matches.push({
      section: opts.section,
      round: opts.round,
      position: i / 2 + 1,
      a: opts.winners[i]?.id ?? null,
      b: opts.winners[i + 1]?.id ?? null,
    });
  }
  return { groupNumber: opts.groupNumber, round: opts.round, matches };
}

export interface DrawOverride {
  entrantId: string;
  name: string;
  from: string;
  to: string;
}

const describe = (ref: DrawSlotRef | null, multiSection: boolean) =>
  !ref
    ? "not in the draw"
    : `${multiSection ? `Section ${sectionLetter(ref.section)} ` : ""}match ${ref.position} (${ref.side.toUpperCase()})`;

/** What the organiser changed relative to the suggestion — the audit trail. */
export function drawOverrides(
  suggested: DrawBoard,
  confirmed: DrawBoard,
  entrants: DrawEntrant[],
): DrawOverride[] {
  const multi = new Set(confirmed.matches.map((m) => m.section)).size > 1;
  const out: DrawOverride[] = [];
  for (const e of entrants) {
    const before = findSlot(suggested, e.id);
    const after = findSlot(confirmed, e.id);
    const b = describe(before, multi);
    const a = describe(after, multi);
    if (b !== a) out.push({ entrantId: e.id, name: e.name, from: b, to: a });
  }
  return out;
}

/** Immutable record of the confirmed draw, stored on `tournament_draw_versions`. */
export function drawAuditSnapshot(opts: {
  board: DrawBoard;
  suggested: DrawBoard;
  entrants: DrawEntrant[];
  divisionLabel?: string | null;
}) {
  const overrides = drawOverrides(opts.suggested, opts.board, opts.entrants);
  const byId = new Map(opts.entrants.map((e) => [e.id, e]));
  return {
    kind: "visual_draw" as const,
    group_number: opts.board.groupNumber,
    division_label: opts.divisionLabel ?? null,
    round_number: opts.board.round,
    confirmed_at: new Date().toISOString(),
    manual_overrides: overrides,
    matchups: opts.board.matches
      .filter((m) => m.a || m.b)
      .map((m) => ({
        section: m.section,
        position: m.position,
        a: m.a ? byId.get(m.a)?.name ?? m.a : null,
        b: m.b ? byId.get(m.b)?.name ?? m.b : null,
        bye: !m.a || !m.b,
      })),
  };
}

/**
 * Guard for later rounds: a manual draw may only touch fixtures that have NOT
 * been played. Returns the ids of rows that must be left alone.
 */
export function immutableMatchIds(matches: KnockoutMatchLike[]): string[] {
  return matches
    .filter((m) => m.status === "completed" || !!m.winner_member_id || !!m.is_bye)
    .map((m) => m.id)
    .filter(Boolean) as string[];
}

/** True when the round can still be re-drawn (nothing played or confirmed yet). */
export function roundIsEditable(roundMatches: KnockoutMatchLike[]): boolean {
  return roundMatches.every((m) => !m.is_bye && m.status !== "completed" && !m.winner_member_id);
}

/** "Section A" — used by the draw board headings. */
export function sectionLabelOf(section: number): string {
  return `Section ${sectionLetter(section)}`;
}
