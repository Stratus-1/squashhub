import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TipStaff } from "@/components/bar/TipEditor";
export interface TipConfig { enabled: boolean; cash_up_enabled: boolean; staff: TipStaff[] }
export function useBarTips(clubId?: string | null) {
  return useQuery({ queryKey: ["bar-tip-config", clubId], enabled: Boolean(clubId), queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_tip_config" as any, { _club_id: clubId });
    if (error) throw error;
    return data as unknown as TipConfig;
  }});
}