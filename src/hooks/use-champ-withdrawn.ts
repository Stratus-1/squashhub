/**
 * Members who are OUT of a championship because an organiser pulled them out
 * (or they declined / withdrew) — as opposed to losing on court.
 *
 * A withdrawal is treated exactly like a knockout: the member keeps their
 * played history, is struck through wherever they appear, and never receives
 * another fixture or bye in a later round.
 */
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

const OUT_STATUSES = ["cancelled", "declined", "withdrawn"];

export function useChampWithdrawn(champId?: string | null) {
  return useQuery<Set<string>>({
    queryKey: ["club-champ-withdrawn", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status")
        .eq("champ_id", champId!)
        .in("status", OUT_STATUSES);
      if (error) throw error;
      const out = new Set<string>();
      for (const r of (data || []) as any[]) {
        if (r.club_member_id) out.add(String(r.club_member_id));
        if (r.partner_member_id) out.add(String(r.partner_member_id));
      }
      return out;
    },
    enabled: !!champId,
    staleTime: 30_000,
  });
}

/** Ids of members who are out of the draw, from already-loaded registrations. */
export function withdrawnMemberIds(registrations: any[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const r of registrations || []) {
    if (!OUT_STATUSES.includes(String(r?.status || "").toLowerCase())) continue;
    if (r.club_member_id) out.add(String(r.club_member_id));
    if (r.partner_member_id) out.add(String(r.partner_member_id));
  }
  return out;
}
