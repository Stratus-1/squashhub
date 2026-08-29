import { useMemo } from "react";
import { CalendarClock, CheckCircle2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { RoundDeadline } from "@/lib/tournaments/round-deadlines";
import {
  currentRoundNumber,
  ensureRound,
  isFinalsStage,
  nextRoundReady,
  patchRound,
  roundStageLabel,
  type RoundProgress,
} from "@/lib/tournaments/self-scheduled-rounds";

interface Props {
  deadlines: RoundDeadline[];
  onChange: (next: RoundDeadline[]) => void;
  progress: RoundProgress[];
  /** Total knockout rounds implied by the field size — used only for stage names. */
  totalRounds?: number;
  minDate?: string;
}

/**
 * Single-round scheduling for self-scheduled knockout tournaments.
 *
 * The organiser only ever configures the CURRENT round: its play-by date and
 * optional instructions. Earlier rounds are shown read-only; later rounds are
 * deliberately not configurable until the current round has been played and
 * the next round generated. From the semi-final on, the round can be flipped
 * to club-scheduled courts and times.
 */
export function SelfScheduledRounds({ deadlines, onChange, progress, totalRounds, minDate }: Props) {
  const current = useMemo(() => currentRoundNumber(progress), [progress]);
  const remaining = totalRounds && totalRounds >= current ? totalRounds - current + 1 : null;
  const stage = roundStageLabel(current, remaining);
  const row = deadlines[current - 1] || { label: stage, date: "" };
  const played = progress.filter((p) => p.complete);
  const currentProgress = progress.find((p) => p.roundNumber === current);
  const ready = nextRoundReady(progress);

  const patch = (p: Partial<RoundDeadline>) => onChange(patchRound(ensureRound(deadlines, current, stage), current, p));

  return (
    <div className="space-y-3">
      {played.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Completed rounds</div>
          {played.map((p) => {
            const d = deadlines[p.roundNumber - 1];
            return (
              <div key={p.roundNumber} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">{d?.label || `Round ${p.roundNumber}`}</span>
                <span className="text-muted-foreground">
                  {d?.date ? `played by ${d.date}` : "no deadline recorded"} · {p.completed}/{p.total} games
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <div>
            <div className="text-sm font-medium">
              {ready ? "Next round" : "Current round"}: {row.label?.trim() || stage}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Players arrange their own court, date and time — you only set the date this round must be
              finished by.
              {currentProgress
                ? ` ${currentProgress.completed}/${currentProgress.total} games played.`
                : " No games generated for this round yet."}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Round name</Label>
            <Input
              value={row.label ?? ""}
              placeholder={stage}
              onChange={(e) => patch({ label: e.target.value })}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Must be played by</Label>
            <Input
              type="date"
              value={row.date ?? ""}
              min={minDate || undefined}
              onChange={(e) => patch({ date: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Notes to players (optional)</Label>
          <Textarea
            value={row.notes ?? ""}
            rows={2}
            placeholder="e.g. Book your own court through the app and capture the result the same day."
            onChange={(e) => patch({ notes: e.target.value })}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Shown with this round's fixtures and in reminders.
          </p>
        </div>

        {isFinalsStage(remaining) && (
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border bg-background p-2">
            <Checkbox
              checked={row.mode === "club"}
              onCheckedChange={(v) => patch({ mode: v ? "club" : "self" })}
            />
            <span>
              <span className="font-medium">Club schedules this stage on booked courts</span>
              <span className="block text-[11px] text-muted-foreground">
                Switch the {stage.toLowerCase()} to a fixed club-run date, time and court instead of leaving it
                to the players. The full court and time controls appear once this is ticked.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="rounded-lg border border-dashed p-3 space-y-3">
        <div className="text-sm font-medium">Plan ahead: {nextRow.label?.trim() || nextStage}</div>
        <p className="text-[11px] text-muted-foreground">
          Optional — you can already name the next round and set its play-by date while{" "}
          <strong>{row.label?.trim() || stage}</strong> is still being played. The fixtures themselves are
          only generated from the winners once this round is complete.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Next round name</Label>
            <Input
              value={nextRow.label ?? ""}
              placeholder={nextStage}
              onChange={(e) => patchNext({ label: e.target.value })}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Must be played by</Label>
            <Input
              type="date"
              value={nextRow.date ?? ""}
              min={row.date || minDate || undefined}
              onChange={(e) => patchNext({ date: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Matchups for later rounds unlock as each round finishes — no need to plan the whole draw upfront.</span>
        </div>
      </div>
    </div>
  );
}
