/** Existing league grants enable setup, never full-admin correction. */
export function canManageLeagueFixtureSetup(input: {
  isDevice: boolean;
  hasLeaguePermission: boolean;
  memberClubId?: string | null;
  fixtureClubIds: Array<string | null | undefined>;
}): boolean {
  return !input.isDevice && input.hasLeaguePermission && !!input.memberClubId
    && input.fixtureClubIds.includes(input.memberClubId);
}