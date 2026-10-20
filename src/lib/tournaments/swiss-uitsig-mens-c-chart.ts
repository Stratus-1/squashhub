import type { RoundPlan } from "./swiss-positional";

/** Owner-approved display chart only; never imported by fixture writers. */
export function usesUitsigMensCChart(clubId: string | null | undefined, tournamentId: string | null | undefined, group: number, entrants: number, rounds: number): boolean {
  return clubId === "d8397b8a-60d3-4c4b-afee-25dab218bf19"
    && tournamentId === "f954222a-0f0a-4d8c-ac7b-9c74042cc69e"
    && group === 4 && entrants === 18 && rounds === 5;
}

export function uitsigMensCChart(): RoundPlan[] {
  const pairs: Array<Array<[number, number]>> = [
    [[1,18],[2,17],[3,16],[4,15],[5,14],[6,13],[7,12],[8,11],[9,10]],
    [[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]],
    [[1,4],[2,3],[5,8],[6,7],[9,12],[10,11],[13,17],[14,18],[15,16]],
    [[1,3],[2,4],[5,7],[6,8],[9,11],[10,12],[13,15],[14,17],[16,18]],
    [[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18]],
  ];
  return pairs.map((ps, index) => ({ round: index + 1, bye: null, pairs: ps.map(([a,b]) => ({ round: index + 1, a, b })) }));
}