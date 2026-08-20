/**
 * Hierarchical model for the tournament "Players from" selector.
 *
 * The club's `leagues` rows are really TEAM entries ("Acacia Thorns",
 * "1st L Reserves"). Organisers think in league LEVELS first ("1st League",
 * "2nd League") and only then about the teams inside that level, so the
 * selector groups the same canonical league ids into a two-level tree:
 *
 *   1st League            (parent — 4 teams)
 *     ├ Acacia Thorns     (child, selectable)
 *     ├ Apex Eagles
 *     └ 1st L Reserves    (child, flagged as reserves)
 *
 * Selection is ALWAYS a set of stable league ids (the same ids the league
 * mapping fix canonicalised). A parent is never a selectable entity of its own
 * — ticking it simply selects all of its children, so everything downstream
 * (player loading, invitations, eligibility, seeding, draw generation) keeps
 * consuming exactly one kind of id.
 */

export interface LeagueTreeInput {
  id: string;
  name: string;
  association_id?: string | null;
  assocName?: string | null;
  /** Canonical level (1 = 1st League) when known — stored or resolved. */
  level?: number | null;
  /** Competition year this row belongs to, when known. */
  seasonYear?: number | null;
  /** Reserves squad flag when known (falls back to the name test). */
  isReserve?: boolean | null;
}

export interface LeagueTreeChild {
  id: string;
  name: string;
  isReserve: boolean;
}

export interface LeagueTreeGroup {
  /** Stable key for expand/collapse state. */
  key: string;
  /** Organiser-facing level label, e.g. "1st League". */
  label: string;
  assocName: string;
  /** Numeric tier used for ordering (999 when unknown). */
  tierNumber: number;
  /** Season this group belongs to (null when the club has no season data). */
  seasonYear?: number | null;
  /** True for the small catch-all group of rows with no confident level. */
  needsAssignment?: boolean;
  children: LeagueTreeChild[];
}


const RESERVE_RE = /\breserves?\b/i;

/** Does this league row represent a reserves pool rather than a team? */
export function isReserveLeague(name: string): boolean {
  return RESERVE_RE.test(String(name || ""));
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

/** Extract the league level from a tier or team name ("3rd L Reserves" → 3). */
export function levelFromName(name: string): number | null {
  const s = String(name || "").toLowerCase();
  const digit = s.match(/(\d+)\s*(?:st|nd|rd|th)?\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n > 0 && n < 100) return n;
  }
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return n;
  }
  return null;
}

function levelLabel(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix} League`;
}

/**
 * Build the tree.
 *
 * `tierByLeagueId` is the fixture-derived tier map ("1st League"). Rows without
 * a derived tier — typically reserves pools, which play no fixtures — are
 * attached to the level named in their own title. Anything that still cannot be
 * placed becomes its own single-child group so no league is ever hidden.
 */
export function buildLeagueTree(
  leagues: LeagueTreeInput[],
  tierByLeagueId?: Map<string, string> | null,
): LeagueTreeGroup[] {
  const groups = new Map<string, LeagueTreeGroup>();
  const orphanGroups = new Map<string, LeagueTreeGroup>();

  const ensure = (
    key: string,
    label: string,
    assocName: string,
    tierNumber: number,
    seasonYear: number | null,
  ) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, assocName, tierNumber, seasonYear, children: [] };
      groups.set(key, g);
    }
    return g;
  };

  const childOf = (l: LeagueTreeInput): LeagueTreeChild => ({
    id: l.id,
    name: l.name,
    isReserve: l.isReserve ?? isReserveLeague(l.name),
  });

  const placed: Array<{
    league: LeagueTreeInput;
    key: string;
    label: string;
    assoc: string;
    level: number;
    season: number | null;
  }> = [];
  const unplaced: LeagueTreeInput[] = [];

  leagues.forEach((l) => {
    const assoc = l.assocName || "League";
    const season = l.seasonYear ?? null;
    // Stored canonical level wins; a season keeps two years with the same level apart.
    if (l.level != null) {
      placed.push({
        league: l,
        key: `${l.association_id || assoc}::${season ?? "no-season"}::L${l.level}`,
        label: levelLabel(l.level),
        assoc,
        level: l.level,
        season,
      });
      return;
    }
    const tier = tierByLeagueId?.get(l.id) || null;
    if (tier) {
      const level = levelFromName(tier) ?? 999;
      placed.push({
        league: l,
        key: `${l.association_id || assoc}::${season ?? "no-season"}::${tier}`,
        label: tier,
        assoc,
        level,
        season,
      });
    } else {
      unplaced.push(l);
    }
  });

  placed.forEach((p) => {
    const g = ensure(p.key, p.label, p.assoc, p.level, p.season);
    g.children.push(childOf(p.league));
  });

  // Second pass: attach leftovers (reserves and un-fixtured teams) to the level
  // their own name implies, when such a level exists in the same association
  // AND the same season — never leak a team across years.
  unplaced.forEach((l) => {
    const assoc = l.assocName || "League";
    const season = l.seasonYear ?? null;
    const level = levelFromName(l.name);
    const target =
      level != null
        ? Array.from(groups.values()).find(
            (g) =>
              g.tierNumber === level &&
              g.assocName === assoc &&
              (g.seasonYear ?? null) === season,
          )
        : undefined;
    if (target) {
      target.children.push(childOf(l));
      return;
    }
    if (level != null) {
      const key = `${l.association_id || assoc}::${season ?? "no-season"}::level-${level}`;
      const g = ensure(key, levelLabel(level), assoc, level, season);
      g.children.push(childOf(l));
      return;
    }
    // Never flatten the selector: everything we cannot place confidently is
    // collected in ONE small "Needs league assignment" group per association.
    const key = `unassigned::${l.association_id || assoc}::${season ?? "no-season"}`;
    let g = orphanGroups.get(key);
    if (!g) {
      g = {
        key,
        label: "Needs league assignment",
        assocName: assoc,
        tierNumber: 9999,
        seasonYear: season,
        needsAssignment: true,
        children: [],
      };
      orphanGroups.set(key, g);
    }
    g.children.push(childOf(l));
  });


  const sorted = Array.from(groups.values()).sort(
    (a, b) =>
      (b.seasonYear ?? 0) - (a.seasonYear ?? 0) ||
      a.assocName.localeCompare(b.assocName) ||
      a.tierNumber - b.tierNumber ||
      a.label.localeCompare(b.label),
  );
  sorted.forEach((g) =>
    g.children.sort(
      (a, b) => Number(a.isReserve) - Number(b.isReserve) || a.name.localeCompare(b.name),
    ),
  );
  const orphans = Array.from(orphanGroups.values()).sort(
    (a, b) => a.assocName.localeCompare(b.assocName) || (b.seasonYear ?? 0) - (a.seasonYear ?? 0),
  );
  orphans.forEach((g) =>
    g.children.sort(
      (a, b) => Number(a.isReserve) - Number(b.isReserve) || a.name.localeCompare(b.name),
    ),
  );
  return [...sorted, ...orphans];
}

/** Distinct seasons present in a tree, newest first. */
export function seasonsInTree(groups: LeagueTreeGroup[]): number[] {
  const set = new Set<number>();
  groups.forEach((g) => { if (g.seasonYear != null) set.add(g.seasonYear); });
  return Array.from(set).sort((a, b) => b - a);
}

/**
 * Restrict the tree to one season. Groups with no season at all are kept, so a
 * club that has never had season data behaves exactly as before.
 */
export function filterTreeBySeason(
  groups: LeagueTreeGroup[],
  season: number | null,
): LeagueTreeGroup[] {
  if (season == null) return groups;
  return groups.filter((g) => g.seasonYear == null || g.seasonYear === season);
}


export type GroupSelectionState = "none" | "some" | "all";

/** Parent checkbox state — "some" drives the indeterminate rendering. */
export function groupSelectionState(group: LeagueTreeGroup, selected: Iterable<string>): GroupSelectionState {
  const set = selected instanceof Set ? selected : new Set(selected);
  if (group.children.length === 0) return "none";
  const on = group.children.filter((c) => set.has(c.id)).length;
  if (on === 0) return "none";
  return on === group.children.length ? "all" : "some";
}

/** Ticking a parent selects every child; untick clears them (partial → all). */
export function toggleGroup(group: LeagueTreeGroup, selected: string[]): string[] {
  const state = groupSelectionState(group, selected);
  const ids = group.children.map((c) => c.id);
  if (state === "all") return selected.filter((id) => !ids.includes(id));
  const next = [...selected];
  ids.forEach((id) => { if (!next.includes(id)) next.push(id); });
  return next;
}

export function toggleChild(id: string, selected: string[]): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** Search matches league level names AND child team names. */
export function filterLeagueTree(groups: LeagueTreeGroup[], query: string): LeagueTreeGroup[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return groups;
  const out: LeagueTreeGroup[] = [];
  groups.forEach((g) => {
    if (g.label.toLowerCase().includes(q)) { out.push(g); return; }
    const children = g.children.filter((c) => c.name.toLowerCase().includes(q));
    if (children.length > 0) out.push({ ...g, children });
  });
  return out;
}

export interface TreeSelectionSummary {
  leagues: number;
  teams: number;
  text: string;
}

/** "2 leagues, 7 teams selected" — counts only ids that exist in the tree. */
export function summarizeTreeSelection(groups: LeagueTreeGroup[], selected: Iterable<string>): TreeSelectionSummary {
  const set = selected instanceof Set ? selected : new Set(selected);
  let leagues = 0;
  let teams = 0;
  groups.forEach((g) => {
    const on = g.children.filter((c) => set.has(c.id)).length;
    if (on > 0) { leagues += 1; teams += on; }
  });
  const text =
    teams === 0
      ? "No teams selected"
      : `${leagues} league${leagues === 1 ? "" : "s"}, ${teams} team${teams === 1 ? "" : "s"} selected`;
  return { leagues, teams, text };
}

/** All league ids in the tree — used by the explicit "All leagues" option. */
export function allTreeLeagueIds(groups: LeagueTreeGroup[]): string[] {
  const out: string[] = [];
  groups.forEach((g) => g.children.forEach((c) => { if (!out.includes(c.id)) out.push(c.id); }));
  return out;
}
