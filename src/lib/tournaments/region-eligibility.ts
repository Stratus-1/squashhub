/**
 * Region-wide division eligibility.
 *
 * A club tournament draws its divisions from the host club's own league rows.
 * A REGIONAL (association) or federation tournament means something different:
 * "6th League" is the region's 6th league, played by every affiliated club, so a
 * player registered in his OWN club's 6th league for the same season is exactly
 * the population the division draws from.
 *
 * The persisted division sources are never rewritten — they keep pointing at the
 * host club's league ids. Instead the POPULATION behind each source league id is
 * widened to every equivalent league in the region (same level, same season, and
 * the same reserve/first-team status). Eligibility, the "not in the league(s)
 * their division draws from" warning and the admin override all keep working
 * unchanged on top of that widened map.
 */

export interface HostLeagueRef {
  id: string;
  level?: number | null;
  season_year?: number | null;
  is_reserve?: boolean | null;
}

export interface RegionLeagueRef {
  league_id: string;
  level?: number | null;
  season_year?: number | null;
  is_reserve?: boolean | null;
}

function matchKey(level: unknown, season: unknown, reserve: unknown): string | null {
  if (level == null) return null; // a league with no level can't be matched across clubs
  return `${season ?? "no-season"}::${level}::${reserve ? "r" : "m"}`;
}

/**
 * Host league id → every league id in the region that means the same thing
 * (including the host league itself). Leagues with no level are never matched,
 * because "unassigned" is not a shared meaning across clubs.
 */
export function regionEquivalentLeagueIds(
  hostLeagues: HostLeagueRef[],
  regionLeagues: RegionLeagueRef[],
): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  (regionLeagues || []).forEach((r) => {
    const k = matchKey(r.level, r.season_year, r.is_reserve);
    if (!k || !r.league_id) return;
    const list = byKey.get(k) || [];
    if (!list.includes(r.league_id)) list.push(r.league_id);
    byKey.set(k, list);
  });

  const out = new Map<string, string[]>();
  (hostLeagues || []).forEach((h) => {
    if (!h.id) return;
    const k = matchKey(h.level, h.season_year, h.is_reserve);
    const ids = k ? [...(byKey.get(k) || [])] : [];
    if (!ids.includes(h.id)) ids.push(h.id);
    out.set(h.id, ids);
  });
  return out;
}

/** All region league ids that need their players resolved, de-duplicated. */
export function regionLeagueIdsToResolve(equivalents: Map<string, string[]>): string[] {
  const seen = new Set<string>();
  equivalents.forEach((ids, hostId) => {
    ids.forEach((id) => {
      if (id !== hostId) seen.add(id);
    });
  });
  return Array.from(seen);
}

/**
 * The host club's registrations, widened with every equivalent region league's
 * players, keyed by the HOST league id the divisions already point at.
 */
export function widenRegistrationsRegionwide(args: {
  base: Map<string, string[]>;
  equivalents: Map<string, string[]>;
  regionMembersByLeague: Map<string, string[]>;
}): Map<string, string[]> {
  const { base, equivalents, regionMembersByLeague } = args;
  if (!equivalents || equivalents.size === 0) return base;
  const out = new Map<string, string[]>(base);
  equivalents.forEach((leagueIds, hostId) => {
    const seen = new Set<string>(out.get(hostId) || []);
    const merged = [...(out.get(hostId) || [])];
    leagueIds.forEach((lid) => {
      (regionMembersByLeague.get(lid) || []).forEach((mid) => {
        if (!mid || seen.has(mid)) return;
        seen.add(mid);
        merged.push(mid);
      });
    });
    out.set(hostId, merged);
  });
  return out;
}
