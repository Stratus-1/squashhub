import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Bypass strict typing for tables/functions that exist in the external Supabase
// but aren't reflected in the generated types.
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
      const { data, error } = await rpc("get_home_insights", { days_back: daysBack });
      if (error) throw error;
      return data as unknown as HomeInsights;
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

export function useBookings(date: string, clubId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bookings", date, clubId],
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*")
        .eq("date", date)
        .eq("status", "active");
      if (clubId) {
        query = query.eq("club_id", clubId);
      }
      const { data: bookings, error } = await query;
      if (error) throw error;

      // Fetch player names for bookings
      const userIds = [
        ...new Set(
          bookings
            .flatMap((b: any) => [b.user_id, b.opponent_id])
            .filter(Boolean)
        ),
      ];
      if (userIds.length === 0) return bookings.map((b: any) => ({
        ...b,
        player_name: "Unknown",
        opponent_name: (b as any).guest_name || null,
      }));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, rank")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

      // For IDs not found in profiles, try club_members
      const unmatchedIds = userIds.filter((id: string) => !profileMap.has(id));
      let clubMemberMap = new Map<string, any>();
      if (unmatchedIds.length > 0) {
        const { data: members } = await (supabase as any)
          .from("club_members")
          .select("id, name, user_id")
          .in("id", unmatchedIds);
        clubMemberMap = new Map((members || []).map((m: any) => [m.id, m]));
      }

      const getName = (id: string | null) => {
        if (!id) return null;
        const profile = profileMap.get(id);
        if (profile) return profile.name;
        const member = clubMemberMap.get(id);
        if (member) return member.name || "Unknown";
        return "Unknown";
      };

      return bookings.map(b => ({
        ...b,
        player_name: getName((b as any).user_id) || "Unknown",
        player_rank: null,
        opponent_name: (b as any).guest_name || getName((b as any).opponent_id),
        opponent_rank: null,
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
      const { data, error } = await rpc("get_public_leaderboard", { limit_count: limit });
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
      guestName,
    }: {
      bookingId?: string;
      courtId: number;
      date: string;
      startTime: string;
      endTime: string;
      opponentId?: string | null;
      isFriendly?: boolean;
      challengeId?: string | null;
      guestName?: string | null;
    }) => {
      if (!user) throw new Error("Must be logged in");

      // Auto-merge: check for an adjacent booking on the same court/date by this user
      const { data: adjacent } = await supabase
        .from("bookings")
        .select("id, start_time, end_time")
        .eq("court_id", courtId)
        .eq("date", date)
        .eq("user_id", user.id)
        .eq("status", "active") as any;

      const existingMerge = (adjacent || []).find((b: any) =>
        b.end_time === startTime || b.start_time === endTime
      );

      if (existingMerge) {
        // Extend the existing booking
        const newStart = existingMerge.start_time <= startTime ? existingMerge.start_time : startTime;
        const newEnd = existingMerge.end_time >= endTime ? existingMerge.end_time : endTime;
        const { data, error } = await supabase
          .from("bookings")
          .update({
            start_time: newStart,
            end_time: newEnd,
            opponent_id: opponentId ?? null,
            is_friendly: !!isFriendly,
            challenge_id: challengeId ?? null,
            guest_name: guestName ?? null,
          } as any)
          .eq("id", existingMerge.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // No adjacent booking — create new
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
          guest_name: guestName ?? null,
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

      // Map court names & opponent names (check profiles first, then club_members)
      const opponentIds = [...new Set((data as any[]).map((b) => b.opponent_id).filter(Boolean))] as string[];
      let opponentMap = new Map<string, any>();
      if (opponentIds.length > 0) {
        const { data: oppProfiles } = await supabase
          .from("profiles")
          .select("id,name,rank")
          .in("id", opponentIds);
        (oppProfiles || []).forEach((p: any) => opponentMap.set(p.id, p));

        const unmatchedIds = opponentIds.filter(id => !opponentMap.has(id));
        if (unmatchedIds.length > 0) {
          const { data: members } = await (supabase as any)
            .from("club_members")
            .select("id,name")
            .in("id", unmatchedIds);
          (members || []).forEach((m: any) => opponentMap.set(m.id, m));
        }
      }

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const nowTime = now.toTimeString().slice(0, 5); // "HH:MM"

      return data
        .filter((b: any) => {
          // For today's bookings, exclude ones where end_time has already passed
          if (b.date === todayStr && b.end_time && b.end_time.slice(0, 5) <= nowTime) return false;
          return true;
        })
        .map((b: any) => ({
          ...b,
          court_name: b.court_id === 1 ? "Court 1" : "Court 2",
          opponent_name: b.guest_name || (b.opponent_id ? (opponentMap.get(b.opponent_id)?.name || "Unknown") : null),
          opponent_rank: null,
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
      const { data, error } = await fromAny("scheduled_matches")
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

export function useLadder(clubId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ladder", clubId],
    queryFn: async () => {
      // 1. Get club members scoped to the user's club
      let query = supabase
        .from("club_members")
        .select("id, name, email, user_id, gender, skill_level, plays_league, ladder_position");
      if (clubId) {
        query = query.eq("club_id", clubId);
      }
      const { data: members, error: mErr } = await query;
      if (mErr) throw mErr;

      // 2. Get profiles for members that have user_id (for stats like wins/losses)
      const userIds = (members || []).map(m => m.user_id).filter(Boolean) as string[];
      let profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds);
        for (const p of profiles || []) {
          profileMap.set(p.id, p);
        }
      }

      // 3. Build ladder entries (single source of truth: club_members.ladder_position)
      const ladder = (members || []).map(m => {
        const profile = m.user_id ? profileMap.get(m.user_id) : null;
        const ladderPos = m.ladder_position ?? null;
        return {
          id: m.user_id || m.id,
          club_member_id: m.id,
          name: m.name || profile?.name || "Unknown",
          avatar_url: profile?.avatar_url || null,
          wins: profile?.wins ?? 0,
          losses: profile?.losses ?? 0,
          matches_played: profile?.matches_played ?? 0,
          rank: ladderPos,
          league_rank: ladderPos,
          user_id: m.user_id,
          gender: m.gender || null,
          ladder_position: null as number | null,
        };
      });

      // Sort by ladder rank (fallback by name for safety)
      ladder.sort((a, b) => {
        if (a.league_rank != null && b.league_rank != null) return a.league_rank - b.league_rank;
        if (a.league_rank != null) return -1;
        if (b.league_rank != null) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });

      // Assign ladder_position per gender group (index+1 within each gender)
      const genderGroups = new Map<string, number>();
      for (const entry of ladder) {
        const gKey = (entry.gender?.toLowerCase() === "female" || entry.gender?.toLowerCase() === "ladies" || entry.gender?.toLowerCase() === "f") ? "ladies" : "men";
        const pos = (genderGroups.get(gKey) ?? 0) + 1;
        genderGroups.set(gKey, pos);
        entry.ladder_position = pos;
      }

      return ladder;
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
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // Auto-create profile if missing (e.g. repeated signup)
        const meta = user.user_metadata || {};
        const { data: created, error: createErr } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            name: meta.name || "",
            email: user.email || "",
            phone: meta.phone || null,
          })
          .select()
          .single();
        if (createErr) throw createErr;
        return created;
      }
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

      // Try profiles table first (playerId is a user_id)
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", playerId)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Fallback: playerId might be a club_member_id for unlinked members
      const { data: member, error: mErr } = await supabase
        .from("club_members")
        .select("id, name, email, user_id, gender, ladder_position")
        .eq("id", playerId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!member) return null;

      // If the member has a linked user_id, fetch that profile
      if (member.user_id) {
        const { data: linkedProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", member.user_id)
          .maybeSingle();
        if (linkedProfile) return linkedProfile;
      }

      // Return a synthetic profile from club_members data
      return {
        id: member.id,
        name: member.name || member.email || "Unknown",
        email: member.email,
        avatar_url: null,
        wins: 0,
        losses: 0,
        matches_played: 0,
        rank: member.ladder_position,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phone: null,
      };
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
      const { data, error } = await fromAny("challenge_schedules")
        .select("*")
        .in("challenge_id", challengeIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ChallengeSchedule[];
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
      const { data, error } = await fromAny("challenge_schedules")
        .insert({
          challenge_id: payload.challengeId,
          proposed_by: user.id,
          proposed_date: payload.proposedDate,
          start_time: payload.startTime,
          end_time: payload.endTime,
          court_id: payload.courtId,
          status: "proposed",
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ChallengeSchedule;
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
      const { error } = await fromAny("challenge_schedules")
        .update({ status })
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
      const { error } = await rpc("accept_challenge_schedule", { target_schedule_id: scheduleId });
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

export function useIncomingChallengesCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["challenges", "incoming-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("challenges")
        .select("id", { count: "exact", head: true })
        .eq("opponent_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
      return typeof count === "number" ? count : 0;
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
      proposedTime,
      courtId,
    }: {
      opponentId: string;
      proposedDate?: string | null;
      proposedTime?: string | null;
      courtId?: number;
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

      const { data: oppActive, error: oppActiveError } = await supabase
        .from("challenges")
        .select("id")
        .in("status", ["pending", "accepted"])
        .or(`challenger_id.eq.${opponentId},opponent_id.eq.${opponentId}`)
        .limit(1);
      if (oppActiveError) throw oppActiveError;
      if ((oppActive || []).length > 0) {
        throw new Error("That player already has an active challenge. Try again later.");
      }

      const insertPayload: Record<string, any> = {
        challenger_id: user.id,
        opponent_id: opponentId,
        proposed_date: proposedDate ?? null,
        status: "pending",
      };
      if (proposedTime) insertPayload.proposed_time = proposedTime;
      if (courtId) insertPayload.court_id = courtId;

      const { data, error } = await fromAny("challenges")
        .insert(insertPayload)
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

      // Both players have accounts and are different people → pending confirmation
      const bothLinked = playerA !== playerB;
      const confirmed = !bothLinked; // auto-confirm only when external/same-id placeholder

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
          confirmed,
          disputed: false,
        } as any, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;

      // Notify the other player to confirm
      if (bothLinked) {
        const otherPlayerId = playerA === user.id ? playerB : playerA;
        try {
          await fromAny("notifications").insert({
            user_id: otherPlayerId,
            title: "Confirm Match Result",
            message: `A match result (${score || "no score"}) has been submitted and needs your confirmation.`,
            type: "match",
            url: "/dashboard",
          });
        } catch {
          // non-critical
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      queryClient.invalidateQueries({ queryKey: ["club-recent-matches"] });
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
      const { error } = await rpc("confirm_match", { match_id: matchId });
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
      const { error } = await rpc("dispute_match", {
        match_id: matchId,
        notes: notes ?? null,
        evidence_url: evidenceUrl ?? null,
      });
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
      const { error } = await rpc("admin_confirm_match", { match_id: matchId });
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
      const { data, error } = await fromAny("integrations_accounts")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []) as unknown as IntegrationAccount[];
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
