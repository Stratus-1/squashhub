import type { StandingRow } from "@/lib/tournaments/team-league";

type DiamondSummaryStage = {
  rows: StandingRow[];
  liveTeamIds: Set<string>;
};

/** Use the furthest-created stage so summary tiles match the visible running table. */
export function diamondLiveSummary(
  poolRows: StandingRow[],
  poolLiveTeamIds: Set<string>,
  semiStage?: DiamondSummaryStage,
  finalStage?: DiamondSummaryStage,
): DiamondSummaryStage {
  return finalStage ?? semiStage ?? { rows: poolRows, liveTeamIds: poolLiveTeamIds };
}