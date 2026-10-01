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
import {
  applyPlayoffPreset,
  openingRoundsWarning,
  playoffModeFor,
  presetFor,
  validateStageScheduling,
  type PlayoffKey,
  type PlayoffPreset,
  type PlayoffRound,
  type StageMode,
  type StageScheduling,
} from "@/lib/tournaments/round-plan";

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
  /** Play-off rounds the chosen structure really has; when given, only these are asked. */
  playoffRounds?: PlayoffRound[];
  /** Opening rounds the pools need (worked out from the structure). */
  roundsNeeded?: number;
  /** Hide the opening-round list (organiser books courts on session dates instead). */
  hideOpeningRounds?: boolean;
  /** Per-stage scheduling (play by date vs fixed date & courts). Shown when onStageSchedulingChange is given. */
  stageScheduling?: StageScheduling;
  onStageSchedulingChange?: (next: StageScheduling) => void;
  /** Tournament-wide mode the pool rounds use. */
  schedulingMode?: StageMode;
  /** Courts the organiser can pick for fixed play-off rounds. */
  courts?: Array<{ id: number; name: string }>;
}

const PRESETS: Array<{ key: PlayoffPreset; label: string }> = [
  { key: "same", label: "Same as pool rounds" },
  { key: "final_fixed", label: "Only the final on a fixed date" },
  { key: "all_fixed", label: "All play-offs on fixed dates" },
];

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
  playoffRounds,
  roundsNeeded = 0,
  hideOpeningRounds = false,
  stageScheduling = {},
  onStageSchedulingChange,
  schedulingMode = "club",
  courts = [],
}: Props) {
  const perStage = !!onStageSchedulingChange && !!playoffRounds;
  const keys = (playoffRounds ? playoffRounds.map((r) => r.key) : MILESTONE_KEYS) as any[];
  const nameFor = (k: any) => playoffRounds?.find((r) => r.key === k)?.name ?? stageName(k);
  const roundsWarning = openingRoundsWarning(deadlines.length, roundsNeeded);
  const fitRounds = () => {
    const next = deadlines.slice(0, roundsNeeded);
    while (next.length < roundsNeeded) next.push({ label: defaultRoundLabel(next.length), date: "" });
    onChange(next);
  };
  const patch = (i: number, p: Partial<RoundDeadline>) =>
    onChange(deadlines.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const milestoneProblems = validateMilestones(milestones, { require: requireMilestones && keys.length > 0, keys });
  const setMilestone = (key: MilestoneKey | "place_playoffs", value: string) =>
    onMilestonesChange({ ...milestones, [key]: value || null });

  const stageKeys = (playoffRounds ?? []).map((r) => r.key) as PlayoffKey[];
  const modeOf = (k: PlayoffKey) => playoffModeFor(k, stageScheduling, schedulingMode);
  const activePreset = perStage ? presetFor(stageScheduling, stageKeys, schedulingMode) : null;
  const patchStage = (k: PlayoffKey, p: Partial<{ mode: StageMode; start_time: string | null; court_ids: number[] }>) => {
    const prev = stageScheduling.playoffs?.[k] ?? { mode: modeOf(k), start_time: null, court_ids: [] };
    onStageSchedulingChange?.({
      ...stageScheduling,
      opening: schedulingMode,
      playoffs: { ...(stageScheduling.playoffs ?? {}), [k]: { ...prev, ...p } },
    });
  };
  const stageProblems = perStage
    ? validateStageScheduling(stageScheduling, stageKeys, schedulingMode,
        Object.fromEntries((playoffRounds ?? []).map((r) => [r.key, r.name])))
    : [];

  const progressFor = (round: number) => progress.find((p) => p.roundNumber === round) ?? null;

  return (
    <div className="space-y-3">
      {!hideOpeningRounds && <div className="rounded-lg border p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <CalendarClock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Opening rounds{roundsNeeded > 0 ? ` — your pools need ${roundsNeeded}` : ""}</div>
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
        {roundsWarning && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            {roundsWarning}{" "}
            <button type="button" className="underline" onClick={fitRounds}>Use {roundsNeeded} rounds</button>
          </p>
        )}
      </div>}

      {keys.length > 0 && <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <Trophy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              Play-off dates{requireMilestones ? "" : " (optional)"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Only the play-off rounds your structure actually has. Play-off games take these dates —
              never a pool round's date — and show "Date to be set" until you fill them in.
            </p>
          </div>
        </div>

        {perStage && (
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              Pool rounds: {schedulingMode === "self" ? "players book by a date" : "organiser books courts"}. Play-offs:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  type="button"
                  size="sm"
                  variant={activePreset === p.key ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => onStageSchedulingChange!(applyPlayoffPreset(p.key, stageKeys, { ...stageScheduling, opening: schedulingMode }, schedulingMode))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {stageKeys.includes("final") && (
              <p className="text-[10px] text-muted-foreground">A 3rd/4th play-off follows the final's setting and date.</p>
            )}
          </div>
        )}

        {perStage ? (
          <div className="space-y-2">
            {stageKeys.map((key) => {
              const mode = modeOf(key);
              const plan = stageScheduling.playoffs?.[key];
              const picked = new Set(plan?.court_ids ?? []);
              return (
                <div key={key} className="rounded-md border bg-background/60 p-2 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{nameFor(key)}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {playoffRounds!.find((r) => r.key === key)?.usedBy.join(", ")}
                      </div>
                    </div>
                    <div className="inline-flex rounded-md border p-0.5">
                      {(["self", "club"] as StageMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => patchStage(key, { mode: m })}
                          className={`px-2 py-0.5 text-[11px] rounded ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          {m === "self" ? "Play by date" : "Fixed date & courts"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`grid gap-2 ${mode === "club" ? "sm:grid-cols-[1fr_1fr_2fr]" : "sm:grid-cols-3"}`}>
                    <div>
                      <Label className="text-xs">{mode === "club" ? "Date" : "Played by"}</Label>
                      <Input
                        type="date"
                        value={milestones?.[key] ?? ""}
                        min={deadlines[deadlines.length - 1]?.date || minDate || undefined}
                        onChange={(e) => setMilestone(key, e.target.value)}
                        className="h-8"
                      />
                    </div>
                    {mode === "club" && (
                      <>
                        <div>
                          <Label className="text-xs">First game at</Label>
                          <Input
                            type="time"
                            value={plan?.start_time ?? ""}
                            onChange={(e) => patchStage(key, { start_time: e.target.value || null })}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Courts</Label>
                          <div className="flex flex-wrap gap-1">
                            {courts.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  const next = new Set(picked);
                                  next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                  patchStage(key, { court_ids: Array.from(next).sort((a, b) => a - b) });
                                }}
                                className={`px-2 py-1 text-[11px] rounded border ${picked.has(c.id) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}
                              >
                                {c.name}
                              </button>
                            ))}
                            {courts.length === 0 && <span className="text-[11px] text-muted-foreground">No courts set up.</span>}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {keys.map((key) => (
            <div key={key}>
              <Label className="text-xs">{nameFor(key)} played by</Label>
              {playoffRounds && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {playoffRounds.find((r) => r.key === key)?.usedBy.join(", ")}
                </div>
              )}
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
        )}

        {(milestoneProblems.length > 0 || stageProblems.length > 0) && (
          <ul className="text-[11px] text-destructive space-y-0.5">
            {[...milestoneProblems, ...stageProblems].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  );
}
