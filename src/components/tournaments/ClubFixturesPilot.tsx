import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { filterFixtures, fmtFixtureDay, groupByDay, type ClubFixture, type FixtureFilters } from "@/lib/tournaments/club-fixtures";

const STATE: Record<ClubFixture["state"], { label: string; v: string }> = {
  upcoming: { label: "Upcoming", v: "--round-1" }, live: { label: "LIVE", v: "--destructive" }, paused: { label: "Paused", v: "--warning" },
  completed: { label: "Completed", v: "--success" }, bye: { label: "Bye", v: "--muted-foreground" },
};

function StateChip({ s }: { s: ClubFixture["state"] }) {
  const { label, v } = STATE[s];
  return <span data-state={s} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-foreground", s === "live" && "animate-pulse")} style={{ backgroundColor: `hsl(var(${v}) / 0.18)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(${v}))` }} />{label}</span>;
}
function When({ f }: { f: ClubFixture }) {
  if (f.timing === "saved") return <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{fmtFixtureDay(f.date!)}{f.time ? ` ${f.time.slice(0, 5)}` : ""}{f.court ? ` · ${f.court}` : ""}</span>;
  if (f.timing === "play_by") return <span className="rounded border border-warning/60 bg-warning/10 px-1.5 py-0.5 font-medium text-foreground">Play by {fmtFixtureDay(f.playBy!)}</span>;
  return <span className="text-muted-foreground">Not scheduled</span>;
}
function Score({ f }: { f: ClubFixture }) {
  if (f.state === "live" || f.state === "paused") return <span className="tabular-nums font-semibold">{f.score ?? "0-0"}{f.liveGames ? <span className="ml-1 font-normal text-muted-foreground">({f.liveGames})</span> : null}</span>;
  return f.score ? <span className="tabular-nums">{f.score}</span> : null;
}

/** Riverside pilot: read-only club-wide fixtures, List | Calendar, with filters. */
export function ClubFixturesPilot({ fixtures, canMine }: { fixtures: ClubFixture[]; canMine: boolean }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [f, setF] = useState<FixtureFilters>({});
  const opts = useMemo(() => ({
    comps: [...new Map(fixtures.map((x) => [x.competitionId, x.competition]))],
    cats: [...new Set(fixtures.filter((x) => !f.competition || x.competitionId === f.competition).map((x) => x.category))].sort(),
    courts: [...new Set(fixtures.map((x) => x.court).filter(Boolean) as string[])].sort(),
    dates: [...new Set(fixtures.map((x) => x.date ?? x.playBy).filter(Boolean) as string[])].sort(),
  }), [fixtures, f.competition]);
  const shown = filterFixtures(fixtures, f);
  const days = groupByDay(shown);
  const sel = (key: keyof FixtureFilters, label: string, items: Array<[string, string]>) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{label}
      <select aria-label={label} className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground" value={(f[key] as string) ?? ""} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value || undefined, ...(key === "competition" ? { category: undefined } : {}) }))}>
        <option value="">All</option>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-3" data-testid="club-fixtures-pilot">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <h3 className="text-sm font-semibold">All club fixtures</h3>
        <Badge variant="outline">Pilot · read-only</Badge>
        <span className="text-muted-foreground">Live scores come from the existing scoring; nothing can be moved or scored here.</span>
      </div>
      <div role="tablist" aria-label="Fixtures view" className="grid grid-cols-2 border border-border sm:max-w-xs">
        {(["list", "calendar"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => setView(k)} className={cn("py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{k === "list" ? "List View" : "Calendar View"}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {sel("competition", "Tournament / league", opts.comps)}
        {sel("category", "Category", opts.cats.map((c) => [c, c]))}
        {sel("court", "Court", opts.courts.map((c) => [c, c]))}
        {sel("date", "Date", opts.dates.map((d) => [d, fmtFixtureDay(d)]))}
        {canMine && <label className="flex items-end gap-1.5 pb-1.5 text-xs"><input type="checkbox" checked={!!f.mine} onChange={(e) => setF((p) => ({ ...p, mine: e.target.checked || undefined }))} /> My matches</label>}
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid="club-fixtures-count">{shown.length} of {fixtures.length} fixtures</p>
      {view === "list" ? (
        <ul className="divide-y divide-border rounded border border-border text-xs" data-testid="club-fixtures-list">
          {shown.slice(0, 300).map((x) => (
            <li key={x.id} data-state={x.state} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2", x.state === "live" && "bg-destructive/5")}>
              <StateChip s={x.state} />
              <span className="font-medium">{x.a} <span className="text-muted-foreground">v</span> {x.b}</span>
              <Score f={x} />
              <span className="text-muted-foreground">{x.competition} · {x.category}{x.round ? ` · R${x.round}` : ""}</span>
              <span className="ml-auto"><When f={x} /></span>
            </li>
          ))}
          {!shown.length && <li className="px-2.5 py-3 text-muted-foreground">No fixtures match these filters.</li>}
        </ul>
      ) : (
        <TournamentInteractiveViewer title="Club fixtures — calendar" inlineHeight={460} defaultFit="none">
          <div className="space-y-3 bg-background p-3 text-xs text-foreground" data-testid="club-fixtures-calendar">
            {days.map(({ day, items }) => (
              <section key={day} className="rounded-md border border-border">
                <h4 className="bg-muted px-2.5 py-1.5 font-semibold">{day === "Not scheduled" ? day : fmtFixtureDay(day)}</h4>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-[11px] text-muted-foreground"><th className="px-2 py-1">Time</th><th className="px-2">Court</th><th className="px-2">Match</th><th className="px-2">Competition</th><th className="px-2">Status</th><th className="px-2">Type</th></tr></thead>
                  <tbody>{items.map((x) => (
                    <tr key={x.id} data-timing={x.timing} className="border-t border-border">
                      <td className="px-2 py-1 tabular-nums font-medium">{x.time?.slice(0, 5) ?? "—"}</td>
                      <td className="px-2">{x.court ?? "—"}</td>
                      <td className="px-2 whitespace-nowrap">{x.a} v {x.b} <Score f={x} /></td>
                      <td className="px-2 whitespace-nowrap text-muted-foreground">{x.competition} · {x.category}{x.round ? ` · R${x.round}` : ""}</td>
                      <td className="px-2"><StateChip s={x.state} /></td>
                      <td className="px-2">{x.timing === "saved" ? <span className="rounded bg-success/15 px-1.5 py-0.5">Saved fixture</span> : x.timing === "play_by" ? <span className="rounded border border-warning/60 bg-warning/10 px-1.5 py-0.5">Play-by deadline</span> : <span className="text-muted-foreground">Not scheduled</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </section>
            ))}
            {!days.length && <p className="text-muted-foreground">No fixtures match these filters.</p>}
          </div>
        </TournamentInteractiveViewer>
      )}
    </section>
  );
}
