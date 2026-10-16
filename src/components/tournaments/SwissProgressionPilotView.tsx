import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import type { FixtureSchedule } from "@/lib/tournaments/swiss-positional-draw";
import { cn } from "@/lib/utils";
import { FixtureCalendar } from "@/components/tournaments/FixtureCalendar";
import { buildSwissCalendar, type SwissCalendarEntry, buildProposedSwissGrid, movement, SWISS_FORMAT_LABEL, type StageScheduleConfig, type SwissProgressionModel } from "@/lib/tournaments/swiss-progression-view";

const STATE_LABEL = { completed: "Played", scheduled: "To play", awaiting_opponent: "Opponent to be decided", bye: "Bye" } as const;

/** Riverside pilot: read-only Swiss grid (default) or classic progression tables, in the shared viewer. */
export function SwissProgressionPilotView({ title, model, positionalPreview = false, classicStandings, stageSchedule, courtName, slots, appliedPlayBy, hideCalendar = false, stageNoun = "Swiss", formatNote }: { appliedPlayBy?: Record<number, string>; hideCalendar?: boolean; slots?: Record<string, FixtureSchedule>; title: string; model: SwissProgressionModel; positionalPreview?: boolean; classicStandings?: ReactNode; stageSchedule?: StageScheduleConfig | null; courtName?: (id: number | string) => string; /** Wording for non-Swiss stages (e.g. "Round robin") so later-stage logs don't read as Swiss. */ stageNoun?: string; formatNote?: string }) {
  const [mode, setMode] = useState<"grid" | "classic" | "calendar">("grid");
  const roundNums = model.rounds.map((r) => r.round);
  // Final standing locks when the Swiss stage's own rounds are complete — later follow-up stage games don't block it.
  const allComplete = model.swissStageComplete;
  const kind = model.format === "positional" ? "fixed-position" : "score-based";
  const proposed = buildProposedSwissGrid(model, { schedule: stageSchedule, courtName, slots, appliedPlayBy });
  const unavailable = positionalPreview && (proposed.issues.length > 0 || !model.rows.length || !model.rounds.some((r) => r.created));
  return (
    <div className="space-y-3" data-testid="swiss-progression-pilot">
      <div role="tablist" aria-label="Swiss view" className={cn("grid border border-border", hideCalendar ? "grid-cols-2" : "grid-cols-3")}>
        {([["grid", positionalPreview ? "Positional Preview" : "Grid"], ["classic", "Log View"], ...(hideCalendar ? [] : [["calendar", "Calendar View"]])] as ["grid" | "classic" | "calendar", string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`swiss-tab-${k}`} aria-selected={mode === k} aria-controls="swiss-tabpanel" onClick={() => setMode(k)}
            className={cn("px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
              mode === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Pilot · read-only view</Badge>
        <span className="text-muted-foreground">{formatNote ?? SWISS_FORMAT_LABEL[model.format]}</span>
      </div>
      <div id="swiss-tabpanel" role="tabpanel" aria-labelledby={`swiss-tab-${mode}`} className="space-y-3">
      {mode === "grid" && unavailable && classicStandings ? classicStandings : null}
      {mode === "classic" && classicStandings ? classicStandings : null}
      {mode === "calendar" ? <SwissCalendarView entries={buildSwissCalendar(model, proposed.issues.length ? undefined : proposed.rounds, appliedPlayBy ? Object.fromEntries(Object.entries(slots ?? {}).filter(([k]) => !appliedPlayBy[Number(/^r(\d+)-/.exec(k)?.[1])])) : slots)} title={title} /> : null}
      {mode === "calendar" ? null : mode === "grid" ? (
        <>
          {!positionalPreview ? <TournamentInteractiveViewer title={`${title} — ${stageNoun} grid (${kind})`} inlineHeight={420} wheelZoom="direct"><SwissPositionGrid model={model} /></TournamentInteractiveViewer> : <>
          <div className="space-y-1 text-xs">
            <h3 className="font-semibold">PREVIEW · Proposed fixed-position Swiss · {model.rows.length} entrants · {model.totalRounds} rounds</h3>
          </div>
          {proposed.issues.length ? <p className="text-xs text-muted-foreground">Positional preview unavailable: {proposed.issues.join(" ")} Saved matches remain available in Classic.</p> : (
            <TournamentInteractiveViewer title={`${title} — PREVIEW proposed positional slots`} inlineHeight={420} defaultFit="none" wheelZoom="direct">
              <SwissPositionGrid model={model} proposedRounds={proposed.rounds} />
            </TournamentInteractiveViewer>
          )}
          </>}
        </>
      ) : (
        <>
          <TournamentInteractiveViewer title={`${title} — ${stageNoun} progression (${kind})`} inlineHeight={360}>
            <table className="text-xs border-collapse bg-background text-foreground">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1">Pos</th><th className="px-2">Move</th><th className="px-2">Player</th><th className="px-2">Seed</th><th className="px-2">Wins</th>
                  {roundNums.map((r) => <th key={r} className="px-2 whitespace-nowrap">Round {r}</th>)}
                  <th className="px-2 whitespace-nowrap">Final standing</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => {
                  const mv = movement(row);
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-2 py-1 font-semibold">{row.current}</td>
                      <td className="px-2" aria-label="movement">{mv == null || mv === 0 ? "–" : mv > 0 ? `▲${mv}` : `▼${-mv}`}</td>
                      <td className="px-2 font-medium whitespace-nowrap">{row.name}</td>
                      <td className="px-2">{row.seed}</td>
                      <td className="px-2">{row.wins}</td>
                      {row.cells.map((c, i) => (
                        <td key={i} className={`px-2 whitespace-nowrap ${c.startsWith("W ") ? "text-primary font-medium" : c.startsWith("L ") ? "text-muted-foreground" : ""}`}>
                          {c}{row.positions[i] != null ? <span className="text-muted-foreground"> · {row.positions[i]}</span> : null}
                        </td>
                      ))}
                      <td data-testid={`swiss-final-standing-${row.id}`} className={allComplete ? "px-2 whitespace-nowrap bg-success/10 font-semibold" : "px-2 whitespace-nowrap text-muted-foreground"}>{row.swissFinalPosition ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TournamentInteractiveViewer>
          <TournamentInteractiveViewer title={`${title} — ${stageNoun} rounds`} inlineHeight={360}>
            <div className="space-y-3 bg-background p-2 text-xs text-foreground">
              {model.rounds.map((rd) => (
                <div key={rd.round}>
                  <div className="font-semibold">Round {rd.round} {rd.complete ? <Badge variant="secondary" className="ml-1 text-[10px]">Complete</Badge> : !rd.created ? <Badge variant="outline" className="ml-1 text-[10px]">Not drawn yet</Badge> : null}</div>
                  {!rd.created ? (
                    <div className="text-muted-foreground">Opponents to be decided once round {rd.round - 1} is finished.</div>
                  ) : (
                    <table className="mt-1 border-collapse">
                      <thead><tr className="text-left text-muted-foreground"><th className="pr-3">Match</th><th className="pr-3">Winner</th><th className="pr-3">Loser</th><th className="pr-3">Score</th><th className="pr-3">Date / time</th><th className="pr-3">Court</th><th className="pr-3">Play by</th><th>Status</th></tr></thead>
                      <tbody>
                        {rd.fixtures.map((f) => (
                          <tr key={f.id} className="border-t border-border">
                            <td className="pr-3 py-0.5 whitespace-nowrap">{f.aLabel} v {f.bLabel}</td>
                            <td className="pr-3">{f.state === "completed" ? (f.winner === f.a ? f.aLabel : f.bLabel) : f.state === "bye" ? f.aLabel : "—"}</td>
                            <td className="pr-3">{f.state === "completed" ? (f.loser === f.a ? f.aLabel : f.bLabel) : "—"}</td>
                            <td className="pr-3">{f.score ?? "—"}</td>
                            <td className="pr-3 whitespace-nowrap">{f.when ?? "Not set"}</td>
                            <td className="pr-3">{f.court ?? "—"}</td>
                            <td className="pr-3">{f.playBy ?? "—"}</td>
                            <td>{STATE_LABEL[f.state]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </TournamentInteractiveViewer>
        </>
      )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<SwissCalendarEntry["kind"], string> = { confirmed: "Saved fixture", proposed: "Proposed slot · not booked", play_by: "Play by", unscheduled: "Not scheduled" };
/** Read-only calendar: saved fixtures vs proposed positional slots, grouped by day. Rescheduling (drag) is a later, separately approved phase. */
export function SwissCalendarView({ entries, title }: { entries: SwissCalendarEntry[]; title: string }) {
  const days = new Map<string, SwissCalendarEntry[]>();
  for (const e of entries) { const k = e.kind === "unscheduled" ? "Not scheduled" : e.date ?? "Not scheduled"; if (!days.has(k)) days.set(k, []); days.get(k)!.push(e); }
  return (
    <div className="space-y-2 text-xs" data-testid="swiss-calendar">
      <p className="text-muted-foreground">Read-only calendar for this category. Solid blocks are saved fixtures; dashed blocks are proposed positional slots (not bookings, players TBD).</p>
      <FixtureCalendar events={entries.filter((e) => e.date && e.kind !== "unscheduled").map((e, i) => ({ id: `${e.round}-${i}`, date: e.date!, time: e.kind === "play_by" ? null : e.time, court: e.court, title: e.label, subtitle: `R${e.round}`, kind: e.kind === "proposed" ? "proposed" : e.kind === "play_by" ? "play_by" : "confirmed", state: e.status === "completed" ? "completed" : "upcoming" }))} />
      {entries.some((e) => e.kind === "unscheduled") && <p className="text-[11px] text-muted-foreground">{entries.filter((e) => e.kind === "unscheduled").length} match(es) not scheduled yet.</p>}
    </div>
  );
}
function fmtCalDay(d: string) {
  const [y, m, da] = d.split("-").map(Number);
  if (!y) return d;
  const dt = new Date(Date.UTC(y, m - 1, da));
  return `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getUTCDay()]} ${da} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
