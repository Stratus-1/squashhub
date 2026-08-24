/**
 * Tournament seeding order.
 *
 * The authoritative ranking source for a club tournament division is the
 * club ladder — `club_members.ladder_position` (1 = strongest). It is the
 * single source of truth for rank across SquashHub, so a division's entrant
 * list is ordered by it, ascending, and the `#n` badge shown on each row IS
 * that global club ladder position (it is not a per-division number).
 *
 * Rules:
 *  - Entrants with a ladder position sort first, ascending (#3 before #9).
 *  - Entrants with no ladder position are kept in the division but pushed
 *    AFTER every ranked entrant and flagged as unranked. A rank is never
 *    invented for them.
 *  - A player entered in several divisions appears once per division and
 *    carries the same underlying ladder rank into each — no dedupe.
 *  - Drag-and-drop only becomes the seed order for a division the organiser
 *    actually reordered (`manual`), never silently.
 */

export interface SeedableEntrant {
  id: string;
  name?: string | null;
  ladder_position?: number | null;
  profiles?: { name?: string | null } | null;
}

export const entrantName = (e: SeedableEntrant): string =>
  (e.name || e.profiles?.name || "").trim();

/** True when the entrant has no usable ladder rank. */
export const isUnranked = (e: SeedableEntrant): boolean =>
  !(typeof e.ladder_position === "number" && e.ladder_position > 0);

/** Ladder-first comparison, unranked last, then alphabetical for stability. */
export function compareBySeed(a: SeedableEntrant, b: SeedableEntrant): number {
  const ar = isUnranked(a) ? Number.POSITIVE_INFINITY : (a.ladder_position as number);
  const br = isUnranked(b) ? Number.POSITIVE_INFINITY : (b.ladder_position as number);
  if (ar !== br) return ar - br;
  return entrantName(a).localeCompare(entrantName(b));
}

/**
 * Order one division's entrants.
 *
 * @param entrants   entrants already allocated to this division
 * @param manual     the organiser deliberately reordered this division
 * @param manualOrder explicit id order captured from drag-and-drop
 */
export function sortDivisionEntrants<T extends SeedableEntrant>(
  entrants: T[],
  opts?: { manual?: boolean; manualOrder?: string[] },
): T[] {
  const list = [...entrants];
  if (opts?.manual && opts.manualOrder?.length) {
    const idx = new Map(opts.manualOrder.map((id, i) => [id, i]));
    return list.sort((a, b) => {
      const ai = idx.get(a.id);
      const bi = idx.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return compareBySeed(a, b);
    });
  }
  return list.sort(compareBySeed);
}

/** Seed preview rows: 1-based seed plus the ladder rank behind it. */
export function seedPreview<T extends SeedableEntrant>(ordered: T[]) {
  return ordered.map((e, i) => ({
    seed: i + 1,
    id: e.id,
    name: entrantName(e),
    ladderPosition: isUnranked(e) ? null : (e.ladder_position as number),
    unranked: isUnranked(e),
  }));
}

/**
 * Write one division's new drag order back into the global entrant order.
 *
 * The global order is a flat id list shared by every division. A division's
 * reordered ids are written into the slots its members already occupy, which
 * only works when EVERY member of that division is present in the global list
 * exactly once — otherwise there are fewer slots than ids and the last dragged
 * entrant is silently dropped (the "player disappeared after dragging across
 * pools" bug). So the list is normalised first: unknown ids appended, stale
 * ids and duplicates removed.
 *
 * @param current    the existing global order (may be empty/stale)
 * @param allIds     every entrant currently in the wizard, in fallback order
 * @param reordered  this division's ids in their new visual order
 */
export function applyDivisionOrder(
  current: string[],
  allIds: string[],
  reordered: string[],
): string[] {
  const valid = new Set(allIds);
  const base: string[] = [];
  const seen = new Set<string>();
  for (const id of current) {
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    base.push(id);
  }
  for (const id of allIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    base.push(id);
  }
  const group = reordered.filter((id) => valid.has(id));
  const groupSet = new Set(group);
  let i = 0;
  return base.map((id) => (groupSet.has(id) ? group[i++] ?? id : id));
}
