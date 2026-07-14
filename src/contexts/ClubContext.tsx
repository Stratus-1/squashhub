import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { getClubSubdomain } from "@/lib/subdomain";
import { useAuth } from "@/contexts/AuthContext";

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
    payment_gateway?: string | null;
    payment_gateway_public_key?: string | null;
    logo_url: string | null;
    chairman_member_id: string | null;
    secretary_member_id: string | null;
    club_captain_member_id: string | null;
    contact_person_name?: string | null;
    show_delegates_on_landing?: boolean | null;
    currency_code?: string | null;
    currency_symbol?: string | null;
    participation_active?: boolean | null;
    visitors_can_book?: boolean | null;
    visitor_booking_fee?: number | null;
    external_booking_provider?: string | null;
    external_booking_url?: string | null;
    external_booking_label?: string | null;
    uses_gobook?: boolean | null;
    gobook_url?: string | null;
    honesty_bar_enabled?: boolean | null;
    face_enrolment_required?: boolean | null;
    tenant_type: string;
  } | null;
  isLoading: boolean;
}

const ClubContext = createContext<ClubContextType>({
  subdomain: null,
  club: null,
  isLoading: false,
});

// Columns readable by anon (grant-safe). Used for logged-out tenant pages so
// the club name/logo render on the auth screen and club landing.
const PUBLIC_CLUB_COLS =
  "id, name, subdomain, logo_url, address, phone, email, tenant_type, nsa_club_id, chairman_member_id, secretary_member_id, club_captain_member_id, contact_person_name, show_delegates_on_landing, currency_code, currency_symbol, participation_active, visitors_can_book, visitor_booking_fee, external_booking_provider, external_booking_url, external_booking_label, uses_gobook, gobook_url, created_at";

// Restricted columns (payments, honesty bar, face enrolment) — only granted to
// authenticated users. Fetched separately and merged into the club object.
const RESTRICTED_CLUB_COLS =
  "id, payment_gateway, payment_gateway_public_key, honesty_bar_enabled, face_enrolment_required";

export function ClubProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const subdomain = useMemo(
    () => getClubSubdomain(),
    [location.pathname, location.search, location.hash]
  );

  const { data: publicClub = null, isLoading } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select(PUBLIC_CLUB_COLS)
        .eq("subdomain", subdomain!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!subdomain,
    staleTime: 5 * 60 * 1000,
  });

  const { data: restrictedClub = null } = useQuery({
    queryKey: ["club-by-subdomain-restricted", (publicClub as any)?.id, user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select(RESTRICTED_CLUB_COLS)
        .eq("id", (publicClub as any).id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!(publicClub as any)?.id,
    staleTime: 5 * 60 * 1000,
  });

  const club = useMemo(() => {
    if (!publicClub) return null;
    return { ...(publicClub as any), ...((restrictedClub as any) || {}) };
  }, [publicClub, restrictedClub]);

  return (
    <ClubContext.Provider value={{ subdomain, club, isLoading }}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClubContext() {
  return useContext(ClubContext);
}

