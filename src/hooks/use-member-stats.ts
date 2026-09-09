import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Personal match history and stats for one member.
 *
 * Everything comes from the existing result records (club matches, club
 * championships/tournaments, league rubbers and imported league history)
 * through the `get_member_match_history` family of RPCs, so the tiles and the
 * drill-down list can never disagree.
 */

export type StatCategory = "club" | "league" | "regional" | "national" | "total";

export const STAT_CATEGORY_LABELS: Record<StatCategory, string> = {
  club: "Club",
  league: "League",
  regional: "Regional",
  national: "National",
  total: "Total",
};

export const STAT_CATEGORY_ORDER: StatCategory[] = [
  "club",
  "league",
  "regional",
  "national",
  "total",
];

export interface MemberStatRow {
  category: StatCategory;
  played: number;
  won: number;
  lost: number;
  winRate: number;
}

export interface MemberMatchRow {
  source: string;
  match_id: string;
  category: StatCategory;
  season_year: number | null;
  played_on: string | null;
  opponent_member_id: string | null;
  opponent_name: string;
  event_label: string;
  score: string | null;
  won: boolean;
}

export interface MemberStatsSummary {
  byCategory: Record<StatCategory, MemberStatRow>;
  /** When these figures were last worked out and stored. */
  computedAt: string | null;
}

/**
 * `null` season = All Time.
 *
 * Reads the stored (cached) figures written by `refresh_member_stats_cache`.
 * The database refreshes them on demand only when they are missing or older
 * than a week; a weekly Sunday job and club-result triggers keep them current,
 * so logging in never re-pulls everything from SportyHQ/NSA.
 */
export function useMemberStatsSummary(memberId?: string | null, seasonYear?: number | null) {
  return useQuery<MemberStatsSummary>({
    queryKey: ["member-stats-summary", memberId, seasonYear ?? "all"],
    enabled: !!memberId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_member_stats_cached", {
        _member_id: memberId!,
        _season_year: seasonYear ?? null,
      });
      if (error) throw error;
      const byCategory = {} as Record<StatCategory, MemberStatRow>;
      for (const c of STAT_CATEGORY_ORDER) {
        byCategory[c] = { category: c, played: 0, won: 0, lost: 0, winRate: 0 };
      }
      let computedAt: string | null = null;
      for (const r of (data ?? []) as any[]) {
        computedAt = computedAt ?? r.computed_at ?? null;
        const cat = r.category as StatCategory;
        if (!byCategory[cat]) continue;
        const played = Number(r.played ?? 0);
        const won = Number(r.won ?? 0);
        byCategory[cat] = {
          category: cat,
          played,
          won,
          lost: Number(r.lost ?? 0),
          winRate: played > 0 ? Math.round((won / played) * 100) : 0,
        };
      }
      return { byCategory, computedAt };
    },
  });
}

/** Seasons the member actually has results in, newest first. */
export function useMemberStatSeasons(memberId?: string | null) {
  return useQuery<number[]>({
    queryKey: ["member-stat-seasons", memberId],
    enabled: !!memberId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_member_stat_seasons_cached", {
        _member_id: memberId!,
      });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => Number(r.season_year ?? r))
        .filter((n) => Number.isFinite(n));
    },
  });
}


export function useMemberMatchHistory(
  memberId?: string | null,
  opts?: {
    seasonYear?: number | null;
    category?: StatCategory | null;
    opponentMemberId?: string | null;
    enabled?: boolean;
  },
) {
  const seasonYear = opts?.seasonYear ?? null;
  const category = opts?.category ?? null;
  const opponentMemberId = opts?.opponentMemberId ?? null;
  return useQuery<MemberMatchRow[]>({
    queryKey: [
      "member-match-history",
      memberId,
      seasonYear ?? "all",
      category ?? "all",
      opponentMemberId ?? "all",
    ],
    enabled: !!memberId && opts?.enabled !== false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_member_match_history", {
        _member_id: memberId!,
        _season_year: seasonYear,
        _category: category === "total" ? null : category,
        _opponent_member_id: opponentMemberId,
      });
      if (error) throw error;
      return (data ?? []) as MemberMatchRow[];
    },
  });
}
