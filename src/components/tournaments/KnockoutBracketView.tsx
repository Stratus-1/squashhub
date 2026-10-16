import { cn } from "@/lib/utils";

export interface BracketMatch {
  id: string; round: number; slot: number | null; bracket: number | null;
  a: string | null; b: string | null; winner: string | null; score?: string | null;
  date?: string | null; time?: string | null; court?: string | null; thirdPlace?: boolean;
}

const roundName = (left: number) => (left === 1 ? "Final" : left === 2 ? "Semi-finals" : left === 4 ? "Quarterfinals" : `Last ${left * 2}`);

/** Classic knockout draw: seeds down the left, winners flow right round by round; future rounds shown as empty boxes. */
export function KnockoutBracketView({ title, matches, names, seedOf }: { title: string; matches: BracketMatch[]; names: Record<string, string>; seedOf: (id: string) => number | null }) {
  const brackets = [...new Set(matches.map((m) => m.bracket ?? 1))].sort((x, y) => x - y);
  return (
    <div className="space-y-4" data-testid="knockout-bracket">
      {brackets.map((b) => {
        const mine = matches.filter((m) => (m.bracket ?? 1) === b && !m.thirdPlace);
        const r1 = mine.filter((m) => m.round === Math.min(...mine.map((x) => x.round))).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0));
        const first = r1[0]?.round ?? 1;
        const rounds: Array<Array<BracketMatch | null>> = [];
        for (let n = r1.length, r = first; n >= 1; n = Math.floor(n / 2), r++) {
          const got = mine.filter((m) => m.round === r).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0));
          rounds.push(Array.from({ length: n }, (_, i) => got[i] ?? null));
          if (n === 1) break;
        }
        const label = brackets.length > 1 ? (b === 1 ? "Top half" : "Bottom half") : null;
        const unit = 64;
        const GAP = 32;
        const H = rounds[0].length * unit;
        // Match i in round column ci is centred at (i + 0.5) * 2^ci * unit, so each
        // box sits exactly between its two feeders and connectors are straight lines.
        const centerY = (ci: number, i: number) => (i + 0.5) * Math.pow(2, ci) * unit;
        return (
          <div key={b} className="rounded-md border border-border p-3">
            <div className="mb-2 text-sm font-semibold">{title}{label ? ` · ${label}` : ""}</div>
            <div className="flex" style={{ gap: GAP }}>
              {rounds.map((col, ci) => (
                <div key={ci} className="w-[220px] shrink-0">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{roundName(col.length)}</div>
                  <div className="relative" style={{ height: H }}>
                    {col.map((m, i) => {
                      const cy = centerY(ci, i);
                      return (
                        <div key={m?.id ?? `${ci}-${i}`} className="absolute left-0 right-0" style={{ top: cy, transform: "translateY(-50%)" }}>
                          {ci > 0 ? <>
                            <div aria-hidden className="absolute border-t-2 border-muted-foreground/40" style={{ left: -GAP / 2, top: "50%", width: GAP / 2 }} />
                            <div aria-hidden className="absolute border-l-2 border-muted-foreground/40" style={{ left: -GAP / 2, top: `calc(50% - ${Math.pow(2, ci - 2) * unit}px)`, height: Math.pow(2, ci - 1) * unit }} />
                          </> : null}
                          {ci < rounds.length - 1 ? <div aria-hidden className="absolute border-t-2 border-muted-foreground/40" style={{ left: "100%", top: "50%", width: GAP / 2 }} /> : null}
                          <Box m={m} names={names} seedOf={seedOf} showSeed={ci === 0} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(() => { const fin = rounds[rounds.length - 1]?.[0]; const champ = fin?.winner; const cy = centerY(rounds.length - 1, 0); return (
                <div className="w-[160px] shrink-0">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label ? `${label} winner` : "Winner"}</div>
                  <div className="relative" style={{ height: H }}>
                    <div className="absolute left-0 right-0" style={{ top: cy, transform: "translateY(-50%)" }}>
                      <div aria-hidden className="absolute border-t-2 border-muted-foreground/40" style={{ left: -GAP / 2, top: "50%", width: GAP / 2 }} />
                      <div className={cn("rounded border px-2 py-2 text-sm", champ ? "border-primary font-semibold" : "border-dashed border-border text-muted-foreground")}>{champ ? names[champ] ?? "—" : "To be decided"}</div>
                    </div>
                  </div>
                </div>); })()}
            </div>
            {mine.length === 0 ? null : matches.filter((m) => (m.bracket ?? 1) === b && m.thirdPlace).map((m) => (
              <div key={m.id} className="mt-3 max-w-[240px]"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">3rd / 4th place</div><Box m={m} names={names} seedOf={seedOf} showSeed={false} /></div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Box({ m, names, seedOf, showSeed }: { m: BracketMatch | null; names: Record<string, string>; seedOf: (id: string) => number | null; showSeed: boolean }) {
  const line = (id: string | null) => {
    const won = !!m?.winner && m.winner === id;
    const s = id && showSeed ? seedOf(id) : null;
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1 text-xs", won && "font-semibold text-primary", m?.winner && id && !won && "text-muted-foreground line-through")}>
        <span className="w-5 shrink-0 text-muted-foreground">{s ?? ""}</span>
        <span className="truncate">{id ? names[id] ?? "Unknown" : m ? "Bye" : "Winner of previous match"}</span>
      </div>
    );
  };
  return (
    <div className={cn("rounded border bg-card", m ? "border-border" : "border-dashed border-border")}>
      {line(m?.a ?? null)}
      <div className="border-t border-border" />
      {line(m?.b ?? null)}
      {m && (m.score || m.date) ? <div className="border-t border-border px-2 py-0.5 text-[10px] text-muted-foreground">{m.score ? m.score : `${m.date ?? ""} ${m.time?.slice(0, 5) ?? ""}${m.court ? ` · ${m.court}` : ""}`}</div> : null}
    </div>
  );
}
