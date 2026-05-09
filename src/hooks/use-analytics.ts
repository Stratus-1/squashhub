import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";

const rpc: any = supabase.rpc.bind(supabase);

export type ClubAnalytics = {
  total_bookings: number;
  active_players: number;
  avg_duration_min: number | null;
  total_matches: number;
  confirmed_matches: number;
  busiest_hours: Array<{ hour: number; count: number }>;
  top_players: Array<{ id: string; name: string; sessions: number }>;
};

export function useClubAnalytics(daysBack = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["club-analytics", daysBack],
    queryFn: async () => {
      const { data, error } = await rpc("get_club_analytics", { days_back: daysBack });
      if (error) throw error;
      return data as unknown as ClubAnalytics;
    },
    enabled: !!user,
  });
}

export type PersonalAnalytics = {
  court_usage: Array<{ court_id: number; count: number }>;
  peak_hours: Array<{ hour: number; count: number }>;
  weekly_performance: Array<{ week: string; matches: number; wins: number }>;
  favourite_days: Array<{ dow: number; count: number }>;
  total_bookings: number;
  total_courts_used: number;
};

export function usePersonalAnalytics(daysBack = 90) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["personal-analytics", user?.id, daysBack],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await rpc("get_personal_analytics", {
        target_user_id: user.id,
        days_back: daysBack,
      });
      if (error) throw error;
      return data as unknown as PersonalAnalytics;
    },
    enabled: !!user,
  });
}

export type MatchOfTheWeek = {
  match_id: string;
  player_a: string;
  player_b: string;
  player_a_name: string;
  player_b_name: string;
  winner_id: string;
  score: string | null;
  game_scores: string | null;
  match_date: string;
  closeness_score: number;
  player_a_member_id: string | null;
  player_b_member_id: string | null;
  winner_member_id: string | null;
};

export function useMatchOfTheWeek() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["match-of-the-week"],
    queryFn: async () => {
      const { data, error } = await rpc("get_match_of_the_week");
      if (error) throw error;
      const rows = data as unknown as MatchOfTheWeek[];
      return rows && rows.length > 0 ? rows[0] : null;
    },
    enabled: !!user,
  });
}

export function useSeasons() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seasons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useSeasonAwards(seasonId?: string) {
  return useQuery({
    queryKey: ["season-awards", seasonId],
    queryFn: async () => {
      if (!seasonId) return [];
      const { data, error } = await (supabase as any)
        .from("season_awards")
        .select("*")
        .eq("season_id", seasonId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!seasonId,
  });
}

export function useRecurringBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recurring-bookings", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("recurring_bookings")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("day_of_week");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useMatchDisputes(matchId?: string) {
  return useQuery({
    queryKey: ["match-disputes", matchId],
    queryFn: async () => {
      if (!matchId) return [];
      const { data, error } = await (supabase as any)
        .from("match_disputes")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!matchId,
  });
}
