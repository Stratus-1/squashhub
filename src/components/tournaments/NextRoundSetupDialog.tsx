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
  onReady,
}: Props) {
  const qc = useQueryClient();
  const roundNumber = state.nextRound?.round_number ?? state.currentRound + 1;
  const [label, setLabel] = useState("");
  const [playBy, setPlayBy] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(suggestStageName({ plannedLabel: state.nextRound?.label, roundNumber, qualifiers }));
    // Priority: saved round row → tournament's configured round deadline → +7d guess.
    const planned = plannedPlayBy && /^\d{4}-\d{2}-\d{2}/.test(plannedPlayBy) ? plannedPlayBy.slice(0, 10) : null;
    setPlayBy(state.nextRound?.play_by ? String(state.nextRound.play_by).slice(0, 10) : planned ?? defaultPlayBy());
  }, [open, state.nextRound?.label, state.nextRound?.play_by, plannedPlayBy, roundNumber, qualifiers]);

  const today = new Date().toISOString().slice(0, 10);
  const setup: NextRoundSetup = { label: label.trim(), playBy: playBy || null };
  const problems = useMemo(
    () => validateNextRoundSetup(setup, { requirePlayBy: !!selfScheduled, today }),
    [setup.label, setup.playBy, selfScheduled, today],
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
              Play by {selfScheduled ? "" : "(optional)"}
            </Label>
            <Input
              id="next-round-playby"
              type="date"
              value={playBy}
              min={today}
              onChange={(e) => setPlayBy(e.target.value)}
            />
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
