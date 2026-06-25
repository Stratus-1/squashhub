import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { TournamentInviteActions } from "@/components/TournamentInviteActions";

/**
 * Surfaces pending tournament invites on the dashboard, similar to the
 * league availability card. Shows any tournament where one of the user's
 * linked members has an invite that hasn't been accepted, declined, paid
 * or cancelled yet.
 */
export function DashboardTournamentInvitesCard() {
  const { linkedMembers } = useMemberContext();
  const memberIds = linkedMembers.map((m) => m.id).filter(Boolean);

  const { data: pending = [] } = useQuery({
    queryKey: ["dashboard-tournament-invites", memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, champ_id, status, partner_confirmed, invited_by_admin, champ:champ_id(id, name, status)")
        .in("club_member_id", memberIds)
        .eq("invited_by_admin", true);
      if (error) throw error;
      const rows = (data || []) as any[];
      return rows.filter((r) => {
        const champStatus = String(r?.champ?.status || "").toLowerCase();
        if (["completed", "cancelled", "archived"].includes(champStatus)) return false;
        const s = String(r.status || "").toLowerCase();
        // Awaiting reply: still in invited / pending_payment state
        return ["invited", "pending", "pending_payment"].includes(s);
      });
    },
    enabled: memberIds.length > 0,
    refetchOnWindowFocus: true,
  });

  if (!pending.length) return null;

  return (
    <div className="space-y-2">
      {pending.map((r: any) => (
        <TournamentInviteActions
          key={r.id}
          champId={r.champ_id}
          registrationId={r.id}
        />
      ))}
    </div>
  );
}
