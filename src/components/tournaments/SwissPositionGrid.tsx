import { useState } from "react";
import { cn } from "@/lib/utils";
import { buildSwissGrid, type GridBlock, type GridRound, type SwissProgressionModel } from "@/lib/tournaments/swiss-progression-view";

type BlockStatus = "completed" | "upcoming" | "unresolved";
/** Visual status only, from what the block already shows. */
export function blockStatus(b: GridBlock): BlockStatus {
  if (b.rows.some((r) => r.result === "W" || r.result === "L")) return "completed";
  return b.rows.every((r) => r.id) ? "upcoming" : "unresolved";
}
type RoundStatus = "completed" | "in_progress" | "upcoming" | "unresolved";
export function roundStatus(rd: GridRound): RoundStatus {
  const st = rd.blocks.map(blockStatus);
  if (!st.length) return "unresolved";
  if (st.every((x) => x === "completed")) return "completed";
  if (st.some((x) => x === "completed")) return "in_progress";
  return st.some((x) => x === "upcoming") ? "upcoming" : "unresolved";
}
const STATUS_VAR: Record<RoundStatus, string> = { completed: "--success", in_progress: "--warning", upcoming: "--round-1", unresolved: "--muted-foreground" };
const STATUS_TEXT: Record<RoundStatus, string> = { completed: "Completed", in_progress: "In progress", upcoming: "Upcoming", unresolved: "Players TBD" };

function WhenTag({ text }: { text: string }) {
  const kind = /^Play by/i.test(text) ? "playby" : /^Proposed/i.test(text) ? "proposed" : /^(Not scheduled|TBD|Not allocated)/i.test(text) ? "none" : "saved";
  return (
    <span data-when={kind} className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight",
      kind === "playby" && "border border-warning/60 bg-warning/10 font-medium text-foreground",
      kind === "proposed" && "border border-dashed border-border text-foreground",
      kind === "saved" && "bg-muted font-medium text-foreground",
      kind === "none" && "text-muted-foreground")}>{text}</span>
  );
}

/** Read-only, spreadsheet-like Swiss grid: rounds side by side, each match a 2-row block. Visual layer only. */
export function SwissPositionGrid({ model, proposedRounds, rrMemberships }: { model: SwissProgressionModel; proposedRounds?: GridRound[]; rrMemberships?: Map<string, { position: number; group: number | null }> }) {
  const rounds = proposedRounds ?? buildSwissGrid(model);
  const slots = Math.max(1, model.rows.length);
  const [selected, setSelected] = useState<string | null>(null);
  const selName = selected ? model.rows.find((r) => r.id === selected)?.name ?? null : null;
  return (
    <div className={cn("bg-background p-3 text-xs text-foreground", proposedRounds && "riverside-round-visuals")} data-testid="swiss-position-grid">
      <div className="mb-2 flex min-h-7 items-center gap-2 text-[11px] text-muted-foreground">
        {selName ? <>
          <span data-testid="swiss-path-selected">Showing known path: <strong className="text-foreground">{selName}</strong> · future rounds stay TBD until results decide them</span>
          <button type="button" className="rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted" onClick={() => setSelected(null)}>Clear highlight</button>
        </> : <span>Tap a player's name to highlight their path.</span>}
      </div>
      <div className="flex gap-4">
      {rounds.map((rd) => {
        const rs = roundStatus(rd);
        return (
        <table key={rd.round} data-round-tone={((rd.round - 1) % 5) + 1} data-testid={`swiss-round-${rd.round}`} data-status={rs} className="round-panel border-collapse min-w-[320px] self-start overflow-hidden rounded-md border border-border">
          <thead>
            <tr className="round-header bg-muted text-left">
              <th colSpan={4} className="border-t-4 px-2.5 py-1.5 font-semibold" style={proposedRounds ? undefined : { borderTopColor: `hsl(var(--round-${((rd.round - 1) % 5) + 1}))` }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Round {rd.round}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `hsl(var(${STATUS_VAR[rs]}) / 0.15)`, color: "hsl(var(--foreground))" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(${STATUS_VAR[rs]}))` }} />{STATUS_TEXT[rs]}
                  </span>
                </div>
                {proposedRounds ? <div className="text-[11px] font-normal text-muted-foreground">{rd.created ? "Real games · results as played" : rd.blocks.some((b) => b.saved) ? "Real games shown · remaining slots still to be decided" : "Proposed slots · not live fixtures"}{rd.schedule && !rd.created ? <div className="text-[11px] font-normal" data-testid={`swiss-round-schedule-${rd.round}`}>{rd.schedule.label}{rd.schedule.kind === "window" ? " · round-level plan, no court booked per match" : ""}</div> : null}</div> : null}
              </th>
            </tr>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="px-2 py-1 w-8">Pos</th><th className="px-2">Player</th><th className="px-2">Day &amp; time · court</th><th className="px-2">Result</th>
            </tr>
          </thead>
          {rd.created || rd.blocks.length > 0 ? rd.blocks.map((b) => {
            const st = blockStatus(b);
            const sv = st === "completed" ? "--success" : st === "upcoming" ? "--round-1" : "--muted-foreground";
            return (
            <tbody key={b.matchId} data-status={st} className="border-t-[3px] border-foreground/60" style={{ boxShadow: `inset 3px 0 0 hsl(var(${sv}) / ${st === "unresolved" ? 0.35 : 0.8})` }}>
              {b.rows.map((r, i) => {
                const on = !!selected && r.id === selected;
                const membership = rd.round >= 3 && r.id ? rrMemberships?.get(r.id) : undefined;
                return (
                <tr key={i} data-path={on ? "on" : undefined} data-rr-group={membership ? membership.group ?? "swiss" : undefined} className={cn(membership && "riverside-rr-band", r.result === "W" && "bg-success/10 font-semibold", r.result === "L" && "text-muted-foreground", on && "bg-primary/20 outline outline-2 -outline-offset-2 outline-primary")}>
                  <td className="px-2 py-1 tabular-nums">{r.pos ?? "—"}</td>
                  <td className="px-2 whitespace-nowrap">
                    {r.id ? <><button type="button" aria-pressed={on} className="text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setSelected(on ? null : r.id)}>{r.name}</button>{r.projected ? <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground" title="Projected from a confirmed result — proposed slot, not a saved fixture">projected</span> : null}</> : <span className={cn(r.name === "TBD" && "text-muted-foreground")}>{r.name}</span>}
                  </td>
                  {i === 0 ? (
                    <td rowSpan={2} className="px-2 py-1 align-middle">
                      <WhenTag text={r.when ?? (rd.created ? "Not scheduled" : "TBD")} />{b.court ? <div className="mt-0.5 text-[11px] font-medium text-foreground">{b.court}</div> : null}
                    </td>
                  ) : null}
                  <td className="px-2 whitespace-nowrap">{r.result}{i === 0 && b.score ? <span className="ml-1 tabular-nums text-muted-foreground">{b.score}</span> : null}</td>
                </tr>
              ); })}
            </tbody>
          ); }) : (
            <tbody className="border-t-[3px] border-foreground/60">
              {Array.from({ length: Math.ceil(slots / 2) }).flatMap((_, k) => [0, 1].map((i) => (
                <tr key={`${k}-${i}`} className={`text-muted-foreground ${i === 0 && k > 0 ? "border-t-[3px] border-foreground/60" : ""}`}>
                  <td className="px-2 py-1">—</td><td className="px-2">TBD</td><td className="px-2">TBD</td><td className="px-2" />
                </tr>
              )))}
            </tbody>
          )}
        </table>
      ); })}
      {model.rows.length ? (
        <table data-testid="swiss-final-standing-card" className="round-panel min-w-[220px] self-start overflow-hidden rounded-md border border-border border-collapse">
          <thead>
            <tr className="round-header bg-muted text-left">
              <th colSpan={2} className="border-t-4 px-2.5 py-1.5 font-semibold" style={{ borderTopColor: "hsl(var(--success))" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{model.swissStageComplete ? "Final standings" : "Current positions"}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `hsl(var(${model.swissStageComplete ? "--success" : "--muted-foreground"}) / 0.15)`, color: "hsl(var(--foreground))" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(${model.swissStageComplete ? "--success" : "--muted-foreground"}))` }} />{model.swissStageComplete ? "Locked" : "Projected"}
                  </span>
                </div>
                <div className="text-[11px] font-normal text-muted-foreground">{model.swissStageComplete ? "All rounds complete — these positions seed the next stage" : `Locks when Round ${model.totalRounds ?? "?"} completes`}</div>
              </th>
            </tr>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="px-2 py-1 w-8">Pos</th><th className="px-2">Player</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border", model.swissStageComplete && "bg-success/10")}>
                <td className="px-2 py-1 tabular-nums font-semibold">{model.swissStageComplete ? (r.swissFinalPosition ?? r.current) : r.current}</td>
                <td className="px-2 whitespace-nowrap">{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      </div>
    </div>
  );
}

/** Current live score-based standings (Pos/Player/Wins/R1..Rn results). Shown on the Results tab for Riverside Swiss pilot categories. */
export function SwissCurrentPositionsTable({ model }: { model: SwissProgressionModel }) {
  // Final standing locks when the Swiss stage's own rounds are complete — later follow-up stage games don't block it.
  const allComplete = model.swissStageComplete;
  return (
    <div className="overflow-x-auto bg-background text-xs text-foreground">
     <table className="border-collapse min-w-[300px] self-start" data-testid="swiss-current-positions">
        <thead>
          <tr className="bg-muted text-left"><th colSpan={3 + model.totalRounds} className="px-2 py-1">{allComplete ? "Final standings · all rounds complete — these positions seed the next stage" : "Current positions · live score-based standings"}</th></tr>
          <tr className="text-left text-muted-foreground"><th className="px-2">Pos</th><th className="px-2">Player</th>{model.rounds.map((r) => <th key={r.round} className="px-2 whitespace-nowrap">R{r.round} result</th>)}<th className="px-2 whitespace-nowrap">{allComplete ? "Final standings" : "Current positions"}</th></tr>
        </thead>
        <tbody>{model.rows.map((row) => <tr key={row.id} className="border-t border-border">
          <td className="px-2 py-1 tabular-nums">{row.current}</td><td className="px-2 whitespace-nowrap">{row.name}</td>
          {row.cells.map((cell, i) => <td key={i} className="px-2 whitespace-nowrap">{cell}</td>)}
          <td data-testid={`swiss-final-standing-${row.id}`} className={cn("px-2 tabular-nums whitespace-nowrap", allComplete ? "bg-success/10 font-semibold text-foreground" : "text-muted-foreground")}>{row.swissFinalPosition ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}
