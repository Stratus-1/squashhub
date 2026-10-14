import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import type { FixtureSchedule } from "@/lib/tournaments/swiss-positional-draw";
import { cn } from "@/lib/utils";
import { buildSwissCalendar, type SwissCalendarEntry, buildProposedSwissGrid, movement, SWISS_FORMAT_LABEL, type StageScheduleConfig, type SwissProgressionModel } from "@/lib/tournaments/swiss-progression-view";

const STATE_LABEL = { completed: "Played", scheduled: "To play", awaiting_opponent: "Opponent to be decided", bye: "Bye" } as const;

/** Riverside pilot: read-only Swiss grid (default) or classic progression tables, in the shared viewer. */
export function SwissProgressionPilotView({ title, model, positionalPreview = false, classicStandings, stageSchedule, courtName, slots }: { slots?: Record<string, FixtureSchedule>; title: string; model: SwissProgressionModel; positionalPreview?: boolean; classicStandings?: ReactNode; stageSchedule?: StageScheduleConfig | null; courtName?: (id: number | string) => string }) {
  const [mode, setMode] = useState<"grid" | "classic" | "calendar">("grid");
  const roundNums = model.rounds.map((r) => r.round);
  const kind = model.format === "positional" ? "fixed-position" : "score-based";
  const proposed = buildProposedSwissGrid(model, { schedule: stageSchedule, courtName, slots });
  const unavailable = positionalPreview && (proposed.issues.length > 0 || !model.rows.length || !model.rounds.some((r) => r.created));
  return (
    <div className="space-y-3" data-testid="swiss-progression-pilot">
      <div role="tablist" aria-label="Swiss view" className="grid grid-cols-3 border border-border">
        {([["grid", positionalPreview ? "Positional Preview" : "Grid"], ["classic", "Classic View"], ["calendar", "Calendar View"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`swiss-tab-${k}`} aria-selected={mode === k} aria-controls="swiss-tabpanel" onClick={() => setMode(k)}
            className={cn("px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
              mode === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Pilot · read-only view</Badge>
        <span className="text-muted-foreground">{SWISS_FORMAT_LABEL[model.format]}</span>
      </div>
      <div id="swiss-tabpanel" role="tabpanel" aria-labelledby={`swiss-tab-${mode}`} className="space-y-3">
      {mode === "grid" && unavailable && classicStandings ? classicStandings : null}
      {mode === "classic" && classicStandings ? classicStandings : null}
      {mode === "calendar" ? <SwissCalendarView entries={buildSwissCalendar(model, proposed.issues.length ? undefined : proposed.rounds, slots)} title={title} /> : null}
      {mode === "calendar" ? null : mode === "grid" ? (
        <>
          {!positionalPreview ? <TournamentInteractiveViewer title={`${title} — Swiss grid (${kind})`} inlineHeight={420}><SwissPositionGrid model={model} /></TournamentInteractiveViewer> : <>
          <div className="space-y-1 text-xs">
            <h3 className="font-semibold">PREVIEW · Proposed fixed-position Swiss · {model.rows.length} entrants · {model.totalRounds} rounds</h3>
            <p className="text-muted-foreground">Round 1 shows saved matches only. Later columns are proposed template slots, not the existing live score-based draw. Players were not moved into fixed slots; future names and results remain TBD. Later rounds show a PROPOSED court and start time per match, laid out from the tournament's daily window, match length and courts across all categories; proposals only, not court bookings.</p>
            <p className="text-muted-foreground">Base template only: bye fairness and rematch adjustments are not applied. No pairing engine conversion has been made.</p>
          </div>
          {proposed.issues.length ? <p className="text-xs text-muted-foreground">Positional preview unavailable: {proposed.issues.join(" ")} Saved matches remain available in Classic.</p> : (
            <TournamentInteractiveViewer title={`${title} — PREVIEW proposed positional slots`} inlineHeight={420} defaultFit="none">
              <SwissPositionGrid model={model} proposedRounds={proposed.rounds} />
            </TournamentInteractiveViewer>
          )}
          </>}
        </>
      ) : (
        <>
          <TournamentInteractiveViewer title={`${title} — Swiss progression (${kind})`} inlineHeight={360}>
            <table className="text-xs border-collapse bg-background text-foreground">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1">Pos</th><th className="px-2">Move</th><th className="px-2">Player</th><th className="px-2">Seed</th><th className="px-2">Wins</th>
                  {roundNums.map((r) => <th key={r} className="px-2 whitespace-nowrap">Round {r}</th>)}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TournamentInteractiveViewer>
          <TournamentInteractiveViewer title={`${title} — Swiss rounds`} inlineHeight={360}>
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
      <p className="text-muted-foreground">Read-only. Solid rows are saved live fixtures; dashed rows are proposed positional slots (not bookings, players TBD). Nothing can be moved here yet.</p>
      <TournamentInteractiveViewer title={`${title} — calendar`} inlineHeight={420} defaultFit="none">
        <div className="space-y-3 bg-background p-3 text-foreground">
          {[...days].map(([day, es]) => (
            <section key={day} className="rounded-md border border-border">
              <h4 className="bg-muted px-2.5 py-1.5 font-semibold" data-testid="swiss-calendar-day">{day === "Not scheduled" ? day : fmtCalDay(day)}</h4>
              <table className="w-full border-collapse">
                <thead><tr className="text-left text-[11px] text-muted-foreground"><th className="px-2 py-1">Time</th><th className="px-2">Court</th><th className="px-2">Round</th><th className="px-2">Match</th><th className="px-2">Type</th></tr></thead>
                <tbody>{es.map((e, i) => (
                  <tr key={i} data-kind={e.kind} className={cn("border-t border-border", e.kind === "proposed" && "border-dashed text-muted-foreground")}>
                    <td className="px-2 py-1 tabular-nums font-medium text-foreground">{e.time?.slice(0, 5) ?? "—"}</td>
                    <td className="px-2">{e.court ?? "—"}</td>
                    <td className="px-2">R{e.round}</td>
                    <td className="px-2 whitespace-nowrap">{e.label}</td>
                    <td className="px-2"><span className={cn("rounded px-1.5 py-0.5 text-[11px]", e.kind === "confirmed" && "bg-success/15 text-foreground", e.kind === "proposed" && "border border-dashed border-border", e.kind === "play_by" && "border border-warning/60 bg-warning/10 text-foreground")}>{KIND_LABEL[e.kind]}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ))}
          {!entries.length && <p className="text-muted-foreground">No matches to show yet.</p>}
        </div>
      </TournamentInteractiveViewer>
    </div>
  );
}
function fmtCalDay(d: string) {
  const [y, m, da] = d.split("-").map(Number);
  if (!y) return d;
  const dt = new Date(Date.UTC(y, m - 1, da));
  return `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getUTCDay()]} ${da} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
