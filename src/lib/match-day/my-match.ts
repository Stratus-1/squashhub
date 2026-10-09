/**
 * Finds the signed-in visitor's own current/next match in a tournament, using
 * their normal member session (row rules apply). Returns null for anyone who
 * is not signed in or not a participant — a Match Day link never identifies
 * or authorises a person by itself.
 */
import { supabase } from "@/integrations/supabase/client";

const SIDES = ["player_a_member_id", "player_b_member_id", "partner_a_member_id", "partner_b_member_id"] as const;

export function pickMyMatch(matches: any[], myIds: string[]) {
  const mine = matches.filter((m) => !m.is_bye && SIDES.some((k) => m[k] && myIds.includes(m[k])));
  const open = mine.filter((m) => !["completed", "cancelled", "walkover"].includes(String(m.status || "")));
  open.sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));
  return open[0] ?? null;
}

export async function findMyTournamentMatch(champId: string, clubId: string): Promise<{ champId: string; label: string } | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid || !champId) return null;
  const { data: me } = await (supabase as any).from("club_members").select("id").eq("user_id", uid).eq("club_id", clubId);
  const myIds: string[] = (me ?? []).map((r: any) => r.id);
  if (!myIds.length) return null;
  const or = SIDES.map((k) => `${k}.in.(${myIds.join(",")})`).join(",");
  const { data: rows } = await (supabase as any).from("club_champs_matches")
    .select("id,round_number,status,is_bye,player_a_member_id,player_b_member_id,partner_a_member_id,partner_b_member_id")
    .eq("champ_id", champId).or(or);
  const m = pickMyMatch(rows ?? [], myIds);
  if (!m) return null;
  const onA = [m.player_a_member_id, m.partner_a_member_id].some((x: string) => myIds.includes(x));
  const oppIds = (onA ? [m.player_b_member_id, m.partner_b_member_id] : [m.player_a_member_id, m.partner_a_member_id]).filter(Boolean);
  let opp = "opponent to be confirmed";
  if (oppIds.length) {
    const { data: names } = await (supabase as any).from("club_members").select("id,name").in("id", oppIds);
    const n = (names ?? []).map((r: any) => r.name).filter(Boolean).join(" & ");
    if (n) opp = n;
  }
  return { champId, label: `Round ${m.round_number ?? "?"} vs ${opp}` };
}
