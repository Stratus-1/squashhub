import { buildSwissGrid, type SwissProgressionModel } from "@/lib/tournaments/swiss-progression-view";

/** Read-only, spreadsheet-like Swiss grid: rounds side by side, each match a 2-row block. */
export function SwissPositionGrid({ model }: { model: SwissProgressionModel }) {
  const rounds = buildSwissGrid(model);
  const slots = Math.max(1, model.rows.length);
  return (
    <div className="flex gap-3 bg-background p-2 text-xs text-foreground" data-testid="swiss-position-grid">
      {rounds.map((rd) => (
        <table key={rd.round} className="border-collapse min-w-[300px] self-start">
          <thead>
            <tr className="bg-muted text-left">
              <th colSpan={4} className="px-2 py-1 font-semibold">Round {rd.round}</th>
            </tr>
            <tr className="text-left text-muted-foreground">
              <th className="px-2 w-8">Pos</th><th className="px-2">Player</th><th className="px-2">Day &amp; time</th><th className="px-2">Result</th>
            </tr>
          </thead>
          {rd.created ? rd.blocks.map((b) => (
            <tbody key={b.matchId} className="border-t-4 border-foreground/70">
              {b.rows.map((r, i) => (
                <tr key={i} className={r.result === "W" ? "font-semibold" : r.result === "L" ? "text-muted-foreground" : ""}>
                  <td className="px-2 py-0.5 tabular-nums">{r.pos ?? "—"}</td>
                  <td className="px-2 whitespace-nowrap">{r.name}</td>
                  {i === 0 ? (
                    <td rowSpan={2} className="px-2 whitespace-nowrap align-middle text-muted-foreground">
                      {r.when ?? "TBD"}{b.court ? <div>{b.court}</div> : null}
                    </td>
                  ) : null}
                  <td className="px-2 whitespace-nowrap">{r.result}{i === 0 && b.score ? <span className="ml-1 text-muted-foreground">{b.score}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          )) : (
            <tbody className="border-t-4 border-foreground/70">
              {Array.from({ length: Math.ceil(slots / 2) }).flatMap((_, k) => [0, 1].map((i) => (
                <tr key={`${k}-${i}`} className={`text-muted-foreground ${i === 0 && k > 0 ? "border-t-4 border-foreground/70" : ""}`}>
                  <td className="px-2 py-0.5">—</td><td className="px-2">TBD</td><td className="px-2">TBD</td><td className="px-2" />
                </tr>
              )))}
            </tbody>
          )}
        </table>
      ))}
    </div>
  );
}
