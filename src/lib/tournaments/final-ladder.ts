import { ladderAfterStandings } from "./overall-standings";

export interface LadderMember { id: string; gender: string | null; ladder_position: number | null }
export interface FinalLadderMove { id: string; from: number; to: number }
const ladies = (gender: string | null) => ["female", "ladies", "f"].includes((gender ?? "").toLowerCase());

/** Only refill participants' occupied slots, independently per ladder group. */
export function finalLadderMoves(members: LadderMember[], order: string[], mixed: boolean): FinalLadderMove[] {
  const moves: FinalLadderMove[] = [];
  for (const group of mixed ? ["mixed"] : ["men", "ladies"]) {
    const ladder = members.filter((m) => m.ladder_position != null && (group === "mixed" || (group === "ladies") === ladies(m.gender)))
      .sort((a, b) => Number(a.ladder_position) - Number(b.ladder_position));
    const next = ladderAfterStandings(ladder.map((m) => m.id), order);
    next.forEach((id, i) => {
      const member = ladder.find((m) => m.id === id);
      const slot = ladder[i];
      if (member?.ladder_position != null && slot?.ladder_position != null && member.ladder_position !== slot.ladder_position) {
        moves.push({ id, from: member.ladder_position, to: slot.ladder_position });
      }
    });
  }
  return moves;
}