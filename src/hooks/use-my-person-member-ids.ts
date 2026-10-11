import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemberContext } from "@/contexts/MemberContext";

/**
 * All club_member ids of the ACTIVE profile's person (home club + other clubs),
 * so cross-club tournament entries count as "mine". Scoped to the active
 * (possibly delegated family) profile — never every profile on the login, and
 * never matched by email.
 */
export function useMyPersonMemberIds(disabled = false): string[] {
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id ?? null;
  const personId = (activeMember as any)?.person_id ?? null;
  const { data } = useQuery({
    queryKey: ["my-person-member-ids", memberId, personId],
    queryFn: async () => {
      if (!personId) return [memberId!];
      const { data } = await supabase.from("club_members").select("id").eq("person_id", personId);
      const ids = new Set<string>([memberId!, ...((data || []) as any[]).map((r) => r.id)]);
      return [...ids];
    },
    enabled: !!memberId && !disabled,
    staleTime: 5 * 60_000,
  });
  if (disabled || !memberId) return [];
  return data ?? [memberId];
}
