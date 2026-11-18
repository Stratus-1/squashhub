import { supabase } from "@/integrations/supabase/client";

/**
 * Move a club to another senior association (or to "no association" with null).
 * Single writer for club ↔ association membership: updates the national structure,
 * records the move and notifies the old association. Never deletes the club.
 */
export async function moveClubToAssociation(clubId: string, associationOrgId: string | null) {
  const { data, error } = await (supabase as any).rpc("federation_move_club", {
    _club_id: clubId,
    _new_parent_org: associationOrgId,
  });
  if (error) throw new Error(error.message || "Could not move the club");
  return data as { ok: boolean; unchanged?: boolean };
}
