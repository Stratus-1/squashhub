import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import { movement, SWISS_FORMAT_LABEL, type SwissProgressionModel } from "@/lib/tournaments/swiss-progression-view";

const STATE_LABEL = { completed: "Played", scheduled: "To play", awaiting_opponent: "Opponent to be decided", bye: "Bye" } as const;

/** Riverside pilot: read-only Swiss grid (default) or classic progression tables, in the shared viewer. */
export function SwissProgressionPilotView({ title, model }: { title: string; model: SwissProgressionModel }) {
  const [mode, setMode] = useState<"grid" | "classic">("grid");
  const roundNums = model.rounds.map((r) => r.round);
  const kind = model.format === "positional" ? "fixed-position" : "score-based";
  return (
    <div className="space-y-3" data-testid="swiss-progression-pilot">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Pilot · read-only view</Badge>
        <span className="text-muted-foreground">{SWISS_FORMAT_LABEL[model.format]}</span>
        <div className="ml-auto flex gap-1" role="group" aria-label="Swiss view">
          <Button size="sm" className="h-7" variant={mode === "grid" ? "default" : "outline"} aria-pressed={mode === "grid"} onClick={() => setMode("grid")}>Grid</Button>
          <Button size="sm" className="h-7" variant={mode === "classic" ? "default" : "outline"} aria-pressed={mode === "classic"} onClick={() => setMode("classic")}>Classic</Button>
        </div>
      </div>
      {mode === "grid" ? (
        <>
          {model.format !== "positional" && (
            <p className="text-[11px] text-muted-foreground">
              Shown in grid form only. Players in this category were paired by score, not moved into fixed slots — position numbers are the standings position going into each round.
            </p>
          )}
          <TournamentInteractiveViewer title={`${title} — Swiss grid (${kind})`} inlineHeight={420}>
            <SwissPositionGrid model={model} />
          </TournamentInteractiveViewer>
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
  );
}
