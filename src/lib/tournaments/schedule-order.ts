export type ScheduledTournamentMatch = {
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  court?: { name?: string | null } | null;
  id?: string | null;
};

/**
 * Bells is played as one continuous programme, so its public schedule is
 * ordered only by date, time and court — never by generated round number.
 */
export function chronologicalTournamentMatches<T extends ScheduledTournamentMatch>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const aSlot = `${a.scheduled_date || "9999-12-31"} ${a.scheduled_time || "23:59:59"}`;
    const bSlot = `${b.scheduled_date || "9999-12-31"} ${b.scheduled_time || "23:59:59"}`;
    const slotOrder = aSlot.localeCompare(bSlot);
    if (slotOrder !== 0) return slotOrder;

    const courtOrder = String(a.court?.name || "").localeCompare(
      String(b.court?.name || ""),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
    if (courtOrder !== 0) return courtOrder;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}