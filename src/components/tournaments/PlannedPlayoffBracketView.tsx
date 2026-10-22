import { cn } from "@/lib/utils";
import type { PlannedPlayoffRow, PlannedSide } from "@/lib/tournaments/planned-playoff-bracket";

/** Display-only connected bracket for planned play-offs (no writes). Columns QF → SF → Final with connector lines. */
const POOL_TONE = ["bg-primary text-primary-foreground", "bg-accent text-accent-foreground", "bg-secondary text-secondary-foreground", "bg-muted text-foreground"];
export const poolTone = (pool: string | null) => (pool ? POOL_TONE[(pool.charCodeAt(0) - 65) % POOL_TONE.length] : "bg-muted text-muted-foreground");

function Side({ s }: { s: PlannedSide }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-2 py-1">
      {s.rank != null && <span className={cn("shrink-0 rounded px-1 text-[10px] font-bold", poolTone(s.pool))}>{s.pool ?? ""}{s.rank}</span>}
      <span className={cn("truncate", s.name ? "font-medium" : "text-muted-foreground")}>{s.name ?? s.label}</span>
    </div>
  );
}

export function PlannedPlayoffBracketView({ rows }: { rows: PlannedPlayoffRow[] }) {
  const stages = [...new Set(rows.map((r) => r.stage))];
  const cols = stages.map((st) => rows.filter((r) => r.stage === st));
  return (
    <div className="overflow-x-auto pb-1" data-testid="planned-playoff-bracket">
      <div className="flex min-w-max gap-6">
        {cols.map((games, ci) => {
          const last = ci === cols.length - 1;
          const pairs = games.length > 1 ? Array.from({ length: Math.ceil(games.length / 2) }, (_, k) => games.slice(2 * k, 2 * k + 2)) : [games];
          return (
            <div key={stages[ci]} className="flex w-52 flex-col">
              <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stages[ci]}</div>
              <div className="flex flex-1 flex-col">
                {pairs.map((pair, pi) => (
                  <div key={pi} className="relative flex flex-1 flex-col">
                    {pair.map((g) => (
                      <div key={g.key} className="relative flex flex-1 items-center py-1.5">
                        {ci > 0 && <span className="absolute -left-3 top-1/2 w-3 border-t border-border" />}
                        <div className={cn("w-full overflow-hidden rounded-md border bg-card text-xs", last ? "border-primary" : "border-border")}>
                          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{g.id}</span>{g.when && <span>{g.when}</span>}
                          </div>
                          <Side s={g.sides[0]} />
                          <div className="border-t border-border" />
                          <Side s={g.sides[1]} />
                        </div>
                        {!last && <span className="absolute -right-3 top-1/2 w-3 border-t border-border" />}
                      </div>
                    ))}
                    {!last && pair.length === 2 && <span className="absolute -right-3 top-1/4 bottom-1/4 border-r border-border" />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
