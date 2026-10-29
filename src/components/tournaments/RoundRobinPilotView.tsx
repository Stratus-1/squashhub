import { Fragment, useRef, useState, type ReactNode } from "react";
import { type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { FixtureCalendar } from "@/components/tournaments/FixtureCalendar";
import { useIsMobile } from "@/hooks/use-mobile";
import { WhenTag } from "@/components/tournaments/SwissPositionGrid";
import type { RRPoolView, RRRound } from "@/lib/tournaments/round-robin-view";
import { allocationAfterDeadline } from "@/lib/tournaments/uitsig-ladies-b-round-labels";

/** Display bands only: caller supplies existing official order, independently per pool. */
export function poolRankTone(index: number, count: number) {
  return count <= 1 ? 2 : Math.round(index * 4 / (count - 1));
}
const ROUND_STATUS: Record<RRRound["status"], string> = { complete: "Complete", in_progress: "In progress", not_started: "Not started" };
/** Status accent colours, same palette as the Swiss round panels. */
const ROUND_STATUS_VAR: Record<RRRound["status"], string> = { complete: "--success", in_progress: "--warning", not_started: "--round-1" };

/** Standard read-only fixtures, results and standings for one round-robin pool. */
export function RoundRobinPilotView({ title, view, calendar, matrixOnly = false, showSlots = false, withCalendar = false, clean = true, group = 1, groupLabel }: { clean?: boolean; group?: number; groupLabel?: string; calendar?: ReactNode; title: string; view: RRPoolView; matrixOnly?: boolean; showSlots?: boolean; withCalendar?: boolean }) {
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
      {!matrixOnly && !clean && <div className="flex flex-wrap items-center gap-2 text-xs">
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

/** Clean fixtures-by-round and live standings, shared by all clubs. */
/** Clean fixtures-by-round and live standings, shared by all clubs. Zoom (wheel, pinch or buttons) and drag to navigate; saved games are never touched. */
export function RoundRobinCleanView({ view, group, groupLabel }: { view: RRPoolView; group: number; groupLabel: string }) {
  const isMobile = useIsMobile();
  const track = useRef<HTMLDivElement>(null);
  const api = useRef<ReactZoomPanPinchContentRef | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const { players, totals, rounds, pointsScoring } = view;
  const tone = ((group - 1) % 6) + 1;
  const standings = [...players].sort((a, b) => (view.rank[a.id] ?? 99) - (view.rank[b.id] ?? 99));
  const pos = (id: string) => players.findIndex((p) => p.id === id) + 1;
  const anyPlayed = Object.values(totals).some((t) => t.played > 0);
  /** Pan the shared viewer until the target section is inside the frame. Navigation only. */
  const jump = (selector: string) => {
    const el = track.current?.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    const a = api.current, f = frame.current;
    if (!a || !f) { el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }); return; }
    const r = el.getBoundingClientRect(), w = f.getBoundingClientRect();
    const { positionX: x, positionY: y, scale: s } = a.state;
    const dx = r.left - w.left, dy = r.top - w.top;
    a.setTransform(dx < 8 || r.right > w.right - 8 ? x - (dx - 8) : x, dy < 8 || r.bottom > w.bottom - 8 ? y - (dy - 8) : y, s, 200);
  };
  return (
    <div className="space-y-2 text-xs" data-testid="rr-clean">
      <section className="space-y-2 overflow-x-auto rounded-md border border-border p-2" data-testid="rr-clean-standings">
        <h4 className="font-semibold">Standings{view.complete ? " — final" : " — live"}</h4>
        <p className="text-muted-foreground">"Pos." is the fixed draw position and never moves; Rank updates with each result.</p>
        <div className="overflow-x-auto"><table className="w-full border-collapse">
          <thead><tr className="text-left text-muted-foreground"><th className="px-2">Rank</th><th className="px-2">Pos.</th><th className="px-2">Player</th><th className="px-2">P</th>{pointsScoring ? <><th className="px-2">Total points</th><th className="px-2">Points against</th></> : <><th className="px-2">W</th><th className="px-2">L</th><th className="px-2">Games</th><th className="px-2">GD</th><th className="px-2">Pts F/A</th></>}</tr></thead>
          <tbody>{standings.map((p) => { const t = totals[p.id]; return (
            <tr key={p.id} className="riverside-rr-band border-t border-border" data-rr-group={tone} data-testid={`rr-clean-row-${p.id}`}>
              <td className="px-2 py-1 font-semibold">{anyPlayed ? view.rank[p.id] ?? "—" : "—"}</td><td className="px-2 tabular-nums">{pos(p.id)}</td>
              <td className="px-2 whitespace-nowrap">{p.name}</td><td className="px-2">{t.played}</td>{pointsScoring ? <><td className="px-2 font-semibold">{t.played ? t.pointsFor : "—"}</td><td className="px-2">{t.played ? t.pointsAgainst : "—"}</td></> : <><td className="px-2">{t.wins}</td><td className="px-2">{t.losses}</td>
              <td className="px-2">{t.gamesFor}–{t.gamesAgainst}</td><td className="px-2">{t.gamesFor - t.gamesAgainst}</td>
              <td className="px-2 whitespace-nowrap">{t.pointsKnown && t.played ? `${t.pointsFor}/${t.pointsAgainst}` : "—"}</td></>}
            </tr>); })}</tbody>
        </table></div>
      </section>
      <TournamentInteractiveViewer title={`${groupLabel} — fixtures & standings`} inlineHeight={isMobile ? 150 : 520} compactMobileToolbar defaultFit="none" wheelZoom="direct" apiRef={api} frameRef={frame}>
      <div ref={track} className="flex gap-3 cursor-grab" data-testid="rr-round-track">
      <section className="flex shrink-0 gap-3" data-testid="rr-clean-fixtures">
        {rounds.map((rd) => (
          <table key={rd.label} data-round-tone={((rd.round ?? 1) - 1) % 5 + 1} data-testid={`rr-clean-round-${rd.round ?? "x"}`} className="round-panel w-80 shrink-0 self-start border-collapse overflow-hidden rounded-md border border-border">
            <thead>
              <tr className="round-header bg-muted text-left">
                <th colSpan={4} className="border-t-4 px-2.5 py-1.5 font-semibold" style={{ borderTopColor: `hsl(var(--round-${((rd.round ?? 1) - 1) % 5 + 1}))` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{groupLabel} · {rd.label}</span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `hsl(var(${ROUND_STATUS_VAR[rd.status]}) / 0.15)`, color: "hsl(var(--foreground))" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(${ROUND_STATUS_VAR[rd.status]}))` }} />{ROUND_STATUS[rd.status]}
                    </span>
                  </div>
                  {rd.sittingOut.length > 0 && <div className="text-[11px] font-normal text-muted-foreground">Bye: {rd.sittingOut.join(", ")}</div>}
                </th>
              </tr>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="w-8 px-2 py-1">Pos</th><th className="px-2">Player</th><th className="px-2 whitespace-nowrap">Day &amp; time · court</th><th className="px-2">Result</th>
              </tr>
            </thead>
            {rd.matches.map((m) => {
              const done = m.status === "played" || m.status === "bye";
              const sv = done ? "--success" : "--round-1";
              return (
              <tbody key={m.id} className="border-t-[3px] border-foreground/60" style={{ boxShadow: `inset 3px 0 0 hsl(var(${sv}) / 0.8)` }}>
                {([0, 1] as const).map((i) => {
                  const isA = i === 0;
                  const won = m.status === "played" && !!m.winner && m.winner === (isA ? m.a : m.b);
                  const lost = m.status === "played" && !!m.winner && !won;
                  return (
                  <tr key={i} className={cn("riverside-rr-band", won && "bg-success/10 font-semibold", lost && "text-muted-foreground", m.status === "bye" && !isA && "text-muted-foreground")} data-rr-group={tone}>
                    <td className="px-2 py-1 tabular-nums">{(isA ? m.posA : m.posB) ?? ""}</td>
                    <td className="px-2 whitespace-nowrap">{isA ? m.aName : m.bName}</td>
                    {i === 0 ? (
                      <td rowSpan={2} className="px-2 py-1 align-middle whitespace-nowrap">
                        <WhenTag text={m.status === "bye" ? "Bye" : m.when || "To play"} />
                      </td>
                    ) : null}
                    <td className="px-2 whitespace-nowrap">{m.status === "played" ? (won ? "W" : lost ? "L" : "") : ""}{i === 0 && m.status === "played" && m.score ? <span className="ml-1 tabular-nums text-muted-foreground">{m.score}</span> : null}</td>
                  </tr>
                ); })}
              </tbody>
            ); })}
          </table>
        ))}
      </section>
      </div>
      </TournamentInteractiveViewer>
    </div>
  );
}

/** One shared match block (2 rows) in the Swiss table format; display only. */
function RrMatchRows({ m, tone }: { m: RRRound["matches"][number]; tone: number }) {
  const done = m.status === "played" || m.status === "bye";
  const sv = done ? "--success" : "--round-1";
  return (
    <tbody className="border-t-[3px] border-foreground/60" style={{ boxShadow: `inset 3px 0 0 hsl(var(${sv}) / 0.8)` }}>
      {([0, 1] as const).map((i) => {
        const isA = i === 0;
        const won = m.status === "played" && !!m.winner && m.winner === (isA ? m.a : m.b);
        const lost = m.status === "played" && !!m.winner && !won;
        return (
        <tr key={i} className={cn("riverside-rr-band", won && "bg-success/10 font-semibold", lost && "text-muted-foreground", m.status === "bye" && !isA && "text-muted-foreground")} data-rr-group={tone}>
          <td className="px-2 py-1 tabular-nums">{(isA ? m.posA : m.posB) ?? ""}</td>
          <td className="px-2 whitespace-nowrap">{isA ? m.aName : m.bName}</td>
          {i === 0 ? (
            <td rowSpan={2} className="px-2 py-1 align-middle whitespace-nowrap">
              <WhenTag text={m.status === "bye" ? "Bye" : m.when || "To play"} />
              {allocationAfterDeadline(m.date, m.playBy, m.status === "played") && <span className="block text-xs text-destructive">After play-by deadline</span>}
            </td>
          ) : null}
          <td className="px-2 whitespace-nowrap">{m.status === "played" ? (won ? "W" : lost ? "L" : "") : ""}{i === 0 && m.status === "played" && m.score ? <span className="ml-1 tabular-nums text-muted-foreground">{m.score}</span> : null}</td>
        </tr>
      ); })}
    </tbody>
  );
}

/** All pools of one category in shared round tables, colour-banded per pool. Display only. */
export function RoundRobinCombinedCleanView({ pools }: { pools: { view: RRPoolView; group: number; groupLabel: string }[] }) {
  const isMobile = useIsMobile();
  const track = useRef<HTMLDivElement>(null);
  const api = useRef<ReactZoomPanPinchContentRef | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const roundLabels: string[] = [];
  const roundNums: (number | null)[] = [];
  for (const p of pools) for (const rd of p.view.rounds) if (!roundLabels.includes(rd.label)) { roundLabels.push(rd.label); roundNums.push(rd.round ?? null); }
  const statusFor = (label: string): RRRound["status"] => {
    const sts = pools.map((p) => p.view.rounds.find((r) => r.label === label)?.status).filter((s): s is RRRound["status"] => !!s);
    if (sts.length && sts.every((s) => s === "complete")) return "complete";
    return sts.some((s) => s !== "not_started") ? "in_progress" : "not_started";
  };
  /** Pan the shared viewer until the target section is inside the frame. Navigation only. */
  const jump = (selector: string) => {
    const el = track.current?.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    const a = api.current, f = frame.current;
    if (!a || !f) { el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }); return; }
    const r = el.getBoundingClientRect(), w = f.getBoundingClientRect();
    const { positionX: x, positionY: y, scale: s } = a.state;
    const dx = r.left - w.left, dy = r.top - w.top;
    a.setTransform(dx < 8 || r.right > w.right - 8 ? x - (dx - 8) : x, dy < 8 || r.bottom > w.bottom - 8 ? y - (dy - 8) : y, s, 200);
  };
  const allComplete = pools.every((p) => p.view.complete);
  const pointsScoring = pools.every((p) => p.view.pointsScoring);
  return (
    <div className="space-y-2 text-xs" data-testid="rr-clean">
      <section className="space-y-2 overflow-x-auto rounded-md border border-border p-2" data-testid="rr-clean-standings">
        <h4 className="font-semibold">Standings{allComplete ? " — final" : " — live"}</h4>
        <p className="text-muted-foreground">"Pos." is the fixed draw position and never moves; Rank updates with each result, within each pool.</p>
        <div className="overflow-x-auto"><table className="w-full border-collapse">
          <thead><tr className="text-left text-muted-foreground"><th className="px-2">Pool</th><th className="px-2">Rank</th><th className="px-2">Pos.</th><th className="px-2">Player</th><th className="px-2">P</th>{pointsScoring ? <><th className="px-2">Total points</th><th className="px-2">Points against</th></> : <><th className="px-2">W</th><th className="px-2">L</th><th className="px-2">Games</th><th className="px-2">GD</th><th className="px-2">Pts F/A</th></>}</tr></thead>
          {pools.map((p) => {
            const tone = ((p.group - 1) % 6) + 1;
            const anyPlayed = Object.values(p.view.totals).some((t) => t.played > 0);
            // Before a pool's first result, rank follows the draw (seeded) position so every pool shows 1, 2, 3…
            const standings = anyPlayed ? [...p.view.players].sort((a, b) => (p.view.rank[a.id] ?? 99) - (p.view.rank[b.id] ?? 99)) : [...p.view.players];
            const pos = (id: string) => p.view.players.findIndex((pl) => pl.id === id) + 1;
            return (
            <tbody key={p.group}>
              {standings.map((pl, ri) => { const t = p.view.totals[pl.id]; return (
                <tr key={pl.id} className="riverside-rr-band border-t border-border" data-rr-group={tone} data-testid={`rr-clean-row-${pl.id}`}>
                  {ri === 0 ? <td rowSpan={standings.length} className="px-2 py-1 font-semibold">{p.groupLabel}</td> : null}
                  <td className="px-2 py-1 font-semibold">{anyPlayed ? p.view.rank[pl.id] ?? "—" : ri + 1}</td><td className="px-2 tabular-nums">{pos(pl.id)}</td>
                  <td className="px-2 whitespace-nowrap">{pl.name}</td><td className="px-2">{t.played}</td>{pointsScoring ? <><td className="px-2 font-semibold">{t.played ? t.pointsFor : "—"}</td><td className="px-2">{t.played ? t.pointsAgainst : "—"}</td></> : <><td className="px-2">{t.wins}</td><td className="px-2">{t.losses}</td>
                  <td className="px-2">{t.gamesFor}–{t.gamesAgainst}</td><td className="px-2">{t.gamesFor - t.gamesAgainst}</td>
                  <td className="px-2 whitespace-nowrap">{t.pointsKnown && t.played ? `${t.pointsFor}/${t.pointsAgainst}` : "—"}</td></>}
                </tr>); })}
            </tbody>
          ); })}
        </table></div>
      </section>
      <TournamentInteractiveViewer title="Pools — fixtures & standings" inlineHeight={isMobile ? 440 : 520} compactMobileToolbar defaultFit={isMobile ? "width" : "none"} wheelZoom="direct" apiRef={api} frameRef={frame}>
      <div ref={track} className="flex gap-3 cursor-grab" data-testid="rr-round-track">
      <section className="flex shrink-0 gap-3" data-testid="rr-clean-fixtures">
        {roundLabels.map((label, li) => {
          const rs = statusFor(label);
          return (
          <table key={label} data-round-tone={(li % 5) + 1} data-testid={`rr-clean-round-${roundNums[li] ?? "x"}`} className="round-panel w-80 shrink-0 self-start border-collapse overflow-hidden rounded-md border border-border">
            <thead>
              <tr className="round-header bg-muted text-left">
                <th colSpan={4} className="border-t-4 px-2.5 py-1.5 font-semibold" style={{ borderTopColor: `hsl(var(--round-${(li % 5) + 1}))` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{label}</span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `hsl(var(${ROUND_STATUS_VAR[rs]}) / 0.15)`, color: "hsl(var(--foreground))" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(${ROUND_STATUS_VAR[rs]}))` }} />{ROUND_STATUS[rs]}
                    </span>
                  </div>
                </th>
              </tr>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="w-8 px-2 py-1">Pos</th><th className="px-2">Player</th><th className="px-2 whitespace-nowrap">Day &amp; time · court</th><th className="px-2">Result</th>
              </tr>
            </thead>
            {pools.map((p) => {
              const rd = p.view.rounds.find((r) => r.label === label);
              if (!rd) return null;
              const tone = ((p.group - 1) % 6) + 1;
              return (
              <Fragment key={p.group}>
                <tbody className="border-t-[3px] border-foreground/60">
                  <tr className="riverside-rr-band" data-rr-group={tone}>
                    <td colSpan={4} className="px-2 py-1 font-semibold">{p.groupLabel}{rd.sittingOut.length > 0 ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">Bye: {rd.sittingOut.join(", ")}</span> : null}</td>
                  </tr>
                </tbody>
                {rd.matches.map((m) => <RrMatchRows key={m.id} m={m} tone={tone} />)}
              </Fragment>
            ); })}
          </table>
        ); })}
      </section>
      </div>
      </TournamentInteractiveViewer>
    </div>
  );
}

/** Pools of one category in one tabbed view: combined fixtures & standings, or the shared calendar. Display only. */
export function RoundRobinCombinedPilotView({ title, pools, calendar }: { title: string; pools: { view: RRPoolView; group: number; groupLabel: string }[]; calendar?: ReactNode }) {
  const [mode, setMode] = useState<"matrix" | "calendar">("matrix");
  const calEvents = pools.flatMap((p) => p.view.rounds.flatMap((rd) => rd.matches.filter((m) => m.status !== "bye" && (m.date || m.playBy)).map((m) => ({
    id: m.id, date: (m.date ?? m.playBy)!, time: m.date ? m.time ?? null : null, court: m.court ?? null,
    title: `${m.aName} v ${m.bName}`, subtitle: `${p.groupLabel} · R${rd.round ?? "?"}`,
    kind: (m.date ? "confirmed" : "play_by") as "confirmed" | "play_by",
    state: (m.status === "played" ? "completed" : "upcoming") as "completed" | "upcoming",
  }))));
  const issues = pools.flatMap((p) => p.view.issues);
  return (
    <div className="space-y-2" data-testid="rr-pilot" data-title={title}>
      {issues.length > 0 && <p className="text-xs text-destructive">{issues.join(" ")}</p>}
      <div role="tablist" aria-label="Round robin view" className="grid grid-cols-2 border border-border">
        {([["matrix", "Fixtures & standings"], ["calendar", "Calendar View"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={cn("px-3 py-1.5 text-xs font-medium", mode === k ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted")}>{label}</button>
        ))}
      </div>
      {mode === "calendar" ? (
        calendar ?? <div className="space-y-2 text-xs" data-testid="rr-calendar">
          <p className="text-muted-foreground">Read-only calendar for these pools. Solid blocks are saved fixtures; play-by rounds show their deadline day.</p>
          <FixtureCalendar events={calEvents} />
        </div>
      ) : <RoundRobinCombinedCleanView pools={pools} />}
    </div>
  );
}
