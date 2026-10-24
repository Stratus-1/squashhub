import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mayApplyForMembership } from "@/lib/membership-availability";

export function useMembershipAvailability(clubId?: string | null) {
  const query = useQuery({
    queryKey: ["membership-application-availability", clubId],
    enabled: !!clubId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!clubId) return false;
      const { data, error } = await supabase.rpc("club_accepts_membership_applications", { _club_id: clubId });
      if (error) throw error;
      return data;
    },
  });
  return { allowed: mayApplyForMembership(query.data), pending: !!clubId && query.isLoading, failed: query.isError };
}