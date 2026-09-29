import { rpcExt } from "@/lib/supabase-ext";

const SIDES = [
  ["player_a", "player_a_member_id"],
  ["player_b", "player_b_member_id"],
  ["partner_a", "partner_a_member_id"],
  ["partner_b", "partner_b_member_id"],
] as const;

/**
 * Players from other clubs are hidden by club privacy, so the joined member is
 * null and the UI shows "Unknown". Fill those names from the tournament-scoped
 * lookup (names/member numbers only, for people in that tournament).
 */
export async function hydrateTournamentNames<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  const champIds = new Set<string>();
  for (const r of rows) {
    for (const [k, idKey] of SIDES) {
      if (r[idKey] && !r[k]?.name && !r[k]?.profiles?.name) champIds.add(r.champ_id);
    }
  }
  if (!champIds.size) return rows;
  const names = new Map<string, any>();
  await Promise.all(
    [...champIds].filter(Boolean).map(async (id) => {
      const { data } = await rpcExt("tournament_member_names", { p_champ_id: id });
      ((data as any[]) || []).forEach((m) => names.set(m.id, m));
    }),
  );
  return rows.map((r) => {
    const out: any = { ...r };
    for (const [k, idKey] of SIDES) {
      const id = r[idKey];
      if (id && !r[k]?.name && !r[k]?.profiles?.name && names.has(id)) {
        out[k] = { ...(r[k] || {}), id, name: names.get(id).name };
      }
    }
    return out;
  });
}
