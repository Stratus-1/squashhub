/**
 * Visual draw board for the CROSS-POOL league finals.
 *
 * The pool winners of a league are placed on the same board used by every
 * other round, so the organiser chooses who plays who (and who gets the bye)
 * before the finals fixtures are created. Confirming inserts the section 0
 * bracket through the shared ConfirmDrawDialog.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { ConfirmDrawDialog } from "./ConfirmDrawDialog";
import type { SectionProgression } from "@/lib/tournaments/knockout-progression";
import { leagueFinalStageLabel } from "@/lib/tournaments/round-control";
import {
  finalsRoundNumber,
  leagueFinalsEntrants,
  suggestLeagueFinalsBoard,
} from "@/lib/tournaments/league-finals-draw";
import type { DrawEntrant } from "@/lib/tournaments/draw-board";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  groupNumber: number;
  /** Every section state of THIS league (pools only are used). */
  sections: SectionProgression[];
  divisionLabel?: string | null;
  playBy?: string | null;
  onConfirmed?: (count: number) => void;
}

export function LeagueFinalsDrawDialog({
  open,
  onOpenChange,
  champId,
  groupNumber,
  sections,
  divisionLabel,
  playBy,
  onConfirmed,
}: Props) {
  const base = useMemo(() => leagueFinalsEntrants(sections), [sections]);
  const ids = useMemo(
    () => Array.from(new Set(base.flatMap((e) => [e.id, e.partnerId]).filter(Boolean) as string[])),
    [base],
  );

  const { data: nameMap = {} } = useQuery({
    queryKey: ["draw-entrant-names", champId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, ladder_position")
        .in("id", ids);
      if (error) throw error;
      const out: Record<string, { name: string; ladder: number | null }> = {};
      for (const r of (data || []) as any[]) out[r.id] = { name: r.name, ladder: r.ladder_position ?? null };
      return out;
    },
    enabled: open && ids.length > 0,
  });

  const entrants: DrawEntrant[] = useMemo(
    () =>
      base.map((e) => ({
        ...e,
        name: nameMap[e.id]?.name || e.name,
        partnerName: e.partnerId ? nameMap[e.partnerId]?.name ?? null : null,
      })),
    [base, nameMap],
  );

  const round = useMemo(() => finalsRoundNumber(sections), [sections]);
  const suggested = useMemo(
    () => suggestLeagueFinalsBoard({ groupNumber, round, winners: entrants }),
    [groupNumber, round, entrants],
  );

  if (entrants.length < 2) return null;
  const stage = leagueFinalStageLabel(entrants.length);

  return (
    <ConfirmDrawDialog
      open={open}
      onOpenChange={onOpenChange}
      champId={champId}
      suggested={suggested}
      entrants={entrants}
      divisionLabel={divisionLabel ?? `Division ${groupNumber}`}
      playBy={playBy ?? null}
      title={`${stage} — confirm the draw`}
      description="Only the pool winners appear here. Drag anyone into a different matchup, or leave a slot empty to give that winner a bye into the final. Pool matches are never changed."
      onConfirmed={onConfirmed}
    />
  );
}
