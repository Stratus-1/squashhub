/**
 * Tournament entry fee is charged PER EVENT: event fee x the events a player pays for themselves.
 * Mirrors DB `champ_reg_own_due_cents` (events with no choice = 1 legacy entry; events a partner covers are excluded).
 */
export function eventCount(divisionChoices: unknown): number {
  const n = Array.isArray(divisionChoices) ? new Set(divisionChoices.map(Number).filter((x) => Number.isFinite(x))).size : 0;
  return Math.max(1, n);
}

export function ownEvents(divisionChoices: unknown, coveredGroups: Array<number | string> = []): number {
  const groups = Array.isArray(divisionChoices) && divisionChoices.length ? Array.from(new Set(divisionChoices.map(Number))) : [0];
  const covered = new Set(coveredGroups.map(Number));
  return groups.filter((g) => !covered.has(g)).length;
}

export function entryDueCents(eventFeeCents: number, divisionChoices: unknown, coveredGroups: Array<number | string> = []): number {
  return Math.max(0, Math.round(Number(eventFeeCents) || 0)) * ownEvents(divisionChoices, coveredGroups);
}

/** "2 events x R150.00 = R300.00", or just "R150.00" for one event. */
export function feeBreakdownLabel(eventFeeCents: number, events: number, money: (cents: number) => string): string {
  if (events <= 1) return money(eventFeeCents);
  return `${events} events × ${money(eventFeeCents)} = ${money(eventFeeCents * events)}`;
}
