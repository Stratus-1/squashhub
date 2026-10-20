import { preferredSwissTemplate } from "./swiss-no-repeat";

/** Display-only revision; live/default writer templates remain unchanged. */
export function swissPreviewFinalsTemplate(n: number, round: number) {
  const original = preferredSwissTemplate(n, round);
  if (n !== 24 || round < 3 || round > 5) return original;
  const half: Record<number, Array<[number, number]>> = {
    // Reserve final pairs, replacing conflicting provisional 3v4/9v10.
    3: [[1,6],[2,5],[3,9],[4,10],[7,12],[8,11]],
    // R2 already uses 5v8/6v7: nearest legal switches avoid repeats.
    4: [[1,4],[2,3],[5,7],[6,8],[9,12],[10,11]],
    5: [[1,2],[3,4],[5,6],[7,8],[9,10],[11,12]],
  };
  return { ...original, pairs: [0,12].flatMap(offset => half[round].map(([a,b]) => ({round,a:a+offset,b:b+offset}))) };
}
