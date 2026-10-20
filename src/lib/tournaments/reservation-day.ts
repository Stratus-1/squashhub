/** Future championship holds must not restrict ordinary booking on another day. */
export function championshipOnlyDay(dates: string[], selectedDay: string, isSuperAdmin: boolean): boolean {
  return !isSuperAdmin && dates.includes(selectedDay);
}