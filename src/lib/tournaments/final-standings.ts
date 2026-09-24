/**
 * Final overall standings for "pools followed by placement play-offs".
 *
 * Lifecycle rule (generic, all tournaments):
 *  - pool play / unresolved play-offs → pool tables stay primary (returns null)
 *  - every placement play-off decided → one combined FINAL table, ordered
 *    purely from play-off outcomes (winner of pos-n final = 2n-1, loser = 2n).
 *    Pool standings are never merged or re-sorted to produce this.
 *
 * Placement finals are stored as stage "playoff_final" with
 * bracket_position = league * 1000 + n (see tournament-playoffs.ts).
 * Doubles teams are taken exactly as recorded on the row (player + partner);
 * partners are never re-paired.
 */
export interface PlacementMatch {
  id?: string;
  stage?: string | null;
  status?: string | null;
  group_number?: number | null;
  bracket_position?: number | null;
  player_a_member_id?: string | null;
  partner_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_b_member_id?: string | null;
  winner_member_id?: string | null;
  side_a_points?: number | null;
  side_b_points?: number | null;
}

export interface FinalPlacement {
  position: number;
  player_member_id: string;
  partner_member_id: string | null;
  /** Placement play-off that decided this position, e.g. n=1 → 1st/2nd. */
  decidedBySlot: number;
  won: boolean;
}

const STRIDE = 1000;

function winnerSide(m: PlacementMatch): "a" | "b" | null {
  if (m.status !== "completed") return null;
  const a = [m.player_a_member_id, m.partner_a_member_id].filter(Boolean);
  const b = [m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
  if (m.winner_member_id) {
    if (a.includes(m.winner_member_id)) return "a";
    if (b.includes(m.winner_member_id)) return "b";
    return null;
  }
  const pa = Number(m.side_a_points) || 0;
  const pb = Number(m.side_b_points) || 0;
  if (pa === pb) return null;
  return pa > pb ? "a" : "b";
}

/**
 * @param expectedTeams number of teams in the division (all pools). When
 *   given, the final table is only produced if every team is placed.
 */
export function computeFinalPlacements(
  matches: PlacementMatch[],
  groupNumber: number,
  expectedTeams?: number,
): FinalPlacement[] | null {
  const rows = matches.filter(
    (m) =>
      m.stage === "playoff_final" &&
      (m.group_number ?? groupNumber) === groupNumber &&
      m.bracket_position != null &&
      Math.floor(Number(m.bracket_position) / STRIDE) === groupNumber &&
      Number(m.bracket_position) % STRIDE >= 1,
  );
  if (rows.length === 0) return null;
  const slots = new Map<number, PlacementMatch>();
  for (const r of rows) {
    const n = Number(r.bracket_position) % STRIDE;
    if (slots.has(n)) return null; // two rows for one placement → inconsistent
    slots.set(n, r);
  }
  const ns = [...slots.keys()].sort((a, b) => a - b);
  // Slots must be contiguous 1..N (no missing placement final).
  if (ns.some((n, i) => n !== i + 1)) return null;

  const out: FinalPlacement[] = [];
  const seen = new Set<string>();
  for (const n of ns) {
    const m = slots.get(n)!;
    if (!m.player_a_member_id || !m.player_b_member_id) return null;
    const w = winnerSide(m);
    if (!w) return null; // unresolved → keep pool view
    const sideA = { player: m.player_a_member_id, partner: m.partner_a_member_id ?? null };
    const sideB = { player: m.player_b_member_id, partner: m.partner_b_member_id ?? null };
    const [win, lose] = w === "a" ? [sideA, sideB] : [sideB, sideA];
    for (const t of [win, lose]) {
      for (const id of [t.player, t.partner].filter(Boolean) as string[]) {
        if (seen.has(id)) return null; // same player placed twice
        seen.add(id);
      }
    }
    out.push({ position: 2 * n - 1, player_member_id: win.player, partner_member_id: win.partner, decidedBySlot: n, won: true });
    out.push({ position: 2 * n, player_member_id: lose.player, partner_member_id: lose.partner, decidedBySlot: n, won: false });
  }
  if (expectedTeams != null && out.length !== expectedTeams) return null;
  return out;
}

export const placementSlotLabel = (n: number) => {
  const o = (k: number) => (k === 1 ? "1st" : k === 2 ? "2nd" : k === 3 ? "3rd" : `${k}th`);
  return `${o(2 * n - 1)}/${o(2 * n)} play-off`;
};
