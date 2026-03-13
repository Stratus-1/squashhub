import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const fromAny = (table: string) => (supabase as any).from(table);

export type BadgeDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xp_reward: number;
  criteria: Record<string, any>;
  created_at: string;
};

export type UserBadge = {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
};

export type XpEvent = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
};

export type UserStreak = {
  id: string;
  user_id: string;
  current_win_streak: number;
  best_win_streak: number;
  current_play_streak: number;
  best_play_streak: number;
  last_match_date: string | null;
  updated_at: string;
};

export function useBadgeDefinitions() {
  return useQuery({
    queryKey: ["badge-definitions"],
    queryFn: async () => {
      const { data, error } = await fromAny("badge_definitions")
        .select("*")
        .order("category")
        .order("xp_reward");
      if (error) throw error;
      return (data || []) as BadgeDefinition[];
    },
  });
}

export function useUserBadges(userId?: string | null) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["user-badges", id],
    queryFn: async () => {
      if (!id) return [] as UserBadge[];
      const { data, error } = await fromAny("user_badges")
        .select("*")
        .eq("user_id", id)
        .order("earned_at", { ascending: false });
      if (error) throw error;
      return (data || []) as UserBadge[];
    },
    enabled: !!id,
  });
}

export function useAllUserBadges() {
  return useQuery({
    queryKey: ["all-user-badges"],
    queryFn: async () => {
      const { data, error } = await fromAny("user_badges").select("*");
      if (error) throw error;
      return (data || []) as UserBadge[];
    },
  });
}

export function useMyXp() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-xp", user?.id],
    queryFn: async () => {
      if (!user) return { total: 0, events: [] as XpEvent[] };
      const { data, error } = await fromAny("xp_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const events = (data || []) as XpEvent[];
      const total = events.reduce((sum, e) => sum + e.amount, 0);
      return { total, events };
    },
    enabled: !!user,
  });
}

export function useUserStreaks(userId?: string | null) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["user-streaks", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await fromAny("user_streaks")
        .select("*")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as UserStreak | null;
    },
    enabled: !!id,
  });
}

export function useAwardBadge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ badgeId, xpAmount, reason }: { badgeId: string; xpAmount: number; reason: string }) => {
      if (!user) throw new Error("Not logged in");
      // Insert badge
      const { error: badgeError } = await fromAny("user_badges")
        .insert({ user_id: user.id, badge_id: badgeId });
      if (badgeError && badgeError.code !== "23505") throw badgeError; // ignore duplicate

      // Award XP
      if (xpAmount > 0) {
        const { error: xpError } = await fromAny("xp_events")
          .insert({ user_id: user.id, amount: xpAmount, reason, reference_id: badgeId });
        if (xpError) throw xpError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-badges"] });
      queryClient.invalidateQueries({ queryKey: ["my-xp"] });
    },
  });
}

// Leaderboard: XP totals for all players
export function useXpLeaderboard() {
  return useQuery({
    queryKey: ["xp-leaderboard"],
    queryFn: async () => {
      // Get all xp events grouped - we'll do client-side since no RPC
      const { data: xpData, error } = await fromAny("xp_events").select("user_id, amount");
      if (error) throw error;
      
      const totals = new Map<string, number>();
      for (const row of (xpData || [])) {
        totals.set(row.user_id, (totals.get(row.user_id) || 0) + row.amount);
      }

      // Get profiles for these users
      const userIds = [...totals.keys()];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, rank")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return userIds
        .map(uid => ({
          user_id: uid,
          xp: totals.get(uid) || 0,
          name: (profileMap.get(uid) as any)?.name || "Unknown",
          avatar_url: (profileMap.get(uid) as any)?.avatar_url || null,
          rank: null,
        }))
        .sort((a, b) => b.xp - a.xp);
    },
  });
}
