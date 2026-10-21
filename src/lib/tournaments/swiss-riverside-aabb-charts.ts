import type { RoundPlan } from "./swiss-positional";

/** Riverside test tournament "AABB" re-uses the approved Uitsig position charts (display-only). */
export const RIVERSIDE_CLUB_ID = "11111111-1111-1111-1111-111111111111";
export const RIVERSIDE_AABB_ID = "5899d31f-c829-4dfc-a1fd-d963648f1a3f";

const isAabb = (clubId: string | null | undefined, tournamentId: string | null | undefined) =>
  clubId === RIVERSIDE_CLUB_ID && tournamentId === RIVERSIDE_AABB_ID;

/** 18-player AABB categories use the Uitsig Men's C chart. */
export const usesAabbEighteenChart = (clubId: string | null | undefined, tid: string | null | undefined, entrants: number, rounds: number) =>
  isAabb(clubId, tid) && entrants === 18 && rounds === 5;

/** 16-player AABB categories use the approved 16-player model (halves of 8). */
export const usesAabbSixteenChart = (clubId: string | null | undefined, tid: string | null | undefined, entrants: number, rounds: number) =>
  isAabb(clubId, tid) && entrants === 16 && rounds === 5;

/** Approved 16-player model: R1 fold, then each half of 8 (bottom = +8). */
export function sixteenPlayerChart(): RoundPlan[] {
  const half: Array<Array<[number, number]>> = [
    [],
    [[1,8],[2,7],[3,6],[4,5]],
    [[1,4],[2,3],[5,8],[6,7]],
    [[1,3],[2,4],[5,7],[6,8]],
    [[1,2],[3,4],[5,6],[7,8]],
  ];
  const r1: Array<[number, number]> = Array.from({ length: 8 }, (_, i) => [i + 1, 16 - i]);
  return half.map((ps, i) => {
    const pairs = i === 0 ? r1 : [...ps, ...ps.map(([a, b]) => [a + 8, b + 8] as [number, number])];
    return { round: i + 1, bye: null, pairs: pairs.map(([a, b]) => ({ round: i + 1, a, b })) };
  });
}
