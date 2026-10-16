/** Allocation intent only; never grants permissions or changes self-entry. */
export interface AllocationRule {
  mode: string;
  leagueIds: string[];
  alsoEveryone?: boolean;
  adminOverride?: boolean;
}

export function adminCanOverride(rule: AllocationRule): boolean {
  return rule.adminOverride === true;
}

/** Only league membership is overridable; category eligibility must still hold. */
export function adminPlacementAllowed(rule: AllocationRule, memberLeagues: string[], categoryEligible: boolean): boolean {
  return categoryEligible && (rule.mode !== "leagues" || rule.alsoEveryone === true || rule.leagueIds.length === 0 ||
    adminCanOverride(rule) || memberLeagues.some((id) => rule.leagueIds.includes(id)));
}