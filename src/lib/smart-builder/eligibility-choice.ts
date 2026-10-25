export interface EligibilityChoice {
  mode: "everyone" | "leagues" | "manual";
  leagueIds: string[];
  placement: "auto" | "choose";
  alsoPick?: boolean;
  alsoEveryone?: boolean;
  adminOverride?: boolean;
}

/** Remove the league audience without removing manual picks or widening a manual-only audience. */
export function withoutLeagueChoice(e: EligibilityChoice): EligibilityChoice {
  if (e.alsoPick) return { ...e, mode: "manual", alsoPick: false, placement: "choose" };
  return { ...e, mode: "everyone", alsoPick: false, alsoEveryone: false, placement: "choose" };
}