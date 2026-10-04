/**
 * Organiser "Pick players": one person, any number of events (categories/subcategories).
 * Pure helpers — the builder stores `picks[memberId]` as a list of unit keys; older saved
 * answers hold a single key string ("" = not placed), which is read as a one-item list.
 */
export type PickValue = string | string[] | null | undefined;
export type Picks = Record<string, PickValue>;

/** Events a picked person is entered in (deduplicated, order kept). */
export function placesOf(picks: Picks, id: string): string[] {
  const v = picks[id];
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Add/remove one event for a person without removing the person.
 * `single` (Bells/time-capped: every event plays at once) replaces instead of adding.
 */
export function togglePlace(picks: Picks, id: string, key: string, single = false): Picks {
  const cur = placesOf(picks, id);
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : single ? [key] : [...cur, key];
  return { ...picks, [id]: next };
}

/** Add an event (idempotent). */
export function addPlace(picks: Picks, id: string, key: string, single = false): Picks {
  return placesOf(picks, id).includes(key) ? picks : togglePlace(picks, id, key, single);
}

/** Unique players = distinct people; total entries = one per person per event. */
export function pickCounts(picks: Picks): { uniquePlayers: number; totalEntries: number } {
  const ids = Object.keys(picks);
  return { uniquePlayers: ids.length, totalEntries: ids.reduce((n, id) => n + placesOf(picks, id).length, 0) };
}

/** Why a person can't enter an event (null = eligible). Mirrors isPlayerEligibleForCategory. */
export function blockedReason(eligible: boolean, categoryType: string | null | undefined): string | null {
  if (eligible) return null;
  if (categoryType === "mens") return "Men only";
  if (categoryType === "ladies") return "Ladies only";
  if (categoryType === "mixed") return "Needs gender on profile";
  return "Not eligible";
}

/** One server entrant item per (person, event); partner only in admin-paired doubles events. */
export function entrantsFromPicks(
  picks: Picks,
  unitKeys: string[],
  partnerIn: (id: string, key: string) => string | null,
): Array<{ memberId: string; partnerId: string | null; division: number | null }> {
  return Object.keys(picks).flatMap((id) => placesOf(picks, id).map((k) => {
    const i = unitKeys.indexOf(k);
    return { memberId: id, partnerId: partnerIn(id, k), division: i >= 0 ? i + 1 : null };
  }));
}
