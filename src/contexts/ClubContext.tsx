import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  } | null;
  isLoading: boolean;
}

const ClubContext = createContext<ClubContextType>({
  subdomain: null,
  club: null,
  isLoading: false,
});

export function ClubProvider({ children }: { children: ReactNode }) {
  const subdomain = useMemo(() => getClubSubdomain(), []);

  const { data: club = null, isLoading } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url")
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
