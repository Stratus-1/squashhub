import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import type { RRPoolView, RRRound } from "@/lib/tournaments/round-robin-view";

const ROUND_TONE = ["border-l-primary", "border-l-accent", "border-l-secondary", "border-l-muted-foreground"];
const ROUND_STATUS: Record<RRRound["status"], string> = { complete: "Complete", in_progress: "In progress", not_started: "Not started" };

/** Riverside pilot: read-only pool matrix + order of play for one round-robin pool. */
export function RoundRobinPilotView({ title, view }: { title: string; view: RRPoolView }) {
  const { players, matrix, totals, rounds } = view;
  return (
    <div className="space-y-2" data-testid="rr-pilot">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Pilot · read-only view</Badge>
        <span className="text-muted-foreground">Same saved matches as the standings table; order follows official standings. No results can be entered here.</span>
      </div>
      {view.issues.length > 0 && <p className="text-xs text-destructive">{view.issues.join(" ")}</p>}
      <TournamentInteractiveViewer title={`${title} — pool matrix & order of play`} inlineHeight={460} defaultFit="none">
        <div className="space-y-4 bg-background p-3 text-xs text-foreground">
          <table className="border-collapse" data-testid="rr-matrix">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1 text-left">#</th>
                <th className="border border-border px-2 py-1 text-left">Player</th>
                {players.map((p, i) => <th key={p.id} className="border border-border px-2 py-1 min-w-[64px]" title={p.name}>{i + 1}</th>)}
                <th className="border border-border px-2 py-1">W</th><th className="border border-border px-2 py-1">L</th><th className="border border-border px-2 py-1">Pts +/−</th><th className="border border-border px-2 py-1">Rank</th>
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
                      <td key={q.id} data-testid={`rr-cell-${p.id}-${q.id}`} className={cn("border border-border px-2 py-1 text-center tabular-nums", c?.result === "W" && "bg-primary/15 font-semibold", c?.result === "L" && "text-muted-foreground")}>
                        {!c ? "—" : c.result ? <>{c.result}<div className="text-[10px]">{c.score}</div></> : <span className="text-muted-foreground">R{c.round ?? "?"}</span>}
                      </td>
                    );
                  })}
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].wins}</td>
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].losses}</td>
                  <td className="border border-border px-2 text-center tabular-nums">{totals[p.id].pointsFor}/{totals[p.id].pointsAgainst}</td>
                  <td className="border border-border px-2 text-center tabular-nums font-semibold">{i + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2" data-testid="rr-order-of-play">
            <h4 className="font-semibold">Order of play</h4>
            {rounds.map((rd, ri) => (
              <div key={rd.label} className={cn("border border-border border-l-4", ROUND_TONE[ri % ROUND_TONE.length])}>
                <div className="flex items-center gap-2 bg-muted px-2 py-1 font-semibold">
                  <span>{rd.label}</span><Badge variant="outline" className="text-[10px]">{ROUND_STATUS[rd.status]}</Badge>
                  {rd.sittingOut.length > 0 && <span className="ml-auto text-[11px] font-normal text-muted-foreground">Sitting out: {rd.sittingOut.join(", ")}</span>}
                </div>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-muted-foreground"><th className="px-2">Pos</th><th className="px-2">Player</th><th className="px-2">v</th><th className="px-2">Pos</th><th className="px-2">Player</th><th className="px-2">Result</th><th className="px-2">Score</th><th className="px-2">Day / time · court</th></tr></thead>
                  <tbody>
                    {rd.matches.map((m) => (
                      <tr key={m.id} className="border-t border-border">
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
          </div>
        </div>
      </TournamentInteractiveViewer>
    </div>
  );
}
