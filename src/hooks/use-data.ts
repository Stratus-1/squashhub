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

export function useLadder() {
  return useQuery({
    queryKey: ["ladder"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .not("rank", "is", null)
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
