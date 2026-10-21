import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
export function RoundRobinPilotView({ title, view, calendar, matrixOnly = false, showSlots = false, withCalendar = false, clean = false, group = 1, groupLabel }: { clean?: boolean; group?: number; groupLabel?: string; calendar?: ReactNode; title: string; view: RRPoolView; matrixOnly?: boolean; showSlots?: boolean; withCalendar?: boolean }) {
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
          {([["matrix", clean ? "Fixtures & standings" : "Matrix"], ["calendar", "Calendar View"]] as const).map(([k, label]) => (
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
      ) : clean && !matrixOnly ? <RoundRobinCleanView view={view} group={group} groupLabel={groupLabel ?? `Group ${group}`} /> : (
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

/** Riverside: clean fixtures-by-round (left) + live standings (right), same layout as the Swiss final-three round robin. */
export function RoundRobinCleanView({ view, group, groupLabel }: { view: RRPoolView; group: number; groupLabel: string }) {
  const track = useRef<HTMLDivElement>(null);
  const jump = (selector: string) => track.current?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  const { players, totals, rounds } = view;
  const tone = ((group - 1) % 6) + 1;
  const standings = [...players].sort((a, b) => (view.rank[a.id] ?? 99) - (view.rank[b.id] ?? 99));
  const pos = (id: string) => players.findIndex((p) => p.id === id) + 1;
  const anyPlayed = Object.values(totals).some((t) => t.played > 0);
  return (
    <div className="space-y-2 text-xs" data-testid="rr-clean">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => jump('[data-testid="rr-clean-standings"]')}>View Standings →</Button></div>
      <div ref={track} className="flex gap-3 overflow-x-auto pb-2" data-testid="rr-round-track">
      <section className="flex shrink-0 gap-3" data-testid="rr-clean-fixtures">
        {rounds.map((rd) => (
          <div key={rd.label} className="w-80 shrink-0 self-start overflow-hidden rounded-md border border-border" data-testid={`rr-clean-round-${rd.round ?? "x"}`}>
            <div className="flex flex-wrap items-center gap-2 bg-muted px-2 py-1 font-semibold">
              <span>{groupLabel} · {rd.label}</span><Badge variant="outline" className="text-[10px]">{ROUND_STATUS[rd.status]}</Badge>
              {rd.sittingOut.length > 0 && <span className="ml-auto text-[11px] font-normal text-muted-foreground">Bye: {rd.sittingOut.join(", ")}</span>}
            </div>
            {rd.matches.map((m) => (
              <div key={m.id} className="riverside-rr-band border-t border-border px-2 py-1" data-rr-group={tone}>
                <div className="flex items-center gap-2">
                  <span className="w-5 tabular-nums text-muted-foreground">{m.posA ?? ""}</span>
                  <span className={cn("flex-1 truncate", m.winner && m.winner === m.a && "font-semibold")}>{m.aName}</span>
                  <span className="max-w-32 whitespace-normal text-right tabular-nums">{m.status === "played" ? m.score ?? "" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 tabular-nums text-muted-foreground">{m.posB ?? ""}</span>
                  <span className={cn("flex-1 truncate", m.winner && m.winner === m.b && "font-semibold", m.status === "bye" && "text-muted-foreground")}>{m.bName}</span>
                  <span className="text-[11px] text-muted-foreground">{m.status === "bye" ? "Bye" : m.status === "played" ? "Played" : m.when}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
      <section className="w-max min-w-80 shrink-0 self-start space-y-2" data-testid="rr-clean-standings">
        <Button size="sm" variant="outline" onClick={() => jump('[data-testid="rr-clean-fixtures"]')}>← Back to Rounds</Button>
        <h4 className="font-semibold">Standings{view.complete ? " — final" : " — live"}</h4>
        <p className="text-muted-foreground">"Pos." is the fixed draw position and never moves; Rank updates with each result.</p>
        <div className="overflow-x-auto"><table className="w-full border-collapse">
          <thead><tr className="text-left text-muted-foreground"><th className="px-2">Rank</th><th className="px-2">Pos.</th><th className="px-2">Player</th><th className="px-2">P</th><th className="px-2">W</th><th className="px-2">L</th><th className="px-2">Games</th><th className="px-2">GD</th><th className="px-2">Pts F/A</th></tr></thead>
          <tbody>{standings.map((p) => { const t = totals[p.id]; return (
            <tr key={p.id} className="riverside-rr-band border-t border-border" data-rr-group={tone} data-testid={`rr-clean-row-${p.id}`}>
              <td className="px-2 py-1 font-semibold">{anyPlayed ? view.rank[p.id] ?? "—" : "—"}</td><td className="px-2 tabular-nums">{pos(p.id)}</td>
              <td className="px-2 whitespace-nowrap">{p.name}</td><td className="px-2">{t.played}</td><td className="px-2">{t.wins}</td><td className="px-2">{t.losses}</td>
              <td className="px-2">{t.gamesFor}–{t.gamesAgainst}</td><td className="px-2">{t.gamesFor - t.gamesAgainst}</td>
              <td className="px-2 whitespace-nowrap">{t.pointsKnown && t.played ? `${t.pointsFor}/${t.pointsAgainst}` : "—"}</td>
            </tr>); })}</tbody>
        </table></div>
      </section>
      </div>
    </div>
  );
}
