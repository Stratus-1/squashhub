import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OVERALL_CATEGORY } from "@/hooks/use-nsa-rankings";
import type { RankingScope } from "@/lib/rankings/provisional";

/**
 * The member's CURRENT standing on each ranking system SquashHub already runs.
 * Nothing is recomputed here — club points come from `club_members`, regional
 * and national positions come from the existing ranking snapshots.
 */

export interface MemberRankingStanding {
  scope: RankingScope;
  rank: number;
  previousRank: number | null;
  /** Rating = numeric points value. Null when the source has no rating. */
  points: number | null;
  /** Real ranking-list name, e.g. "Men Northerns Squash Association". */
  label?: string | null;
  /** Number of players on the list, when known. */
  total?: number | null;
  /** Snapshot / owner the standing came from, used for the drill-down. */
  snapshotId: string | null;
  associationId: string | null;
  playerCode: string | null;
}


/** Club + regional + national standing for one member. */
export function useMemberRankings(clubId?: string | null, memberId?: string | null) {
  return useQuery<Partial<Record<RankingScope, MemberRankingStanding>>>({
    queryKey: ["member-rankings", clubId, memberId],
    enabled: !!clubId && !!memberId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const out: Partial<Record<RankingScope, MemberRankingStanding>> = {};

      const { data: me } = await (supabase as any)
        .from("club_members")
        .select("id, person_id, ranking_points, ladder_position")
        .eq("id", memberId!)
        .maybeSingle();
      if (!me) return out;

      // ---- Club ----------------------------------------------------------
      const { data: club } = await (supabase as any)
        .from("clubs")
        .select("ranking_points_enabled")
        .eq("id", clubId!)
        .maybeSingle();

      if (club?.ranking_points_enabled) {
        const myPoints = Number(me.ranking_points ?? 0);
        const { count } = await (supabase as any)
          .from("club_members")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId!)
          .not("ladder_position", "is", null)
          .neq("role", "visitor")
          .gt("ranking_points", myPoints);
        out.club = {
          scope: "club",
          rank: (count ?? 0) + 1,
          previousRank: null,
          points: myPoints,
          snapshotId: null,
          associationId: null,
          playerCode: null,
        };
      }

      // ---- Regional / national -------------------------------------------
      const { data: affiliations } = await (supabase as any)
        .from("member_association_affiliations")
        .select("association_id, league_association_number, active")
        .eq("club_member_id", memberId!)
        .eq("active", true);

      const codes = ((affiliations ?? []) as any[])
        .map((a) => a.league_association_number)
        .filter(Boolean) as string[];
      const associationId = ((affiliations ?? []) as any[])[0]?.association_id ?? null;

      const loadScope = async (scope: "association" | "national", assocId: string | null) => {
        let snapQuery = (supabase as any)
          .from("ranking_snapshots")
          .select("id")
          .order("computed_at", { ascending: false })
          .limit(1);
        snapQuery = assocId ? snapQuery.eq("association_id", assocId) : snapQuery.is("association_id", null);
        const { data: snap } = await snapQuery.maybeSingle();
        if (!snap?.id) return;

        let entryQuery = (supabase as any)
          .from("ranking_snapshot_entries")
          .select("rank, previous_rank, score, player_code, person_id")
          .eq("snapshot_id", snap.id)
          .eq("category", OVERALL_CATEGORY)
          .limit(1);

        if (me.person_id) {
          entryQuery = entryQuery.eq("person_id", me.person_id);
        } else if (codes.length) {
          entryQuery = entryQuery.in("player_code", codes);
        } else {
          return;
        }

        const { data: entry } = await entryQuery.maybeSingle();
        if (!entry) return;

        out[scope === "association" ? "association" : "national"] = {
          scope: scope === "association" ? "association" : "national",
          rank: Number(entry.rank),
          previousRank: entry.previous_rank != null ? Number(entry.previous_rank) : null,
          points: Number(entry.score ?? 0),
          snapshotId: snap.id,
          associationId: assocId,
          playerCode: entry.player_code ?? null,
        };
      };

      if (associationId) await loadScope("association", associationId);
      await loadScope("national", null);

      return out;
    },
  });
}

export interface NearbyRankingRow {
  rank: number;
  name: string;
  score: number;
  playerCode: string | null;
}

/** The player plus their immediate neighbours on a ranking snapshot. */
export function useNearbyRankings(
  snapshotId: string | null | undefined,
  rank: number | null | undefined,
  enabled = true,
) {
  return useQuery<NearbyRankingRow[]>({
    queryKey: ["nearby-rankings", snapshotId, rank],
    enabled: !!snapshotId && !!rank && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ranking_snapshot_entries")
        .select("rank, player_name, player_code, score")
        .eq("snapshot_id", snapshotId!)
        .eq("category", OVERALL_CATEGORY)
        .gte("rank", Math.max(1, (rank ?? 1) - 3))
        .lte("rank", (rank ?? 1) + 3)
        .order("rank", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        rank: Number(r.rank),
        name: r.player_name ?? r.player_code ?? "Unknown",
        score: Number(r.score ?? 0),
        playerCode: r.player_code ?? null,
      }));
    },
  });
}
