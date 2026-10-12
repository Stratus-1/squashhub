/**
 * Step-by-Step Beta: place an admin-picked player into the category /
 * subcategory whose "Specific league(s)" eligibility matches the player's own
 * league registration. Only an unambiguous single match is used. A gendered
 * category (by its name) prefers the matching gender, but a woman registered
 * in a men's league is placed in the men's category her league feeds (clubs
 * run ladies in men's leagues); a man is never placed in a ladies category.
 */
import { inferCategory, isPlayerEligibleForCategory, type CompetitionCategory } from "@/lib/leagues/category";

export interface PlacementUnit { key: string; base: string; categoryType?: CompetitionCategory | null }
export interface PlacementElig { mode: string; leagueIds: string[] }

export function placeByLeague(args: {
  memberId: string;
  units: PlacementUnit[];
  eligOf: (key: string) => PlacementElig;
  leaguesByMember: Map<string, string[]>;
  genderByMember: Map<string, string | null>;
}): string {
  const { memberId, units, eligOf, leaguesByMember, genderByMember } = args;
  if (units.length === 1) return isPlayerEligibleForCategory(genderByMember.get(memberId), units[0].categoryType ?? inferCategory(units[0].base)) ? units[0].key : "";
  const mine = new Set(leaguesByMember.get(memberId) ?? []);
  if (mine.size === 0) return "";
  const gender = genderByMember.get(memberId) ?? null;
  const leagueHits = units.filter((u) => {
    const e = eligOf(u.key);
    return e.mode === "leagues" && e.leagueIds.some((id) => mine.has(id));
  });
  const catOf = (u: PlacementUnit) => u.categoryType ?? inferCategory(u.base);
  // Preferred: the category's gender matches the player (or the category is open).
  const preferred = leagueHits.filter((u) => {
    const cat = catOf(u);
    return cat === "mens" || cat === "ladies" ? isPlayerEligibleForCategory(gender, cat) : true;
  });
  if (preferred.length === 1) return preferred[0].key;
  if (preferred.length > 1) return "";
  // Fallback: a woman whose only league match is a men's category plays in it
  // (ladies enter men's leagues at several clubs). Men never fall back into ladies.
  const female = gender?.toLowerCase().startsWith("f") ?? false;
  const fallback = female ? leagueHits.filter((u) => catOf(u) === "mens") : [];
  return fallback.length === 1 ? fallback[0].key : "";
}
