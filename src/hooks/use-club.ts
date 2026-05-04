import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";

export interface Club {
  id: string;
  name: string;
  subdomain?: string;
  logo_url?: string;
  address?: string;
  email?: string;
  phone?: string;
  payment_gateway?: string;
  payment_gateway_public_key?: string;
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
  lights_integration_enabled?: boolean;
  honesty_bar_enabled?: boolean;
  face_enrolment_required?: boolean;
  tenant_type?: string;
  league_member_annual_fee?: number;
  league_fee_due_month?: number;
  booking_slot_minutes?: number;
  peak_weekday_start?: string;
  peak_weekday_end?: string;
  peak_weekend_start?: string;
  peak_weekend_end?: string;
  max_peak_bookings_per_day?: number;
  uses_gobook?: boolean;
  gobook_url?: string;
  external_booking_provider?: string | null;
  external_booking_url?: string | null;
  external_booking_label?: string | null;
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
  ladder_position?: number;
  id_number?: string;
  gender?: string;
  phone?: string;
  address?: string;
  fee_category_id?: string;
  avatar_url?: string | null;
  joined_at: string;
  updated_at: string;
  profiles?: { name: string; email: string; phone?: string; avatar_url?: string };
  fee_category?: MemberFeeCategory;
  skill_level?: string;
}

export const SKILL_LEVELS = [
  { value: "advanced", label: "Advanced", order: 1 },
  { value: "intermediate", label: "Intermediate", order: 2 },
  { value: "beginner", label: "Beginner", order: 3 },
] as const;

// Legacy skill values are mapped to the current 3-tier scale so existing
// member records still resolve to a valid label / order.
const LEGACY_SKILL_MAP: Record<string, string> = {
  elite: "advanced",
  league_player: "advanced",
  club_player: "intermediate",
  social_player: "beginner",
};

function normalizeSkillValue(level?: string | null): string | null {
  if (!level) return null;
  return LEGACY_SKILL_MAP[level] ?? level;
}

export function getSkillOrder(level?: string | null): number {
  const v = normalizeSkillValue(level);
  const found = SKILL_LEVELS.find(s => s.value === v);
  return found ? found.order : 99;
}

export function getSkillLabel(level?: string | null): string {
  const v = normalizeSkillValue(level);
  const found = SKILL_LEVELS.find(s => s.value === v);
  return found ? found.label : "";
}

export interface MemberFeeCategory {
  id: string;
  club_id: string;
  name: string;
  description?: string;
  annual_fee: number;
  sort_order: number;
  fee_class: "club_income" | "pass_through";
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
  fee_class: "club_income" | "pass_through";
  platform_association_id?: string | null;
  scope?: "internal" | "region";
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
  fee_class: "club_income" | "pass_through";
}

export interface MemberLeagueRegistration {
  id: string;
  club_member_id: string;
  league_id: string;
  league_association_number?: string;
  ssa_number?: string;
  player_rank?: number;
}

/** Get the current user's membership for the active tenant when one is selected */
export function useMyClub() {
  const { user } = useAuth();
  const { club: contextClub, subdomain } = useClubContext();
  const activeClubId = contextClub?.id;

  return useQuery({
    queryKey: ["my-club", user?.id, activeClubId ?? subdomain ?? null],
    queryFn: async () => {
      let query = fromExt("club_members")
        .select("club_id, role, clubs:club_id(*)")
        .eq("user_id", user!.id)
        .order("joined_at", { ascending: true });

      if (activeClubId) {
        query = query.eq("club_id", activeClubId);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      if (!data) {
        // If a tenant context is active but the user has no membership there,
        // surface the tenant club so the UI still renders in the correct context.
        if (contextClub) {
          return { membership: null as any, club: contextClub as unknown as Club };
        }
        return null;
      }
      return { membership: { club_id: data.club_id, role: data.role }, club: data.clubs as Club };
    },
    enabled: !!user && (!subdomain || !!activeClubId),
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
      // Use limit(1) instead of maybeSingle() because a user can have
      // multiple club_member rows (family accounts / duplicates).
      const { data, error } = await fromExt("club_members")
        .select("*, fee_category:fee_category_id(id, name, annual_fee)")
        .eq("user_id", user!.id)
        .eq("club_id", clubId!)
        .order("joined_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data && data.length > 0 ? data[0] : null) as ClubMember | null;
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

/**
 * Get the current user's primary league registration.
 *
 * A member can be slotted into many leagues by an admin (pool/guest depth),
 * so we have to pick the *one* that represents their actual home team.
 *
 * Priority order:
 *  1. The registration whose `league_association_number` matches the
 *     member's permanent NSA/league number from `member_association_affiliations`.
 *     This is the league the admin actually placed the player's permanent
 *     number into (e.g. NSF7155 → Men's 6th League).
 *  2. Any registration where they are captain.
 *  3. The lowest player_rank registration with a number set.
 *  4. Anything with a number, then anything at all.
 */
export function useMyLeagueRegistration(clubMemberId?: string) {
  return useQuery({
    queryKey: ["my-league-registration", clubMemberId],
    queryFn: async () => {
      const [regsRes, affsRes] = await Promise.all([
        fromExt("member_league_registrations")
          .select("*, leagues:league_id(id, name, code, association_id)")
          .eq("club_member_id", clubMemberId!)
          .order("created_at", { ascending: true }),
        fromExt("member_association_affiliations")
          .select("association_id, league_association_number, active")
          .eq("club_member_id", clubMemberId!)
          .eq("active", true),
      ]);
      if (regsRes.error) throw regsRes.error;

      const rows = (regsRes.data || []) as Array<{
        id: string;
        club_member_id: string;
        league_id: string;
        league_association_number: string | null;
        ssa_number: string | null;
        is_captain: boolean;
        player_rank: number | null;
        leagues?: {
          id?: string | null;
          name?: string | null;
          code?: string | null;
          association_id?: string | null;
        } | null;
      }>;
      const affs = (affsRes.data || []) as Array<{
        association_id: string;
        league_association_number: string | null;
      }>;

      // Set of canonical (permanent) NSA numbers this member owns.
      const permanentNumbers = new Set(
        affs
          .map((a) => (a.league_association_number || "").trim().toUpperCase())
          .filter((n) => n.length > 0),
      );
      // Map association_id → canonical permanent number, for matching by association.
      const permanentNumberByAssoc: Record<string, string> = {};
      for (const a of affs) {
        const n = (a.league_association_number || "").trim().toUpperCase();
        if (n) permanentNumberByAssoc[a.association_id] = n;
      }

      const numberMatchesPermanent = (row: typeof rows[number]) => {
        const n = (row.league_association_number || "").trim().toUpperCase();
        if (!n) return false;
        if (permanentNumbers.has(n)) return true;
        const aid = row.leagues?.association_id;
        return !!aid && permanentNumberByAssoc[aid] === n;
      };

      const bestRow =
        // 1. Registration carrying the permanent NSA number AND captain
        rows.find((r) => numberMatchesPermanent(r) && r.is_captain) ||
        // 2. Any registration carrying the permanent NSA number, lowest rank first
        rows
          .filter(numberMatchesPermanent)
          .sort((a, b) => (a.player_rank ?? 99) - (b.player_rank ?? 99))[0] ||
        // 3. Captain row with any number
        rows.find((r) => r.is_captain && !!r.league_association_number?.trim()) ||
        // 4. Any row with a number, lowest rank
        rows
          .filter((r) => !!r.league_association_number?.trim())
          .sort((a, b) => (a.player_rank ?? 99) - (b.player_rank ?? 99))[0] ||
        rows[0] ||
        null;

      return bestRow
        ? {
            ...bestRow,
            association_id: bestRow.leagues?.association_id || null,
          }
        : null;
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

      // Send club registration confirmation email (fire-and-forget)
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", user!.id)
        .single();

      if (profile?.email) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const fnUrl = `https://${projectId}.supabase.co/functions/v1/auth-email-hook?action=club-registered`;
        fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": anonKey },
          body: JSON.stringify({
            to: profile.email,
            name: profile.name || "",
            clubName: newClub.name || club.name || "Your Club",
            clubAdminUrl: `${window.location.origin}/club-admin`,
          }),
        }).catch((err) => console.warn("Club registration email failed:", err));
      }

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-club"] });
      qc.invalidateQueries({ queryKey: ["club-by-subdomain"] });
      qc.invalidateQueries({ queryKey: ["club-delegates"] });
    },
  });
}
