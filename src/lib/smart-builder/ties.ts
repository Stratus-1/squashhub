/**
 * Pool-v-pool ties — generic rules shared by the builder UI, validation and fixture generation.
 * Pool ROTATION (which pool meets which pool per round) and PAIRING (who plays whom inside a tie)
 * are separate settings. Each linked stage in a session holds one discipline.
 */
import type { Stage } from "./definition";

export type TieRubber = NonNullable<Stage["tieFormat"]>["rubbers"][number];
export type TiePairing = "position" | "crossover" | "custom";

export const TIE_PAIRING_LABEL: Record<TiePairing, string> = {
  position: "Position-to-position (1v1, 2v2…)",
  crossover: "Crossover (1v2, 2v1, 3v4, 4v3…)",
  custom: "Custom mapping",
};

/** Crossover partner of a unit index (1-based units: players for singles, pairs for doubles). */
const cross = (u: number) => (u % 2 ? u + 1 : u - 1);

/** Opponent positions for one game, or null when the rule can't resolve them. */
export function opponentPositions(r: TieRubber, pairing: TiePairing | null | undefined): number[] | null {
  if (!pairing) return null;
  if (pairing === "custom") return r.positionsB?.length === r.positions.length ? r.positionsB : null;
  if (pairing === "position") return r.positions;
  if (r.positions.length === 1) return [cross(r.positions[0])];
  // Doubles: pair k (positions 2k-1, 2k) meets the crossover pair.
  const k = Math.ceil(Math.max(...r.positions) / 2), o = cross(k);
  return [2 * o - 1, 2 * o];
}

export const gameLabel = (r: TieRubber, pairing: TiePairing | null | undefined) =>
  `${r.positions.join("+")} v ${(opponentPositions(r, pairing) ?? ["?"]).join("+")}`;

/** Standard games for a pool size: singles 1v1…nvn, or doubles 1+2, 3+4…. */
export function standardRubbers(discipline: "singles" | "doubles", poolSize: number, minutes: number): TieRubber[] {
  if (discipline === "singles") return Array.from({ length: poolSize }, (_, i) => ({ discipline, positions: [i + 1], minutes }));
  return Array.from({ length: Math.floor(poolSize / 2) }, (_, i) => ({ discipline, positions: [2 * i + 1, 2 * i + 2], minutes }));
}

export interface TieIssue { level: "error" | "warning"; code: string; message: string }

/** Structural checks for a pool-v-pool league stage. */
export function tieIssues(st: Stage, label = st.name): TieIssue[] {
  if (st.kind !== "cross_pool_league") return [];
  const out: TieIssue[] = [];
  const size = st.groupSize ?? null;
  if ((st.groups ?? 0) < 2) out.push({ level: "error", code: "tie_pools", message: `${label}: a pool-v-pool league needs at least 2 pools.` });
  if (!size) out.push({ level: "error", code: "tie_pool_size", message: `${label}: set the number of ${st.discipline === "doubles" ? "players" : "players"} per pool.` });
  const t = st.tieFormat;
  if (!t?.rubbers.length) { out.push({ level: "error", code: "tie_games", message: `${label}: add the games played in each tie.` }); return out; }
  if (!t.pairing) out.push({ level: "error", code: "tie_pairing", message: `${label}: choose the pairing method inside each tie (position-to-position, crossover or custom).` });
  const need = st.discipline === "doubles" ? 2 : 1;
  const seen = new Set<string>();
  t.rubbers.forEach((r, i) => {
    const g = `${label} game ${i + 1}`;
    if (r.discipline !== st.discipline) out.push({ level: "error", code: "tie_discipline", message: `${g} is ${r.discipline} but the stage is ${st.discipline}. Put ${r.discipline} games in their own linked stage.` });
    if (r.positions.length !== need) out.push({ level: "error", code: "tie_positions", message: `${g}: ${st.discipline} games need ${need} position${need > 1 ? "s" : ""} per side.` });
    const opp = t.pairing ? opponentPositions(r, t.pairing) : [];
    if (t.pairing && !opp) out.push({ level: "error", code: "tie_mapping", message: `${g}: set the opponent position${need > 1 ? "s" : ""} for the custom mapping.` });
    if (size && [...r.positions, ...(opp ?? [])].some((p) => p > size)) out.push({ level: "error", code: "tie_positions", message: `${g} uses a position beyond ${size} (pool size).` });
    const k = r.positions.join("+");
    if (seen.has(k)) out.push({ level: "warning", code: "tie_repeat", message: `${g}: position ${k} already plays in this tie.` });
    seen.add(k);
  });
  if ((st.groups ?? 0) % 2 === 1) out.push({ level: "warning", code: "tie_bye", message: `${label}: an odd number of pools means one pool sits out each round.` });
  return out;
}
