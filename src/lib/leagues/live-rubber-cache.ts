/**
 * Pure helpers that apply a realtime change for one league fixture straight
 * into the cached rows, so viewers following a live league game do not
 * re-download every rubber (and the fixture totals) on every point scored.
 * Display-only: never writes, never changes scoring rules.
 */

export type RealtimeChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
};

const byPosition = (a: any, b: any) => (Number(a?.position) || 0) - (Number(b?.position) || 0);

/**
 * Returns the updated rubber list, or `undefined` when the change cannot be
 * applied safely (nothing cached yet / unknown shape) — callers then refetch.
 */
export function applyRubberChange(
  prev: any[] | undefined | null,
  change: RealtimeChange,
  fixtureId: string,
): any[] | undefined {
  if (!Array.isArray(prev)) return undefined;
  if (change.eventType === "DELETE") {
    const id = change.old?.id;
    if (!id) return undefined;
    return prev.filter((r) => r?.id !== id);
  }
  const row = change.new;
  if (!row || !row.id) return undefined;
  if (row.fixture_id && row.fixture_id !== fixtureId) return prev;
  const idx = prev.findIndex((r) => r?.id === row.id);
  if (idx === -1) return [...prev, row].sort(byPosition);
  const next = prev.slice();
  // Merge so any column the change omitted keeps its last known value.
  next[idx] = { ...prev[idx], ...row };
  return next.sort(byPosition);
}

/**
 * Returns the updated fixture result row, or `undefined` when it cannot be
 * applied safely — callers then refetch.
 */
export function applyFixtureResultChange(
  prev: Record<string, any> | null | undefined,
  change: RealtimeChange,
  fixtureId: string,
): Record<string, any> | null | undefined {
  if (change.eventType === "DELETE") return undefined;
  const row = change.new;
  if (!row || !row.id) return undefined;
  if (row.fixture_id && row.fixture_id !== fixtureId) return prev ?? null;
  if (prev && prev.id && prev.id !== row.id) return undefined;
  return { ...(prev || {}), ...row };
}

/** Fallback poll while a game is live: fast only if live updates are down. */
export function liveRubberPollMs(isLive: boolean, realtimeConnected: boolean): number | false {
  if (!isLive) return false;
  return realtimeConnected ? 60_000 : 10_000;
}
