/** Shortcut visibility only; the counter still validates personal PIN authority. */
export function canShowCounterEntry(hasClubAccount: boolean, token: string | null, operator: string | null): boolean {
  return hasClubAccount || Boolean(token?.trim() && operator?.trim());
}