// Repair only the organiser-approved, already saved Myburg 7's final slots.
export const MYBURG_TOURNAMENT = "3612d8cf-5e0e-496a-b6ab-b177c9127710";
export const MYBURG_FEEDERS = [
  ["825df8bb-3afd-480d-8d6e-bce9d1fbf1f9", "e7083234-8e6e-4a62-afec-1c8499cb1cb9", "a", "Winner SF1"],
  ["249e5253-d208-4494-996c-cc9805e3123c", "e7083234-8e6e-4a62-afec-1c8499cb1cb9", "b", "Winner SF2"],
  ["9c5aa85b-c69c-4c34-8e82-9c30ab673fca", "de0d2d59-d434-4e5e-acfe-ffcfe0cbb094", "a", "Winner SF3"],
  ["6f920b8d-3317-488c-820f-758106157e54", "de0d2d59-d434-4e5e-acfe-ffcfe0cbb094", "b", "Winner SF4"],
] as const;
export interface HandoverRow {
  id: string; champ_id: string; division_id: string | null; status: string;
  player_a_member_id: string | null; player_b_member_id: string | null;
  winner_member_id: string | null; score: string | null; game_scores: string | null;
  side_a_points: number | null; side_b_points: number | null;
  placeholder_a: string | null; placeholder_b: string | null;
}
export function myburgFinalPlacements(rows: HandoverRow[]) {
  return MYBURG_FEEDERS.flatMap(([sourceId, finalId, side, placeholder]) => {
    const source = rows.find(r => r.id === sourceId && r.champ_id === MYBURG_TOURNAMENT);
    const final = rows.find(r => r.id === finalId && r.champ_id === MYBURG_TOURNAMENT);
    if (!source || !final || !source.division_id || source.division_id !== final.division_id
      || source.status !== "completed" || !source.winner_member_id
      || ![source.player_a_member_id, source.player_b_member_id].includes(source.winner_member_id)
      || final.status !== "scheduled" || final.winner_member_id || final.score || final.game_scores
      || (final.side_a_points ?? 0) !== 0 || (final.side_b_points ?? 0) !== 0
      || final[`placeholder_${side}`] !== placeholder || final[`player_${side}_member_id`]
      || [final.player_a_member_id, final.player_b_member_id].includes(source.winner_member_id)) return [];
    return [{ finalId, sourceId, side, placeholder, winner: source.winner_member_id }];
  });
}