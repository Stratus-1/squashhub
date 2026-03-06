import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function RealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channels = [
      supabase
        .channel(`realtime:challenges:challenger:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "challenges", filter: `challenger_id=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["challenges", user.id] });
            queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
          }
        )
        .subscribe(),
      supabase
        .channel(`realtime:challenges:opponent:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "challenges", filter: `opponent_id=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["challenges", user.id] });
            queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
          }
        )
        .subscribe(),
      supabase
        .channel(`realtime:matches:a:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `player_a=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["matches", user.id] });
            queryClient.invalidateQueries({ queryKey: ["challenges", user.id] });
            queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
            queryClient.invalidateQueries({ queryKey: ["ladder"] });
          }
        )
        .subscribe(),
      supabase
        .channel(`realtime:matches:b:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `player_b=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["matches", user.id] });
            queryClient.invalidateQueries({ queryKey: ["challenges", user.id] });
            queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
            queryClient.invalidateQueries({ queryKey: ["ladder"] });
          }
        )
        .subscribe(),
      supabase
        .channel(`realtime:bookings:user:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
          }
        )
        .subscribe(),
      supabase
        .channel(`realtime:bookings:opponent:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `opponent_id=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
          }
        )
        .subscribe(),
    ];

    return () => {
      for (const ch of channels) supabase.removeChannel(ch);
    };
  }, [queryClient, user?.id]);

  return null;
}

