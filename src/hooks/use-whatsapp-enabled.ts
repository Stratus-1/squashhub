import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether a club has opted in to WhatsApp messaging. Used to conditionally
 * surface "WhatsApp" as a delivery channel next to email / in-app options.
 */
export function useWhatsAppEnabled(clubId?: string | null) {
  const { data } = useQuery({
    queryKey: ["club-whatsapp-enabled", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clubs")
        .select("whatsapp_enabled")
        .eq("id", clubId as string)
        .maybeSingle();
      return !!(data as any)?.whatsapp_enabled;
    },
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });
  return !!data;
}
