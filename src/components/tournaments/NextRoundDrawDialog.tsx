/**
 * The visual draw board for EVERY knockout round after the first.
 *
 * One component, used by every admin surface (progress card, knockout card,
 * next-action bar) so a later round can only ever be created through a
 * reviewed, confirmed draw:
 *
 *  - "prepare": the feeder round is decided — the board is pre-populated with
 *    ONLY its qualifiers, and the fixtures are created on confirm.
 *  - "redraw": the round exists but is entirely unplayed — the board shows the
 *    current pairings and confirming replaces those fixtures transactionally.
 *
 * Completed fixtures are never read-modified: prepare only reads winners, and
 * redraw refuses to run once any result exists (see `roundRedrawState`).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { ConfirmDrawDialog } from "./ConfirmDrawDialog";
import { sectionLetter } from "@/lib/tournaments/knockout";
import type { SectionProgression } from "@/lib/tournaments/knockout-progression";
import {
  prepareDrawTitle,
  qualifierEntrants,
  roundRedrawState,
} from "@/lib/tournaments/round-draw";
import {
  suggestNextRoundBoard,
  type DrawBoard as DrawBoardModel,
  type DrawEntrant,
} from "@/lib/tournaments/draw-board";

export type NextRoundDrawMode = "prepare" | "redraw";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  state: SectionProgression;
  mode: NextRoundDrawMode;
  multiSection?: boolean;
  selfScheduled?: boolean;
  divisionLabel?: string | null;
  /** Metadata just captured in the "set up the next round" popup. */
  setup?: { label: string; playBy: string | null; roundId: string | null } | null;
  onConfirmed?: (count: number) => void;
}

/** Everyone drawn into an existing (unplayed) round, in bracket order. */
function entrantsOfRound(rows: any[]): DrawEntrant[] {
  const out: DrawEntrant[] = [];
  const seen = new Set<string>();
  for (const m of [...rows].sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0))) {
    for (const side of ["a", "b"] as const) {
      const id = m[`player_${side}_member_id`];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: "Player", partnerId: m[`partner_${side}_member_id`] ?? null, seed: out.length + 1 });
    }
  }
  return out;
}

export function NextRoundDrawDialog({
  open,
  onOpenChange,
  champId,
  state,
  mode,
  multiSection,
  selfScheduled,
  divisionLabel,
  setup,
  onConfirmed,
}: Props) {
  const rows = (state.currentRoundMatches || []) as any[];
  const redraw = mode === "redraw";
  const safety = useMemo(() => roundRedrawState(rows as any), [rows]);

  const baseEntrants = useMemo(
    () => (redraw ? entrantsOfRound(rows) : qualifierEntrants(state, () => "Player")),
    [redraw, rows, state],
  );
  const ids = useMemo(() => baseEntrants.map((e) => e.id), [baseEntrants]);

  const { data: nameMap = {} } = useQuery({
    queryKey: ["draw-entrant-names", champId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members").select("id, name, ladder_position").in("id", ids);
      if (error) throw error;
      const out: Record<string, { name: string; ladder: number | null }> = {};
      for (const r of (data || []) as any[]) out[r.id] = { name: r.name, ladder: r.ladder_position ?? null };
      return out;
    },
    enabled: open && ids.length > 0,
  });

  const entrants: DrawEntrant[] = useMemo(
    () =>
      baseEntrants.map((e) => ({
        ...e,
        name: nameMap[e.id]?.name || e.name,
        partnerName: e.partnerId ? nameMap[e.partnerId]?.name ?? null : null,
        rankLabel: nameMap[e.id]?.ladder ? `Ladder ${nameMap[e.id]!.ladder}` : null,
      })),
    [baseEntrants, nameMap],
  );

  const round = redraw ? state.currentRound : state.nextRound?.round_number ?? state.currentRound + 1;

  const suggested: DrawBoardModel | null = useMemo(() => {
    if (entrants.length === 0) return null;
    if (redraw) {
      return {
        groupNumber: state.groupNumber,
        round,
        matches: [...rows]
          .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0))
          .map((m, i) => ({
            section: Number(m.section_number ?? state.section),
            round,
            position: i + 1,
            a: m.player_a_member_id ?? null,
            b: m.player_b_member_id ?? null,
          })),
      };
    }
    return suggestNextRoundBoard({
      groupNumber: state.groupNumber,
      section: state.section,
      round,
      winners: entrants,
    });
  }, [redraw, entrants, rows, round, state.groupNumber, state.section]);

  if (!suggested) return null;
  if (redraw && !safety.canRedraw) return null;

  const stageLabel = setup?.label ? setup.label : redraw
    ? state.plan.find((r) => r.round_number === state.currentRound)?.label || `Round ${state.currentRound}`
    : state.nextRound?.label || `Round ${round}`;

  const label =
    divisionLabel ??
    `Division ${state.groupNumber}${multiSection ? ` · Section ${sectionLetter(state.section)}` : ""}`;

  return (
    <ConfirmDrawDialog
      open={open}
      onOpenChange={onOpenChange}
      champId={champId}
      suggested={suggested}
      entrants={entrants}
      multiSection={multiSection}
      divisionLabel={label}
      roundId={redraw ? null : setup?.roundId ?? state.nextRound?.id ?? null}
      playBy={setup?.playBy ?? (selfScheduled ? state.nextRound?.play_by ?? null : null)}
      replaceIds={redraw ? safety.replaceIds : undefined}
      onConfirmed={onConfirmed}
      title={redraw ? `${stageLabel} — redraw this round` : prepareDrawTitle(stageLabel, round)}
      description={
        redraw
          ? `Nothing in this round has been played, so it can still be re-paired. Confirming replaces these fixtures. ${
              safety.warning ?? ""
            }`.trim()
          : "Only the players who came through the last round appear here. Drag anyone into a different matchup, or empty a slot to give a bye. Played matches are never changed."
      }
    />
  );
}
