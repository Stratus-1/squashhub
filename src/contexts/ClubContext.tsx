import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { getClubSubdomain } from "@/lib/subdomain";

interface ClubContextType {
  /** The subdomain detected from hostname, or null if on root */
  subdomain: string | null;
  /** The resolved club row, if any */
  club: {
    id: string;
    name: string;
    subdomain: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
    chairman_member_id: string | null;
    secretary_member_id: string | null;
    club_captain_member_id: string | null;
    honesty_bar_enabled: boolean;
    face_enrolment_required: boolean;
    tenant_type: string;
  } | null;
  isLoading: boolean;
}

const ClubContext = createContext<ClubContextType>({
  subdomain: null,
  club: null,
  isLoading: false,
});

export function ClubProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const subdomain = useMemo(
    () => getClubSubdomain(),
    [location.pathname, location.search, location.hash]
  );

  const { data: club = null, isLoading } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url, chairman_member_id, secretary_member_id, club_captain_member_id, honesty_bar_enabled, face_enrolment_required, tenant_type")
        .eq("subdomain", subdomain!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!subdomain,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ClubContext.Provider value={{ subdomain, club, isLoading }}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClubContext() {
  return useContext(ClubContext);
}
