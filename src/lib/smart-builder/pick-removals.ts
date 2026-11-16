/**
 * Pick-players removals that stick: a player the organiser removed is remembered so the
 * "add back anyone with an active entry" sync never silently restores them on reopen.
 * Only an explicit re-add by the organiser clears the mark.
 */
import type { Picks } from "./pick-entries";

export function removePick(picks: Picks, removed: string[] | undefined, id: string): { picks: Picks; removedPicks: string[] } {
  const next = { ...picks };
  delete next[id];
  return { picks: next, removedPicks: [...new Set([...(removed ?? []), id])] };
}

export function unmarkRemoved(removed: string[] | undefined, id: string): string[] {
  return (removed ?? []).filter((x) => x !== id);
}

/** Should a player with an active entry be added back to the picks automatically? */
export function shouldAutoAdd(picks: Picks, removed: string[] | undefined, id: string): boolean {
  return !(id in picks) && !(removed ?? []).includes(id);
}

/**
 * An entered player sitting in "Not placed" (picked with no current category) takes the
 * categories from their actual entry, e.g. once a partner's pair adds the category.
 * Players already placed somewhere keep the organiser's placement.
 */
export function shouldFillEntryPlaces(currentPlaces: string[], removed: string[] | undefined, id: string, entered: string[]): boolean {
  return currentPlaces.length === 0 && entered.length > 0 && !(removed ?? []).includes(id);
}

/** Stable signature of the player list, used for the Saved / Unsaved changes label. */
export function picksSignature(picks: Picks, removed: string[] | undefined): string {
  const p = Object.keys(picks).sort().map((id) => {
    const v = picks[id];
    const l = Array.isArray(v) ? [...v].sort() : v ? [v] : [];
    return `${id}:${l.join(",")}`;
  });
  return `${p.join("|")}#${[...(removed ?? [])].sort().join(",")}`;
}

export interface GameLite { status: string | null; winner_member_id: string | null; score: string | null; is_bye: boolean | null }

/** A game "has a result" once it is completed, has a winner or any score. */
export function gameHasResult(g: GameLite): boolean {
  return !!g.winner_member_id || !!(g.score && String(g.score).trim()) || /complet|final|walkover|forfeit/i.test(g.status ?? "");
}

export function removalImpact(games: GameLite[]): { kind: "none" | "unplayed" | "played"; unplayed: number; played: number } {
  const real = games.filter((g) => !g.is_bye);
  const played = real.filter(gameHasResult).length;
  const unplayed = real.length - played;
  return { kind: played ? "played" : unplayed ? "unplayed" : "none", unplayed, played };
}

/** Registration fields the player board reads to decide who really entered and who cancelled. */
export interface BoardReg {
  club_member_id: string;
  partner_member_id: string | null;
  status: string | null;
  division_choices: number[] | null;
  division_partners?: Record<string, string | null> | null;
  registration_status?: string | null;
  registration_source?: string | null;
  confirmed_at?: string | null;
  fee_status?: string | null;
  withdrawn_keep_position?: boolean | null;
}

const CANCELLED = /withdrawn|cancel|declin|reject|removed/i;

/**
 * Who the player board treats as entered, and who cancelled.
 * - An invitation is not an entry: only rows passing `isEntered` count.
 * - A partner named by a real entry counts as entered for that event (e.g. paid for by their partner).
 * - A cancelled/declined entry (not a mid-tournament withdrawal that keeps its place) is listed in
 *   `cancelled` so the board can take that player off; never someone who is entered another way.
 */
export function boardEntries(rows: BoardReg[], isEntered: (r: BoardReg) => boolean): { entered: Map<string, number[]>; cancelled: string[] } {
  const entered = new Map<string, number[]>();
  const add = (id: string | null | undefined, groups: number[]) => {
    if (!id) return;
    entered.set(id, [...new Set([...(entered.get(id) ?? []), ...groups])].sort((x, y) => x - y));
  };
  for (const r of rows) {
    if (CANCELLED.test(r.status ?? "") || !isEntered(r)) continue;
    const groups = r.division_choices ?? [];
    add(r.club_member_id, groups);
    if (r.division_partners && Object.keys(r.division_partners).length) {
      for (const [g, p] of Object.entries(r.division_partners)) add(p, [Number(g)].filter((n) => n > 0));
    } else if (r.partner_member_id) add(r.partner_member_id, groups);
  }
  const cancelled = [...new Set(rows
    .filter((r) => CANCELLED.test(r.status ?? "") && !r.withdrawn_keep_position && !entered.has(r.club_member_id))
    .map((r) => r.club_member_id))].sort();
  return { entered, cancelled };
}

/** Take cancelled players off the board (not marked as organiser-removed, so a later re-entry shows them again). */
export function pruneCancelledPicks(picks: Picks, cancelled: string[]): Picks | null {
  const hit = cancelled.filter((id) => id in picks);
  if (!hit.length) return null;
  const next = { ...picks };
  for (const id of hit) delete next[id];
  return next;
}
