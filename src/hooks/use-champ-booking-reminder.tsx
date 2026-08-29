/**
 * Dashboard nudge: "Please make your court booking for your next upcoming game."
 *
 * Fires once per day per member when they are drawn into a tournament match
 * that still has no court/date/time. Tapping the toast opens the Tournaments
 * page where the match list and booking action live.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { splitTournamentsByLifecycle } from "@/lib/tournaments/lifecycle";
import { matchesNeedingBooking, bookingReminderMessage } from "@/lib/tournaments/booking-reminder";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function useChampBookingReminder(
  clubId?: string | null,
  memberId?: string | null,
  enabled: boolean = true,
) {
  const navigate = useNavigate();

  const { data: matches } = useQuery({
    queryKey: ["champ-booking-reminder", clubId, memberId],
    queryFn: async () => {
      const { data: champs, error: cErr } = await fromExt("club_champs")
        .select("id, status, start_date, end_date")
        .eq("club_id", clubId!);
      if (cErr) throw cErr;
      const ids = splitTournamentsByLifecycle((champs || []) as any[]).current.map((c: any) => c.id);
      if (!ids.length) return [] as any[];
      const { data, error } = await fromExt("club_champs_matches")
        .select(
          "id, champ_id, status, is_bye, winner_member_id, scheduled_date, scheduled_time, court_id, play_by, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id",
        )
        .in("champ_id", ids)
        .or(
          `player_a_member_id.eq.${memberId},player_b_member_id.eq.${memberId},partner_a_member_id.eq.${memberId},partner_b_member_id.eq.${memberId}`,
        );
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clubId && !!memberId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!clubId || !memberId || !matches?.length) return;

    const pending = matchesNeedingBooking(matches as any[], memberId);
    const message = bookingReminderMessage(pending.length);
    if (!message) return;

    const key = `sh.champ.booking.nudge.${clubId}.${memberId}`;
    try {
      if (localStorage.getItem(key) === today()) return;
      localStorage.setItem(key, today());
    } catch {
      /* ignore */
    }

    toast("🎾 Court booking needed", {
      description: message,
      duration: 12000,
      id: `champ-booking-${memberId}`,
      action: {
        label: "Make your court booking",
        onClick: () => navigate("/tournaments"),
      },
    });
  }, [clubId, memberId, matches, navigate]);
}
