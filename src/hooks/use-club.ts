import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fromExt } from "@/lib/supabase-ext";

export interface Club {
  id: string;
  name: string;
  subdomain?: string;
  logo_url?: string;
  address?: string;
  email?: string;
  phone?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_branch_code?: string;
  bank_reference?: string;
  payment_gateway?: string;
  payment_gateway_public_key?: string;
  payment_gateway_secret_key?: string;
  member_fee_annual?: number;
  member_fee_due_month?: number;
  fee_reminder_days_before?: number;
  chairman_member_id?: string;
  secretary_member_id?: string;
  club_captain_member_id?: string;
  member_number_prefix?: string;
  member_number_length?: number;
  member_number_start?: number;
  challenge_levels_up?: number;
  light_fee_per_hour?: number;
  shelly_auth_key?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ClubMember {
  id: string;
  club_id: string;
  user_id?: string;
  name?: string;
  email?: string;
  role: "captain" | "admin" | "member";
  club_member_number?: string;
  plays_league: boolean;
  league_player_rank?: number;
  id_number?: string;
  gender?: string;
  phone?: string;
  address?: string;
  fee_category_id?: string;
  joined_at: string;
  updated_at: string;
  profiles?: { name: string; email: string; phone?: string; avatar_url?: string };
  fee_category?: MemberFeeCategory;
  skill_level?: string;
}

export const SKILL_LEVELS = [
  { value: "elite", label: "Elite", order: 1 },
  { value: "league_player", label: "League Player", order: 2 },
  { value: "club_player", label: "Club Player", order: 3 },
  { value: "social_player", label: "Social Player", order: 4 },
  { value: "beginner", label: "Beginner", order: 5 },
] as const;

export function getSkillOrder(level?: string | null): number {
  const found = SKILL_LEVELS.find(s => s.value === level);
  return found ? found.order : 99;
}

export function getSkillLabel(level?: string | null): string {
  const found = SKILL_LEVELS.find(s => s.value === level);
  return found ? found.label : "";
}

export interface MemberFeeCategory {
  id: string;
  club_id: string;
  name: string;
  description?: string;
  annual_fee: number;
  sort_order: number;
}

export interface LeagueAssociation {
  id: string;
  club_id: string;
  name: string;
  abbreviation?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  fee_annual?: number;
  fee_due_month?: number;
  fee_payable_to?: string;
  fee_payment_details?: string;
}

export interface League {
  id: string;
  club_id: string;
  association_id?: string;
  name: string;
  code?: string;
}

export interface NationalBodyFee {
  id: string;
  club_id: string;
  body_name: string;
  abbreviation?: string;
  fee_annual?: number;
  fee_due_month?: number;
  fee_payable_to?: string;
  fee_payment_details?: string;
}

export interface MemberLeagueRegistration {
  id: string;
  club_member_id: string;
  league_id: string;
  league_association_number?: string;
  ssa_number?: string;
  player_rank?: number;
}

/** Get the club the current user belongs to (first one found) */
export function useMyClub() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-club", user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("club_id, role, clubs:club_id(*)")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { membership: { club_id: data.club_id, role: data.role }, club: data.clubs as Club };
    },
    enabled: !!user,
  });
}

/** Check if user is club admin */
export function useIsClubAdmin() {
  const { data } = useMyClub();
  return data?.membership?.role === "captain" || data?.membership?.role === "admin";
}

/** Get the current user's own club member record */
export function useMyClubMember() {
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  return useQuery({
    queryKey: ["my-club-member", user?.id, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("*, fee_category:fee_category_id(id, name, annual_fee)")
        .eq("user_id", user!.id)
        .eq("club_id", clubId!)
        .maybeSingle();
      if (error) throw error;
      return data as ClubMember | null;
    },
    enabled: !!user && !!clubId,
  });
}

/** Get club members */
export function useClubMembers(clubId?: string) {
  return useQuery({
    queryKey: ["club-members", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("*, profiles:user_id(name, email, phone, avatar_url), fee_category:fee_category_id(id, name, annual_fee)")
        .eq("club_id", clubId!)
        .order("role")
        .order("joined_at");
      if (error) throw error;
      return (data || []) as ClubMember[];
    },
    enabled: !!clubId,
  });
}

/** Get fee categories for a club */
export function useFeeCategories(clubId?: string) {
  return useQuery({
    queryKey: ["fee-categories", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_fee_categories")
        .select("*")
        .eq("club_id", clubId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as MemberFeeCategory[];
    },
    enabled: !!clubId,
  });
}

/** Get league associations for a club */
export function useLeagueAssociations(clubId?: string) {
  return useQuery({
    queryKey: ["league-associations", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("league_associations").select("*").eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as LeagueAssociation[];
    },
    enabled: !!clubId,
  });
}

/** Get the current user's league registration (from member_league_registrations) */
export function useMyLeagueRegistration(clubMemberId?: string) {
  return useQuery({
    queryKey: ["my-league-registration", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("*")
        .eq("club_member_id", clubMemberId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; league_id: string; league_association_number: string | null; ssa_number: string | null; is_captain: boolean; player_rank: number | null; club_member_id: string } | null;
    },
    enabled: !!clubMemberId,
  });
}

/** Get leagues for a club */
export function useLeagues(clubId?: string) {
  return useQuery({
    queryKey: ["leagues", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues").select("*").eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as League[];
    },
    enabled: !!clubId,
  });
}

/** Get national body fees for a club */
export function useNationalBodyFees(clubId?: string) {
  return useQuery({
    queryKey: ["national-body-fees", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("national_body_fees").select("*").eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as NationalBodyFee[];
    },
    enabled: !!clubId,
  });
}

/** Get member league registrations */
export function useMemberLeagueRegistrations(clubMemberId?: string) {
  return useQuery({
    queryKey: ["member-league-registrations", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("*, leagues:league_id(name, code)")
        .eq("club_member_id", clubMemberId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId,
  });
}

/** Register a new club (self-service) */
export function useCreateClub() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (club: Partial<Club>) => {
      // Create the club
      const { data: newClub, error } = await fromExt("clubs")
        .insert({ ...club, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      // Add creator as captain
      const { error: memErr } = await fromExt("club_members").insert({
        club_id: newClub.id,
        user_id: user!.id,
        role: "captain",
      });
      if (memErr) throw memErr;
      return newClub as Club;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-club"] }),
  });
}

/** Update club details */
export function useUpdateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Club> & { id: string }) => {
      const { data, error } = await fromExt("clubs").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as Club;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-club"] }),
  });
}
