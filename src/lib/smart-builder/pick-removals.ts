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
