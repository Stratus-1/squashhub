/**
 * Where a stage's courts and match length come from — resolved, never re-typed per stage.
 *   pool home courts (poolGroups) → division courts (Division.courtKeys) → stage override → tournament courts (Design)
 * Match length (court-slot duration) is a SCHEDULE input: tie games' own minutes → stage/tournament
 * match minutes. Scoring (PAR, Bells cap…) never supplies it.
 */
import { effectiveSchedule, type Division, type Stage, type TournamentDefinition } from "./definition";
import { selectedCourtPool } from "./venues";

export const courtKey = (c: { clubId: string; courtId: number }) => `${c.clubId}:${c.courtId}`;

export interface StageCourts { count: number; source: "pools" | "division" | "stage" | "tournament" | null; text: string }

export function stageCourts(def: TournamentDefinition, div: Division, st: Stage): StageCourts {
  const poolCourts = [...new Set((div.poolGroups ?? []).map((g) => g.court).filter(Boolean) as string[])];
  if (poolCourts.length) return { count: poolCourts.length, source: "pools", text: `${poolCourts.join(", ")} (pool home courts)` };
  const pool = new Set(selectedCourtPool(def).map(courtKey));
  const mine = (div.courtKeys ?? []).filter((k) => pool.has(k));
  if (mine.length) return { count: mine.length, source: "division", text: `${mine.length} for ${div.name}` };
  const own = effectiveSchedule(def, st).courtsPerVenue.value as number | null;
  if (own) return { count: own, source: "stage", text: `${own} per venue` };
  if (pool.size) return { count: pool.size, source: "tournament", text: `All ${pool.size} tournament courts` };
  return { count: 0, source: null, text: "" };
}

export interface StageMatch { text: string | null; minutes: number | null }
export function stageMatch(def: TournamentDefinition, st: Stage): StageMatch {
  if (st.tieFormat?.rubbers.length) {
    const mins = st.tieFormat.rubbers.map((r) => r.minutes);
    const total = mins.reduce((a, b) => a + b, 0);
    const same = mins.every((m) => m === mins[0]);
    return { text: `${mins.length} games${same ? ` × ${mins[0]}m` : ""} = ${total}m per tie`, minutes: same ? mins[0] : null };
  }
  const mm = effectiveSchedule(def, st).matchMinutes.value as number | null;
  return { text: mm ? `${mm}m` : null, minutes: mm ?? null };
}
