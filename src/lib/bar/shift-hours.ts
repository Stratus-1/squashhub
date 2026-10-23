/** Paid start never precedes attendance; normal opening uses Johannesburg wall time. */
export function paidShiftStart(entry: string, opening = "16:00", special?: string): string {
  const entered = new Date(entry);
  const day = new Date(entered.getTime() + 2 * 60 * 60_000).toISOString().slice(0, 10);
  const requested = new Date(special ?? `${day}T${opening}:00+02:00`);
  return new Date(Math.max(entered.getTime(), requested.getTime())).toISOString();
}

export function workedHours(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
}

/** Largest-remainder cent allocation: exact total, deterministic ties. */
export function splitTipsByHours(total: number, people: { id: string; hours: number }[]) {
  const sorted = people.filter(p => p.hours > 0).sort((a, b) => a.id.localeCompare(b.id));
  const hours = sorted.reduce((sum, p) => sum + p.hours, 0);
  if (!hours) throw new Error("No paid hours logged; management review required");
  const cents = Math.round(total * 100);
  const shares = sorted.map(p => ({ id: p.id, cents: Math.floor(cents * p.hours / hours), remainder: cents * p.hours / hours % 1 }));
  const remaining = cents - shares.reduce((sum, p) => sum + p.cents, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  ranked.slice(0, remaining).forEach(p => { p.cents += 1; });
  return shares.map(p => ({ id: p.id, amount: p.cents / 100 }));
}