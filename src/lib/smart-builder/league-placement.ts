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
export interface PlacementElig { mode: string; leagueIds: string[]; alsoEveryone?: boolean }

export function placeByLeague(args: {
  memberId: string;
  units: PlacementUnit[];
  eligOf: (key: string) => PlacementElig;
  leaguesByMember: Map<string, string[]>;
  genderByMember: Map<string, string | null>;
}): string {
  const { memberId, units, eligOf, leaguesByMember, genderByMember } = args;
  const singleGender = genderByMember.get(memberId) ?? null;
  if (units.length === 1) {
    const cat = units[0].categoryType ?? inferCategory(units[0].base);
    if (isPlayerEligibleForCategory(singleGender, cat)) return units[0].key;
    // Single men's category: a woman is placed too (ladies play in men's leagues).
    return cat === "mens" && (singleGender?.toLowerCase().startsWith("f") ?? false) ? units[0].key : "";
  }
  const mine = new Set(leaguesByMember.get(memberId) ?? []);
  const gender = genderByMember.get(memberId) ?? null;
  const catOf0 = (u: PlacementUnit) => u.categoryType ?? inferCategory(u.base);
  // No league match: place into the one category of the player's own gender that is
  // open to anyone (not limited to specific leagues), e.g. a lady into Ladies.
  const openGenderFit = (): string => {
    const g = String(gender ?? "").toLowerCase();
    const want = /^(f|female|ladies|lady|women|woman)$/.test(g) ? "ladies" : /^(m|male|men|man|mens)$/.test(g) ? "mens" : null;
    if (!want) return "";
    const open = units.filter((u) => { const e = eligOf(u.key); return catOf0(u) === want && (e.mode !== "leagues" || e.alsoEveryone || e.leagueIds.length === 0); });
    return open.length === 1 ? open[0].key : "";
  };
  if (mine.size === 0) return openGenderFit();
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
  if (fallback.length === 1) return fallback[0].key;
  return leagueHits.length === 0 ? openGenderFit() : "";
}
