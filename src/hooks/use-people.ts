import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PersonDirectoryRow {
  id: string;
  national_player_number: string | null;
  full_name: string;
  gender: string | null;
  status: string;
  nationality: string | null;
  age: number | null;
  age_group: string | null;
  primary_club_id: string | null;
  primary_club_name: string | null;
  association_name: string | null;
  membership_status: string | null;
  club_link_count: number;
  quality_flags: string[];
}

export interface DuplicateCandidate {
  person_a_id: string;
  person_a_name: string;
  person_a_club: string | null;
  person_b_id: string;
  person_b_name: string;
  person_b_club: string | null;
  confidence: number;
  reasons: string[];
}

/** Suggested duplicates only — never auto-merged, every pair needs admin review. */
export function useDuplicateCandidates(limit = 200) {
  return useQuery({
    queryKey: ["people-duplicate-candidates", limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("people_duplicate_candidates", { _limit: limit });
      if (error) throw error;
      return (data || []) as DuplicateCandidate[];
    },
  });
}


export interface PersonClubLink {
  person_id: string;
  club_id: string;
  club_name: string | null;
  role: string;
  club_member_number: string | null;
}

/** National person directory — never exposes date of birth, only age / age group. */
export function usePeopleDirectory(search: string) {
  return useQuery({
    queryKey: ["people-directory", search],
    queryFn: async () => {
      let q = supabase
        .from("people_directory")
        .select("*")
        .order("full_name")
        .limit(200);
      if (search.trim()) q = q.ilike("full_name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PersonDirectoryRow[];
    },
  });
}

/** Club memberships that sit underneath each person (the club facets of the spine). */
export function usePersonClubLinks(personIds: string[]) {
  const key = [...personIds].sort().join(",");
  return useQuery({
    queryKey: ["person-club-links", key],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("person_id, club_id, role, club_member_number, clubs(name)")
        .in("person_id", personIds);
      if (error) throw error;
      const map = new Map<string, PersonClubLink[]>();
      (data || []).forEach((r: any) => {
        if (!r.person_id) return;
        const list = map.get(r.person_id) || [];
        list.push({
          person_id: r.person_id,
          club_id: r.club_id,
          club_name: r.clubs?.name ?? null,
          role: r.role,
          club_member_number: r.club_member_number,
        });
        map.set(r.person_id, list);
      });
      return map;
    },
  });
}

/** National affiliation / competitive licence rows for a person. */
export function usePersonAffiliations(personId: string | null) {
  return useQuery({
    queryKey: ["person-affiliations", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_affiliations")
        .select("*, organisations(name)")
        .eq("person_id", personId!)
        .order("season_year", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useMergePeople() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, dupId }: { keepId: string; dupId: string }) => {
      const { error } = await supabase.rpc("merge_people", {
        _keep_id: keepId,
        _dup_id: dupId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people-directory"] });
      qc.invalidateQueries({ queryKey: ["person-club-links"] });
    },
  });
}

/** Licence products defined per organisation/season. Charging stays off until activated. */
export function useLicenceProducts() {
  return useQuery({
    queryKey: ["licence-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("national_licence_products")
        .select("*, organisations(name)")
        .order("season_year", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}
