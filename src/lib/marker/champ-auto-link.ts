/**
 * Decides whether a live-scorer save may auto-link to an unplayed Club Champs
 * fixture between the same two players. Only games explicitly set up as a
 * Club Champs / tournament game may be posted onto a tournament fixture;
 * friendly, ladder and league games must never complete one.
 */
export function mayAutoLinkChampFixture(opts: {
  matchType?: string | null;
  isForfeit: boolean;
  isDoubles: boolean;
  playerAMemberId?: string | null;
  playerBMemberId?: string | null;
  clubId?: string | null;
}): boolean {
  if (opts.matchType !== "club_champs" && opts.matchType !== "tournament") return false;
  if (opts.isForfeit || opts.isDoubles) return false;
  return Boolean(opts.playerAMemberId && opts.playerBMemberId && opts.clubId);
}
