/**
 * FormatLearnDialog — read-only, fictional learning preview for a structure
 * format. Opened from the ⓘ control next to each format palette card; it never
 * writes to the draft, the database, fixtures or notifications.
 */
import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LEARN_EXAMPLES, LEARN_FORMAT_LABEL, type LearnFormat, type LearnStanding } from "@/lib/smart-builder/format-learn";

/** Ladder-style standings — mirrors the Player Ladder page: position circle,
 *  initials avatar, name and win–loss record. Used for the Swiss preview so
 *  organisers see the ranking the way players will. */
function LadderStandings({ title, note, rows }: { title: string; note?: string; rows: LearnStanding[] }) {
  const initials = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold">{title}</div>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{initials(r.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold leading-tight">{r.name}</span>
              <span className="block text-[10px] text-muted-foreground">{r.won}W-{r.lost}L</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{r.points} pt{r.points === 1 ? "" : "s"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StandingsTable({ title, note, rows }: { title: string; note?: string; rows: LearnStanding[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold">{title}</div>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-2 py-1 font-medium">#</th>
              <th className="px-2 py-1 font-medium">Player</th>
              <th className="px-2 py-1 text-center font-medium">P</th>
              <th className="px-2 py-1 text-center font-medium">W</th>
              <th className="px-2 py-1 text-center font-medium">L</th>
              <th className="px-2 py-1 text-center font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1 font-medium">{r.name}</td>
                <td className="px-2 py-1 text-center">{r.played}</td>
                <td className="px-2 py-1 text-center">{r.won}</td>
                <td className="px-2 py-1 text-center">{r.lost}</td>
                <td className="px-2 py-1 text-center font-semibold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FormatLearnDialog({ format, open, onOpenChange }: { format: LearnFormat | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [roundKey, setRoundKey] = useState<string | null>(null);
  const ex = format ? LEARN_EXAMPLES[format] : null;
  const active = ex?.rounds.find((r) => r.key === roundKey) ?? ex?.rounds[0];
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setRoundKey(null); }}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,640px)] overflow-y-auto" data-testid="format-learn-dialog">
        {ex && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                {ex.title}
                <Badge variant="secondary" className="text-[10px]">Hypothetical example</Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">{ex.tagline}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-xs">
              <section>
                <h4 className="mb-1 font-semibold">When to use it</h4>
                <p className="text-muted-foreground">{ex.whenToUse}</p>
              </section>
              <section>
                <h4 className="mb-1 font-semibold">How it works</h4>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {ex.howItWorks.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </section>
              <section aria-label="Example rounds">
                <h4 className="mb-2 font-semibold">Fictional walkthrough</h4>
                <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Choose a round">
                  {ex.rounds.map((r) => (
                    <Button key={r.key} size="sm" variant={active?.key === r.key ? "default" : "outline"} className="h-7 px-2 text-[11px]" role="tab" aria-selected={active?.key === r.key} onClick={() => setRoundKey(r.key)}>
                      {r.label}
                    </Button>
                  ))}
                </div>
                {active && (
                  <div className="space-y-1 rounded-md border border-border p-2" role="tabpanel">
                    {active.note && <p className="text-[11px] text-muted-foreground">{active.note}</p>}
                    <ul className="divide-y divide-border/50">
                      {active.games.map((g, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 py-1">
                          <span className={g.winner === g.a ? "font-semibold" : ""}>{g.a}</span>
                          <span className="text-muted-foreground">{g.score}</span>
                          <span className={g.winner === g.b ? "font-semibold" : ""}>{g.b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              {ex.standings && (
                <section className="space-y-3" aria-label="Example standings">
                  {ex.standings.map((s) => <StandingsTable key={s.title} {...s} />)}
                </section>
              )}
              {ex.positions && (
                <section aria-label="Final positions">
                  <h4 className="mb-1 font-semibold">Final positions</h4>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          <th className="px-2 py-1 font-medium">Place</th>
                          <th className="px-2 py-1 font-medium">Player</th>
                          <th className="px-2 py-1 font-medium">Path (W = won, L = lost)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.positions.map((p) => (
                          <tr key={p.place} className="border-b border-border/50 last:border-0">
                            <td className="px-2 py-1 font-semibold">{p.place}</td>
                            <td className="px-2 py-1">{p.name}</td>
                            <td className="px-2 py-1 text-muted-foreground">{p.path}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <p className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground" role="note">{ex.engineNote}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small ⓘ trigger that never interferes with drag/click-to-add. */
export function FormatLearnButton({ format, onOpen }: { format: LearnFormat; onOpen: (f: LearnFormat) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      aria-label={`Learn about ${LEARN_FORMAT_LABEL[format]} with a fictional example`}
      onClick={(e) => { e.stopPropagation(); onOpen(format); }}
      onDragStart={(e) => e.stopPropagation()}
    >
      <Info className="h-3.5 w-3.5" />
    </Button>
  );
}
