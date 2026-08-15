import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

/**
 * One tournament platform — shared hooks used at club, association and
 * federation level. The engine row (`tournaments`) holds operations only:
 * draws, scheduling, entries and scoring. Governance, rules and venues live
 * in their own tables and are edited through the hooks below.
 */

export type OwnerLevel = "club" | "association" | "national";

export interface TournamentSummary {
  id: string;
  name: string;
  club_id: string;
  owner_org_id: string | null;
  gender: string;
  match_type: string;
  status: string;
  start_date: string;
  end_date: string;
  num_groups: number;
}

export interface TournamentGovernance {
  tournament_id?: string;
  sanction_status: "none" | "pending" | "approved" | "rejected";
  sanctioning_org_id: string | null;
  sanction_reference: string | null;
  sanction_notes: string | null;
  competition_level: "club" | "regional" | "provincial" | "national";
  eligibility_min_age: number | null;
  eligibility_max_age: number | null;
  eligibility_requires_licence: boolean;
  eligibility_scope: "club" | "association" | "open";
  eligibility_notes: string | null;
  registration_required: boolean;
  registration_mode: "open" | "invite";
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  entry_fee_cents: number;
  federation_fee_cents: number;
  association_fee_cents: number;
  payment_required: boolean;
  refund_policy: "none" | "full_before_cutoff" | "partial_before_cutoff";
  refund_cutoff_date: string | null;
}

export interface TournamentRules {
  tournament_id?: string;
  scoring_mode: "standard" | "time_capped_points" | "swiss";
  draw_type: "round_robin" | "groups_playoffs" | "swiss" | "knockout" | "monrad";
  standard_of_play: string;
  round_format: "single_round_robin" | "double_round_robin" | "cross_league" | "swiss";
  best_of: number | null;
  points_per_game: number;
  win_condition: string;
  handicap_mode: string;
  handicap_multiplier: number;
  handicap_divider: number;
  bye_handling: "no_match" | "walkover_win" | "neutral";
  play_all_games: boolean;
  affects_ranking_points: boolean;
  no_show_opponent_points: number;
  no_show_player_points: number;
}

export interface TournamentVenue {
  id: string;
  tournament_id: string;
  club_id: string;
  court_ids: number[];
  is_primary: boolean;
  host_fee_cents: number;
  host_share_pct: number;
  notes: string | null;
}

const GOV_FIELDS =
  "tournament_id, sanction_status, sanctioning_org_id, sanction_reference, sanction_notes, competition_level, eligibility_min_age, eligibility_max_age, eligibility_requires_licence, eligibility_scope, eligibility_notes, registration_required, registration_mode, registration_opens_at, registration_closes_at, entry_fee_cents, federation_fee_cents, association_fee_cents, payment_required, refund_policy, refund_cutoff_date";

const RULES_FIELDS =
  "tournament_id, scoring_mode, draw_type, standard_of_play, round_format, best_of, points_per_game, win_condition, handicap_mode, handicap_multiplier, handicap_divider, bye_handling, play_all_games, affects_ranking_points, no_show_opponent_points, no_show_player_points";

/** Tournaments owned by a given body (club, association or federation). */
export function useTournamentsByOwner(ownerOrgId: string | null) {
  return useQuery({
    queryKey: ["tournaments-by-owner", ownerOrgId],
    enabled: !!ownerOrgId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments")
        .select("id, name, club_id, owner_org_id, gender, match_type, status, start_date, end_date, num_groups")
        .eq("owner_org_id", ownerOrgId as string)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as TournamentSummary[];
    },
  });
}

/** The owning body of a single tournament. */
export function useTournamentOwner(tournamentId: string | null) {
  return useQuery({
    queryKey: ["tournament-owner", tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments")
        .select("id, owner_org_id, club_id")
        .eq("id", tournamentId as string)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; owner_org_id: string | null; club_id: string } | null;
    },
  });
}

export function useSetTournamentOwner(tournamentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ownerOrgId: string | null) => {
      const { error } = await fromExt("tournaments")
        .update({ owner_org_id: ownerOrgId })
        .eq("id", tournamentId as string);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament-owner", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournaments-by-owner"] });
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });
}

/* ---------------------------------------------------------------- governance */

export function useTournamentGovernance(tournamentId: string | null) {
  return useQuery({
    queryKey: ["tournament-governance", tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournament_governance")
        .select(GOV_FIELDS)
        .eq("tournament_id", tournamentId as string)
        .maybeSingle();
      if (error) throw error;
      return data as TournamentGovernance | null;
    },
  });
}

export function useSaveTournamentGovernance(tournamentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TournamentGovernance>) => {
      const { tournament_id: _ignored, ...rest } = patch as any;
      const { error } = await fromExt("tournament_governance")
        .upsert({ tournament_id: tournamentId, ...rest }, { onConflict: "tournament_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament-governance", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament-governance-audit", tournamentId] });
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });
}

/* --------------------------------------------------------------------- rules */

export function useTournamentRules(tournamentId: string | null) {
  return useQuery({
    queryKey: ["tournament-rules", tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournament_rules")
        .select(RULES_FIELDS)
        .eq("tournament_id", tournamentId as string)
        .maybeSingle();
      if (error) throw error;
      return data as TournamentRules | null;
    },
  });
}

export function useSaveTournamentRules(tournamentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TournamentRules>) => {
      const { tournament_id: _ignored, ...rest } = patch as any;
      const { error } = await fromExt("tournament_rules")
        .upsert({ tournament_id: tournamentId, ...rest }, { onConflict: "tournament_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament-rules", tournamentId] });
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });
}

/* -------------------------------------------------------------------- venues */

export function useTournamentVenues(tournamentId: string | null) {
  return useQuery({
    queryKey: ["tournament-venues", tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournament_venues")
        .select("id, tournament_id, club_id, court_ids, is_primary, host_fee_cents, host_share_pct, notes")
        .eq("tournament_id", tournamentId as string)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data || []) as TournamentVenue[];
    },
  });
}

export function useSaveTournamentVenue(tournamentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (venue: Partial<TournamentVenue> & { club_id: string }) => {
      const { error } = await fromExt("tournament_venues").upsert(
        {
          tournament_id: tournamentId,
          club_id: venue.club_id,
          court_ids: venue.court_ids ?? [],
          is_primary: venue.is_primary ?? false,
          host_fee_cents: venue.host_fee_cents ?? 0,
          host_share_pct: venue.host_share_pct ?? 0,
          notes: venue.notes ?? null,
        },
        { onConflict: "tournament_id,club_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament-venues", tournamentId] }),
  });
}

export function useDeleteTournamentVenue(tournamentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("tournament_venues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament-venues", tournamentId] }),
  });
}

/* --------------------------------------------------------------------- audit */

export interface GovernanceAuditRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export function useTournamentGovernanceAudit(tournamentId: string | null) {
  return useQuery({
    queryKey: ["tournament-governance-audit", tournamentId],
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournament_governance_audit")
        .select("id, field, old_value, new_value, changed_by, created_at")
        .eq("champ_id", tournamentId as string)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as GovernanceAuditRow[];
    },
  });
}

/* ------------------------------------------------------------- organisations */

/** Bodies that can sanction or own a tournament. */
export function useSanctioningAuthorities() {
  return useQuery({
    queryKey: ["sanctioning-authorities"],
    queryFn: async () => {
      const { data, error } = await fromExt("organisations")
        .select("id, name, kind, abbreviation")
        .in("kind", ["national", "association"])
        .eq("active", true)
        .order("kind")
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; kind: string; abbreviation: string | null }[];
    },
  });
}

/** Every organisation that may own a tournament (clubs included). */
export function useOwnerOrganisations() {
  return useQuery({
    queryKey: ["owner-organisations"],
    queryFn: async () => {
      const { data, error } = await fromExt("organisations")
        .select("id, name, kind, club_id")
        .eq("active", true)
        .order("kind")
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; kind: OwnerLevel; club_id: string | null }[];
    },
  });
}

/** Clubs available as host venues. */
export function useHostClubs() {
  return useQuery({
    queryKey: ["host-clubs"],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, host_court_fee_cents_per_hour, host_cleaning_fee_cents_per_day")
        .order("name");
      if (error) throw error;
      return (data || []) as {
        id: string;
        name: string;
        host_court_fee_cents_per_hour?: number | null;
        host_cleaning_fee_cents_per_day?: number | null;
      }[];

    },
  });
}

/** Create a tournament owned by an association or the national federation. */
export function useCreateOwnedTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      owner_org_id: string;
      host_club_id: string;
      gender: string;
      match_type: string;
      start_date: string;
      end_date: string;
      num_groups: number;
      description?: string | null;
    }) => {
      const { data, error } = await fromExt("tournaments")
        .insert({
          name: input.name,
          owner_org_id: input.owner_org_id,
          club_id: input.host_club_id,
          gender: input.gender,
          match_type: input.match_type,
          start_date: input.start_date,
          end_date: input.end_date,
          num_groups: input.num_groups,
          description: input.description ?? null,
          status: "planning",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournaments-by-owner"] });
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });
}
