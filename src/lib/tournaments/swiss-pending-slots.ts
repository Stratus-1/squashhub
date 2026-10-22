import type { GridBlock, GridRow } from "./swiss-progression-view";

/** Positional display only: null player IDs cannot become committed participants. */
export function pendingSwissSlots(round: number, positions: number[], label: string, playBy: string | null): GridBlock[] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const blocks: GridBlock[] = [];
  const row = (pos: number | null): GridRow => ({ id: null, pos, name: pos == null ? "Bye position to be decided" : "Swiss player — results pending", result: "", projected: true, when: pos == null ? null : label });
  for (let i = 0; i < sorted.length; i += 2) {
    const a = sorted[i], b = sorted[i + 1] ?? null;
    blocks.push({ matchId: `swiss-wait-${round}-${a}-${b ?? "bye"}`, rows: [row(a), row(b)], score: null, court: null, playBy });
  }
  return blocks;
}