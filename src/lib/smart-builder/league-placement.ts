/**
 * Step-by-Step Beta: place an admin-picked player into the category /
 * subcategory whose "Specific league(s)" eligibility matches the player's own
 * league registration. Only an unambiguous single match is used; a gendered
 * category (by its name) never takes a player of the other gender.
 */
import { inferCategory, isPlayerEligibleForCategory } from "@/lib/leagues/category";

export interface PlacementUnit { key: string; base: string }
export interface PlacementElig { mode: string; leagueIds: string[] }

export function placeByLeague(args: {
  memberId: string;
  units: PlacementUnit[];
  eligOf: (key: string) => PlacementElig;
  leaguesByMember: Map<string, string[]>;
  genderByMember: Map<string, string | null>;
}): string {
  const { memberId, units, eligOf, leaguesByMember, genderByMember } = args;
  if (units.length === 1) return units[0].key;
  const mine = new Set(leaguesByMember.get(memberId) ?? []);
  if (mine.size === 0) return "";
  const gender = genderByMember.get(memberId) ?? null;
  const hits = units.filter((u) => {
    const e = eligOf(u.key);
    if (e.mode !== "leagues" || !e.leagueIds.some((id) => mine.has(id))) return false;
    const cat = inferCategory(u.base);
    return cat === "mens" || cat === "ladies" ? isPlayerEligibleForCategory(gender, cat) : true;
  });
  return hits.length === 1 ? hits[0].key : "";
}
