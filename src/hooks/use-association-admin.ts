import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns true when the signed-in user is an association admin for the given
 * association tenant. This covers platform super-admins, club admins of the
 * tenant, and explicit `organisation_admins` entries linked to the association.
 */
export function useIsAssociationAdmin(tenantId: string | undefined): boolean {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["is-association-admin", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user?.id) return false;
      const { data, error } = await (supabase as any).rpc("is_association_admin", {
        _user_id: user.id,
        _tenant_id: tenantId,
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!tenantId && !!user?.id,
  });

  return !!data;
}
