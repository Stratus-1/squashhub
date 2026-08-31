import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  authoritativeRules,
  resolveAuthoritativeComposition,
  type StoredComposition,
} from "@/lib/leagues/authoritative-format";


export interface LeagueRules {
  id: string;
  league_id: string | null;
  association_id: string | null;
  club_id: string | null;
  points_per_game: number;
  win_by: number;
  games_format: "best_of_3" | "best_of_5" | "best_of_7";
  tiebreak_at: number | null;
  let_stroke_enabled: boolean;
  max_timeouts_per_player: number;
  marker_required: boolean;
  marker_must_be_qualified: boolean;
  forfeit_allowed: boolean;
  tiebreak_method: "games_then_points_then_share" | "games_only" | "points_only";
  bonus_points_mode: "none" | "per_match" | "per_game_won" | "fixed_winner";
  bonus_points_value: number;
  share_bonus_on_tie: boolean;
  notes: string | null;
  // Substitution rules (added 2026-05-08)
  enforce_sub_rules: boolean;
  max_position_movement_per_week: number | null;
  sub_direction: "any" | "lower_or_equal_only" | "higher_or_equal_only";
  cross_gender_subs_allowed: boolean;
  // Original-player bonus (NIL): +N points per originally-allocated player who actually plays
  original_player_bonus_enabled: boolean;
  original_player_bonus_value: number;
  // Team-win bonus: +N points to the team that wins the overall fixture for the night
  team_win_bonus_enabled: boolean;
  team_win_bonus_value: number;
  // Team size: fixed (e.g. NSA = always 4, extras are reserves) or flexible (NIL — grows to however many were allocated)
  team_size_mode: "fixed" | "flexible";
  team_size: number;
  // NSA-style flexibility: allow a member to be registered in multiple teams
  // within the same association. NIL = false (strict), NSA = true.
  allow_multi_team_registration: boolean;
  // Same-night subbing: a player may appear in a second team's lineup in the
  // same week as a substitute, without being registered in that team.
  allow_multi_fixture_per_night: boolean;

  // Phase 4 — adaptive format engine (Singles / Doubles / Hybrid).
  // Nullable: legacy singles leagues fall back to team_size.
  singles_rubbers: number | null;
  doubles_rubbers: number | null;
  pairing_policy: "fixed" | "per_fixture";
  allow_dual_participation: boolean;

  // Feature toggles per association
  fill_up_leagues_enabled: boolean;
}


export function useAssociationRules(associationId: string | null | undefined) {
  return useQuery({
    queryKey: ["association-rules", "direct", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      // Try tenant association first, then fall back to its platform_association_id.
      // Rules are typically authored once in Super Admin against the platform
      // association; tenant rows inherit unless they override.
      // NOTE: never `maybeSingle()` here — a stray duplicate row would make the
      // whole query throw and silently drop the league's configured format.
      const { data: direct, error: directErr } = await supabase
        .from("league_rules")
        .select("*")
        .eq("association_id", associationId!)
        .is("league_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (directErr) throw directErr;
      if (direct && direct.length) return direct[0] as LeagueRules;

      const { data: assoc, error: assocErr } = await supabase
        .from("league_associations")
        .select("platform_association_id")
        .eq("id", associationId!)
        .maybeSingle();
      if (assocErr) throw assocErr;
      const platformId = assoc?.platform_association_id;
      if (!platformId) return null;

      const { data: inherited, error: inheritedErr } = await supabase
        .from("league_rules")
        .select("*")
        .eq("association_id", platformId)
        .is("league_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (inheritedErr) throw inheritedErr;
      return ((inherited && inherited[0]) as LeagueRules | null) ?? null;
    },
  });
}


export function useUpdateAssociationRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { associationId: string; patch: Partial<LeagueRules> }) => {
      const { associationId } = input;
      // Never carry identity/audit columns through — when rules are inherited from a
      // platform association the loaded row's id/association_id would collide on insert.
      const patch: Record<string, any> = { ...input.patch };
      delete patch.id;
      delete patch.association_id;
      delete patch.league_id;
      delete patch.club_id;
      delete patch.created_at;
      delete patch.updated_at;

      const { data: existingRows, error: existingError } = await supabase
        .from("league_rules")
        .select("id")
        .eq("association_id", associationId)
        .is("league_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (existingError) throw existingError;
      const existing = existingRows?.[0] ?? null;

      if (existing) {
        const { data: updated, error } = await supabase
          .from("league_rules")
          .update(patch as any)
          .eq("id", existing.id)
          .eq("association_id", associationId)
          .is("league_id", null)
          .select("id, association_id");
        if (error) throw error;
        if (!updated?.length || updated[0].association_id !== associationId) {
          throw new Error("You don't have permission to change these league rules.");
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("league_rules")
          .insert({ ...patch, association_id: associationId, league_id: null, club_id: null })
          .select("id, association_id");
        if (error) throw error;
        if (!inserted?.length || inserted[0].association_id !== associationId) {
          throw new Error("The club-specific league rules could not be saved.");
        }
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["association-rules", "direct", vars.associationId] });
      qc.invalidateQueries({ queryKey: ["association-rules"] });
      toast.success("Rules saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save rules"),
  });
}

/* ── Authoritative league playing structure ───────────────────────────────
 * The association-scoped league_rules row (league_id IS NULL) is the ONE
 * record that owns rubber counts for a Club League + season. Per-team rows are
 * derived mirrors kept for legacy readers only.                              */

export function useLeagueComposition(associationId: string | null | undefined) {
  const assoc = useAssociationRules(associationId);

  const teamRules = useQuery({
    queryKey: ["league-team-rules", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      const { data: leagueRows, error: leagueErr } = await supabase
        .from("leagues")
        .select("id")
        .eq("association_id", associationId!);
      if (leagueErr) throw leagueErr;
      const ids = (leagueRows ?? []).map((l: any) => l.id);
      if (!ids.length) return [] as StoredComposition[];
      const { data, error } = await supabase
        .from("league_rules")
        .select("league_id, singles_rubbers, doubles_rubbers, team_size, reserves_per_team")
        .in("league_id", ids);
      if (error) throw error;
      return (data ?? []) as StoredComposition[];
    },
  });

  const composition = resolveAuthoritativeComposition({
    associationRules: (assoc.data as StoredComposition | null) ?? null,
    teamRules: teamRules.data ?? [],
  });

  return {
    associationRules: (assoc.data as LeagueRules | null) ?? null,
    /** association row merged with the authoritative composition numbers. */
    rules: authoritativeRules(assoc.data as any, teamRules.data ?? []),
    composition,
    isLoading: assoc.isLoading || teamRules.isLoading,
    isFetched: assoc.isFetched && teamRules.isFetched,
  };
}

/**
 * Write the playing structure ONCE, to the authoritative association row, then
 * mirror the derived numbers onto existing per-team rows (compatibility only).
 * Team rows never carry association_id — the scope CHECK forbids it.
 */
export function useSaveLeagueComposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      associationId: string;
      clubId?: string | null;
      singlesRubbers: number;
      doublesRubbers: number;
      teamSize: number;
      reservesPerTeam?: number | null;
      /** Team league ids to mirror onto (derived copies). */
      teamLeagueIds?: string[];
    }) => {
      const patch = {
        singles_rubbers: input.singlesRubbers,
        doubles_rubbers: input.doublesRubbers,
        team_size: input.teamSize,
        team_size_mode: "fixed" as const,
        reserves_per_team: input.reservesPerTeam ?? null,
      };

      const { data: existingRows, error: readErr } = await supabase
        .from("league_rules")
        .select("id")
        .eq("association_id", input.associationId)
        .is("league_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (readErr) throw readErr;

      if (existingRows?.length) {
        const { error } = await supabase.from("league_rules").update(patch).eq("id", existingRows[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("league_rules")
          .insert({ association_id: input.associationId, ...patch });
        if (error) throw error;
      }

      const ids = input.teamLeagueIds ?? [];
      if (ids.length) {
        const { error } = await supabase.from("league_rules").upsert(
          ids.map((league_id) => ({
            league_id,
            club_id: input.clubId ?? null,
            ...patch,
          })),
          { onConflict: "league_id" },
        );
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["association-rules", "direct", vars.associationId] });
      qc.invalidateQueries({ queryKey: ["league-team-rules", vars.associationId] });
    },
  });
}



export function useAssociationPenalties(associationId: string | null | undefined) {
  return useQuery({
    queryKey: ["association-penalties", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      // Penalties are stored per fixture; join via leagues belonging to this association
      const { data: leagueRows } = await supabase
        .from("leagues")
        .select("id")
        .eq("association_id", associationId!);
      const leagueIds = (leagueRows ?? []).map((l: any) => l.id);
      if (leagueIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_penalties")
        .select("*")
        .in("league_id", leagueIds)
        .order("scraped_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
