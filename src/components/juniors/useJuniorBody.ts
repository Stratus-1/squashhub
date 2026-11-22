import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type JuniorBody = {
  found: boolean;
  org_id?: string;
  name?: string;
  kind?: string;
  is_regional?: boolean;
  can_lead?: boolean;
  list_confirmed_at?: string | null;
  list_confirmed_by?: string | null;
  club_count?: number;
  link_token?: string | null;
  pending?: number;
  clubs?: { club_id: string; club_name: string }[];
};

/** The junior body (zone, province or regional) this workspace belongs to, as seen by the signed-in leader. */
export function useJuniorBody(workspaceClubId?: string | null) {
  return useQuery({
    queryKey: ["junior-workspace-body", workspaceClubId],
    enabled: !!workspaceClubId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("junior_workspace_body", { p_club_id: workspaceClubId });
      if (error) throw error;
      return (data ?? { found: false }) as JuniorBody;
    },
  });
}
