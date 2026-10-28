import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useFinancialAccess(clubId?: string) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["financial-admin-access", clubId, user?.id],
    enabled: !!clubId && !!user,
    queryFn: async () => {
      if (!clubId) throw new Error("Club required");
      const { data, error } = await supabase.rpc("club_financial_access" as never, { _club_id: clubId } as never);
      if (error) throw error;
      return data as unknown as { chairman: boolean; can_change: boolean };
    },
    staleTime: 0,
  });
  return { ...query, canChange: query.data?.can_change === true, isChairman: query.data?.chairman === true };
}