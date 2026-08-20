/**
 * League fixture lineup resolution + persistence helpers.
 *
 * Background (production bug, Nelspruit captains): a captain swapped reserves
 * into a fixture lineup, but when the match was opened later that evening the
 * original players were back. Two independent causes:
 *
 *  1. Saved per-position player rows in `league_match_results` were DISCARDED
 *     on load whenever the sibling `league_fixture_results` row was missing
 *     (or hadn't been fetched yet). The blanked slots were then re-filled from
 *     the default week lineup / registrations — i.e. the originals.
 *  2. The prefill builder applied the weekly (default) lineup BEFORE the
 *     per-fixture override rows, and its fill helper never overwrites an
 *     already-filled slot — so per-fixture overrides could never win.
 *
 * These helpers make the precedence explicit and unit-testable:
 *   per-fixture override  >  weekly lineup  >  registration order (default)
 * and make a saved player row authoritative on reload.
 */

export type LineupSlot = { code: string; name: string };

export type SavedMatchRow = {
  position?: number | null;
  home_player_code?: string | null;
  home_player_name?: string | null;
  away_player_code?: string | null;
  away_player_name?: string | null;
  game_scores?: unknown;
  is_forfeit?: boolean | null;
  current_game?: unknown;
};

/** Real play recorded for this rubber (scores, forfeit or a live game). */
export function rowHasPlay(row: SavedMatchRow | undefined | null): boolean {
  if (!row) return false;
  const scores = Array.isArray(row.game_scores) ? row.game_scores : [];
  return scores.length > 0 || !!row.is_forfeit || !!(row.current_game && typeof row.current_game === "object");
}

/** A captain-confirmed player is stored on this row (either side). */
export function rowHasSavedPlayers(row: SavedMatchRow | undefined | null): boolean {
  if (!row) return false;
  return !!(row.home_player_code || row.home_player_name || row.away_player_code || row.away_player_name);
}

/**
 * Should the saved DB row be used as-is for this position?
 *
 * A row carrying saved players is ALWAYS authoritative — never blank it just
 * because the fixture-level result row is missing or still loading. Blanking
 * is what allowed the default lineup to overwrite saved reserves.
 */
export function shouldKeepSavedRow(
  row: SavedMatchRow | undefined | null,
  hasSavedFixtureState: boolean,
): boolean {
  return rowHasPlay(row) || rowHasSavedPlayers(row) || hasSavedFixtureState;
}

export type LineupEntry = { position: number; memberId: string };

/**
 * Resolve the member id for each position of one team.
 *
 * Precedence per position: fixture override → weekly lineup → registrations.
 * A member is never placed twice. `originals` reflects the DEFAULT allocation
 * (weekly lineup + registrations only) so reserve swaps can be identified.
 */
export function resolveLineupPositions(opts: {
  fixtureOverrides: LineupEntry[];
  weekLineup: LineupEntry[];
  registrations: string[];
  maxPositions: number;
  fallbackCount: number;
}): { lineup: (string | null)[]; originals: (string | null)[] } {
  const { fixtureOverrides, weekLineup, registrations, maxPositions, fallbackCount } = opts;
  const lineup: (string | null)[] = Array.from({ length: maxPositions }, () => null);
  const originals: (string | null)[] = Array.from({ length: maxPositions }, () => null);
  const usedLineup = new Set<string>();
  const usedOriginals = new Set<string>();

  const place = (
    target: (string | null)[],
    used: Set<string>,
    position: number,
    memberId: string,
  ) => {
    if (!memberId) return;
    if (position < 1 || position > maxPositions) return;
    if (target[position - 1]) return;
    if (used.has(memberId)) return;
    target[position - 1] = memberId;
    used.add(memberId);
  };

  // 1) Captain's per-fixture override wins outright.
  for (const e of fixtureOverrides) place(lineup, usedLineup, e.position, e.memberId);
  // 2) Weekly (default) lineup fills what's left, and defines the originals.
  for (const e of weekLineup) {
    place(lineup, usedLineup, e.position, e.memberId);
    place(originals, usedOriginals, e.position, e.memberId);
  }
  // 3) Registration order as the last resort for still-empty slots.
  const cap = Math.min(maxPositions, Math.max(fallbackCount, 0));
  let regIdx = 0;
  for (let i = 0; i < cap; i++) {
    if (lineup[i] && originals[i]) continue;
    while (regIdx < registrations.length) {
      const memberId = registrations[regIdx++];
      if (!memberId) continue;
      if (usedLineup.has(memberId) && usedOriginals.has(memberId)) continue;
      place(lineup, usedLineup, i + 1, memberId);
      place(originals, usedOriginals, i + 1, memberId);
      break;
    }
  }
  return { lineup, originals };
}

/**
 * Merge a prefill slot into the current scorecard slot.
 * Anything already present locally (saved reserve, visitor without a code, or
 * live play) is preserved — prefill only fills genuinely empty sides.
 */
export function applyPrefillSlot(
  current: LineupSlot,
  prefill: LineupSlot | undefined,
  opts: { slotHasPlay: boolean; sourceHasAny: boolean },
): LineupSlot {
  if (opts.slotHasPlay) return current;
  if (!opts.sourceHasAny) return current;
  if (current.code || current.name) return current;
  return { code: prefill?.code || "", name: prefill?.name || "" };
}

/** Is the local lineup different from what the server currently holds? */
export function lineupDiffers(
  local: Array<{ homeCode: string; homeName: string; awayCode: string; awayName: string }>,
  saved: SavedMatchRow[],
): boolean {
  const byPos = new Map<number, SavedMatchRow>();
  for (const r of saved) byPos.set(Number(r.position), r);
  for (let i = 0; i < local.length; i++) {
    const p = local[i];
    const r = byPos.get(i + 1);
    const norm = (v?: string | null) => (v || "").trim().toUpperCase();
    if (
      norm(p.homeCode) !== norm(r?.home_player_code) ||
      norm(p.homeName) !== norm(r?.home_player_name) ||
      norm(p.awayCode) !== norm(r?.away_player_code) ||
      norm(p.awayName) !== norm(r?.away_player_name)
    ) {
      return true;
    }
  }
  return false;
}
