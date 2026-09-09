/**
 * Region-wide league team picker for tournament invitations.
 *
 * A regional (association) or federation tournament must let the organiser
 * invite, say, every 6th and 7th league player in the region — not just the
 * host club's own teams. The host club's `leagues` rows only cover its own
 * teams, so the cross-club list comes from the security-definer RPC
 * `tournament_invite_league_tree`, which applies the same eligibility scope and
 * organiser rights as the rest of the invite step and returns counts only (no
 * contact details).
 */

import { supabase } from "@/integrations/supabase/client";
import type { LeagueTreeGroup } from "@/lib/tournaments/league-tree";
import { isReserveLeague } from "@/lib/tournaments/league-tree";

export interface ScopeLeagueRow {
  league_id: string;
  league_name: string;
  level: number | null;
  season_year: number | null;
  is_reserve: boolean;
  club_id: string;
  club_name: string;
  association_name: string | null;
  player_count: number;
  contactable_count: number;
}

function levelLabel(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix} League`;
}

/**
 * One group per league LEVEL across the whole region, with a child per club
 * team. Ticking "6th League" therefore selects every club's 6th league team.
 */
export function buildScopeLeagueTree(rows: ScopeLeagueRow[]): LeagueTreeGroup[] {
  const groups = new Map<string, LeagueTreeGroup>();
  (rows || []).forEach((r) => {
    const level = r.level ?? null;
    const season = r.season_year ?? null;
    const key = `${season ?? "no-season"}::${level ?? "unassigned"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: level != null ? levelLabel(level) : "Needs league assignment",
        assocName: r.association_name || "Region",
        tierNumber: level ?? 999,
        seasonYear: season,
        needsAssignment: level == null,
        children: [],
      };
      groups.set(key, g);
    }
    const reachable = r.contactable_count ?? 0;
    g.children.push({
      id: r.league_id,
      // The organiser is choosing across clubs here, so the club name leads and
      // the reachable count makes an empty team obvious before sending.
      name: `${r.club_name} — ${r.league_name} (${reachable} reachable)`,
      isReserve: r.is_reserve ?? isReserveLeague(r.league_name),
    });
  });
  const out = Array.from(groups.values());
  out.forEach((g) => g.children.sort((a, b) => a.name.localeCompare(b.name)));
  return out.sort(
    (a, b) => (b.seasonYear ?? 0) - (a.seasonYear ?? 0) || a.tierNumber - b.tierNumber,
  );
}

export async function fetchScopeLeagueTree(input: {
  tournamentId?: string | null;
  clubId?: string | null;
  scope?: string | null;
}): Promise<ScopeLeagueRow[]> {
  const { data, error } = await (supabase as any).rpc("tournament_invite_league_tree", {
    p_tournament_id: input.tournamentId || null,
    p_club_id: input.clubId || null,
    p_scope: input.scope || null,
  });
  if (error) throw error;
  return ((data as ScopeLeagueRow[]) || []).filter((r) => !!r.league_id);
}

/**
 * Resolve ticked teams into the members who will actually receive the invite.
 * Only players with an email or phone on file are returned — an invitation the
 * platform cannot deliver is not an invitation.
 */
export async function fetchScopeLeagueMemberIds(input: {
  tournamentId?: string | null;
  clubId?: string | null;
  scope?: string | null;
  leagueIds: string[];
  includeReserves?: boolean;
}): Promise<Map<string, string[]>> {
  const byLeague = new Map<string, string[]>();
  if (!input.leagueIds || input.leagueIds.length === 0) return byLeague;
  const { data, error } = await (supabase as any).rpc("tournament_invite_league_member_ids", {
    p_tournament_id: input.tournamentId || null,
    p_club_id: input.clubId || null,
    p_scope: input.scope || null,
    p_league_ids: input.leagueIds,
    p_include_reserves: input.includeReserves !== false,
    p_contactable_only: true,
  });
  if (error) throw error;
  ((data as Array<{ member_id: string; league_id: string }>) || []).forEach((r) => {
    if (!r.member_id || !r.league_id) return;
    const list = byLeague.get(r.league_id) || [];
    list.push(r.member_id);
    byLeague.set(r.league_id, list);
  });
  return byLeague;
}
