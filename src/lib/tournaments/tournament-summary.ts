/** Read-only late-stage overview. Never infers a winner from pool order or fixture dates. */
import { playoffResult } from "./historical-pool-progress";

export type SummaryFixture = {
  id?: string; group_number?: number | null; stage?: string | null; stage_label?: string | null;
  status?: string | null; is_bye?: boolean | null; winner_member_id?: string | null;
  player_a_member_id?: string | null; partner_a_member_id?: string | null;
  player_b_member_id?: string | null; partner_b_member_id?: string | null;
  score?: string | null; game_scores?: string | null; round_number?: number | null; bracket_position?: number | null;
};
export type SummaryStage = "qf" | "sf" | "final";
export type SummaryCategory = { group: number; label: string; firstStage: SummaryStage | null; fieldReady?: boolean };
export type SummaryRow<M extends SummaryFixture> = {
  category: SummaryCategory; quarterfinals: M[]; semifinals: M[]; finals: M[];
  champion: M | null; status: string;
};

export function formalStageOf(m: SummaryFixture): SummaryStage | null {
  const label = String(m.stage_label || "").toLowerCase();
  // A paced "Round N" never becomes a formal stage just because the field is small.
  if (/quarter.?final|\bqf\b/.test(label)) return "qf";
  if (/semi.?final|\bsf\b/.test(label)) return "sf";
  if (/\bfinal\b/.test(label) && !/3rd|4th|5th|place|position/i.test(label)) return "final";
  // Legacy non-paced fixtures may only have a stage code.
  if (m.stage === "playoff_sf" || m.stage === "semi_final") return "sf";
  if (m.stage === "playoff_final" || m.stage === "final") return "final";
  if (m.stage === "quarter_final") return "qf";
  return null;
}

export function tournamentSummary<M extends SummaryFixture>(categories: SummaryCategory[], matches: M[]): SummaryRow<M>[] {
  return categories.map((category) => {
    const rows = matches.filter((m) => Number(m.group_number) === category.group && !m.is_bye && m.status !== "cancelled" && m.status !== "void");
    const byStage = (s: SummaryStage) => rows.filter((m) => formalStageOf(m) === s)
      .sort((a, b) => (Number(a.bracket_position) || 0) - (Number(b.bracket_position) || 0) || (Number(a.round_number) || 0) - (Number(b.round_number) || 0));
    const quarterfinals = byStage("qf"), semifinals = byStage("sf"), finals = byStage("final");
    const titleFinal = finals.find((m) => m.player_a_member_id && m.player_b_member_id) ?? null;
    const champion = titleFinal && playoffResult(titleFinal).winnerSide ? titleFinal : null;
    const first = category.firstStage;
    const status = champion ? "Champion decided"
      : finals.length ? "Final in progress"
      : semifinals.length ? "Semifinals in progress"
      : quarterfinals.length ? "Quarterfinals in progress"
      : category.fieldReady && first === "sf" ? "Semifinal field ready / waiting for Semifinals"
      : category.fieldReady && first === "final" ? "Final field ready / waiting for Final"
      : category.fieldReady && first === "qf" ? "Quarterfinal field ready / waiting for Quarterfinals"
      : "Qualification in progress";
    return { category, quarterfinals, semifinals, finals, champion, status };
  });
}