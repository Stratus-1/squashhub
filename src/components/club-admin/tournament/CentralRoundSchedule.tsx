import { CalendarClock, CheckCircle2, Plus, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultRoundLabel,
  type RoundDeadline,
} from "@/lib/tournaments/round-deadlines";
import {
  MILESTONE_KEYS,
  stageName,
  validateMilestones,
  type MilestoneKey,
  type MilestonePlayBy,
} from "@/lib/tournaments/round-definitions";
import type { RoundProgress } from "@/lib/tournaments/self-scheduled-rounds";

interface Props {
  /** The tournament's central early-round list. */
  deadlines: RoundDeadline[];
  onChange: (next: RoundDeadline[]) => void;
  /** Central championship deadlines. */
  milestones: MilestonePlayBy;
  onMilestonesChange: (next: MilestonePlayBy) => void;
  /** Knockouts must have quarter-final / semi-final / final deadlines. */
  requireMilestones?: boolean;
  /** Live per-round progress, so played rounds can be shown as history. */
  progress?: RoundProgress[];
  minDate?: string;
  /** Which leagues currently sit on each round, e.g. { 3: ["2nd League"] }. */
  usageByRound?: Record<number, string[]>;
}

/**
 * The ONE place a tournament's round names and play-by dates are entered.
 *
 * Rounds are defined for the whole tournament, not per league: Round 6 can
 * exist even though only the biggest league ever reaches it. Every other
 * screen — progressing a league, generating a draw, the fixture list, the
 * notices — references what is set here and never asks for a date again.
 *
 * Championship milestones are separate on purpose: the organiser sets ONE
 * quarter-final / semi-final / final deadline for the event, and the system
 * decides on its own when each league reaches those stages from the players
 * still standing.
 */
export function CentralRoundSchedule({
  deadlines,
  onChange,
  milestones,
  onMilestonesChange,
  requireMilestones = false,
  progress = [],
  minDate,
  usageByRound = {},
}: Props) {
  const patch = (i: number, p: Partial<RoundDeadline>) =>
    onChange(deadlines.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const milestoneProblems = validateMilestones(milestones, { require: requireMilestones });
  const setMilestone = (key: MilestoneKey, value: string) =>
    onMilestonesChange({ ...milestones, [key]: value || null });

  const progressFor = (round: number) => progress.find((p) => p.roundNumber === round) ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <CalendarClock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Early rounds</div>
            <p className="text-[11px] text-muted-foreground">
              One list for the whole tournament. Leagues move through these rounds at their own pace — a
              small league may reach its final while a big one is still on Round 3, and a round only
              applies to the leagues that actually reach it.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {deadlines.map((d, i) => {
            const round = i + 1;
            const p = progressFor(round);
            const users = usageByRound[round] || [];
            const played = !!p && p.total > 0;
            return (
              <div key={round} className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1.5fr_auto]">
                  <div>
                    <Label className="text-xs">Round name</Label>
                    <Input
                      value={d.label ?? ""}
                      placeholder={defaultRoundLabel(i)}
                      onChange={(e) => patch(i, { label: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Must be played by</Label>
                    <Input
                      type="date"
                      value={d.date ?? ""}
                      min={deadlines[i - 1]?.date || minDate || undefined}
                      onChange={(e) => patch(i, { date: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Notes to players (optional)</Label>
                    <Textarea
                      value={d.notes ?? ""}
                      rows={1}
                      placeholder="Shown with this round's fixtures"
                      onChange={(e) => patch(i, { notes: e.target.value })}
                      className="min-h-8 h-8 py-1.5 text-sm resize-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={played}
                      title={played ? "This round has fixtures and cannot be removed" : "Remove this round"}
                      onClick={() => onChange(deadlines.filter((_, j) => j !== i))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {(played || users.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {played && (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2
                          className={`w-3 h-3 ${p!.complete ? "text-primary" : "text-muted-foreground"}`}
                        />
                        {p!.completed}/{p!.total} games played
                      </span>
                    )}
                    {users.length > 0 && <span>Used by {users.join(", ")}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([...deadlines, { label: defaultRoundLabel(deadlines.length), date: "" }])
          }
        >
          <Plus className="w-4 h-4 mr-1" /> Add another round
        </Button>
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <Trophy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              Championship deadlines{requireMilestones ? "" : " (optional)"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The date each championship stage must be played by. You do not say which league is at
              which stage — the app works that out from the players still standing, so a league that
              gets there early simply waits for the common date.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {MILESTONE_KEYS.map((key) => (
            <div key={key}>
              <Label className="text-xs">{stageName(key)} played by</Label>
              <Input
                type="date"
                value={milestones?.[key] ?? ""}
                min={deadlines[deadlines.length - 1]?.date || minDate || undefined}
                onChange={(e) => setMilestone(key, e.target.value)}
                className="h-8"
              />
            </div>
          ))}
        </div>

        {milestoneProblems.length > 0 && (
          <ul className="text-[11px] text-destructive space-y-0.5">
            {milestoneProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
