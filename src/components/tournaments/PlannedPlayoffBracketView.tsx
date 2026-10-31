import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import type { PlannedPlayoffRow, PlannedSide } from "@/lib/tournaments/planned-playoff-bracket";

/**
 * Display-only connected bracket for planned play-offs (no writes).
 * Pool standings → QF → SF → Final, with coloured connector lines measured from the rendered layout.
 */
const POOL_TONES = [
  { chip: "bg-primary text-primary-foreground", ring: "border-primary/60", head: "bg-primary/15 text-primary", line: "hsl(var(--primary))" },
  { chip: "bg-warning text-background", ring: "border-warning/60", head: "bg-warning/15 text-warning", line: "hsl(var(--warning))" },
  { chip: "bg-success text-background", ring: "border-success/60", head: "bg-success/15 text-success", line: "hsl(var(--success))" },
  { chip: "bg-accent text-accent-foreground", ring: "border-accent", head: "bg-accent/30 text-accent-foreground", line: "hsl(var(--accent-foreground))" },
];
const toneOf = (pool: string | null) => (pool ? POOL_TONES[(pool.charCodeAt(0) - 65) % POOL_TONES.length] : null);
export const poolTone = (pool: string | null) => toneOf(pool)?.chip ?? "bg-muted text-muted-foreground";

export type PoolStanding = { pool: string; title: string; names: string[]; qualifiers: number };
const ord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function Side({ s, slot }: { s: PlannedSide; slot: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5" data-side={slot ?? undefined}>
      {s.rank != null && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", poolTone(s.pool))}>{s.pool ?? ""}{s.rank}</span>}
      <span className={cn("truncate", s.name ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.name ?? s.label}</span>
    </div>
  );
}

type Line = { d: string; color: string; dashed: boolean };

export function PlannedPlayoffBracketView({ rows, pools = [], confirmed = false, champion = null }: { rows: PlannedPlayoffRow[]; pools?: PoolStanding[]; confirmed?: boolean; champion?: string | null }) {
  const stages = [...new Set(rows.map((r) => r.stage))];
  const cols = stages.map((st) => rows.filter((r) => r.stage === st));
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      // Connector coordinates stay in unscaled content space, so they survive zooming.
      const k = el.offsetWidth ? base.width / el.offsetWidth : 1;
      const box = (n: Element) => { const r = n.getBoundingClientRect(); return { l: (r.left - base.left) / k, r: (r.right - base.left) / k, y: (r.top - base.top) / k + r.height / k / 2 }; };
      const curve = (x1: number, y1: number, x2: number, y2: number) => { const m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
      const out: Line[] = [];
      el.querySelectorAll<HTMLElement>("[data-side]").forEach((side) => {
        const slot = side.dataset.side;
        if (!slot) return;
        const src = el.querySelector(`[data-pool-slot="${slot}"]`);
        if (!src) return;
        const a = box(src), b = box(side);
        out.push({ d: curve(a.r, a.y, b.l, b.y), color: toneOf(slot[0])?.line ?? "hsl(var(--border))", dashed: !confirmed });
      });
      el.querySelectorAll<HTMLElement>("[data-feeds]").forEach((game) => {
        game.dataset.feeds?.split(",").forEach((id) => {
          const src = el.querySelector(`[data-game="${id}"]`);
          if (!src) return;
          const a = box(src), b = box(game);
          out.push({ d: curve(a.r, a.y, b.l, b.y), color: "hsl(var(--primary))", dashed: false });
        });
      });
      setLines(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, pools, confirmed, champion]);

  const feedsOf = (g: PlannedPlayoffRow) => g.sides.map((s) => s.label.match(/^Winner (\S+)$/)?.[1]).filter(Boolean).join(",");

  return (
    <TournamentInteractiveViewer title="Play-off bracket" inlineHeight={460} defaultFit="none" wheelZoom="direct">
    <div className="cursor-grab pb-1" data-testid="planned-playoff-bracket">
      <div ref={wrap} className="relative flex min-w-max gap-12 p-1">
        <svg className="pointer-events-none absolute left-0 top-0" width={size.w} height={size.h} aria-hidden>
          {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={2} strokeOpacity={0.85} strokeDasharray={l.dashed ? "5 4" : undefined} />)}
        </svg>
        {pools.length > 0 && (
          <div className="flex w-52 flex-col justify-around gap-3">
            <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pool standings</div>
            {pools.map((p) => {
              const t = toneOf(p.pool);
              return (
                <div key={p.pool} className={cn("overflow-hidden rounded-lg border-2 bg-card text-xs", t?.ring)} data-testid={`pool-standing-${p.pool}`}>
                  <div className={cn("px-2 py-1 text-[11px] font-bold uppercase tracking-wide", t?.head)}>{p.title}</div>
                  {p.names.map((n, i) => (
                    <div key={i} data-pool-slot={i < p.qualifiers ? `${p.pool}${i + 1}` : undefined} className={cn("flex items-center gap-1.5 border-t border-border px-2 py-1", i >= p.qualifiers && "opacity-50")}>
                      <span className={cn("w-9 shrink-0 rounded px-1 text-center text-[10px] font-bold", i < p.qualifiers ? t?.chip : "bg-muted text-muted-foreground")}>{ord(i + 1)}</span>
                      <span className="truncate font-medium">{n}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {cols.map((games, ci) => {
          const last = ci === cols.length - 1;
          return (
            <div key={stages[ci]} className="flex w-56 flex-col">
              <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stages[ci]}</div>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {games.map((g) => {
                  const slot = (s: PlannedSide) => (s.pool && s.rank != null ? `${s.pool}${s.rank}` : null);
                  return (
                    <div key={g.key} data-game={g.id} data-feeds={feedsOf(g) || undefined}
                      className={cn("overflow-hidden rounded-lg border bg-card text-xs shadow-sm", last ? "border-2 border-warning" : "border-border")}>
                      <div className={cn("flex items-center justify-between px-2 py-1 text-[10px]", last ? "bg-warning/15" : "bg-muted/60")}>
                        <span className={cn("font-bold", last ? "text-warning" : "text-foreground")}>{last ? "🏆 " : ""}{g.id}</span>
                        {g.when && <span className="text-muted-foreground">{g.when}</span>}
                      </div>
                      <Side s={g.sides[0]} slot={slot(g.sides[0])} />
                      <div className="border-t border-border" />
                      <Side s={g.sides[1]} slot={slot(g.sides[1])} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {cols.length > 0 && (
          <div className="flex w-52 flex-col">
            <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Winner</div>
            <div className="flex flex-1 flex-col justify-around gap-2">
              {cols[cols.length - 1].map((game, index) => {
                const winner = game.winner ?? (index === 0 ? champion : null);
                return <div key={game.key} data-feeds={game.id} data-testid={index === 0 ? "playoff-champion" : "playoff-plate-winner"}
                  className={cn("rounded-lg border-2 px-3 py-2 text-center text-sm", winner ? "border-warning bg-warning/15 font-bold text-warning" : "border-dashed border-border text-muted-foreground")}>
                  🏆 {winner ? <><span className="block text-[10px]">Winner {game.id}</span>{winner}</> : `Winner ${game.id}`}
                </div>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    </TournamentInteractiveViewer>
  );
}
