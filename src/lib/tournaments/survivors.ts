/**
 * Knockout "survivors" and daily result events.
 *
 * A knockout league has no meaningful bottom-of-the-table: a player is either
 * still in it (survivor) or out. These pure helpers derive both from the match
 * rows already loaded by the championship view, reusing the same elimination
 * rule the draw uses to strike through losers, so the two can never disagree.
 */

import { eliminatedSide, isKnockoutStage, type EliminationMatchLike } from "./elimination";

export interface KoMatchLike extends EliminationMatchLike {
  id?: string;
  group_number?: number | null;
  scheduled_date?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  /** Set when the result was captured, used to date the event when scheduled_date is absent. */
  updated_at?: string | null;
}

export interface KoResultEvent {
  matchId: string;
  /** yyyy-MM-dd the result belongs to. */
  date: string | null;
  groupNumber: number | null;
  winnerIds: string[];
  loserIds: string[];
}

const sideIds = (m: KoMatchLike, side: "a" | "b"): string[] =>
  [
    side === "a" ? m.player_a_member_id : m.player_b_member_id,
    side === "a" ? m.partner_a_member_id : m.partner_b_member_id,
  ].filter(Boolean) as string[];

const dateOf = (m: KoMatchLike): string | null =>
  m.scheduled_date ? String(m.scheduled_date).slice(0, 10) : m.updated_at ? String(m.updated_at).slice(0, 10) : null;

/** One event per decided knockout match: who went through, who went out. */
export function koResultEvents(matches: KoMatchLike[], opts: { knockout?: boolean } = {}): KoResultEvent[] {
  const out: KoResultEvent[] = [];
  for (const m of matches || []) {
    const loserSide = eliminatedSide(m, opts);
    if (!loserSide) continue;
    const winnerSide = loserSide === "a" ? "b" : "a";
    out.push({
      matchId: String(m.id ?? ""),
      date: dateOf(m),
      groupNumber: m.group_number ?? null,
      winnerIds: sideIds(m, winnerSide),
      loserIds: sideIds(m, loserSide),
    });
  }
  return out;
}

/** Every member knocked out of the event so far. */
export function eliminatedMemberIds(matches: KoMatchLike[], opts: { knockout?: boolean } = {}): Set<string> {
  const set = new Set<string>();
  for (const e of koResultEvents(matches, opts)) e.loserIds.forEach((id) => set.add(id));
  return set;
}

/** Members who won a knockout match on a given day (yyyy-MM-dd). */
export function winnersOn(matches: KoMatchLike[], date: string, opts: { knockout?: boolean } = {}): Set<string> {
  const set = new Set<string>();
  for (const e of koResultEvents(matches, opts)) {
    if (e.date === date) e.winnerIds.forEach((id) => set.add(id));
  }
  return set;
}

/** Every member who has won at least one knockout match so far. */
export function winnerMemberIds(matches: KoMatchLike[], opts: { knockout?: boolean } = {}): Set<string> {
  const set = new Set<string>();
  for (const e of koResultEvents(matches, opts)) e.winnerIds.forEach((id) => set.add(id));
  return set;
}

/** Members knocked out on a given day (yyyy-MM-dd). */
export function eliminatedOn(matches: KoMatchLike[], date: string, opts: { knockout?: boolean } = {}): Set<string> {
  const set = new Set<string>();
  for (const e of koResultEvents(matches, opts)) {
    if (e.date === date) e.loserIds.forEach((id) => set.add(id));
  }
  return set;
}

/**
 * Filter standings-style rows down to the players still in the knockout.
 * A row survives while none of its member ids has lost a knockout match.
 */
export function survivorRows<T extends { club_member_id?: string | null; partner_member_id?: string | null }>(
  rows: T[],
  out: Set<string>,
): T[] {
  return (rows || []).filter(
    (r) => ![r.club_member_id, r.partner_member_id].filter(Boolean).some((id) => out.has(String(id))),
  );
}

/** True when any match in the list belongs to a knockout / play-off bracket. */
export function hasKnockoutStage(matches: KoMatchLike[]): boolean {
  return (matches || []).some((m) => isKnockoutStage(m));
}
