/**
 * Members who are OUT of a championship because an organiser pulled them out
 * (or they declined / withdrew) — as opposed to losing on court.
 *
 * A withdrawal is treated exactly like a knockout: the member keeps their
 * played history, is struck through wherever they appear, and never receives
 * another fixture or bye in a later round.
 *
 * A partner named on a withdrawn row is only out if they have no live entry of
 * their own — one player pulling out must never strike through a partner who
 * is still entered (and possibly paid).
 */
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

const OUT_STATUSES = ["cancelled", "declined", "withdrawn"];

const isOut = (status: unknown) => OUT_STATUSES.includes(String(status || "").toLowerCase());

function computeWithdrawn(rows: any[]): Set<string> {
  // Anyone with a live registration of their own is never treated as out.
  const stillIn = new Set<string>();
  for (const r of rows) {
    if (!isOut(r?.status) && r?.club_member_id) stillIn.add(String(r.club_member_id));
  }

  const out = new Set<string>();
  for (const r of rows) {
    if (!isOut(r?.status)) continue;
    if (r.club_member_id) out.add(String(r.club_member_id));
    if (r.partner_member_id && !stillIn.has(String(r.partner_member_id))) {
      out.add(String(r.partner_member_id));
    }
  }
  for (const id of stillIn) out.delete(id);
  return out;
}

export function useChampWithdrawn(champId?: string | null) {
  return useQuery<Set<string>>({
    queryKey: ["club-champ-withdrawn", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status")
        .eq("champ_id", champId!);
      if (error) throw error;
      return computeWithdrawn((data || []) as any[]);
    },
    enabled: !!champId,
    staleTime: 30_000,
  });
}

/** Ids of members who are out of the draw, from already-loaded registrations. */
export function withdrawnMemberIds(registrations: any[] | undefined): Set<string> {
  return computeWithdrawn(registrations || []);
}
