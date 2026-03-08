import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const fromAny = (table: string) => (supabase as any).from(table);

export type AvailabilitySlot = {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function useDayName(dayOfWeek: number) {
  return DAY_NAMES[dayOfWeek] || "Unknown";
}

export { DAY_NAMES };

export function useMyAvailability() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-availability", user?.id],
    queryFn: async () => {
      if (!user) return [] as AvailabilitySlot[];
      const { data, error } = await fromAny("player_availability")
        .select("*")
        .eq("user_id", user.id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data || []) as AvailabilitySlot[];
    },
    enabled: !!user,
  });
}

export function usePlayerAvailability(playerId?: string | null) {
  return useQuery({
    queryKey: ["player-availability", playerId],
    queryFn: async () => {
      if (!playerId) return [] as AvailabilitySlot[];
      const { data, error } = await fromAny("player_availability")
        .select("*")
        .eq("user_id", playerId)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data || []) as AvailabilitySlot[];
    },
    enabled: !!playerId,
  });
}

export function useAddAvailability() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ dayOfWeek, startTime, endTime }: { dayOfWeek: number; startTime: string; endTime: string }) => {
      if (!user) throw new Error("Not logged in");
      const { data, error } = await fromAny("player_availability").insert({
        user_id: user.id,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-availability"] });
    },
  });
}

export function useRemoveAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await fromAny("player_availability").delete().eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-availability"] });
    },
  });
}

// Find overlapping slots between two players
export function useOverlappingSlots(playerAId?: string | null, playerBId?: string | null) {
  return useQuery({
    queryKey: ["overlapping-availability", playerAId, playerBId],
    queryFn: async () => {
      if (!playerAId || !playerBId) return [];
      
      const [{ data: slotsA }, { data: slotsB }] = await Promise.all([
        fromAny("player_availability").select("*").eq("user_id", playerAId),
        fromAny("player_availability").select("*").eq("user_id", playerBId),
      ]);

      const overlaps: { day_of_week: number; start_time: string; end_time: string }[] = [];

      for (const a of (slotsA || []) as AvailabilitySlot[]) {
        for (const b of (slotsB || []) as AvailabilitySlot[]) {
          if (a.day_of_week !== b.day_of_week) continue;
          const start = a.start_time > b.start_time ? a.start_time : b.start_time;
          const end = a.end_time < b.end_time ? a.end_time : b.end_time;
          if (start < end) {
            overlaps.push({ day_of_week: a.day_of_week, start_time: start, end_time: end });
          }
        }
      }

      return overlaps;
    },
    enabled: !!playerAId && !!playerBId,
  });
}
