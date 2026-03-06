import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useBookings(date: string) {
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
      const userIds = [...new Set(bookings.map(b => b.user_id))];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);

      return bookings.map(b => ({
        ...b,
        player_name: profileMap.get(b.user_id) || "Unknown",
      }));
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ courtId, date, startTime, endTime }: {
      courtId: number; date: string; startTime: string; endTime: string;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("bookings")
        .insert({
          court_id: courtId,
          user_id: user.id,
          date,
          start_time: startTime,
          end_time: endTime,
        })
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
      return data.map(b => ({
        ...b,
        court_name: b.court_id === 1 ? "Court 1" : "Court 2",
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

export type ChallengeStatus = "pending" | "accepted" | "declined" | "completed";

export type ChallengeWithProfiles = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: ChallengeStatus;
  proposed_date: string | null;
  created_at: string;
  updated_at: string;
  challenger_name: string;
  opponent_name: string;
};

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
    }: {
      challengeId: string;
      status: ChallengeStatus;
    }) => {
      const { data, error } = await supabase
        .from("challenges")
        .update({ status })
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
  challenge_id: string | null;
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
      playerA,
      playerB,
      winnerId,
      score,
      matchDate,
      courtId,
      challengeId,
      gameScores,
    }: {
      playerA: string;
      playerB: string;
      winnerId: string | null;
      score?: string | null;
      matchDate: string;
      courtId?: number | null;
      challengeId?: string | null;
      gameScores?: string | null;
    }) => {
      if (!user) throw new Error("Must be logged in");

      const { data, error } = await supabase
        .from("matches")
        .insert({
          player_a: playerA,
          player_b: playerB,
          winner_id: winnerId,
          score: score ?? null,
          match_date: matchDate,
          court_id: courtId ?? null,
          challenge_id: challengeId ?? null,
          game_scores: gameScores ?? null,
          submitted_by: user.id,
          confirmed: false,
          disputed: false,
        })
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
      const patch: Record<string, boolean> = {};
      if (typeof confirmed === "boolean") patch.confirmed = confirmed;
      if (typeof disputed === "boolean") patch.disputed = disputed;

      const { data, error } = await supabase
        .from("matches")
        .update(patch)
        .eq("id", matchId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
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
