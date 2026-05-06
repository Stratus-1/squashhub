/**
 * useNsa — React Query wrappers around the `nsa-proxy` edge function.
 *
 * The proxy forwards to admin.northerns.co.za (NSA's PHP admin) with `?json`
 * appended. All endpoints require an authenticated SquashHub user.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NsaTeamRef = {
  id: string;
  code: string;
  club: string;
  club_id: string;
};

export type NsaFixture = {
  id: string;
  category: string; // "Mens" | "Ladies" | "Mixed" | "Junior"
  league: string; // "1st", "2nd", ...
  league_id: string;
  round: string;
  players: string; // squad size (4 for adults, varies for juniors)
  date: string; // YYYY-MM-DD
  venue: string;
  venue_id: string;
  team1: NsaTeamRef;
  team2: NsaTeamRef;
  status: string; // "running" | "completed" | ...
};

export type NsaTeamPlayer = {
  code: string; // "NSF1234"
  name: string;
  surname: string;
  result_summary: { won: string | number; lost: string | number; played: string | number };
};

export type NsaTeam = {
  club: string;
  club_id: string;
  code: string;
  result_summary: {
    won: string | number;
    lost: string | number;
    played: string | number;
    remaining: number;
    total: string | number;
  };
  players: NsaTeamPlayer[];
};

async function callProxy<T>(
  endpoint: "fixtures" | "team",
  params: Record<string, string | number | undefined>
): Promise<T> {
  const cleanParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) cleanParams[k] = String(v);
  }
  const { data, error } = await supabase.functions.invoke("nsa-proxy", {
    body: { endpoint, params: cleanParams },
  });
  if (error) throw new Error(error.message || "NSA proxy call failed");
  if (data?.error) throw new Error(data.error);
  return data?.data as T;
}

/** Fetch fixtures filtered by league season ID (e.g. "s79") and optional NSA club ID (e.g. "6").
 *  status: omit for current/upcoming round only; pass "completed" to retrieve the
 *  full season including past rounds. */
export function useNsaFixtures(opts: { league?: string; club?: string; status?: string; enabled?: boolean }) {
  const { league, club, status, enabled = true } = opts;
  return useQuery({
    queryKey: ["nsa-fixtures", league, club, status],
    queryFn: () => callProxy<NsaFixture[]>("fixtures", { league, club, status }),
    enabled: enabled && !!league,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Fetch a single team's roster + W/L from NSA. */
export function useNsaTeam(teamId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["nsa-team", teamId],
    queryFn: () => callProxy<NsaTeam>("team", { team: teamId! }),
    enabled: enabled && !!teamId,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Imperative fetch for one-off lookups. */
export async function fetchNsaFixtures(opts: { league: string; club?: string }): Promise<NsaFixture[]> {
  return callProxy<NsaFixture[]>("fixtures", { league: opts.league, club: opts.club });
}

/** Current NSA season — TODO: make this dynamic / configurable per association. */
export const NSA_CURRENT_SEASON = "s79";

/** Normalize a team code for matching: uppercase, strip non-alphanumeric. */
const normalizeCode = (s: string | null | undefined) =>
  (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Resolve a local team code (e.g. "CSI006") to NSA's numeric team_id by scanning
 * the season's fixtures, then fetch that team's roster. No DB column required —
 * codes are the contract since the club assigns them.
 */
export function useNsaTeamByCode(code: string | null | undefined, enabled = true) {
  const { data: fixtures } = useNsaFixtures({
    league: NSA_CURRENT_SEASON,
    status: "completed",
    enabled: enabled && !!code,
  });

  const teamId = (() => {
    if (!code || !fixtures) return null;
    const target = normalizeCode(code);
    if (!target) return null;
    for (const f of fixtures) {
      for (const t of [f.team1, f.team2]) {
        if (t?.code && normalizeCode(t.code) === target) return String(t.id);
      }
    }
    return null;
  })();

  return useNsaTeam(teamId, enabled && !!teamId);
}


