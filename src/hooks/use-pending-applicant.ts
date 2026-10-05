import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemberContext } from "@/contexts/MemberContext";

/**
 * True while the active member's club row is still an unapproved application.
 * The server hides courts from pending applicants, so booking entry points
 * (tiles, nav buttons) should be hidden too.
 */
export function usePendingApplicant(): boolean {
  const { activeMember } = useMemberContext();
  const { data } = useQuery({
    queryKey: ["pending-applicant", activeMember?.id],
    enabled: !!activeMember?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("is_pending_approval")
        .eq("id", activeMember!.id)
        .maybeSingle();
      return !!(data as any)?.is_pending_approval;
    },
  });
  return !!data;
}
