import { supabase } from "@/integrations/supabase/client";

export interface PublicClub {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  subdomain: string | null;
  tenant_type: string;
  nsa_club_id: string | null;
  chairman_member_id: string | null;
  secretary_member_id: string | null;
  club_captain_member_id: string | null;
  show_delegates_on_landing: boolean | null;
  created_at: string;
}

export async function getPublicClubBySubdomain(subdomain: string): Promise<PublicClub | null> {
  const { data, error } = await (supabase.rpc as any)("get_public_club_by_subdomain", {
    _subdomain: subdomain,
  });
  if (error) throw error;
  return ((data || [])[0] as PublicClub | undefined) ?? null;
}

export async function listPublicClubs(): Promise<PublicClub[]> {
  const { data, error } = await (supabase.rpc as any)("list_public_clubs");
  if (error) throw error;
  return (data || []) as PublicClub[];
}