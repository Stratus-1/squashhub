import type { RoundPlan } from "./swiss-positional";

/** Owner-approved display chart only; never imported by fixture writers. */
export function usesUitsigLadiesAChart(clubId: string | null | undefined, tournamentId: string | null | undefined, group: number, entrants: number, rounds: number): boolean {
  return clubId === "d8397b8a-60d3-4c4b-afee-25dab218bf19"
    && tournamentId === "f954222a-0f0a-4d8c-ac7b-9c74042cc69e"
    && group === 5 && entrants === 9 && rounds === 5;
}

/**
 * Owner-supplied Ladies A chart (20 Oct 2026). Byes: R1=9, R2=3, R3=2, R4=4, R5=5.
 * Owner confirmed positions 6-9 have no Round 5 games (they sit out the final round),
 * so Round 5 is deliberately incomplete — this overrides the "every slot appears" rule.
 */
export function uitsigLadiesAChart(): RoundPlan[] {
  const pairs: Array<Array<[number, number]>> = [
    [[1,8],[2,7],[3,6],[4,5]],
    [[1,5],[2,4],[6,9],[7,8]],
    [[1,4],[3,5],[6,7],[8,9]],
    [[1,3],[2,5],[6,8],[7,9]],
    [[1,2],[3,4]],
  ];
  const byes: Array<number | null> = [9, 3, 2, 4, 5];
  return pairs.map((ps, index) => ({ round: index + 1, bye: byes[index], pairs: ps.map(([a,b]) => ({ round: index + 1, a, b })) }));
}
