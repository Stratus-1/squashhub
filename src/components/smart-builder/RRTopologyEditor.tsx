import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rrEdges, rrIssues, rrMatchCount, rrSizes, type RRTopology } from "@/lib/smart-builder/rr-topology";
import type { StagePlanItem } from "@/lib/smart-builder/stage-plan";

const group = (i: number) => `Pool ${String.fromCharCode(65 + i)}`;
export function RRTopologyEditor({ stage, entrants, label, onChange }: { stage: StagePlanItem; entrants: number; label: string; onChange: (patch: Partial<StagePlanItem>) => void }) {
  const count = stage.pools ?? 1, t = stage.rrTopology ?? { mode: "within" as const };
  const sizes = rrSizes(entrants, count, t), edges = rrEdges(count, t), issues = rrIssues(entrants, count, t);
  const options: { mode: RRTopology["mode"]; name: string; description: string }[] = [
    { mode: "within", name: "Within each pool/group", description: "Everyone plays every other entrant in their own pool only." },
    { mode: "between", name: "Between selected pools/groups", description: "Everyone in A plays everyone in selected other pools. No own-pool games." },
    { mode: "custom", name: "Custom group matchup matrix", description: "Choose exact group meetings, including optional within-pool games." },
  ];
  const candidateFor = (mode: RRTopology["mode"]): RRTopology => ({ ...t, mode, edges: mode === "within" ? t.edges : t.edges ? (mode === "between" ? t.edges.filter(([a, b]) => a !== b) : t.edges) : mode === "between" ? Array.from({ length: count }, (_, a) => Array.from({ length: count - a - 1 }, (_, d) => [a, a + d + 1] as [number, number])).flat() : rrEdges(count) });
  const choose = (mode: RRTopology["mode"]) => onChange({ rrTopology: candidateFor(mode) });
  return <section className="basis-full w-[min(850px,calc(100vw-100px))] space-y-2 border-t border-border py-2" aria-label={`${label} Who plays whom?`}>
    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Who plays whom?</span><label className="flex items-center gap-1 text-xs">Pools/groups <Input aria-label={`${label} group count`} className="h-7 w-16 text-xs" type="number" min={1} max={26} value={count} onChange={(e) => onChange({ pools: Math.max(1, Math.min(26, Number(e.target.value) || 1)) })} /></label></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} pairing options`}>{options.map((o) => {
      const candidate = candidateFor(o.mode);
      return <Button key={o.mode} size="sm" className="h-auto min-h-8 max-w-full whitespace-normal py-1 text-left" variant={t.mode === o.mode ? "default" : "outline"} aria-pressed={t.mode === o.mode} disabled={count === 1 && o.mode !== "within" && t.mode !== o.mode} onClick={() => choose(o.mode)}>{o.name} · {rrMatchCount(sizes, candidate)} matches</Button>;
    })}</div>
    <p className="text-xs text-muted-foreground">{options.find((o) => o.mode === t.mode)?.description} Each meeting counts once; A v B is the same as B v A.</p>
    <div className="flex flex-wrap gap-2">{sizes.map((size, i) => <label key={i} className="flex items-center gap-1 text-xs">{group(i)}<Input className="h-7 w-16 text-xs" aria-label={`${label} ${group(i)} entries`} type="number" min={1} value={size} onChange={(e) => onChange({ rrTopology: { ...t, sizes: sizes.map((s, j) => i === j ? Number(e.target.value) : s) } })} /></label>)}<Button size="sm" variant="ghost" onClick={() => onChange({ rrTopology: { ...t, sizes: undefined } })}>Use balanced sizes</Button></div>
    {t.mode !== "within" && <div className="flex flex-wrap gap-x-4 gap-y-2" aria-label={`${label} matchup matrix`}>{Array.from({ length: count }, (_, a) => Array.from({ length: count - a }, (_, d) => [a, a + d] as [number, number])).flat().filter(([a, b]) => t.mode === "custom" || a !== b).map(([a, b]) => <label key={`${a}:${b}`} className="flex items-center gap-1 text-xs"><input type="checkbox" aria-label={`${label} ${group(a)} vs ${group(b)}`} checked={edges.some(([x, y]) => x === a && y === b)} onChange={(e) => onChange({ rrTopology: { ...t, edges: e.target.checked ? [...edges, [a, b]] : edges.filter(([x, y]) => x !== a || y !== b) } })} />{a === b ? `Within ${group(a)}` : `${group(a)} v ${group(b)}`} · {a === b ? sizeMatches(sizes[a]) : sizes[a] * sizes[b]}</label>)}</div>}
    <p className="text-xs" role="status">{issues.length ? "Match count awaits valid group sizes and matchups." : `${rrMatchCount(sizes, t)} matches · ${sizes.join(" / ")} entrants. Example: ${edges[0] ? (edges[0][0] === edges[0][1] ? `${group(edges[0][0])}: ${sizes[edges[0][0]]} × ${sizes[edges[0][0]] - 1} ÷ 2` : `${group(edges[0][0])} v ${group(edges[0][1])}: ${sizes[edges[0][0]]} × ${sizes[edges[0][1]]}`) : "no meetings selected"}.`}</p>
    {issues.map((x) => <p key={x} className="text-xs text-destructive">{x}</p>)}
    {t.mode !== "within" && <p className="text-xs text-muted-foreground">Cross-group play needs a mapped draw and an agreed standings/qualification review before application. This saved plan does not change pool assignments, schedules or results.</p>}
  </section>;
}
const sizeMatches = (n: number) => n * (n - 1) / 2;