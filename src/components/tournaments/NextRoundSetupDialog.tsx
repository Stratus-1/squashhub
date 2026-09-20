/**
 * "Define the next round" — the small popup that opens straight from the
 * tournament card / next-action bar instead of navigating away.
 *
 * Dates are NOT entered here. The tournament has one central round list and one
 * set of championship deadlines (quarter-final / semi-final / final), set in
 * tournament setup. This dialog only shows which of those applies to the league
 * being progressed, and offers to add a round to the central list if the
 * organiser has run past the end of it.
 *
 * The stage itself is worked out from the players still standing, never typed:
 * two left is a final, three or four a semi-final, five to eight a
 * quarter-final. Anything bigger is an ordinary numbered round.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import { typeForPlayers, type SectionProgression } from "@/lib/tournaments/knockout-progression";
import type { NextRoundSetup } from "@/lib/tournaments/next-round-setup";
import {
  addRoundDefinition,
  nextRoundReference,
  stageForAlive,
  stageName,
} from "@/lib/tournaments/round-definitions";
import { useRoundDefinitions, useSaveRoundDefinitions } from "@/hooks/use-round-definitions";

export type NextRoundReady = NextRoundSetup & { roundId: string | null; roundNumber: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  clubId?: string | null;
  state: SectionProgression;
  /** How many players came through the feeder round. */
  qualifiers: number;
  divisionLabel?: string | null;
  /** Players arrange their own court/date — the play-by date then matters most. */
  selfScheduled?: boolean;
  /** Metadata saved — open the visual draw for this round. */
  onReady: (v: NextRoundReady) => void;
}

export function NextRoundSetupDialog({
  open,
  onOpenChange,
  champId,
  clubId,
  state,
  qualifiers,
  divisionLabel,
  selfScheduled,
  onReady,
}: Props) {
  const qc = useQueryClient();
  const roundNumber = state.nextRound?.round_number ?? state.currentRound + 1;
  const [saving, setSaving] = useState(false);
  const [newRoundDate, setNewRoundDate] = useState("");

  const { data: central, isLoading } = useRoundDefinitions(open ? champId : null);
  const saveCentral = useSaveRoundDefinitions({ champId, clubId });

  const reference = useMemo(
    () =>
      nextRoundReference({
        alive: qualifiers,
        roundNumber,
        definitions: central?.definitions ?? [],
        milestones: central?.milestones ?? {},
        leagueLabel: divisionLabel,
      }),
    [qualifiers, roundNumber, central, divisionLabel],
  );

  const stage = stageForAlive(qualifiers);
  const label = reference.label;

  useEffect(() => {
    if (open) setNewRoundDate("");
  }, [open]);

  // A milestone with no central date is a setup gap, not something to patch here.
  const missingMilestone = stage !== "early" && !reference.playBy;
  const missingRound = reference.needsDefinition;

  const addCentralRound = async () => {
    if (!newRoundDate) return;
    await saveCentral.mutateAsync({
      definitions: addRoundDefinition(central?.definitions ?? [], roundNumber, {
        label: `Round ${roundNumber}`,
        play_by: newRoundDate,
      }),
      milestones: central?.milestones ?? {},
    });
  };

  const submit = async () => {
    if (missingRound || missingMilestone) return;
    setSaving(true);
    try {
      let roundId = state.nextRound?.id ?? null;
      const payload = {
        champ_id: champId,
        group_number: state.groupNumber,
        section_number: state.section,
        round_number: roundNumber,
        round_type: typeForPlayers(Math.max(2, qualifiers)),
        label,
        stage_key: stage,
        // Mirrored from the central list so fixtures print a date offline;
        // the central list stays the thing that is edited.
        play_by: reference.playBy,
        scheduling_mode: selfScheduled ? "self" : "club",
        status: "pending",
      };
      if (roundId) {
        const { error } = await fromExt("club_champs_rounds")
          .update({
            label: payload.label,
            play_by: payload.play_by,
            round_type: payload.round_type,
            stage_key: payload.stage_key,
          } as any)
          .eq("id", roundId);
        if (error) throw error;
      } else {
        const { data, error } = await fromExt("club_champs_rounds")
          .insert(payload as any)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        roundId = (data as any)?.id ?? null;
      }
      qc.invalidateQueries({ queryKey: ["club-champ-rounds", champId] });
      onOpenChange(false);
      onReady({ label, playBy: reference.playBy, roundId, roundNumber });
    } catch (e: any) {
      toast.error(e?.message || "Could not save this round");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" /> Set up the next round
          </DialogTitle>
          <DialogDescription>
            {divisionLabel ? `${divisionLabel} — ` : ""}
            {qualifiers} player{qualifiers === 1 ? "" : "s"} left. This is {label.toLowerCase()}
            {stage === "early" ? "" : " for this league"}. Check the date and arrange the matchups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
            <div className="text-xs text-muted-foreground">Stage</div>
            <div className="text-sm font-medium">{label}</div>
            <p className="text-[11px] text-muted-foreground">
              Worked out from the {qualifiers} player{qualifiers === 1 ? "" : "s"} still standing —
              {stage === "early"
                ? " an ordinary round of this league."
                : ` every league plays its ${stageName(stage).toLowerCase()} by the same date.`}
            </p>
          </div>

          {isLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading the tournament's dates…</p>
          ) : missingRound ? (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
              <p className="text-[11px]">
                Round {roundNumber} is not on this tournament's round list yet. Add it here and it
                becomes the date for every league that reaches Round {roundNumber}.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Round {roundNumber} played by</Label>
                  <Input
                    type="date"
                    value={newRoundDate}
                    onChange={(e) => setNewRoundDate(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={addCentralRound}
                  disabled={!newRoundDate || saveCentral.isPending}
                >
                  {saveCentral.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add round"}
                </Button>
              </div>
            </div>
          ) : missingMilestone ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-[11px] text-destructive">
              No {stageName(stage).toLowerCase()} date has been set for this tournament. Set it once
              in Edit tournament → Rounds and every league will use it.
            </p>
          ) : (
            <div className="rounded-md border bg-muted/30 p-2.5 space-y-0.5">
              <div className="text-xs text-muted-foreground">Must be played by</div>
              <div className="text-sm font-medium">{reference.playBy}</div>
              <p className="text-[11px] text-muted-foreground">
                {reference.sourceLabel} — change it in Edit tournament → Rounds and every league that
                uses it follows.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || isLoading || missingRound || missingMilestone}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save &amp; arrange matchups
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
