/**
 * Court-slot ORDER for centrally scheduled play-off stages (QF / SF / Final with a date, time window
 * and courts). Scheduling only — never qualification, seeds, pairings, winners or progression.
 *
 * Default: lower competitive level first; within the same level Ladies before Men; strongest Men's
 * draw last. Competitive level comes from the draw's linked leagues (`leagues.level`, 1 = strongest,
 * larger = lower). When any draw lacks a usable level, or its linked leagues disagree, we WARN and keep
 * the draw order instead of guessing. An explicit organiser order (`schedule.slotOrder`) always wins.
 */

export interface SlotDivision {
  id: string;
  label: string;
  gender: "men" | "ladies" | null;
  /** Levels of the draw's linked leagues (nulls = league without a level). */
  leagueLevels: Array<number | null>;
}

export interface SlotOrder {
  source: "override" | "level" | "draw_order";
  /** Scheduling tiers, earliest first; draws in one tier may share a start time across courts. */
  tiers: string[][];
  order: string[];
  levels: Record<string, number | null>;
  warnings: string[];
}

/** One draw's competitive level, or null with a reason. */
export function divisionLevel(d: SlotDivision): { level: number | null; reason?: string } {
  const known = d.leagueLevels.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!known.length) return { level: null, reason: `${d.label}: no linked league has a level` };
  if (known.length !== d.leagueLevels.length) return { level: null, reason: `${d.label}: some linked leagues have no level` };
  const lo = Math.min(...known), hi = Math.max(...known);
  if (hi - lo > 1) return { level: null, reason: `${d.label}: linked leagues span levels ${lo}–${hi}` };
  return { level: lo };
}

export function playoffSlotOrder(divs: SlotDivision[], override?: string[] | null): SlotOrder {
  const ids = divs.map((d) => d.id);
  const levels: Record<string, number | null> = {};
  const warnings: string[] = [];
  for (const d of divs) {
    const r = divisionLevel(d);
    levels[d.id] = r.level;
    if (r.reason) warnings.push(r.reason);
    if (!d.gender) warnings.push(`${d.label}: no Ladies/Men category`);
  }
  if (override?.length) {
    const known = override.filter((id) => ids.includes(id));
    const rest = ids.filter((id) => !known.includes(id));
    const order = [...known, ...rest];
    return { source: "override", tiers: order.map((x) => [x]), order, levels, warnings: [] };
  }
  if (warnings.length) return { source: "draw_order", tiers: ids.map((x) => [x]), order: ids, levels, warnings };
  // Same level = one tier; tiers from lowest competitive level (largest number) to strongest.
  const byLevel = new Map<number, SlotDivision[]>();
  for (const d of divs) {
    const l = levels[d.id]!;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(d);
  }
  const g = (d: SlotDivision) => (d.gender === "ladies" ? 0 : 1);
  const tiers = [...byLevel.keys()].sort((a, b) => b - a).map((l) =>
    byLevel.get(l)!.slice().sort((a, b) => g(a) - g(b) || ids.indexOf(a.id) - ids.indexOf(b.id)).map((d) => d.id));
  return { source: "level", tiers, order: tiers.flat(), levels, warnings };
}

/** Sort a stage's games into slot order: draw order from `order`, then bracket position. */
export function sortGamesForSlots<T extends { group_number?: number | null; bracket_position?: number | null }>(
  games: T[], order: string[], groupOf: (id: string) => number,
): T[] {
  const rank = new Map(order.map((id, i) => [groupOf(id), i] as const));
  return games.slice().sort((a, b) =>
    (rank.get(Number(a.group_number)) ?? 99) - (rank.get(Number(b.group_number)) ?? 99) ||
    (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
}
