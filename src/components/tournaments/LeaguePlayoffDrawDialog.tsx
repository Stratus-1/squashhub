/**
 * League play-off draw — reviewed, never auto-created.
 *
 * When a league (division) has 2, 4 or 8 players still standing across its
 * pools, the organiser opens this board, arranges exactly who plays whom in
 * the semi-final / final, and only then are fixtures created. Nothing is
 * generated behind the organiser's back.
 */
import { useMemo } from "react";
import { ConfirmDrawDialog } from "./ConfirmDrawDialog";
import type { DrawBoard as DrawBoardModel, DrawEntrant } from "@/lib/tournaments/draw-board";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  groupNumber: number;
  /** Players still in the league, across all of its pools. */
  entrants: DrawEntrant[];
  /** Round number the play-off fixtures get. */
  round: number;
  stageLabel: string;
  divisionLabel: string;
  playBy?: string | null;
  onConfirmed?: (count: number) => void;
}

export function LeaguePlayoffDrawDialog({
  open,
  onOpenChange,
  champId,
  groupNumber,
  entrants,
  round,
  stageLabel,
  divisionLabel,
  playBy,
  onConfirmed,
}: Props) {
  // Suggested pairings only — the organiser drags anyone anywhere before
  // confirming. Section 0 is the league's own (cross-pool) bracket.
  const suggested: DrawBoardModel | null = useMemo(() => {
    if (entrants.length < 2) return null;
    const matches = [] as DrawBoardModel["matches"];
    for (let i = 0; i < entrants.length; i += 2) {
      matches.push({
        section: 0,
        round,
        position: i / 2 + 1,
        a: entrants[i]?.id ?? null,
        b: entrants[i + 1]?.id ?? null,
      });
    }
    return { groupNumber, round, matches };
  }, [entrants, groupNumber, round]);

  if (!suggested) return null;

  return (
    <ConfirmDrawDialog
      open={open}
      onOpenChange={onOpenChange}
      champId={champId}
      suggested={suggested}
      entrants={entrants}
      title={`${divisionLabel} — ${stageLabel}`}
      description="Choose exactly who plays whom. Drag a player into another matchup, or empty a slot to give a bye. No fixtures exist until you confirm."
      divisionLabel={divisionLabel}
      playBy={playBy ?? null}
      onConfirmed={onConfirmed}
    />
  );
}
