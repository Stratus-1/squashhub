/** Existing league grants enable fixture setup at the holder's own club. */
export function canManageLeagueFixtureSetup(input: {
  isDevice: boolean;
  hasLeaguePermission: boolean;
  memberClubId?: string | null;
  fixtureClubIds: Array<string | null | undefined>;
}): boolean {
  return !input.isDevice && input.hasLeaguePermission && !!input.memberClubId
    && input.fixtureClubIds.includes(input.memberClubId);
}

/**
 * Who may re-open and edit scores on a submitted / past league scorecard.
 * Club admins (incl. super admin), NSA captains, and holders of the club's
 * Leagues permission for a fixture played by their own club (owner request,
 * 11 Nov 2026: Vian at Nelspruit). Device links never qualify.
 */
export function canEditSubmittedLeagueScores(input: {
  isDevice: boolean;
  isClubAdmin: boolean;
  isNsaCaptain?: boolean;
  hasLeaguePermission: boolean;
  memberClubId?: string | null;
  fixtureClubIds: Array<string | null | undefined>;
}): boolean {
  if (input.isDevice) return false;
  if (input.isClubAdmin || input.isNsaCaptain) return true;
  return canManageLeagueFixtureSetup(input);
}
