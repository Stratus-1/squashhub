/** Clubs where the new tournament views may appear (still gated by club_beta_features switches). */
export const TOURNAMENT_VIEW_PILOT_CLUBS = new Set([
  "11111111-1111-1111-1111-111111111111", // Riverside
  "d8397b8a-60d3-4c4b-afee-25dab218bf19", // Uitsig
]);
export const isTournamentViewPilotClub = (id?: string | null) => !!id && TOURNAMENT_VIEW_PILOT_CLUBS.has(id);
