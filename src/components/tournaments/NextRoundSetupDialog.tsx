/**
 * "Define the next round" — the small popup that opens straight from the
 * tournament card / next-action bar instead of navigating away.
 *
 * It asks for the bare minimum a round needs: its name (auto-suggested from
 * the real bracket) and the date it must be played by. On submit the round
 * metadata is saved to `club_champs_rounds` and the visual draw for THAT
 * tournament + division + round opens immediately.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  defaultPlayBy,
  stageNameOptions,
  suggestStageName,
  validateNextRoundSetup,
  type NextRoundSetup,
} from "@/lib/tournaments/next-round-setup";
import {
  mergeRoundDeadlines,
  parseRoundDeadlines,
  serializeRoundDeadlines,
} from "@/lib/tournaments/round-deadlines";

export type NextRoundReady = NextRoundSetup & { roundId: string | null; roundNumber: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  state: SectionProgression;
  /** How many players came through the feeder round. */
  qualifiers: number;
  divisionLabel?: string | null;
  /** Players arrange their own court/date — the play-by date then matters most. */
  selfScheduled?: boolean;
  /**
   * The tournament's configured play-by date for this round number
   * (`round_play_by` from setup). Always preferred over the +7-day guess.
   */
  plannedPlayBy?: string | null;
  /**
   * The configured date for a NAMED stage ("Final", "Semi-final", …). Round
   * numbers drift between divisions, so once the organiser names this round the
   * date published for that stage is the one that must be offered.
   */
  plannedPlayByForStage?: (stageLabel: string) => string | null;
  /** Metadata saved — open the visual draw for this round. */
  onReady: (v: NextRoundReady) => void;
}

export function NextRoundSetupDialog({
  open,
  onOpenChange,
  champId,
  state,
  qualifiers,
  divisionLabel,
  selfScheduled,
  plannedPlayBy,
  plannedPlayByForStage,
  onReady,
}: Props) {
  const qc = useQueryClient();
  const roundNumber = state.nextRound?.round_number ?? state.currentRound + 1;
  const [label, setLabel] = useState("");
  const [playBy, setPlayBy] = useState<string>("");
  const [dateTouched, setDateTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const asDate = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;

  // The date published for THIS stage ("Final" → 22 Sep) wins over the date
  // that merely sits at this round's position in the plan: divisions reach the
  // final on different round numbers, so position alone sent players the wrong
  // deadline.
  const stagePlanned = asDate(plannedPlayByForStage?.(label));
  const plannedForRound = asDate(plannedPlayBy);
  const suggestedPlanned = stagePlanned ?? plannedForRound;

  useEffect(() => {
    if (!open) return;
    setDateTouched(false);
    setLabel(suggestStageName({ plannedLabel: state.nextRound?.label, roundNumber, qualifiers }));
    setPlayBy(
      asDate(state.nextRound?.play_by) ?? plannedForRound ?? defaultPlayBy(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.nextRound?.label, state.nextRound?.play_by, roundNumber, qualifiers]);

  // Naming the round (e.g. picking "Final") pulls in that stage's published
  // date, unless the organiser has already typed a date of their own.
  useEffect(() => {
    if (!open || dateTouched || !stagePlanned) return;
    setPlayBy((cur) => (cur === stagePlanned ? cur : stagePlanned));
  }, [open, dateTouched, stagePlanned]);

  const today = new Date().toISOString().slice(0, 10);
  // A published date may already be in the past — that must not block the
  // organiser from setting the section up.
  const earliest = suggestedPlanned && suggestedPlanned < today ? suggestedPlanned : today;
  const setup: NextRoundSetup = { label: label.trim(), playBy: playBy || null };
  const problems = useMemo(
    () => validateNextRoundSetup(setup, { requirePlayBy: !!selfScheduled, today: earliest }),
    [setup.label, setup.playBy, selfScheduled, earliest],
  );
  const options = useMemo(() => stageNameOptions(qualifiers, roundNumber), [qualifiers, roundNumber]);

  const submit = async () => {
    if (problems.length > 0) return;
    setSaving(true);
    try {
      let roundId = state.nextRound?.id ?? null;
      const payload = {
        champ_id: champId,
        group_number: state.groupNumber,
        section_number: state.section,
        round_number: roundNumber,
        round_type: typeForPlayers(Math.max(2, qualifiers)),
        label: setup.label,
        play_by: setup.playBy,
        scheduling_mode: selfScheduled ? "self" : "club",
        status: "pending",
      };
      if (roundId) {
        const { error } = await fromExt("club_champs_rounds")
          .update({ label: payload.label, play_by: payload.play_by, round_type: payload.round_type })
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
      // Keep the tournament's own round plan in step, so the setup screen and
      // the "book your court by …" nudges show this round too.
      // Only FILL IN a round the plan does not cover yet. Sections of the same
      // round are set up on different days, and rewriting a date the organiser
      // already published would make the round's date appear to move.
      if (setup.playBy) {
        const { data: t } = await fromExt("tournaments")
          .select("round_play_by")
          .eq("id", champId)
          .maybeSingle();
        const planned = parseRoundDeadlines((t as any)?.round_play_by);
        const alreadyPlanned = /^\d{4}-\d{2}-\d{2}/.test(String(planned[roundNumber - 1]?.date || ""));
        if (!alreadyPlanned) {
          const merged = serializeRoundDeadlines(
            mergeRoundDeadlines(planned, [
              { round_number: roundNumber, label: setup.label, play_by: setup.playBy },
            ]),
          );
          if (merged) await fromExt("tournaments").update({ round_play_by: merged } as any).eq("id", champId);
        }
      }
      qc.invalidateQueries({ queryKey: ["club-champ-rounds", champId] });
      onOpenChange(false);
      onReady({ ...setup, roundId, roundNumber });
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
            {qualifiers} player{qualifiers === 1 ? "" : "s"} came through. Name this round and set the date it must be
            played by, then arrange the matchups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="next-round-label" className="text-xs">Round / stage name</Label>
            <Input
              id="next-round-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Semi-final"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {options.map((o) => (
                <Badge
                  key={o}
                  variant={o === label ? "default" : "outline"}
                  className="cursor-pointer text-[10px]"
                  onClick={() => setLabel(o)}
                >
                  {o}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="next-round-playby" className="text-xs">
              Play by {fixedPlayBy ? "(fixed)" : selfScheduled ? "" : "(optional)"}
            </Label>
            <Input
              id="next-round-playby"
              type="date"
              value={playBy}
              min={earliest}
              disabled={!!fixedPlayBy}
              onChange={(e) => setPlayBy(e.target.value)}
            />
            {fixedPlayBy && (
              <p className="text-[11px] text-muted-foreground">
                This round's date was set when the tournament was planned and every player has been told to play by
                it, so it stays as it is. Change it in the tournament's round dates if it really must move.
              </p>
            )}
          </div>

          {problems.map((p) => (
            <p key={p} className="text-[11px] text-destructive">{p}</p>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={problems.length > 0 || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save &amp; arrange matchups
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
