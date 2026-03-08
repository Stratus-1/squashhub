import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Bypass strict typing for tables/functions that exist in the external Supabase
// but aren't reflected in the auto-generated Lovable Cloud types.
const rpc: any = supabase.rpc.bind(supabase);
const fromAny = (table: string) => (supabase as any).from(table);

export type CourtBusynessRow = { slot: string; bookings_count: number };

export type SquashTotals = {
  matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_duration_min: number | null;
  last_match_date: string | null;
  current_streak: string;
  best_win_streak: number;
  best_loss_streak: number;
  sets_for: number;
  sets_against: number;
  points_for: number;
  points_against: number;
};

export function useSquashTotals(playerId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["squash-totals", playerId],
    queryFn: async () => {
      if (!playerId) return null;
      const { data, error } = await rpc("get_squash_totals", { target_user_id: playerId });
      if (error) throw error;
      return data as unknown as SquashTotals;
    },
    enabled: !!user && !!playerId,
  });
}

export type HeadToHeadRow = {
  opponent_id: string;
  opponent_name: string;
  matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  last_match_date: string | null;
  avg_duration_min: number | null;
  sets_for: number;
  sets_against: number;
  points_for: number;
  points_against: number;
};

export function useHeadToHead(playerId?: string | null, limit = 20) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["head-to-head", playerId, limit],
    queryFn: async () => {
      if (!playerId) return [] as HeadToHeadRow[];
      const { data, error } = await rpc("get_head_to_head", {
        target_user_id: playerId,
        limit_count: limit,
      } as any);
      if (error) throw error;
      return (data || []) as HeadToHeadRow[];
    },
    enabled: !!user && !!playerId,
  });
}

export function useCourtBusyness(daysBack = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["court-busyness", user?.id, daysBack],
    queryFn: async () => {
      const { data, error } = await rpc("get_court_busyness", { days_back: daysBack });
      if (error) throw error;
      return (data || []) as CourtBusynessRow[];
    },
    enabled: !!user,
  });
}

export type HomeInsights = {
  range: { from: string; to: string; days: number };
  totals: { sessions: number; avg_session_minutes: number };
  busiest: { slot: string | null; slot_count: number; day: string | null; day_count: number };
  top_players: Array<{ id: string; name: string; sessions: number }>;
  top_pairs: Array<{ a_id: string; a_name: string; b_id: string; b_name: string; sessions: number }>;
  me: { sessions: number; avg_session_minutes: number };
};

export function useHomeInsights(daysBack = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["home-insights", user?.id, daysBack],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_home_insights", { days_back: daysBack } as any);
      if (error) throw error;
      return data as HomeInsights;
    },
    enabled: !!user,
  });
}

export function useUnreadNotificationsCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

export function useBookings(date: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bookings", date],
    queryFn: async () => {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("date", date)
        .eq("status", "active");
      if (error) throw error;

      // Fetch player names for bookings
      const userIds = [
        ...new Set(
          bookings
            .flatMap((b: any) => [b.user_id, b.opponent_id])
            .filter(Boolean)
        ),
      ];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, availability, rank")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

      return bookings.map(b => ({
        ...b,
        player_name: (profileMap.get((b as any).user_id) as any)?.name || "Unknown",
        player_availability: (profileMap.get((b as any).user_id) as any)?.availability || null,
        player_rank: (profileMap.get((b as any).user_id) as any)?.rank ?? null,
        opponent_name: (b as any).opponent_id ? ((profileMap.get((b as any).opponent_id) as any)?.name || "Unknown") : null,
        opponent_availability: (b as any).opponent_id ? ((profileMap.get((b as any).opponent_id) as any)?.availability || null) : null,
        opponent_rank: (b as any).opponent_id ? ((profileMap.get((b as any).opponent_id) as any)?.rank ?? null) : null,
      }));
    },
    enabled: !!user,
  });
}

export type PublicLeaderboardRow = {
  id: string;
  name: string;
  rank: number;
  matches_played: number;
  wins: number;
  losses: number;
  win_rate: number;
};

export function usePublicLeaderboard(limit = 10) {
  return useQuery({
    queryKey: ["public-leaderboard", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_leaderboard", { limit_count: limit } as any);
      if (error) throw error;
      return (data || []) as PublicLeaderboardRow[];
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      bookingId,
      courtId,
      date,
      startTime,
      endTime,
      opponentId,
      isFriendly,
      challengeId,
    }: {
      bookingId?: string;
      courtId: number;
      date: string;
      startTime: string;
      endTime: string;
      opponentId?: string | null;
      isFriendly?: boolean;
      challengeId?: string | null;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const id = bookingId || crypto.randomUUID();
      const { data, error } = await supabase
        .from("bookings")
        .upsert({
          id,
          court_id: courtId,
          user_id: user.id,
          date,
          start_time: startTime,
          end_time: endTime,
          opponent_id: opponentId ?? null,
          is_friendly: !!isFriendly,
          challenge_id: challengeId ?? null,
        } as any, { onConflict: "id" })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("This slot is already booked");
        throw error;
      }
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bookings", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

export function useMyBookings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date")
        .order("start_time");
      if (error) throw error;

      // Map court names
      const opponentIds = [...new Set((data as any[]).map((b) => b.opponent_id).filter(Boolean))] as string[];
      let opponentMap = new Map<string, any>();
      if (opponentIds.length > 0) {
        const { data: oppProfiles } = await supabase
          .from("profiles")
          .select("id,name,availability,rank")
          .in("id", opponentIds);
        opponentMap = new Map((oppProfiles || []).map((p: any) => [p.id, p]));
      }

      return data.map((b: any) => ({
        ...b,
        court_name: b.court_id === 1 ? "Court 1" : "Court 2",
        opponent_name: b.opponent_id ? (opponentMap.get(b.opponent_id)?.name || "Unknown") : null,
        opponent_availability: b.opponent_id ? (opponentMap.get(b.opponent_id)?.availability || null) : null,
        opponent_rank: b.opponent_id ? (opponentMap.get(b.opponent_id)?.rank ?? null) : null,
      }));
    },
    enabled: !!user,
  });
}

export function useMyScheduledMatches() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-scheduled-matches", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("scheduled_matches")
        .select("*")
        .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
        .eq("status", "scheduled")
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useLadder() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ladder"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .not("rank", "is", null)
        .lte("rank", 20)
        .order("rank");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function usePlayerProfile(playerId?: string | null) {
  return useQuery({
    queryKey: ["player-profile", playerId],
    queryFn: async () => {
      if (!playerId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", playerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });
}

export type ChallengeStatus = "pending" | "accepted" | "declined" | "completed" | "expired";

export type ChallengeWithProfiles = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: ChallengeStatus;
  proposed_date: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  challenger_name: string;
  opponent_name: string;
};

export type ChallengeScheduleStatus = "proposed" | "accepted" | "declined" | "cancelled" | "expired";

export type ChallengeSchedule = {
  id: string;
  challenge_id: string;
  proposed_by: string;
  proposed_date: string;
  start_time: string;
  end_time: string;
  court_id: number | null;
  booking_id: string | null;
  status: ChallengeScheduleStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export function useChallengeSchedulesByChallengeIds(challengeIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["challenge-schedules", user?.id, challengeIds.join(",")],
    queryFn: async () => {
      if (!user || challengeIds.length === 0) return [] as ChallengeSchedule[];
      const { data, error } = await supabase
        .from("challenge_schedules")
        .select("*")
        .in("challenge_id", challengeIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ChallengeSchedule[];
    },
    enabled: !!user && challengeIds.length > 0,
  });
}

export function useProposeChallengeSchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      challengeId: string;
      proposedDate: string;
      startTime: string;
      endTime: string;
      courtId: number;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("challenge_schedules")
        .insert({
          challenge_id: payload.challengeId,
          proposed_by: user.id,
          proposed_date: payload.proposedDate,
          start_time: payload.startTime,
          end_time: payload.endTime,
          court_id: payload.courtId,
          status: "proposed",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as ChallengeSchedule;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useRespondChallengeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scheduleId, status }: { scheduleId: string; status: "accepted" | "declined" | "cancelled" }) => {
      const { error } = await supabase
        .from("challenge_schedules")
        .update({ status } as any)
        .eq("id", scheduleId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

export function useAcceptChallengeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase.rpc("accept_challenge_schedule", { target_schedule_id: scheduleId } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

export function useChallenges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["challenges", user?.id],
    queryFn: async () => {
      if (!user) return [] as ChallengeWithProfiles[];

      const { data: challenges, error } = await supabase
        .from("challenges")
        .select("*")
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = [
        ...new Set(challenges.flatMap((c) => [c.challenger_id, c.opponent_id])),
      ];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ids);
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map((p) => [p.id, p.name]) || []);

      return challenges.map((c) => ({
        ...c,
        challenger_name: profileMap.get(c.challenger_id) || "Unknown",
        opponent_name: profileMap.get(c.opponent_id) || "Unknown",
      })) as ChallengeWithProfiles[];
    },
    enabled: !!user,
  });
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      opponentId,
      proposedDate,
    }: {
      opponentId: string;
      proposedDate?: string | null;
    }) => {
      if (!user) throw new Error("Must be logged in");
      if (!opponentId) throw new Error("Choose an opponent");
      if (opponentId === user.id) throw new Error("You can't challenge yourself");

      const { data: existing, error: existingError } = await supabase
        .from("challenges")
        .select("id, status")
        .in("status", ["pending", "accepted"])
        .or(
          `and(challenger_id.eq.${user.id},opponent_id.eq.${opponentId}),and(challenger_id.eq.${opponentId},opponent_id.eq.${user.id})`
        )
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        throw new Error("A challenge between you two is already active");
      }

      const { data, error } = await supabase
        .from("challenges")
        .insert({
          challenger_id: user.id,
          opponent_id: opponentId,
          proposed_date: proposedDate ?? null,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export function useUpdateChallengeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      challengeId,
      status,
      proposedDate,
    }: {
      challengeId: string;
      status: ChallengeStatus;
      proposedDate?: string | null;
    }) => {
      const patch: Record<string, any> = { status };
      if (typeof proposedDate !== "undefined") patch.proposed_date = proposedDate;
      const { data, error } = await supabase
        .from("challenges")
        .update(patch)
        .eq("id", challengeId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

export type MatchWithProfiles = {
  id: string;
  player_a: string;
  player_b: string;
  score: string | null;
  game_scores: string | null;
  winner_id: string | null;
  court_id: number | null;
  match_date: string;
  submitted_by: string | null;
  confirmed: boolean;
  disputed: boolean;
  is_friendly?: boolean;
  booking_id?: string | null;
  confirm_a?: boolean;
  confirm_b?: boolean;
  confirmed_by_admin?: boolean;
  confirmed_at?: string | null;
  disputed_by?: string | null;
  disputed_at?: string | null;
  dispute_notes?: string | null;
  dispute_evidence_url?: string | null;
  challenge_id: string | null;
  duration_s?: number | null;
  notes?: string | null;
  created_at: string;
  player_a_name: string;
  player_b_name: string;
};

export function useMatches() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["matches", user?.id],
    queryFn: async () => {
      if (!user) return [] as MatchWithProfiles[];

      const { data: matches, error } = await supabase
        .from("matches")
        .select("*")
        .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = [...new Set(matches.flatMap((m) => [m.player_a, m.player_b]))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ids);
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map((p) => [p.id, p.name]) || []);

      return matches.map((m) => ({
        ...m,
        player_a_name: profileMap.get(m.player_a) || "Unknown",
        player_b_name: profileMap.get(m.player_b) || "Unknown",
      })) as MatchWithProfiles[];
    },
    enabled: !!user,
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      matchId,
      playerA,
      playerB,
      winnerId,
      score,
      matchDate,
      courtId,
      challengeId,
      gameScores,
      durationS,
      notes,
    }: {
      matchId?: string;
      playerA: string;
      playerB: string;
      winnerId: string | null;
      score?: string | null;
      matchDate: string;
      courtId?: number | null;
      challengeId?: string | null;
      gameScores?: string | null;
      durationS?: number | null;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("Must be logged in");

      const id = matchId || crypto.randomUUID();

      const { data, error } = await supabase
        .from("matches")
        .upsert({
          id,
          player_a: playerA,
          player_b: playerB,
          winner_id: winnerId,
          score: score ?? null,
          match_date: matchDate,
          court_id: courtId ?? null,
          challenge_id: challengeId ?? null,
          game_scores: gameScores ?? null,
          duration_s: durationS ?? null,
          notes: notes ?? null,
          submitted_by: user.id,
          confirmed: false,
          disputed: false,
        } as any, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      matchId,
      confirmed,
      disputed,
    }: {
      matchId: string;
      confirmed?: boolean;
      disputed?: boolean;
    }) => {
      // Deprecated: use confirm/dispute RPCs for the new two-party workflow.
      // Keep for backward compatibility where admin UIs may still patch fields.
      const patch: Record<string, boolean> = {};
      if (typeof confirmed === "boolean") patch.confirmed = confirmed;
      if (typeof disputed === "boolean") patch.disputed = disputed;

      const { data, error } = await supabase.from("matches").update(patch).eq("id", matchId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

export function useConfirmMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await supabase.rpc("confirm_match", { match_id: matchId } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["challenges", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}

export function useDisputeMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      matchId,
      notes,
      evidenceUrl,
    }: {
      matchId: string;
      notes?: string | null;
      evidenceUrl?: string | null;
    }) => {
      const { error } = await supabase.rpc("dispute_match", {
        match_id: matchId,
        notes: notes ?? null,
        evidence_url: evidenceUrl ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["challenges", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    },
  });
}

export function useAdminConfirmMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await supabase.rpc("admin_confirm_match", { match_id: matchId } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
    },
  });
}

export type IntegrationProvider =
  | "strava"
  | "apple_health"
  | "samsung_health"
  | "huawei_health"
  | "garmin";

export type IntegrationAccount = {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  provider_user_id: string | null;
  display_name: string | null;
  scopes: string | null;
  status: "connected" | "error" | "disconnected";
  connected_at: string;
  updated_at: string;
};

export function useIntegrations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["integrations", user?.id],
    queryFn: async () => {
      if (!user) return [] as IntegrationAccount[];
      const { data, error } = await supabase
        .from("integrations_accounts")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []) as IntegrationAccount[];
    },
    enabled: !!user,
  });
}

export type AppRole = "admin" | "moderator" | "user";

export function useMyRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      if (!user) return [] as AppRole[];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []).map((r) => r.role) as AppRole[];
    },
    enabled: !!user,
  });
}
