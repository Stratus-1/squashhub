import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { FixtureCalendar } from "@/components/tournaments/FixtureCalendar";
import type { RRPoolView, RRRound } from "@/lib/tournaments/round-robin-view";

/** Display bands only: caller supplies existing official order, independently per pool. */
export function poolRankTone(index: number, count: number) {
  return count <= 1 ? 2 : Math.round(index * 4 / (count - 1));
}
const ROUND_STATUS: Record<RRRound["status"], string> = { complete: "Complete", in_progress: "In progress", not_started: "Not started" };

/** Riverside pilot: read-only pool matrix + order of play for one round-robin pool. */
export function RoundRobinPilotView({ title, view, calendar, matrixOnly = false, showSlots = false, withCalendar = false }: { calendar?: ReactNode; title: string; view: RRPoolView; matrixOnly?: boolean; showSlots?: boolean; withCalendar?: boolean }) {
  const { players, matrix, totals, rounds } = view;
  const [mode, setMode] = useState<"matrix" | "calendar">("matrix");
  const calEvents = rounds.flatMap((rd) => rd.matches.filter((m) => m.status !== "bye" && (m.date || m.playBy)).map((m) => ({
    id: m.id, date: (m.date ?? m.playBy)!, time: m.date ? m.time ?? null : null, court: m.court ?? null,
    title: `${m.aName} v ${m.bName}`, subtitle: `R${rd.round ?? "?"}`,
    kind: (m.date ? "confirmed" : "play_by") as "confirmed" | "play_by",
    state: (m.status === "played" ? "completed" : "upcoming") as "completed" | "upcoming",
  })));
  return (
    <div className="space-y-2" data-testid="rr-pilot">
      {!matrixOnly && <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Pilot · read-only view</Badge>
        <span className="text-muted-foreground">Same saved matches as the standings table; rows stay in draw order; Rank updates after each result. No results can be entered here.</span>
      </div>}
      {view.issues.length > 0 && <p className="text-xs text-destructive">{view.issues.join(" ")}</p>}
      {(!matrixOnly || withCalendar) && (
        <div role="tablist" aria-label="Round robin view" className="grid grid-cols-2 border border-border">
          {([["matrix", "Matrix"], ["calendar", "Calendar View"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
              className={cn("px-3 py-1.5 text-xs font-medium", mode === k ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted")}>{label}</button>
          ))}
        </div>
      )}
      {mode === "calendar" && (!matrixOnly || withCalendar) ? (
        calendar ?? <div className="space-y-2 text-xs" data-testid="rr-calendar">
          <p className="text-muted-foreground">Read-only calendar for this pool. Solid blocks are saved fixtures; play-by rounds show their deadline day.</p>
          <FixtureCalendar events={calEvents} />
        </div>
      ) : (
      <TournamentInteractiveViewer title={`${title} — ${matrixOnly ? "Rankings & results" : "pool matrix & order of play"}`} inlineHeight={matrixOnly ? 240 : 460} defaultFit="none" wheelZoom="direct">
        <div className="riverside-round-visuals space-y-4 bg-background p-3 text-xs text-foreground">
          <table className="border-collapse" data-testid="rr-matrix">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1 text-left">#</th>
                <th className="border border-border px-2 py-1 text-left">Player</th>
                {players.map((p, i) => <th key={p.id} className="border border-border px-2 py-1 min-w-[64px]" title={p.name}>{i + 1}</th>)}
                <th className="border border-border px-2 py-1">W</th><th className="border border-border px-2 py-1">L</th><th className="border border-border px-2 py-1" title="Games won">GF</th><th className="border border-border px-2 py-1" title="Games lost">GA</th><th className="border border-border px-2 py-1" title="Game difference">GD</th><th className="border border-border px-2 py-1 whitespace-nowrap" title="Recorded rally points for / against; excludes live games and walkover awards">Pts F/A</th><th className="border border-border px-2 py-1">Rank</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id}>
                  <td className="border border-border px-2 py-1 tabular-nums">{i + 1}</td>
                  <td className="border border-border px-2 py-1 whitespace-nowrap font-medium">{p.name}</td>
                  {players.map((q) => {
                    if (q.id === p.id) return <td key={q.id} className="border border-border bg-muted-foreground/40" aria-label="Not applicable" />;
                    const c = matrix[p.id][q.id];
                    return (
                      <td key={q.id} data-testid={`rr-cell-${p.id}-${q.id}`} data-state={c?.status === "played" ? "final" : c?.live ? "live" : "pending"} aria-label={`${p.name} versus ${q.name}: ${c?.status === "played" ? `Final ${c.setSummary ?? "score not recorded"}${c.result ? `, ${c.result === "W" ? "won" : "lost"}` : ""}` : c?.live ? "In progress" : `Round ${c?.round ?? "not assigned"}`}`} className={cn("border border-border px-2 py-1 text-center tabular-nums whitespace-nowrap", c?.status === "played" && "rr-matrix-final font-semibold", c?.live && "border-destructive bg-destructive/10")}>
                        {!c ? "—" : c.status === "played" ? c.setSummary ?? "Final" : c.live ? <span className="text-[10px] font-semibold">In progress</span> : <><span className="round-reference" data-round-tone={((c.round ?? 1) - 1) % 5 + 1}>R{c.round ?? "?"}</span>{showSlots && c.slot && <span data-testid="rr-cell-slot" className="block text-[10px] leading-tight text-muted-foreground">{c.slot}</span>}</>}
                      </td>
                    );
                  })}
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].wins}</td>
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].losses}</td>
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].gamesFor}</td><td className="border border-border px-2 text-center tabular-nums">{totals[p.id].gamesAgainst}</td><td className="border border-border px-2 text-center tabular-nums">{(g => g > 0 ? `+${g}` : `${g}`)(totals[p.id].gamesFor - totals[p.id].gamesAgainst)}</td>
                  <td data-testid={`rr-points-${p.id}`} title={totals[p.id].pointsKnown ? "Recorded rally points for / against" : "Incomplete recorded rally-point detail"} className="border border-border px-2 text-center tabular-nums whitespace-nowrap">{totals[p.id].pointsKnown ? `${totals[p.id].pointsFor}/${totals[p.id].pointsAgainst}` : "—"}</td>
                  <td data-testid={`rr-rank-${p.id}`} className="border border-border px-2 text-center tabular-nums font-semibold">{view.rank[p.id] ?? i + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.complete && <div className="space-y-1" data-testid="rr-final-standing">
            <h4 className="font-semibold">Final standing</h4>
            <table className="border-collapse"><tbody>
              {[...players].sort((a, b) => (view.rank[a.id] ?? 0) - (view.rank[b.id] ?? 0)).map((p) => (
                <tr key={p.id}><td className="border border-border px-2 py-1 tabular-nums font-semibold text-success">{view.rank[p.id]}</td><td className="border border-border px-2 py-1 whitespace-nowrap">{p.name}</td><td className="border border-border px-2 py-1 tabular-nums">{totals[p.id].wins}W {totals[p.id].losses}L</td></tr>
              ))}
            </tbody></table>
          </div>}
          {!matrixOnly && <div className="space-y-2" data-testid="rr-order-of-play">
            <h4 className="font-semibold">Order of play</h4>
            {rounds.map((rd, ri) => (
              <div key={rd.label} data-round-tone={ri % 5 + 1} className="round-panel border border-border border-l-4">
                <div className="round-header flex flex-wrap items-center gap-2 px-2 py-1 font-semibold">
                  <span>{rd.label}</span><Badge variant="outline" className="text-[10px]">{ROUND_STATUS[rd.status]}</Badge>
                  {rd.sittingOut.length > 0 && <span className="ml-auto text-[11px] font-normal text-muted-foreground">Sitting out: {rd.sittingOut.join(", ")}</span>}
                </div>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-muted-foreground"><th className="px-2">Pos</th><th className="px-2">Player</th><th className="px-2">v</th><th className="px-2">Pos</th><th className="px-2">Player</th><th className="px-2">Result</th><th className="px-2">Score</th><th className="px-2">Day / time · court</th></tr></thead>
                  <tbody>
                    {rd.matches.map((m) => (
                      <tr key={m.id} className={cn("border-t border-border", m.status === "played" && "bg-success/5")}>
                        <td className="px-2 tabular-nums">{m.posA ?? ""}</td>
                        <td className={cn("px-2 whitespace-nowrap", m.winner && m.winner === m.a && "font-semibold")}>{m.aName}</td>
                        <td className="px-2 text-muted-foreground">v</td>
                        <td className="px-2 tabular-nums">{m.posB ?? ""}</td>
                        <td className={cn("px-2 whitespace-nowrap", m.winner && m.winner === m.b && "font-semibold")}>{m.bName}</td>
                        <td className="px-2">{m.status === "bye" ? "Bye" : m.status === "played" ? (m.winner === m.a ? `${m.aName} won` : m.winner === m.b ? `${m.bName} won` : "Played") : "To play"}</td>
                        <td className="px-2 tabular-nums">{m.score ?? ""}</td>
                        <td className="px-2 whitespace-nowrap">{m.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>}
        </div>
      </TournamentInteractiveViewer>
      )}
    </div>
  );
}
