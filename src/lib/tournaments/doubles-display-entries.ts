/**
 * Display-only: turn saved entry rows into one row per doubles team PER CATEGORY.
 *
 * A player can be in several doubles categories with a different partner in each
 * (e.g. Mens with Siyanda, Mixed with Lazelle), so a pairing is looked up by
 * category + player, never by player alone. Within one category the second
 * member of a team is folded into the first row, whichever of the two rows
 * already names the partner. Never fed to the draw, pools or seeding.
 */
export interface DoublesPairLite {
  group_number: number | string | null;
  member_a: string | null;
  member_b: string | null;
  member_a_name?: string | null;
  member_b_name?: string | null;
}

const key = (group: unknown, member: unknown) => `${Number(group) || 0}:${String(member || "")}`;

export function pairLookup(pairs: DoublesPairLite[]): Map<string, DoublesPairLite> {
  const map = new Map<string, DoublesPairLite>();
  for (const p of pairs) {
    const a = String(p.member_a || "");
    const b = String(p.member_b || "");
    if (!a || !b) continue;
    map.set(key(p.group_number, a), p);
    map.set(key(p.group_number, b), p);
  }
  return map;
}

export function foldDoublesEntries<T extends Record<string, any>>(entries: T[], pairs: DoublesPairLite[]): T[] {
  const byPair = pairLookup(pairs);
  // Resolve each row's partner first (saved partner wins, else this category's pairing).
  const resolved = entries.map((e) => {
    const mid = String(e.club_member_id || "");
    if (!mid || e.partner_member_id) return e;
    const pair = byPair.get(key(e.group_number, mid));
    if (!pair) return e;
    const isA = String(pair.member_a) === mid;
    const otherId = String(isA ? pair.member_b : pair.member_a);
    const otherName = isA ? pair.member_b_name : pair.member_a_name;
    return { ...e, partner_member_id: otherId, partner: e.partner ?? { id: otherId, name: otherName } };
  });
  // Then keep one row per team per category.
  const taken = new Set<string>();
  const out: T[] = [];
  for (const e of resolved) {
    const mid = String(e.club_member_id || "");
    const pid = String(e.partner_member_id || "");
    if (mid && taken.has(key(e.group_number, mid))) continue;
    if (mid) taken.add(key(e.group_number, mid));
    if (pid) taken.add(key(e.group_number, pid));
    out.push(e);
  }
  return out;
}
