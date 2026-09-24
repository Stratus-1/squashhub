/**
 * Event scope → audience → seeding coverage → expected entries.
 * The opening steps of the Smart Builder. Owner and audience are separate:
 * e.g. owner = NSA, scope = regional, audience = selected clubs.
 * Organisation hierarchy itself is NOT modelled here; callers pass the
 * subtree resolved by the existing organisation/invite-scope helpers.
 */
export type EventScope = "club" | "regional" | "national";

export type AudienceKind =
  | "all_members" | "league_players" | "selected_members" | "open_public"
  | "all_clubs" | "selected_clubs" | "selected_leagues" | "selected_regions" | "ranked_players" | "selected_players";

export const AUDIENCE_OPTIONS: Record<EventScope, Array<{ value: AudienceKind; label: string }>> = {
  club: [
    { value: "all_members", label: "All club members" },
    { value: "league_players", label: "League players only" },
    { value: "selected_members", label: "Selected members/groups" },
    { value: "open_public", label: "Open/public" },
  ],
  regional: [
    { value: "all_clubs", label: "All clubs under the association" },
    { value: "selected_clubs", label: "Selected clubs" },
    { value: "league_players", label: "League players only (eligible clubs)" },
    { value: "selected_leagues", label: "Selected leagues/divisions" },
    { value: "selected_players", label: "Selected players" },
  ],
  national: [
    { value: "all_clubs", label: "All affiliated regions/clubs" },
    { value: "selected_regions", label: "Selected regions" },
    { value: "selected_clubs", label: "Selected clubs" },
    { value: "ranked_players", label: "Ranked/league players only" },
    { value: "selected_players", label: "Selected players" },
  ],
};

export type SeedingSourceKey = "national" | "regional" | "league_strength" | "club_ladder" | "match_history" | "manual";

export const SEEDING_LABELS: Record<SeedingSourceKey, string> = {
  national: "National / SportyHQ ranking",
  regional: "Regional ranking",
  league_strength: "Regional league/division strength",
  club_ladder: "Club ladder",
  match_history: "SquashHub match history",
  manual: "Manual seed",
};

/** Recommended relevance by scope — a default, never a rule. */
export function seedingPriority(scope: EventScope): SeedingSourceKey[] {
  if (scope === "club") return ["club_ladder", "regional", "national", "match_history", "league_strength", "manual"];
  if (scope === "regional") return ["regional", "league_strength", "national", "club_ladder", "match_history", "manual"];
  return ["national", "regional", "league_strength", "club_ladder", "match_history", "manual"];
}

export function isAudienceValid(scope: EventScope | null | undefined, kind: AudienceKind | null | undefined) {
  return !!scope && !!kind && AUDIENCE_OPTIONS[scope].some((o) => o.value === kind);
}

export interface Coverage { eligible: number | null; bySource: Partial<Record<SeedingSourceKey, number>> }

/** Recommend the most relevant source with meaningful coverage (≥ 50%). Unranked players are never given invented values. */
export function recommendSeeding(scope: EventScope, cov: Coverage): { source: SeedingSourceKey; covered: number; missing: number } | null {
  if (!cov.eligible) return null;
  for (const s of seedingPriority(scope)) {
    const n = cov.bySource[s] ?? 0;
    if (s !== "manual" && n / cov.eligible >= 0.5) return { source: s, covered: n, missing: cov.eligible - n };
  }
  return { source: "manual", covered: 0, missing: cov.eligible };
}

export function coverageSentence(scope: EventScope, cov: Coverage): string {
  if (cov.eligible == null) return "Eligible audience not counted yet.";
  const parts = seedingPriority(scope).filter((s) => s !== "manual" && cov.bySource[s] != null)
    .map((s) => `${SEEDING_LABELS[s]} for ${cov.bySource[s]}`);
  return `Eligible audience: ${cov.eligible} players.${parts.length ? ` ${parts.join("; ")}.` : ""} Approximately how many entries do you expect?`;
}
